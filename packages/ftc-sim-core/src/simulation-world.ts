import type RAPIER from "@dimforge/rapier3d-compat";
import { compliantNormalForce, compliantTractionForce } from "./compliant-contact.js";
import { sphereIntersectsRuleVolume } from "./rule-volumes.js";
import { advanceMotor, advanceServo, clampPhysical, commandedMotorPower, createMotorState, motorElectricalOutput } from "./electromechanics.js";
import { robotFixedGeometry, robotGateGeometry, robotLiftPosition, robotLiftStageGeometry } from "./robot-geometry.js";
import { robotTurretAngle } from "./robot-turret.js";
import { WORLD_PHYSICAL_PARAMETERS, validateWorldRobotConfiguration } from "./robot-presets.js";
import { add3, axisAngle, conjugate, cross3, dot3, inversePoint3, length3, multiplyQ, point3, QUAT_IDENTITY, rotate3, scale3, sub3, unit3, VEC_ZERO, WorldRandom } from "./world-math.js";
import { CONTROL_STEP_TICKS, PHYSICS_STEP_SECONDS, PHYSICS_VERSION } from "./world-types.js";
import type { AprilTagObservation, ElementState, HiveConfiguration, MotorCommand, MotorPhysicalState, RobotId, ServoPhysicalState, SimulationWorldOptions, Vector3, WorldBodyState, WorldCollider, WorldCommand, WorldObservation, WorldRobotSetup, WorldRobotState, WorldSensorFrame } from "./world-types.js";

/** Change in contact-point speed per unit impulse, including angular response. */
function inverseContactMass(body: RAPIER.RigidBody | null, point: Vector3, direction: Vector3): number {
  if (!body?.isDynamic()) return 0;
  const inverseMass = body.effectiveInvMass();
  const arm = cross3(sub3(point, body.worldCom()), direction);
  const inertia = body.effectiveWorldInvInertia();
  const angular = {
    x: inertia.m11 * arm.x + inertia.m12 * arm.y + inertia.m13 * arm.z,
    y: inertia.m21 * arm.x + inertia.m22 * arm.y + inertia.m23 * arm.z,
    z: inertia.m31 * arm.x + inertia.m32 * arm.y + inertia.m33 * arm.z,
  };
  return inverseMass.x * direction.x ** 2 + inverseMass.y * direction.y ** 2 + inverseMass.z * direction.z ** 2 + dot3(arm, angular);
}

type RobotRuntime = {
  setup: WorldRobotSetup;
  handle: number;
  motors: Record<string, MotorPhysicalState>;
  servos: Record<string, ServoPhysicalState>;
  command: WorldCommand;
  voltage: number;
  liftHeight: number;
  liftVelocity: number;
  liftHandle: number | null;
  liftJoint: number | null;
  liftPlateCollider: number | null;
  liftStageColliders: { handle: number; id: string; stageIndex: number; basePosition: Vector3 }[];
  liftStageColliderHeight: number;
  liftTrayRims: { handle: number; position: Vector3 }[];
  gateCollider: number | null;
  jammed: boolean;
  payload: string[];
  sensors: WorldSensorFrame;
  pendingSensors: { availableTick: number; name: string; kind: string; value: unknown }[];
  pendingTagFrames: { camera: string; availableTimeMs: number; observations: AprilTagObservation[] }[];
  latestTagFrames: Record<string, AprilTagObservation[]>;
  cameraNextTick: Record<string, number>;
  odometry: Record<string, { position: Vector3; heading: number }>;
};
type ElementRuntime = {
  id: string; kind: ElementState["kind"]; alliance: "red" | "blue" | null; appearance?: "green" | "purple";
  handle: number; collider: number; radius: number; mass: number;
  location: ElementState["location"]; controlledBy: RobotId | null;
  dischargedUntilFloorContact: boolean; previousHive: string | null; previousCellId: string | null; dischargeCandidateHive: string | null;
  lastLaunchedTick: number;
};
type HiveRuntime = { configuration: HiveConfiguration; handle: number; joint: number };

export interface SimulationSnapshot {
  physicsVersion: string;
  configurationHash: string;
  seed: number;
  tick: number;
  randomState: number;
  powered: boolean;
  physics: Uint8Array;
  robots: RobotRuntime[];
  elements: ElementRuntime[];
  queuedCommands: WorldCommand[];
  commandLog: WorldCommand[];
}

export interface WorldContact {
  first: string;
  second: string;
}

let rapier: typeof RAPIER;
let rapierReady: Promise<void> | undefined;
const zeroCommand = (id: RobotId, tick = 0): WorldCommand => ({ robotId: id, tick, sequence: 0, motors: {}, servos: {}, source: "opmode" });
const zeroSensors = (id: RobotId): WorldSensorFrame => ({ robotId: id, tick: 0, simulationTimeMs: 0, orientation: { yawRadians: 0, pitchRadians: 0, rollRadians: 0 }, angularVelocity: { ...VEC_ZERO }, voltage: 12.8, currentAmps: 0, motors: {}, digital: {}, analog: {}, distance: {}, color: {}, odometry: {}, aprilTags: [] });

/** Authoritative fixed-step simulation. Rendering and wall-clock scheduling live outside this class. */
export class SimulationWorld {
  private physics!: RAPIER.World;
  private staticBodyHandle = 0;
  private random: WorldRandom;
  private readonly options: SimulationWorldOptions;
  private readonly configurationHash: string;
  private readonly robots = new Map<RobotId, RobotRuntime>();
  private readonly elements = new Map<string, ElementRuntime>();
  private readonly hives = new Map<string, HiveRuntime>();
  private readonly colliderOwners = new Map<number, string>();
  private queuedCommands: WorldCommand[] = [];
  private commandLog: WorldCommand[] = [];
  private powered = true;
  private disposed = false;
  tick = 0;

  /** Stable world-configuration identity without allocating a physics snapshot. */
  get configurationFingerprint(): string { return this.configurationHash; }

  /** Load the engine independently of the editor and overlap field preparation. */
  static preload(): Promise<void> {
    rapierReady ??= import(/* webpackChunkName: "physics-engine" */ "@dimforge/rapier3d-compat")
      .then(async ({ default: engine }) => {
        await engine.init();
        rapier = engine;
      })
      .catch((error: unknown) => { rapierReady = undefined; throw error; });
    return rapierReady;
  }

  static async create(options: SimulationWorldOptions): Promise<SimulationWorld> {
    await SimulationWorld.preload();
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ field: options.field, robots: options.robots, parameters: options.parameters ?? {} })));
    const configurationHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    return new SimulationWorld(options, configurationHash);
  }

  private constructor(options: SimulationWorldOptions, configurationHash: string) {
    this.configurationHash = configurationHash;
    this.options = structuredClone(options);
    if (options.parameters?.motorOutputInertia !== undefined) {
      const scale = options.parameters.motorOutputInertia / WORLD_PHYSICAL_PARAMETERS.motorOutputInertia!.value;
      for (const robot of this.options.robots) for (const motor of robot.configuration.motors) motor.profile.rotorInertiaKgM2 *= scale;
    }
    this.random = new WorldRandom(options.seed);
    const robotIds = new Set(options.robots.map((robot) => robot.id));
    if (robotIds.size !== options.robots.length) throw new Error("Robot IDs must be unique.");
    for (const robot of options.robots) {
      const errors = validateWorldRobotConfiguration(robot.configuration);
      if (errors.length) throw new Error(errors.join(" "));
    }
    for (const [key, value] of Object.entries(options.parameters ?? {})) {
      const parameter = WORLD_PHYSICAL_PARAMETERS[key];
      if (!parameter || value === undefined || !Number.isFinite(value)) throw new Error(`Unknown or invalid physical parameter: ${key}`);
      const range = parameter.experimentalRange;
      if (range && (value < range[0] || value > range[1])) throw new Error(`${key} is outside its documented experimental range.`);
      if (!range && value !== parameter.value) throw new Error(`${key} is a fixed published parameter.`);
    }
    this.build();
  }

  get simulationTimeMs(): number { return this.tick * (PHYSICS_STEP_SECONDS * 1000); }
  get field(): SimulationWorldOptions["field"] { return this.options.field; }
  get robotSetups(): readonly WorldRobotSetup[] { return this.options.robots; }
  get isPowered(): boolean { return this.powered; }
  private parameter(name: string): number { return this.options.parameters?.[name] ?? WORLD_PHYSICAL_PARAMETERS[name]!.value; }
  private body(handle: number): RAPIER.RigidBody { return this.physics.getRigidBody(handle); }

  reset(seed = this.options.seed): void {
    this.assertOpen();
    this.physics.free();
    this.options.seed = seed;
    this.random = new WorldRandom(seed);
    this.tick = 0; this.powered = true;
    this.queuedCommands = []; this.commandLog = [];
    this.robots.clear(); this.elements.clear(); this.hives.clear(); this.colliderOwners.clear();
    this.build();
  }

  setPowered(enabled: boolean): void {
    this.powered = enabled;
    if (!enabled) {
      this.queuedCommands = [];
      for (const robot of this.robots.values()) {
        // Match power is separate from a controller's enable bit and encoder
        // direction. Neutralize demand without changing hardware configuration.
        robot.command = {
          ...robot.command,
          tick: this.tick,
          motors: Object.fromEntries(Object.entries(robot.command.motors).map(([name, command]) => {
            const neutral = { ...command, power: 0 };
            delete neutral.velocitySetpoint;
            return [name, neutral];
          })),
        };
      }
    }
  }

  enqueue(command: WorldCommand): void {
    this.assertOpen();
    if (!this.robots.has(command.robotId)) throw new Error(`Unknown robot: ${command.robotId}`);
    if (!Number.isSafeInteger(command.tick) || command.tick < this.tick) throw new Error("Commands cannot rewrite past simulation ticks.");
    if (!Number.isSafeInteger(command.sequence) || command.sequence < 0) throw new Error("Command sequence must be a non-negative integer.");
    const configuration = this.robots.get(command.robotId)!.setup.configuration;
    const motorNames = new Set(configuration.motors.map((motor) => motor.name));
    const servoNames = new Set(configuration.servos.map((servo) => servo.name));
    for (const [name, value] of Object.entries(command.motors)) {
      if (!motorNames.has(name)) throw new Error(`Motor is not configured for ${command.robotId}: ${name}`);
      if (!Number.isFinite(value.power) || Math.abs(value.power) > 1) throw new Error(`Invalid motor power: ${name}`);
      for (const key of ["velocitySetpoint", "targetPosition", "targetPositionTolerance"] as const) if (value[key] !== undefined && !Number.isFinite(value[key])) throw new Error(`Invalid motor ${key}: ${name}`);
    }
    for (const [name, value] of Object.entries(command.servos)) if (!servoNames.has(name) || !Number.isFinite(value) || value < 0 || value > 1) throw new Error(`Invalid servo command: ${name}`);
    this.queuedCommands.push(structuredClone(command));
    this.queuedCommands.sort((a, b) => a.tick - b.tick || a.robotId.localeCompare(b.robotId) || a.sequence - b.sequence);
  }

  /** Never drops elapsed steps. Hosts may choose to advance fewer steps and visibly slow time. */
  step(steps = 1): void {
    this.assertOpen();
    if (!Number.isSafeInteger(steps) || steps < 0 || steps > 20000) throw new RangeError("Advance between zero and 20000 physics steps per call.");
    for (let index = 0; index < steps; index++) {
      while (this.queuedCommands[0] && this.queuedCommands[0].tick <= this.tick) {
        const command = this.queuedCommands.shift()!;
        const robot = this.robots.get(command.robotId)!;
        if (command.sequence >= robot.command.sequence) {
          robot.command = command;
          if (this.options.recordCommands !== false) this.commandLog.push(structuredClone(command));
        }
      }
      this.physics.forEachRigidBody((body) => { if (body.isDynamic()) { body.resetForces(false); body.resetTorques(false); } });
      for (const element of this.elements.values()) element.controlledBy = null;
      for (const robot of this.robots.values()) this.advanceRobot(robot);
      for (const element of this.elements.values()) this.advanceElement(element);
      for (const hive of this.hives.values()) this.advanceHive(hive);
      this.physics.step();
      this.tick++;
      this.updateElements();
      for (const robot of this.robots.values()) this.captureCameras(robot);
      if (this.tick % CONTROL_STEP_TICKS === 0) for (const robot of this.robots.values()) this.updateSensors(robot);
    }
  }

  advanceControlFrame(): WorldObservation { this.step(CONTROL_STEP_TICKS); return this.observe(); }

  observe(): WorldObservation {
    this.assertOpen();
    return {
      physicsVersion: PHYSICS_VERSION, seed: this.options.seed, tick: this.tick,
      simulationTimeMs: this.simulationTimeMs, physicalAccuracy: "unvalidated",
      robots: [...this.robots.values()].map((robot): WorldRobotState => ({
        ...this.bodyState(robot.setup.id, robot.handle), id: robot.setup.id, alliance: robot.setup.alliance,
        motors: structuredClone(robot.motors), servos: structuredClone(robot.servos), payload: [...robot.payload],
        mechanism: { liftHeight: robot.liftHeight, liftVelocity: robot.liftVelocity, jammed: robot.jammed, flywheelRadiansPerSecond: this.outputSpeed(robot, robot.setup.configuration.mechanisms?.shooter.motor) },
        sensors: structuredClone(robot.sensors),
      })),
      elements: [...this.elements.values()].map((element) => ({ ...this.bodyState(element.id, element.handle), kind: element.kind, ...(element.appearance ? { appearance: element.appearance } : {}), alliance: element.alliance, radius: element.radius, location: element.location, controlledBy: element.controlledBy, dischargedUntilFloorContact: element.dischargedUntilFloorContact })),
      hives: [...this.hives.values()].map((hive) => this.bodyState(hive.configuration.id, hive.handle)),
    };
  }

  sensorFrame(robotId: RobotId): WorldSensorFrame {
    const robot = this.robots.get(robotId);
    if (!robot) throw new Error(`Unknown robot: ${robotId}`);
    return structuredClone(robot.sensors);
  }

  /** Geometric camera visibility. Policy adapters apply their own capture/latency history. */
  visibleFromRobot(robotId: RobotId, target: Vector3, radius = 0, cameraName?: string): boolean {
    this.assertOpen();
    const robot = this.robots.get(robotId);
    if (!robot) throw new Error(`Unknown robot: ${robotId}`);
    const body = this.body(robot.handle);
    for (const camera of robot.setup.configuration.cameras) {
      if (cameraName !== undefined && camera.name !== cameraName) continue;
      const origin = point3(camera.mount.position, body.translation(), body.rotation());
      const rotation = multiplyQ(body.rotation(), camera.mount.rotation);
      const local = inversePoint3(target, origin, rotation);
      const distance = length3(local);
      if (local.x <= 0 || distance > camera.maximumRange + radius) continue;
      const margin = Math.asin(Math.min(1, radius / Math.max(radius, distance)));
      if (Math.abs(Math.atan2(-local.z, local.x)) > camera.horizontalFovRadians / 2 + margin || Math.abs(Math.atan2(local.y, Math.hypot(local.x, local.z))) > camera.verticalFovRadians / 2 + margin) continue;
      const hit = this.physics.castRay(new rapier.Ray(origin, unit3(sub3(target, origin))), Math.max(0, distance - radius - 0.002), true, undefined, undefined, undefined, body);
      if (!hit) return true;
    }
    return false;
  }

  snapshot(): SimulationSnapshot {
    return { physicsVersion: PHYSICS_VERSION, configurationHash: this.configurationHash, seed: this.options.seed, tick: this.tick, randomState: this.random.state, powered: this.powered, physics: this.physics.takeSnapshot(), robots: structuredClone([...this.robots.values()]), elements: structuredClone([...this.elements.values()]), queuedCommands: structuredClone(this.queuedCommands), commandLog: structuredClone(this.commandLog) };
  }

  restore(snapshot: SimulationSnapshot): void {
    this.assertOpen();
    if (snapshot.physicsVersion !== PHYSICS_VERSION) throw new Error("Replay uses a different physics version.");
    if (snapshot.configurationHash !== this.configurationHash) throw new Error("Snapshot field, robot, or physical parameters do not match this world.");
    if (snapshot.robots.map((robot) => robot.setup.id).join() !== [...this.robots.keys()].join()) throw new Error("Snapshot robot configuration does not match this world.");
    const restored = rapier.World.restoreSnapshot(snapshot.physics);
    this.physics.free(); this.physics = restored;
    this.physics.propagateModifiedBodyPositionsToColliders();
    this.tick = snapshot.tick; this.options.seed = snapshot.seed; this.random.state = snapshot.randomState; this.powered = snapshot.powered;
    this.robots.clear(); for (const robot of structuredClone(snapshot.robots)) this.robots.set(robot.setup.id, robot);
    this.elements.clear(); for (const element of structuredClone(snapshot.elements)) this.elements.set(element.id, element);
    this.queuedCommands = structuredClone(snapshot.queuedCommands); this.commandLog = structuredClone(snapshot.commandLog);
  }

  replayCommands(): readonly WorldCommand[] { return structuredClone(this.commandLog); }

  /** Field staff/human actions preserve identities. Rules authorizes where and when this is called. */
  placeElement(id: string, position: Vector3, location: ElementState["location"] = "field"): void {
    const element = this.elements.get(id);
    if (!element) throw new Error(`Unknown scoring element: ${id}`);
    if (![position.x, position.y, position.z].every(Number.isFinite)) throw new Error("Element position must be finite.");
    const body = this.body(element.handle);
    body.setTranslation(position, true); body.setLinvel(VEC_ZERO, true); body.setAngvel(VEC_ZERO, true);
    body.setEnabled(location === "field"); element.location = location; element.controlledBy = null; element.dischargedUntilFloorContact = false; element.previousHive = null; element.previousCellId = null; element.dischargeCandidateHive = null;
    this.physics.propagateModifiedBodyPositionsToColliders();
  }

  /** Rules only need robot contacts; omit unrelated mesh manifolds when requested. */
  contacts(options: { robotsOnly?: boolean } = {}): WorldContact[] {
    const result: WorldContact[] = [];
    const seen = new Set<string>();
    for (const [handle, first] of this.colliderOwners) {
      if (options.robotsOnly && !this.robots.has(first as RobotId)) continue;
      const collider = this.physics.getCollider(handle);
      this.physics.contactPairsWith(collider, (other) => {
        const second = this.colliderOwners.get(other.handle);
        if (!second || first === second) return;
        const key = [first, second].sort().join(":");
        if (seen.has(key)) return;
        if (this.touching(collider, other)) { seen.add(key); result.push({ first, second }); }
      });
    }
    return result;
  }

  private touching(first: RAPIER.Collider, second: RAPIER.Collider): boolean {
    let touching = false;
    this.physics.contactPair(first, second, (manifold) => {
      if (touching) return;
      for (let index = 0; index < manifold.numContacts(); index++) {
        if (manifold.contactDist(index) <= 0.002) { touching = true; break; }
      }
    });
    return touching;
  }

  /** Shortest physical surface distance, including deployed mechanisms, for pin separation. */
  robotSeparationMeters(firstId: RobotId, secondId: RobotId): number {
    this.assertOpen();
    if (!this.robots.has(firstId) || !this.robots.has(secondId)) throw new Error("Pin separation requires two known robots.");
    if (firstId === secondId) return 0;
    const first = [...this.colliderOwners].filter(([, owner]) => owner === firstId).map(([handle]) => this.physics.getCollider(handle));
    const second = [...this.colliderOwners].filter(([, owner]) => owner === secondId).map(([handle]) => this.physics.getCollider(handle));
    let distance = Infinity;
    for (const a of first) for (const b of second) {
      const contact = a.contactCollider(b, Number.MAX_SAFE_INTEGER);
      if (contact) distance = Math.min(distance, Math.max(0, contact.distance));
    }
    return distance;
  }

  /** A zone is occupied by any physical robot component, including its lifted carriage. */
  robotOverlapsBox(robotId: RobotId, center: Vector3, halfExtents: Vector3): boolean {
    this.assertOpen();
    if (!this.robots.has(robotId)) throw new Error(`Unknown robot: ${robotId}`);
    const zone = new rapier.Cuboid(halfExtents.x, halfExtents.y, halfExtents.z);
    for (const [handle, owner] of this.colliderOwners) {
      if (owner !== robotId) continue;
      const contact = this.physics.getCollider(handle).contactShape(zone, center, QUAT_IDENTITY, 0);
      if (contact && contact.distance <= 0) return true;
    }
    return false;
  }

  dispose(): void { if (!this.disposed) { this.physics.free(); this.disposed = true; } }
  private assertOpen(): void { if (this.disposed) throw new Error("Simulation world has been disposed."); }
  private bodyState(id: string, handle: number): WorldBodyState {
    const body = this.body(handle);
    return { id, position: { ...body.translation() }, rotation: { ...body.rotation() }, linearVelocity: { ...body.linvel() }, angularVelocity: { ...body.angvel() } };
  }

  private collider(configuration: WorldCollider, parent?: RAPIER.RigidBody, owner = configuration.id): RAPIER.Collider {
    const shape = configuration.shape;
    const descriptor = shape.kind === "box" ? rapier.ColliderDesc.cuboid(shape.halfExtents.x, shape.halfExtents.y, shape.halfExtents.z)
      : shape.kind === "cylinder" ? rapier.ColliderDesc.cylinder(shape.halfHeight, shape.radius)
      : rapier.ColliderDesc.trimesh(new Float32Array(shape.vertices), new Uint32Array(shape.indices));
    descriptor.setTranslation(configuration.position.x, configuration.position.y, configuration.position.z)
      .setRotation(configuration.rotation ?? QUAT_IDENTITY).setFriction(configuration.friction ?? 0.6)
      .setRestitution(configuration.restitution ?? 0.1).setDensity(0);
    // Every collider has a body. Rapier 0.14 reconstructs a parentless collider's
    // JS parent cache as handle zero after deserialization, breaking contact reactions.
    const collider = this.physics.createCollider(descriptor, parent ?? this.body(this.staticBodyHandle));
    this.colliderOwners.set(collider.handle, owner);
    return collider;
  }

  private build(): void {
    this.physics = new rapier.World({ x: 0, y: -this.parameter("gravity"), z: 0 });
    this.physics.timestep = PHYSICS_STEP_SECONDS;
    // Preserve the millimetre-scale contact tolerances used by the field model.
    // Rapier 0.21 defaults to 5 mm slop and 20 mm prediction for metre-scale scenes.
    this.physics.integrationParameters.normalizedAllowedLinearError = 0.001;
    this.physics.integrationParameters.normalizedPredictionDistance = 0.002;
    this.physics.integrationParameters.numSolverIterations = 8;
    this.physics.integrationParameters.maxCcdSubsteps = 4;
    this.staticBodyHandle = this.physics.createRigidBody(rapier.RigidBodyDesc.fixed()).handle;
    const field = this.options.field;
    this.collider({ id: "floor", position: { x: 0, y: field.floorHeight - 0.03, z: 0 }, shape: { kind: "box", halfExtents: { x: field.halfSize + 0.08, y: 0.03, z: field.halfSize + 0.08 } }, friction: 0.85 });
    for (const collider of field.colliders) this.collider(collider);
    for (const hive of field.hives) {
      const mass = hive.physicalParameters ? this.parameter(hive.physicalParameters.massKg) : hive.massKg;
      const centerOfMass = hive.physicalParameters ? scale3(unit3(hive.centerOfMass), this.parameter(hive.physicalParameters.centerOfMassRadius)) : hive.centerOfMass;
      const angularDamping = hive.physicalParameters ? this.parameter(hive.physicalParameters.angularDamping) : hive.angularDamping;
      const fixed = this.body(this.staticBodyHandle);
      const body = this.physics.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation(hive.pivot.x, hive.pivot.y, hive.pivot.z)
        .setRotation(axisAngle(hive.axis, hive.initialAngle)).setAngularDamping(angularDamping));
      const extent = hive.cells.reduce((max, cell) => Math.max(max, length3(cell.center) + length3(cell.halfExtents)), 0.2);
      const inertia = mass * extent ** 2 / 3;
      body.setAdditionalMassProperties(mass, centerOfMass, { x: inertia, y: inertia, z: inertia }, QUAT_IDENTITY, true);
      for (const collider of hive.colliders) this.collider(collider, body, hive.id);
      const joint = this.physics.createImpulseJoint(rapier.JointData.revolute(hive.pivot, VEC_ZERO, hive.axis), fixed, body, true) as RAPIER.RevoluteImpulseJoint;
      // The mating bearing surfaces overlap in assembly CAD. Their constraint is the
      // revolute joint; damping near the measured end contacts is integrated below.
      // Robots and balls still collide with every exposed HIVE shell surface.
      joint.setContactsEnabled(false);
      joint.setLimits(hive.lowerLimit - hive.initialAngle, hive.upperLimit - hive.initialAngle);
      this.hives.set(hive.id, { configuration: hive, handle: body.handle, joint: joint.handle });
    }
    for (const setup of this.options.robots) this.buildRobot(setup);
    for (const spawn of field.spawns) {
      const radius = spawn.radius ?? this.parameter(spawn.kind === "pollen" ? "pollenRadius" : "nectarRadius");
      const mass = spawn.massKg ?? this.parameter(spawn.kind === "pollen" ? "pollenMass" : "nectarMass");
      if (!(radius > 0 && mass > 0 && Number.isFinite(radius) && Number.isFinite(mass))) throw new Error("Scoring-element mass and radius must be positive and finite.");
      const body = this.physics.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation(spawn.position.x, spawn.position.y, spawn.position.z).setCcdEnabled(true).setCanSleep(true));
      // Uniform thin-shell inertia approximates hollow polyethylene balls. The
      // small perforations and wall-thickness variation remain uncalibrated.
      const inertia = (spawn.kind === "artifact" ? 0.4 : 2 / 3) * mass * radius ** 2;
      const collider = this.physics.createCollider(rapier.ColliderDesc.ball(radius).setMassProperties(mass, VEC_ZERO, { x: inertia, y: inertia, z: inertia }, QUAT_IDENTITY).setFriction(this.parameter("ballFriction")).setRestitution(this.parameter("ballRestitution")), body);
      this.colliderOwners.set(collider.handle, spawn.id);
      body.setEnabled(spawn.location === "field");
      this.elements.set(spawn.id, { id: spawn.id, kind: spawn.kind, ...(spawn.appearance ? { appearance: spawn.appearance } : {}), alliance: spawn.alliance, handle: body.handle, collider: collider.handle, radius, mass, location: spawn.location, controlledBy: null, dischargedUntilFloorContact: false, previousHive: null, previousCellId: null, dischargeCandidateHive: null, lastLaunchedTick: -1000 });
    }
    this.physics.propagateModifiedBodyPositionsToColliders();
    for (const robot of this.robots.values()) { this.captureCameras(robot); this.updateSensors(robot); }
  }

  private advanceHive(hive: HiveRuntime): void {
    const body = this.body(hive.handle), config = hive.configuration;
    const angularSpeed = dot3(body.angvel(), config.axis);
    // Hydraulic resistance acts only while approaching a damper's endpoint.
    // The opposite damper is clear. Force increases through its finite stroke.
    for (let index = 0; index < config.dampers.length; index++) {
      if (index === 0 ? angularSpeed >= 0 : angularSpeed <= 0) continue;
      const damper = config.dampers[index]!;
      const gap = length3(sub3(point3(damper.local, body.translation(), body.rotation()), damper.frame));
      const stroke = this.parameter("hiveDamperStroke");
      if (gap >= stroke) continue;
      const lever = length3(cross3(damper.local, config.axis));
      const resistance = this.parameter("hiveDamperResistance") * (1 - gap / stroke) * lever * lever;
      body.addTorque(scale3(config.axis, -angularSpeed * resistance), true);
    }
  }

  private buildRobot(setup: WorldRobotSetup): void {
    const config = setup.configuration;
    const body = this.physics.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation(setup.position.x, setup.position.y, setup.position.z).setRotation(axisAngle({ x: 0, y: 1, z: 0 }, setup.heading)).setCcdEnabled(true).setCanSleep(false));
    const size = config.chassis.size;
    const mass = config.chassis.massKg;
    body.setAdditionalMassProperties(mass, config.chassis.centerOfMass, { x: mass * (size.y ** 2 + size.z ** 2) / 12, y: mass * (size.x ** 2 + size.z ** 2) / 12, z: mass * (size.x ** 2 + size.y ** 2) / 12 }, QUAT_IDENTITY, true);
    for (const part of robotFixedGeometry(config)) this.collider({ ...part, id: `${setup.id}-${part.id}` }, body, setup.id);
    const robot: RobotRuntime = { setup, handle: body.handle, motors: {}, servos: {}, command: zeroCommand(setup.id), voltage: config.battery.openCircuitVoltage, liftHeight: 0, liftVelocity: 0, liftHandle: null, liftJoint: null, liftPlateCollider: null, liftStageColliders: [], liftStageColliderHeight: 0, liftTrayRims: [], gateCollider: null, jammed: false, payload: [], sensors: zeroSensors(setup.id), pendingSensors: [], pendingTagFrames: [], latestTagFrames: {}, cameraNextTick: {}, odometry: {} };
    for (const part of robotLiftStageGeometry(config, robot.liftHeight)) {
      const stageIndex = Number(/^lift-stage-(\d+)-/.exec(part.id)?.[1]);
      robot.liftStageColliders.push({
        handle: this.collider({ ...part, id: `${setup.id}-${part.id}` }, body, setup.id).handle,
        id: part.id,
        stageIndex,
        basePosition: { ...part.position },
      });
    }
    robot.liftStageColliderHeight = 0;
    if (config.mechanisms) {
      const gate = this.collider({ id: `${setup.id}-rejection-door`, position: robotGateGeometry(config), shape: { kind: "box", halfExtents: { x: 0.07, y: size.y / 2, z: 0.004 } }, friction: 0.4 }, body, setup.id);
      robot.gateCollider = gate.handle;
      const lift = config.mechanisms.lift;
      const mount = point3(lift.mount, body.translation(), body.rotation());
      const carriage = this.physics.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation(mount.x, mount.y, mount.z).setRotation(body.rotation()).setCcdEnabled(true));
      const plate = this.collider({ id: `${setup.id}-lift-platform`, position: VEC_ZERO, shape: { kind: "box", halfExtents: { x: 0.06, y: 0.003, z: config.mechanisms.storage.width / 2 } }, friction: 0.6 }, carriage, setup.id);
      plate.setMass(lift.carriageMassKg);
      for (const [index, position, halfExtents] of [
        [0, { x: 0.058, y: 0.012, z: 0 }, { x: 0.003, y: 0.012, z: config.mechanisms.storage.width / 2 }],
        [1, { x: 0, y: 0.012, z: config.mechanisms.storage.width / 2 }, { x: 0.06, y: 0.012, z: 0.003 }],
        [2, { x: 0, y: 0.012, z: -config.mechanisms.storage.width / 2 }, { x: 0.06, y: 0.012, z: 0.003 }],
        // Low feed-over lip retains a freely rolling ball while the inclined
        // carriage moves outward; the powered feeder can push it over this step.
        [3, { x: -0.058, y: 0.004, z: 0 }, { x: 0.003, y: 0.004, z: config.mechanisms.storage.width / 2 }],
      ] as const) {
        const rim = this.collider({ id: `${setup.id}-lift-rim-${index}`, position, shape: { kind: "box", halfExtents }, friction: 0.6 }, carriage, setup.id);
        robot.liftTrayRims.push({ handle: rim.handle, position: { ...position } });
      }
      const slide = this.physics.createImpulseJoint(rapier.JointData.prismatic(lift.mount, VEC_ZERO, lift.axis ?? { x: 0, y: 1, z: 0 }), body, carriage, true) as RAPIER.PrismaticImpulseJoint;
      slide.setLimits(0, lift.maximumTravel); slide.setContactsEnabled(false);
      slide.configureMotorModel(rapier.MotorModel.ForceBased);
      robot.liftHandle = carriage.handle; robot.liftJoint = slide.handle; robot.liftPlateCollider = plate.handle;
    }
    for (const motor of config.motors) robot.motors[motor.name] = createMotorState();
    for (const servo of config.servos) robot.servos[servo.name] = { target: servo.name === "turret" ? 0.5 : 0, angle: servo.name === "turret" ? (servo.minRadians + servo.maxRadians) / 2 : servo.minRadians, velocity: 0, torque: 0 };
    for (const sensor of config.sensors) if (sensor.kind === "pinpoint" || sensor.kind === "odometry") robot.odometry[sensor.name] = { position: { ...setup.position }, heading: setup.heading };
    this.robots.set(setup.id, robot);
  }

  private commandFor(robot: RobotRuntime, name: string): MotorCommand {
    return this.powered ? robot.command.motors[name] ?? { power: 0, zeroPowerBehavior: "BRAKE" } : { power: 0, zeroPowerBehavior: "BRAKE", enabled: false };
  }
  private outputSpeed(robot: RobotRuntime, name: string | undefined): number {
    if (!name) return 0;
    const motor = robot.setup.configuration.motors.find((motor) => motor.name === name);
    return motor ? robot.motors[name]!.velocityRadiansPerSecond / motor.reduction : 0;
  }

  private advanceRobot(robot: RobotRuntime): void {
    const body = this.body(robot.handle);
    const config = robot.setup.configuration;
    const rotation = body.rotation();
    const position = body.translation();
    const dt = PHYSICS_STEP_SECONDS;
    const loads = new Map<string, { torque: number; inertia: number }>();
    for (const wheel of config.wheels) {
      const motor = config.motors.find((motor) => motor.name === wheel.motor)!;
      const state = robot.motors[wheel.motor]!;
      const origin = point3(wheel.mount, position, rotation);
      const down = rotate3({ x: 0, y: -1, z: 0 }, rotation);
      const ray = new rapier.Ray(origin, down);
      const hit = this.physics.castRayAndGetNormal(ray, wheel.radius + wheel.suspensionTravel, true, undefined, undefined, undefined, body);
      let groundTorque = 0;
      if (hit && dot3(hit.normal, scale3(down, -1)) > 0.25) {
        const contact = ray.pointAt(hit.timeOfImpact);
        const velocity = add3(body.linvel(), cross3(body.angvel(), sub3(contact, body.worldCom())));
        const other = hit.collider.parent();
        const otherVelocity = other ? add3(other.linvel(), cross3(other.angvel(), sub3(contact, other.worldCom()))) : VEC_ZERO;
        const relativeVelocity = sub3(velocity, otherVelocity);
        const compression = wheel.radius + wheel.suspensionTravel - hit.timeOfImpact;
        const contactMass = (direction: Vector3) => inverseContactMass(body, contact, direction) + inverseContactMass(other, contact, direction);
        // Solve the spring/damper against both bodies' velocity response. A loose
        // ball cannot absorb a full chassis suspension force as if it were fixed tile.
        const normalResponse = other?.isDynamic() ? contactMass(hit.normal) : 0;
        const normalDamping = wheel.damperNsPerM + (normalResponse > 0 ? wheel.springNPerM * dt : 0);
        const normalForce = clampPhysical((compression * wheel.springNPerM - dot3(relativeVelocity, hit.normal) * normalDamping)
          / (1 + dt * normalDamping * normalResponse), 0, config.chassis.massKg * this.parameter("gravity") * 2);
        const rawTraction = rotate3({ x: Math.cos(wheel.tractionAngle), y: 0, z: -Math.sin(wheel.tractionAngle) }, rotation);
        const traction = unit3(sub3(rawTraction, scale3(hit.normal, dot3(rawTraction, hit.normal))));
        const roller = unit3(cross3(hit.normal, traction));
        const driveProjection = wheel.driveProjection ?? Math.abs(Math.cos(wheel.tractionAngle));
        const surfaceSpeed = state.velocityRadiansPerSecond / motor.reduction * wheel.radius * driveProjection;
        const slip = surfaceSpeed - dot3(relativeVelocity, traction);
        const effectiveInertia = motor.profile.rotorInertiaKgM2 * motor.reduction ** 2 + wheel.inertiaKgM2;
        const contactCompliance = 350;
        const grip = wheel.grip * this.parameter("wheelGrip") / WORLD_PHYSICAL_PARAMETERS.wheelGrip!.value;
        const tractionResponse = contactMass(traction) + wheel.radius ** 2 * driveProjection ** 2 / effectiveInertia;
        const force = clampPhysical(slip * contactCompliance / (1 + contactCompliance * dt * tractionResponse), -grip * normalForce, grip * normalForce);
        const rollerVelocity = dot3(relativeVelocity, roller);
        const rollerResponse = contactMass(roller);
        const rollerLimit = rollerResponse > 0 ? Math.min(wheel.rollerGrip * normalForce, Math.abs(rollerVelocity) / (dt * rollerResponse)) : 0;
        const rollerForce = -Math.tanh(rollerVelocity / 0.03) * rollerLimit;
        const total = add3(scale3(hit.normal, normalForce), add3(scale3(traction, force), scale3(roller, rollerForce)));
        body.addForceAtPoint(total, contact, true);
        if (other?.isDynamic()) other.addForceAtPoint(scale3(total, -1), contact, true);
        groundTorque = force * wheel.radius * driveProjection;
      }
      loads.set(wheel.motor, { torque: groundTorque, inertia: wheel.inertiaKgM2 });
    }
    this.advanceMechanisms(robot, loads);
    for (const motor of config.motors) {
      if (motor.name === config.mechanisms?.lift.motor) continue; // Shaft state is constrained by the physical carriage.
      const load = loads.get(motor.name) ?? { torque: 0, inertia: 0.0003 };
      advanceMotor(motor, robot.motors[motor.name]!, this.commandFor(robot, motor.name), robot.voltage, load.torque, load.inertia, dt);
    }
    for (const servo of config.servos) {
      const state = robot.servos[servo.name]!;
      let load = servo.name === config.mechanisms?.shooter.hoodServo ? 0.12 * this.parameter("gravity") * 0.04 * Math.cos(state.angle) : 0;
      if (servo.name === config.mechanisms?.lift.releaseServo && robot.liftHandle !== null) {
        const carriage = this.body(robot.liftHandle);
        load += this.servoContactLoad(robot, [robot.liftPlateCollider!, ...robot.liftTrayRims.map((rim) => rim.handle)], carriage.translation(), rotate3({ x: 0, y: 0, z: -1 }, carriage.rotation()));
      }
      if (servo.name === config.mechanisms?.gate.servo && robot.gateCollider !== null) {
        const gate = robotGateGeometry(config);
        load += this.servoContactLoad(robot, [robot.gateCollider], point3({ ...gate, x: gate.x - 0.07 }, position, rotation), rotate3({ x: 0, y: -1, z: 0 }, rotation));
      }
      advanceServo(servo, state, robot.command.servos[servo.name] ?? state.target, load, dt, this.powered, this.parameter("servoPassiveDamping"));
    }
    const current = Object.values(robot.motors).reduce((sum, motor) => sum + motor.currentAmps, 0);
    const battery = config.battery;
    robot.voltage = Math.max(0, battery.openCircuitVoltage - current * battery.internalResistanceOhms);
    if (current > battery.maximumCurrentAmps) robot.voltage *= battery.maximumCurrentAmps / current;
  }

  /** Previous-step physical contact impulses load the gate/release servo shaft.
   * Positive external torque assists the commanded angle, hence a negative load.
   */
  private servoContactLoad(robot: RobotRuntime, handles: number[], pivot: Vector3, axis: Vector3): number {
    let load = 0;
    for (const handle of handles) {
      const collider = this.physics.getCollider(handle);
      this.physics.contactPairsWith(collider, (other) => {
        if (this.colliderOwners.get(other.handle) === robot.setup.id) return;
        this.physics.contactPair(collider, other, (manifold, flipped) => {
          const normal = manifold.normal();
          for (let index = 0; index < manifold.numContacts(); index++) {
            const local = flipped ? manifold.localContactPoint2(index) : manifold.localContactPoint1(index);
            if (!local) continue;
            const contact = point3(local, collider.translation(), collider.rotation());
            const force = scale3(normal, manifold.contactImpulse(index) / PHYSICS_STEP_SECONDS * (flipped ? 1 : -1));
            load -= dot3(cross3(sub3(contact, pivot), force), axis);
          }
        });
      });
    }
    return load;
  }

  private advanceMechanisms(robot: RobotRuntime, loads: Map<string, { torque: number; inertia: number }>): void {
    const config = robot.setup.configuration;
    const mechanism = config.mechanisms;
    if (!mechanism) return;
    const chassis = this.body(robot.handle);
    const position = chassis.translation();
    const rotation = chassis.rotation();
    const gravity = this.parameter("gravity");
    const intakeSpeed = this.outputSpeed(robot, mechanism.intake.motor) * mechanism.intake.radius;
    const feederReduction = mechanism.feeder.reduction ?? 1;
    const feederSpeed = this.outputSpeed(robot, mechanism.feeder.motor) / feederReduction / (Math.PI * 2 * 5.2) * mechanism.feeder.speedMetersPerSecond;
    let intakeLoad = 0; let feederLoad = 0;
    robot.payload = []; robot.jammed = false;
    const liftMotor = config.motors.find((motor) => motor.name === mechanism.lift.motor)!;
    const carriage = this.body(robot.liftHandle!);
    const localLiftAxis = mechanism.lift.axis ?? { x: 0, y: 1, z: 0 };
    const liftAxis = rotate3(localLiftAxis, rotation);
    const liftTravel = clampPhysical(dot3(sub3(inversePoint3(carriage.translation(), position, rotation), mechanism.lift.mount), localLiftAxis), 0, mechanism.lift.maximumTravel);
    const liftRailVelocity = dot3(sub3(carriage.linvel(), add3(chassis.linvel(), cross3(chassis.angvel(), sub3(carriage.translation(), chassis.worldCom())))), liftAxis);
    robot.liftHeight = liftTravel * localLiftAxis.y;
    robot.liftVelocity = liftRailVelocity * localLiftAxis.y;
    const liftStageDelta = robot.liftHeight - robot.liftStageColliderHeight;
    if (Math.abs(liftStageDelta) > 1e-6) {
      for (const stage of robot.liftStageColliders) {
        const shift = scale3(localLiftAxis, robot.liftHeight * stage.stageIndex / (3 * localLiftAxis.y));
        this.physics.getCollider(stage.handle).setTranslationWrtParent(add3(stage.basePosition, shift));
      }
      robot.liftStageColliderHeight = robot.liftHeight;
    }
    const liftState = robot.motors[liftMotor.name]!, command = this.commandFor(robot, liftMotor.name);
    const shaftPerMetre = liftMotor.reduction / mechanism.lift.spoolRadius;
    liftState.positionRadians = liftTravel * shaftPerMetre;
    liftState.velocityRadiansPerSecond = liftRailVelocity * shaftPerMetre;
    if (command.mode === "STOP_AND_RESET_ENCODER") liftState.encoderOffsetRadians = liftState.positionRadians;
    const power = commandedMotorPower(liftMotor, liftState, command, robot.voltage);
    const resistance = liftMotor.profile.nominalVoltage / liftMotor.profile.stallCurrentAmps;
    const kt = liftMotor.profile.stallTorqueNm / liftMotor.profile.stallCurrentAmps;
    const ke = (liftMotor.profile.nominalVoltage - resistance * liftMotor.profile.freeCurrentAmps) / (liftMotor.profile.freeSpeedRpm * Math.PI / 30);
    const braking = command.enabled !== false && command.zeroPowerBehavior !== "FLOAT";
    const driveDamping = power === 0 && !braking ? 0 : kt * ke / resistance * shaftPerMetre ** 2 * liftMotor.efficiency;
    // A force-based joint motor is the implicit DC relation F = Kt/R * (V - Ke*ω),
    // reflected through the gear ratio and spool. Contact load and gravity are solved
    // by the same rigid-body solver, so encoders cannot advance through a hard stop.
    const slide = this.physics.getImpulseJoint(robot.liftJoint!) as RAPIER.PrismaticImpulseJoint;
    slide.configureMotorVelocity(power * robot.voltage / ke / shaftPerMetre, driveDamping);
    const friction = kt * liftMotor.profile.freeCurrentAmps * Math.tanh(liftState.velocityRadiansPerSecond / 0.5) * shaftPerMetre * liftMotor.efficiency;
    carriage.addForce(scale3(liftAxis, -friction), true);
    chassis.addForceAtPoint(scale3(liftAxis, friction), carriage.translation(), true);
    const electrical = motorElectricalOutput(liftMotor.profile, power, liftState.velocityRadiansPerSecond, robot.voltage, braking);
    liftState.currentAmps = Math.abs(electrical.currentAmps); liftState.torqueNm = electrical.torqueNm;
    const trayRotation = axisAngle({ x: 0, y: 0, z: 1 }, -(robot.servos[mechanism.lift.releaseServo]?.angle ?? 0));
    this.physics.getCollider(robot.liftPlateCollider!).setRotationWrtParent(trayRotation);
    for (const rim of robot.liftTrayRims) {
      const collider = this.physics.getCollider(rim.handle);
      collider.setRotationWrtParent(trayRotation); collider.setTranslationWrtParent(rotate3(rim.position, trayRotation));
    }
    const gateAngle = robot.servos[mechanism.gate.servo]?.angle ?? 0;
    const gateMount = robotGateGeometry(config);
    const gateX = gateMount.x;
    const gateCollider = this.physics.getCollider(robot.gateCollider!);
    gateCollider.setTranslationWrtParent({ x: gateX - 0.07 + 0.07 * Math.cos(gateAngle), y: gateMount.y, z: gateMount.z + 0.07 * Math.sin(gateAngle) });
    gateCollider.setRotationWrtParent(axisAngle({ x: 0, y: 1, z: 0 }, -gateAngle));
    const reject = gateAngle > mechanism.gate.rejectionThreshold;
    for (const element of this.elements.values()) {
      if (element.location !== "field") continue;
      const body = this.body(element.handle);
      const local = inversePoint3(body.translation(), position, rotation);
      const relative = rotate3(sub3(body.linvel(), add3(chassis.linvel(), cross3(chassis.angvel(), sub3(body.translation(), chassis.worldCom())))), conjugate(rotation));
      const intake = mechanism.intake;
      const inIntake = Math.abs(local.z - intake.mount.z) < intake.width / 2 + element.radius && Math.abs(local.x - intake.mount.x) < intake.radius + element.radius && Math.abs(local.y - intake.mount.y) < intake.radius + element.radius;
      const storage = mechanism.storage;
      const inStorage = Math.abs(local.z - storage.mount.z) < storage.width / 2 && Math.abs(local.x - storage.mount.x) < storage.length / 2 + element.radius && local.y > storage.mount.y - 0.08 && local.y < storage.mount.y + 0.13;
      const atRejectionPort = Math.abs(local.x - gateX) < 0.07 - element.radius * 0.5 && local.z > storage.mount.z - storage.width / 2 && local.z < config.chassis.size.z / 2 + element.radius && Math.abs(local.y - gateMount.y) < 0.09;
      let force = { ...VEC_ZERO };
      if (inIntake) {
        const dx = local.x - intake.mount.x, dy = local.y - intake.mount.y;
        const distance = Math.hypot(dx, dy);
        const compression = Math.max(0, intake.radius + element.radius - distance);
        // Reduced pinch contact: compressed tread presses against the backing
        // ramp. That pressure limits shaft-driven traction, including at rest.
        const normal = { x: 0, y: -1, z: 0 };
        const tangent = { x: -1, y: 0, z: 0 };
        const worldNormal = rotate3(normal, rotation), worldTangent = rotate3(tangent, rotation);
        const point = sub3(body.translation(), scale3(worldNormal, element.radius));
        const contactVelocity = (contactBody: RAPIER.RigidBody) => add3(contactBody.linvel(), cross3(contactBody.angvel(), sub3(point, contactBody.worldCom())));
        const relativeContact = rotate3(sub3(contactVelocity(body), contactVelocity(chassis)), conjugate(rotation));
        const normalResponse = inverseContactMass(body, point, worldNormal) + inverseContactMass(chassis, point, worldNormal);
        const tangentResponse = inverseContactMass(body, point, worldTangent) + inverseContactMass(chassis, point, worldTangent);
        const stiffness = intake.complianceNPerM;
        const damping = 2 * 0.7 * Math.sqrt(stiffness / Math.max(normalResponse, 1e-9));
        const normalForce = compliantNormalForce(compression, dot3(relativeContact, normal), stiffness, damping, normalResponse, PHYSICS_STEP_SECONDS);
        const contactRadius = Math.max(intake.radius * 0.2, intake.radius - compression / 2);
        const surfaceSpeed = intakeSpeed * contactRadius / intake.radius;
        const traction = compliantTractionForce(surfaceSpeed - dot3(relativeContact, tangent), normalForce, this.parameter("intakeGrip"), tangentResponse, PHYSICS_STEP_SECONDS);
        const contactForce = rotate3(scale3(tangent, traction), rotation);
        body.addForceAtPoint(contactForce, point, true);
        chassis.addForceAtPoint(scale3(contactForce, -1), point, true);
        if (intakeSpeed > 0.03) {
          const channelHeight = storage.mount.y - config.chassis.size.y / 2 + 0.022 + element.radius;
          const rampSupport = clampPhysical(element.mass * gravity + (channelHeight - local.y) * 25 - relative.y * 1.5, -normalForce, normalForce);
          force.y += rampSupport;
          if (!(reject && atRejectionPort)) force.z += clampPhysical((intake.mount.z - local.z) * 3, -normalForce, normalForce);
        }
        intakeLoad += traction * contactRadius;
        if (Math.abs(intakeSpeed) > 0.03 && normalForce > 0) element.controlledBy = robot.setup.id;
      }
      if (inStorage) {
        robot.payload.push(element.id); element.controlledBy = robot.setup.id;
        if (!(reject && atRejectionPort) && Math.abs(feederSpeed) > 0.02) {
          const tractionLimit = 3 * mechanism.feeder.grip / 0.8;
          const traction = clampPhysical((-feederSpeed - relative.x) * 8, -tractionLimit, tractionLimit);
          force.x += traction; feederLoad += Math.abs(traction) * 0.02;
          if (Math.abs(relative.x) < 0.02 && Math.abs(feederSpeed) > 0.15) robot.jammed = true;
        }
      }
      if (reject && atRejectionPort && Math.abs(feederSpeed) > 0.02) {
        // A transverse belt shares the feeder shaft. Its contact force and reflected
        // load vanish when that motor stops; opening a servo alone cannot propel a ball.
        const tractionLimit = 2 * mechanism.feeder.grip / 0.8;
        const traction = clampPhysical((Math.abs(feederSpeed) - relative.z) * element.mass / 0.04, -tractionLimit, tractionLimit);
        force.z += traction;
        force.x += clampPhysical((gateX - local.x) * 8 - relative.x * 0.4, -1, 1);
        feederLoad += Math.abs(traction) * 0.02;
        element.controlledBy = robot.setup.id;
      }
      // Powered belt contact follows the rear chute. It uses bounded contact forces and transfers reaction to the chassis.
      const shooter = mechanism.shooter;
      const inChute = local.x < shooter.mount.x - 0.03 && local.x > shooter.mount.x - 0.15 && Math.abs(local.z - shooter.mount.z) < storage.width / 2 && local.y > storage.mount.y - 0.07 && local.y < shooter.mount.y - element.radius;
      const inShooterThroat = local.x < shooter.mount.x - 0.015 && local.x > shooter.mount.x - 0.16 && Math.abs(local.z - shooter.mount.z) < storage.width / 2 && local.y >= shooter.mount.y - element.radius && local.y < shooter.mount.y + element.radius;
      if ((inChute || inShooterThroat) && this.tick - element.lastLaunchedTick > 100) {
        element.controlledBy = robot.setup.id;
        if (!robot.payload.includes(element.id)) robot.payload.push(element.id);
      }
      if (inChute && feederSpeed > 0.02 && !reject) {
        const tractionLimit = 5 * mechanism.feeder.grip / 0.8;
        force.x += clampPhysical((shooter.mount.x - 0.11 + element.radius + 0.003 - local.x) * 100 - relative.x * 4, -tractionLimit, tractionLimit);
        force.z += clampPhysical((shooter.mount.z - local.z) * 100 - relative.z * 4, -tractionLimit, tractionLimit);
        force.y += clampPhysical((feederSpeed - relative.y) * 8 + element.mass * gravity, -tractionLimit, tractionLimit);
        feederLoad += Math.abs(force.y) * 0.02;
        element.controlledBy = robot.setup.id;
      }
      const liftPosition = robotLiftPosition(config, robot.liftHeight);
      const onLift = Math.abs(local.x - liftPosition.x) < 0.06 + element.radius && Math.abs(local.z - liftPosition.z) < storage.width / 2 + element.radius && Math.abs(local.y - (liftPosition.y + element.radius)) < 0.015;
      if (onLift) { element.controlledBy = robot.setup.id; if (!robot.payload.includes(element.id)) robot.payload.push(element.id); }
      if (length3(force) > 0) {
        const worldForce = rotate3(force, rotation);
        body.addForce(worldForce, true); chassis.addForceAtPoint(scale3(worldForce, -1), body.translation(), true);
      }
      const flywheelSpeed = this.outputSpeed(robot, shooter.motor);
      if (inShooterThroat && flywheelSpeed > 20 && feederSpeed > 0.02 && this.tick - element.lastLaunchedTick > 100) {
        const turret = robotTurretAngle(config, robot);
        const hood = robot.servos[shooter.hoodServo]?.angle ?? Math.PI / 4;
        const localDirection = { x: Math.cos(hood) * Math.cos(turret), y: Math.sin(hood), z: -Math.cos(hood) * Math.sin(turret) };
        const direction = rotate3(localDirection, rotation);
        // An inelastic wheel/ball contact conserves angular momentum; wheel slowdown follows ball impulse.
        // Contact acts at the compressed wheel's mean radius. The no-slip impulse
        // includes ball rotation in its effective mass so spin cannot add energy.
        const contactRadius = shooter.wheelRadius - shooter.compression / 2;
        const rimSpeed = flywheelSpeed * contactRadius;
        const ballSpeed = dot3(sub3(body.linvel(), chassis.linvel()), direction);
        const spinRatio = 0.3;
        const ballInertia = (element.kind === "artifact" ? 0.4 : 2 / 3) * element.mass * element.radius ** 2;
        const inverseEffectiveMass = 1 / element.mass + contactRadius ** 2 / shooter.inertiaKgM2 + (spinRatio * element.radius) ** 2 / ballInertia;
        const impulse = Math.max(0, (rimSpeed - ballSpeed) / inverseEffectiveMass);
        body.applyImpulse(scale3(direction, impulse), true);
        chassis.applyImpulseAtPoint(scale3(direction, -impulse), body.translation(), true);
        const angularImpulse = impulse * element.radius * spinRatio;
        const spinImpulse = rotate3({
          x: -Math.sin(turret) * angularImpulse,
          y: 0,
          z: -Math.cos(turret) * angularImpulse,
        }, rotation);
        body.applyTorqueImpulse(spinImpulse, true);
        chassis.applyTorqueImpulse(scale3(spinImpulse, -1), true);
        const motor = config.motors.find((motor) => motor.name === shooter.motor)!;
        robot.motors[shooter.motor]!.velocityRadiansPerSecond -= impulse * contactRadius / shooter.inertiaKgM2 * motor.reduction;
        element.lastLaunchedTick = this.tick; element.controlledBy = null;
      }
    }
    const addLoad = (name: string, torque: number, inertia: number) => {
      const previous = loads.get(name);
      loads.set(name, { torque: torque + (previous?.torque ?? 0), inertia: inertia + (previous?.inertia ?? 0) });
    };
    addLoad(mechanism.intake.motor, intakeLoad, 0.0004);
    addLoad(mechanism.feeder.motor, feederLoad / feederReduction, 0.0005 / feederReduction ** 2);
    addLoad(mechanism.shooter.motor, 0, mechanism.shooter.inertiaKgM2);
    if (mechanism.shooter.turretMotor) addLoad(mechanism.shooter.turretMotor, 0, mechanism.shooter.turretInertiaKgM2 ?? 0.012);
  }

  private advanceElement(element: ElementRuntime): void {
    if (element.location !== "field") return;
    const body = this.body(element.handle);
    // Passive resistance must not reset Rapier's sleep timer every tick.
    // Collisions and powered mechanisms still wake resting pieces normally.
    const velocity = body.linvel();
    const speed = length3(velocity);
    if (speed > 0.01) {
      const area = Math.PI * element.radius ** 2;
      const drag = scale3(velocity, -0.5 * this.parameter("airDensity") * this.parameter("sphereDrag") * area * speed);
      const magnus = scale3(cross3(body.angvel(), velocity), this.parameter("spinLift") * this.parameter("airDensity") * area * element.radius);
      body.addForce(add3(drag, magnus), false);
    }
    const collider = this.physics.getCollider(element.collider);
    let floorContact = false;
    this.physics.contactPairsWith(collider, (other) => {
      const owner = this.colliderOwners.get(other.handle);
      // Only tile friction and a pending discharge need these manifolds. Mesh
      // contacts inside a CELL/FLOWER still resolve normally in the physics step.
      if (owner !== "floor" && !(element.dischargedUntilFloorContact && owner && !this.robots.has(owner as RobotId))) return;
      if (!this.touching(collider, other)) return;
      if (owner === "floor") floorContact = true;
      // G409 permits collection after contact with any other surface, not only tile.
      if (owner && !this.robots.has(owner as RobotId)) element.dischargedUntilFloorContact = false;
    });
    if (floorContact) {
      const angular = body.angvel();
      const angularSpeed = length3(angular);
      const inertia = (element.kind === "artifact" ? 0.4 : 2 / 3) * element.mass * element.radius ** 2;
      const maximumTorque = angularSpeed * inertia / PHYSICS_STEP_SECONDS;
      const resistance = Math.min(maximumTorque, this.parameter("rollingResistance") * element.mass * this.parameter("gravity") * element.radius);
      if (angularSpeed > 0) body.addTorque(scale3(angular, -resistance / angularSpeed), false);
      element.dischargedUntilFloorContact = false;
    }
  }

  private updateElements(): void {
    for (const element of this.elements.values()) {
      if (element.location !== "field") continue;
      const body = this.body(element.handle);
      const position = body.translation();
      if (Math.abs(position.x) > this.field.halfSize + 0.2 || Math.abs(position.z) > this.field.halfSize + 0.2 || position.y < -0.3) {
        element.location = "out-of-bounds"; element.controlledBy = null; body.setEnabled(false); continue;
      }
      if (element.controlledBy) {
        const robot = this.robots.get(element.controlledBy)!;
        const local = inversePoint3(position, this.body(robot.handle).translation(), this.body(robot.handle).rotation());
        const lift = robot.setup.configuration.mechanisms ? robotLiftPosition(robot.setup.configuration, robot.liftHeight) : VEC_ZERO;
        if (Math.abs(local.x) > Math.max(0.3, Math.abs(lift.x) + 0.06 + element.radius) || Math.abs(local.z) > Math.max(0.25, Math.abs(lift.z) + 0.06 + element.radius) || local.y < -0.12 || local.y > robot.liftHeight + 0.4) element.controlledBy = null;
      }
      let inHive: string | null = null;
      let inCell: string | null = null;
      for (const hive of this.hives.values()) {
        const hiveBody = this.body(hive.handle);
        const local = inversePoint3(position, hiveBody.translation(), hiveBody.rotation());
        const membership = hive.configuration.cells.find((cell) => {
          if (cell.volume) return sphereIntersectsRuleVolume(local, element.radius, cell.volume);
          const centered = sub3(local, cell.center);
          const cellPoint = cell.rotation ? rotate3(centered, conjugate(cell.rotation)) : centered;
          return Math.abs(cellPoint.x) < cell.halfExtents.x + element.radius && Math.abs(cellPoint.y) < cell.halfExtents.y + element.radius && Math.abs(cellPoint.z) < cell.halfExtents.z + element.radius;
        });
        if (membership) { inHive = hive.configuration.id; inCell = membership.id; }
      }
      if (element.previousHive && !inHive) {
        const previousHive = this.hives.get(element.previousHive)!;
        const previousCell = previousHive.configuration.cells.find((cell) => cell.id === element.previousCellId);
        const facing = previousCell && rotate3(previousCell.openingNormal ?? { x: 0, y: 1, z: 0 }, this.body(previousHive.handle).rotation());
        // A missed shot falling back from an upward CELL is not a TIP discharge.
        if (facing && facing.y < 0) element.dischargeCandidateHive = previousHive.configuration.id;
      }
      if (element.dischargeCandidateHive || element.dischargedUntilFloorContact) {
        const touching = new Set<string>();
        this.physics.contactPairsWith(this.physics.getCollider(element.collider), (other) => {
          const owner = this.colliderOwners.get(other.handle);
          if (owner && this.touching(this.physics.getCollider(element.collider), other)) touching.add(owner);
        });
        if (element.dischargeCandidateHive && !touching.has(element.dischargeCandidateHive)) {
          element.dischargedUntilFloorContact = true;
          element.dischargeCandidateHive = null;
        }
        if (element.dischargedUntilFloorContact && [...touching].some((owner) => !this.robots.has(owner as RobotId))) element.dischargedUntilFloorContact = false;
      }
      element.previousHive = inHive; element.previousCellId = inCell;
    }
  }

  private updateSensors(robot: RobotRuntime): void {
    const body = this.body(robot.handle);
    const config = robot.setup.configuration;
    const position = body.translation(); const rotation = body.rotation();
    const forward = rotate3({ x: 1, y: 0, z: 0 }, rotation);
    const up = rotate3({ x: 0, y: 1, z: 0 }, rotation);
    const right = rotate3({ x: 0, y: 0, z: 1 }, rotation);
    const yaw = Math.atan2(-forward.z, forward.x);
    const pitch = Math.asin(clampPhysical(forward.y, -1, 1));
    // FTC intrinsic yaw/pitch/roll uses the robot's up/right/forward axes.
    // Vertical components remove heading from the roll measurement.
    const roll = Math.atan2(-right.y, up.y);
    const frame = robot.sensors;
    frame.tick = this.tick; frame.simulationTimeMs = this.simulationTimeMs;
    frame.orientation = { yawRadians: yaw, pitchRadians: pitch, rollRadians: roll };
    frame.angularVelocity = rotate3(body.angvel(), conjugate(rotation));
    frame.voltage = robot.voltage;
    frame.currentAmps = Object.values(robot.motors).reduce((sum, motor) => sum + motor.currentAmps, 0);
    for (const motor of config.motors) {
      const state = robot.motors[motor.name]!;
      const direction = (robot.command.motors[motor.name]?.direction === "REVERSE" ? -1 : 1) * (motor.inverted ? -1 : 1);
      const scale = motor.profile.ticksPerRevolution / (2 * Math.PI) * direction;
      frame.motors[motor.name] = { positionTicks: (state.positionRadians - state.encoderOffsetRadians) * scale, velocityTicksPerSecond: state.velocityRadiansPerSecond * scale, currentAmps: state.currentAmps, enabled: robot.command.motors[motor.name]?.enabled !== false };
    }
    for (const sensor of config.sensors) {
      if (sensor.kind === "pinpoint" || sensor.kind === "odometry") {
        const mount = point3(sensor.mount.position, position, rotation);
        const previous = robot.odometry[sensor.name]!;
        const grounded = mount.y < this.field.floorHeight + 0.05;
        const value = frame.odometry[sensor.name] ?? { xMeters: 0, yMeters: 0, headingRadians: 0, xVelocity: 0, yVelocity: 0, angularVelocity: 0 };
        const delta = sub3(position, previous.position);
        const dt = CONTROL_STEP_TICKS * PHYSICS_STEP_SECONDS;
        const dx = grounded ? delta.x + this.random.noise(sensor.noise * length3(delta)) : 0;
        const dy = grounded ? -delta.z + this.random.noise(sensor.noise * length3(delta)) : 0;
        value.xMeters += dx; value.yMeters += dy;
        value.headingRadians = yaw - robot.setup.heading;
        value.xVelocity = dx / dt; value.yVelocity = dy / dt; value.angularVelocity = body.angvel().y;
        frame.odometry[sensor.name] = value;
        previous.position = { ...position }; previous.heading = yaw;
        continue;
      }
      let value: unknown;
      if (sensor.kind === "analog") value = robot.liftHeight / Math.max(0.001, (config.mechanisms?.lift.maximumTravel ?? 1) * (config.mechanisms?.lift.axis?.y ?? 1)) * 3.3;
      else {
        const origin = point3(sensor.mount.position, position, rotation);
        const direction = rotate3({ x: 1, y: 0, z: 0 }, multiplyQ(rotation, sensor.mount.rotation));
        const hit = this.physics.castRay(new rapier.Ray(origin, direction), sensor.maximumRange, true, undefined, undefined, undefined, body);
        const element = hit ? this.elements.get(this.colliderOwners.get(hit.collider.handle) ?? "") : undefined;
        if (sensor.kind === "digital") value = !hit;
        else if (sensor.kind === "distance") value = hit ? clampPhysical(hit.timeOfImpact + this.random.noise(sensor.noise), 0, sensor.maximumRange) : sensor.maximumRange;
        else value = element ? { red: element.kind === "pollen" || element.alliance === "red" ? 0.9 : 0.08, green: element.kind === "pollen" ? 0.8 : 0.1, blue: element.alliance === "blue" ? 0.9 : 0.06, alpha: 1 } : { red: 0, green: 0, blue: 0, alpha: 0 };
      }
      robot.pendingSensors.push({ availableTick: this.tick + Math.ceil(sensor.latencyMs / 5), name: sensor.name, kind: sensor.kind, value });
    }
    for (const pending of robot.pendingSensors.filter((pending) => pending.availableTick <= this.tick)) {
      if (pending.kind === "digital") frame.digital[pending.name] = pending.value as boolean;
      else if (pending.kind === "analog") frame.analog[pending.name] = pending.value as number;
      else if (pending.kind === "distance") frame.distance[pending.name] = pending.value as number;
      else if (pending.kind === "color") frame.color[pending.name] = pending.value as WorldSensorFrame["color"][string];
    }
    robot.pendingSensors = robot.pendingSensors.filter((pending) => pending.availableTick > this.tick);
    for (const capture of robot.pendingTagFrames) if (capture.availableTimeMs <= this.simulationTimeMs) robot.latestTagFrames[capture.camera] = capture.observations;
    robot.pendingTagFrames = robot.pendingTagFrames.filter((capture) => capture.availableTimeMs > this.simulationTimeMs);
    frame.aprilTags = Object.values(robot.latestTagFrames).flat();
  }
  private captureCameras(robot: RobotRuntime): void {
    const config = robot.setup.configuration;
    if (!config.cameras.some((camera) => (robot.cameraNextTick[camera.name] ?? 0) <= this.tick)) return;
    const body = this.body(robot.handle), position = body.translation(), rotation = body.rotation();
    for (const camera of config.cameras) {
      if ((robot.cameraNextTick[camera.name] ?? 0) > this.tick) continue;
      robot.cameraNextTick[camera.name] = (robot.cameraNextTick[camera.name] ?? 0) + Math.max(1, 200 / camera.framesPerSecond);
      const cameraPosition = point3(camera.mount.position, position, rotation);
      const cameraRotation = multiplyQ(rotation, camera.mount.rotation);
      const observations: AprilTagObservation[] = [];
      for (const tag of this.field.tags) {
        const hive = tag.parentHive ? this.hives.get(tag.parentHive) : undefined;
        const parent = hive ? this.body(hive.handle) : undefined;
        const tagPosition = parent ? point3(tag.transform.position, parent.translation(), parent.rotation()) : tag.transform.position;
        const tagRotation = parent ? multiplyQ(parent.rotation(), tag.transform.rotation) : tag.transform.rotation;
        const local = inversePoint3(tagPosition, cameraPosition, cameraRotation);
        const range = length3(local);
        const bearing = Math.atan2(-local.z, local.x); const elevation = Math.atan2(local.y, Math.hypot(local.x, local.z));
        if (local.x <= 0 || range > camera.maximumRange || Math.abs(bearing) > camera.horizontalFovRadians / 2 || Math.abs(elevation) > camera.verticalFovRadians / 2) continue;
        const facing = rotate3({ x: 1, y: 0, z: 0 }, tagRotation);
        if (dot3(facing, unit3(sub3(cameraPosition, tagPosition))) < 0.15) continue;
        const ray = new rapier.Ray(cameraPosition, unit3(sub3(tagPosition, cameraPosition)));
        const obstruction = this.physics.castRay(ray, Math.max(0, range - tag.sizeMeters * 0.02), true, undefined, undefined, undefined, body);
        if (obstruction && obstruction.timeOfImpact < range - 0.008) continue;
        const noise = camera.positionNoiseMeters * (1 + range ** 2);
        const translation = add3(local, { x: this.random.noise(noise), y: this.random.noise(noise), z: this.random.noise(noise) });
        observations.push({ id: tag.id, camera: camera.name, captureTimeMs: this.simulationTimeMs, availableTimeMs: this.simulationTimeMs + camera.latencyMs, translation, rotation: multiplyQ(conjugate(cameraRotation), tagRotation), rangeMeters: length3(translation), bearingRadians: bearing + this.random.noise(camera.angleNoiseRadians), elevationRadians: elevation + this.random.noise(camera.angleNoiseRadians) });
      }
      // Empty captures are frames too: after latency they clear previously visible tags.
      robot.pendingTagFrames.push({ camera: camera.name, availableTimeMs: this.simulationTimeMs + camera.latencyMs, observations });
    }
  }

}
