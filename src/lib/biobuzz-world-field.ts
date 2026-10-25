import { createBiobuzzAllRounder, meshBounds, readGlbColliders, type HiveConfiguration, type Quaternion, type RobotId, type SimulationWorldOptions, type Vector3, type WorldAlliance, type WorldCollider, type WorldFieldConfiguration, type WorldRobotConfiguration, type WorldRobotSetup } from "@ftc-studio/sim-core";
import layout from "./biobuzz-field-layout.json";
import physicsLayout from "./biobuzz-physics-layout.json";
import flowerScoring from "./biobuzz-flower-scoring.json";
import { fetchWorldAsset, type WorldAssetLoader } from "./legacy-world-field";

const vector = (values: readonly number[]): Vector3 => ({ x: values[0]!, y: values[1]!, z: values[2]! });
const INNER_WALL = 1.7951196; // STEP: inner surface of FTC Field Side Glass 11in.
const pollenRadius = 0.03556;

/** Fit a narrow solid frame leg with one rotated box instead of thousands of tiny CAD triangles. */
function frameLegCollider(collider: WorldCollider): WorldCollider {
  if (collider.shape.kind !== "mesh") return collider;
  const vertices = collider.shape.vertices;
  let minY = Infinity, maxY = -Infinity;
  for (let i = 1; i < vertices.length; i += 3) { minY = Math.min(minY, vertices[i]!); maxY = Math.max(maxY, vertices[i]!); }
  const low = { x: 0, z: 0, n: 0 }, high = { x: 0, z: 0, n: 0 };
  const band = (maxY - minY) * 0.1;
  for (let i = 0; i < vertices.length; i += 3) {
    const y = vertices[i + 1]!;
    if (y <= minY + band) { low.x += vertices[i]!; low.z += vertices[i + 2]!; low.n++; }
    if (y >= maxY - band) { high.x += vertices[i]!; high.z += vertices[i + 2]!; high.n++; }
  }
  if (!low.n || !high.n) return collider;
  const rise = { x: high.x / high.n - low.x / low.n, y: maxY - minY, z: high.z / high.n - low.z / low.n };
  const riseLength = Math.hypot(rise.x, rise.y, rise.z);
  const up = { x: rise.x / riseLength, y: rise.y / riseLength, z: rise.z / riseLength };
  const lateralLength = Math.hypot(up.x, up.z);
  const across = lateralLength > 1e-6 ? { x: up.z / lateralLength, y: 0, z: -up.x / lateralLength } : { x: 1, y: 0, z: 0 };
  const depth = { x: across.y * up.z - across.z * up.y, y: across.z * up.x - across.x * up.z, z: across.x * up.y - across.y * up.x };
  const axes = [across, up, depth];
  const lows = [Infinity, Infinity, Infinity], highs = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < vertices.length; i += 3) {
    for (let axis = 0; axis < 3; axis++) {
      const projection = vertices[i]! * axes[axis]!.x + vertices[i + 1]! * axes[axis]!.y + vertices[i + 2]! * axes[axis]!.z;
      lows[axis] = Math.min(lows[axis]!, projection); highs[axis] = Math.max(highs[axis]!, projection);
    }
  }
  const middle = axes.map((_, i) => (lows[i]! + highs[i]!) / 2);
  return {
    ...collider,
    position: {
      x: across.x * middle[0]! + up.x * middle[1]! + depth.x * middle[2]!,
      y: across.y * middle[0]! + up.y * middle[1]! + depth.y * middle[2]!,
      z: across.z * middle[0]! + up.z * middle[1]! + depth.z * middle[2]!,
    },
    rotation: tagRotation(across, up),
    shape: { kind: "box", halfExtents: { x: (highs[0]! - lows[0]!) / 2 + 0.002, y: (highs[1]! - lows[1]!) / 2 + 0.002, z: (highs[2]! - lows[2]!) / 2 + 0.002 } },
  };
}

function solidFrameCollider(collider: WorldCollider): WorldCollider {
  if (collider.shape.kind !== "mesh") return collider;
  const { center, halfExtents } = meshBounds(collider);
  return { ...collider, position: center, shape: { kind: "box", halfExtents } };
}

/** Collision-only open rings; the visible FLOWER still uses the complete CAD. */
function flowerColliderProxies(collider: WorldCollider): WorldCollider[] {
  if (collider.shape.kind !== "mesh" || collider.shape.indices.length < 24_000) return [collider];
  const { center, halfExtents } = meshBounds(collider);
  // The foot and top rim affect ball settling and FLOWER ownership. Keep their
  // exact CAD collision; the middle ring is the expensive robot-contact band.
  if (center.y < 0.04 || center.y > 0.2) return [collider];
  // Backstops curve around the mouth; their bounding boxes would obstruct it.
  if (halfExtents.x <= 0.05 || halfExtents.z <= 0.05) return [collider];
  const opening = 0.0508;
  const innerX = Math.min(opening, halfExtents.x - 0.008);
  const innerZ = Math.min(opening, halfExtents.z - 0.008);
  const count = 16;
  return Array.from({ length: count }, (_, index) => {
    const angle = 2 * Math.PI * index / count;
    const tangent = { x: -halfExtents.x * Math.sin(angle), z: halfExtents.z * Math.cos(angle) };
    const tangentLength = Math.hypot(tangent.x, tangent.z);
    const radial = { x: tangent.z / tangentLength, y: 0, z: -tangent.x / tangentLength };
    const middleX = (halfExtents.x + innerX) / 2;
    const middleZ = (halfExtents.z + innerZ) / 2;
    const radialThickness = (halfExtents.x - innerX) * Math.cos(angle) * radial.x + (halfExtents.z - innerZ) * Math.sin(angle) * radial.z;
    const segmentLength = Math.hypot(middleX * Math.sin(angle), middleZ * Math.cos(angle)) * Math.PI / count + 0.003;
    return {
      id: `${collider.id}/ring-${index}`,
      position: { x: center.x + middleX * Math.cos(angle), y: center.y, z: center.z + middleZ * Math.sin(angle) },
      rotation: tagRotation(radial, { x: 0, y: 1, z: 0 }),
      shape: { kind: "box" as const, halfExtents: { x: radialThickness / 2 + 0.001, y: halfExtents.y, z: segmentLength } },
    };
  });
}

export interface BiobuzzWorldRequest {
  seed: number;
  alliance: WorldAlliance;
  startPosition: "near" | "far";
  robotConfiguration: WorldRobotConfiguration;
}

/** Camera/tag convention: +X faces out of the printed tag, +Y is printed up. */
function tagRotation(normal: Vector3, up: Vector3): Quaternion {
  const z = { x: normal.y * up.z - normal.z * up.y, y: normal.z * up.x - normal.x * up.z, z: normal.x * up.y - normal.y * up.x };
  const m = [normal.x, up.x, z.x, normal.y, up.y, z.y, normal.z, up.z, z.z];
  const trace = m[0]! + m[4]! + m[8]!;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    return { w: s / 4, x: (m[7]! - m[5]!) / s, y: (m[2]! - m[6]!) / s, z: (m[3]! - m[1]!) / s };
  }
  const i = m[0]! > m[4]! && m[0]! > m[8]! ? 0 : m[4]! > m[8]! ? 1 : 2;
  const j = (i + 1) % 3, k = (i + 2) % 3;
  const s = Math.sqrt(1 + m[i * 3 + i]! - m[j * 3 + j]! - m[k * 3 + k]!) * 2;
  const xyz = [0, 0, 0]; xyz[i] = s / 4;
  xyz[j] = (m[i * 3 + j]! + m[j * 3 + i]!) / s;
  xyz[k] = (m[i * 3 + k]! + m[k * 3 + i]!) / s;
  return { ...vector(xyz), w: (m[k * 3 + j]! - m[j * 3 + k]!) / s };
}

function robotSetups(request: BiobuzzWorldRequest): WorldRobotSetup[] {
  return (["red", "blue"] as const).flatMap((alliance) => [1, 2].map((slot) => {
    const id = `${alliance}-${slot}` as RobotId;
    const player = alliance === request.alliance && slot === 1;
    const configuration = player ? request.robotConfiguration : createBiobuzzAllRounder();
    const swap = alliance === request.alliance && request.startPosition === "far";
    const near = (slot === 1) !== swap;
    const sign = alliance === "red" ? -1 : 1;
    return { id, alliance, controller: player ? "opmode" as const : "policy" as const, configuration,
      position: { x: sign * (INNER_WALL - configuration.chassis.size.x / 2), y: 0.105, z: (near ? 1.02 : -1.49) * -sign }, heading: alliance === "red" ? 0 : Math.PI };
  }));
}

function initialElements(robots: WorldRobotSetup[]): WorldFieldConfiguration["spawns"] {
  const spawns: WorldFieldConfiguration["spawns"] = [];
  const pollen = layout.initialGamePieces.find((group) => group.kind === "pollen")!.instances;
  let pollenIndex = 1;
  const addPollen = (position: readonly number[], robotId?: RobotId) => spawns.push({ id: `pollen-${String(pollenIndex++).padStart(2, "0")}`, kind: "pollen", alliance: null, position: vector(position), location: "field", ...(robotId ? { robotId } : {}) });
  for (const flower of layout.flowers) {
    const matching = pollen.filter((ball) => Math.hypot(ball.positionMeters[0]! - flower.positionMeters[0]!, ball.positionMeters[2]! - flower.positionMeters[2]!) < 0.02).sort((a, b) => a.positionMeters[1]! - b.positionMeters[1]!);
    if (matching.length !== 4) throw new Error(`Official field asset requires four POLLEN in ${flower.id}.`);
    matching.forEach((ball) => addPollen(ball.positionMeters));
  }
  for (const alliance of ["red", "blue"] as const) {
    const sign = alliance === "red" ? -1 : 1;
    const garden = pollen.filter((ball) => ball.positionMeters[0]! * sign > 1.4 && ball.positionMeters[0]! * sign < 1.8 && ball.positionMeters[2]! * -sign > 1.7).sort((a, b) => Math.abs(b.positionMeters[0]!) - Math.abs(a.positionMeters[0]!));
    if (garden.length !== 4) throw new Error(`Official field asset requires four ${alliance} GARDEN POLLEN.`);
    garden.forEach((ball) => addPollen(ball.positionMeters));
  }
  for (const robot of robots) {
    // Four separate balls contact the front rail faces. These are robot-relative legal choices,
    // not the CAD's off-field placeholders for team-selected preloads (V1 §10.3.1/G304).
    for (const lateral of [-0.17, -0.09, 0.09, 0.17]) {
      const forward = robot.configuration.chassis.size.x / 2 + pollenRadius;
      addPollen([robot.position.x + Math.cos(robot.heading) * forward + Math.sin(robot.heading) * lateral, pollenRadius, robot.position.z - Math.sin(robot.heading) * forward + Math.cos(robot.heading) * lateral], robot.id);
    }
  }
  for (const alliance of ["red", "blue"] as const) {
    const nectar = layout.initialGamePieces.find((group) => group.kind === "nectar" && group.alliance === alliance)!;
    const inCell = nectar.instances.filter((ball) => ball.positionMeters[1]! > 1).sort((a, b) => a.positionMeters[0]! - b.positionMeters[0]!);
    const supply = nectar.instances.filter((ball) => ball.positionMeters[1]! < 1).sort((a, b) => a.positionMeters[2]! - b.positionMeters[2]!);
    if (inCell.length !== 3 || supply.length !== 5) throw new Error(`Official field asset requires three CELL and five supply ${alliance} NECTAR.`);
    [...inCell, ...supply].forEach((ball, index) => spawns.push({ id: `nectar-${alliance}-${String(index + 1).padStart(2, "0")}`, kind: "nectar", alliance, position: vector(ball.positionMeters), location: index < 3 ? "field" : "supply" }));
  }
  return spawns;
}

export async function createBiobuzzWorldOptions(request: BiobuzzWorldRequest, loadAsset: WorldAssetLoader = fetchWorldAsset): Promise<SimulationWorldOptions> {
  const robots = robotSetups(request);
  const staticGroups = layout.assets.staticCollision.groups.filter((group) => group.id !== "floor"); // Tile-top plane is Y=0; seams/compliance await measured calibration.
  const collisionAssets = [
    ...staticGroups.map((group) => ({ url: group.url, id: group.id === "perimeter-walls" ? "wall" : group.id })),
    ...layout.movableBodies.flatMap((hive) => [hive.collider.url, ...hive.cells.map((cell) => cell.collider.url)].map((url) => ({ url, id: hive.id }))),
  ];
  const loadedColliders = await Promise.all(collisionAssets.map(async ({ url, id }) => readGlbColliders(await loadAsset(url), id)));
  const colliders = loadedColliders.slice(0, staticGroups.length).flat()
    .filter((collider) => !collider.id.startsWith("frame/") || !["Panel Sticker", "Under Tile Bar"].some((part) => collider.id.includes(part)))
    .flatMap((collider) => {
      if (collider.id.startsWith("flowers/")) return flowerColliderProxies(collider);
      if (!collider.id.startsWith("frame/")) return collider;
      if (collider.id.includes("A-Frame Leg")) return [frameLegCollider(collider)];
      if (["Sheet Metal Foot Bar", "Frame Foot"].some((part) => collider.id.includes(part))) return [solidFrameCollider(collider)];
      return [collider];
    });
  const hives: HiveConfiguration[] = [];
  const tags: WorldFieldConfiguration["tags"] = [];
  let loadedHiveAssetIndex = staticGroups.length;
  for (const hive of layout.movableBodies) {
    const derived = physicsLayout.hives.find((candidate) => candidate.id === hive.id)!;
    const movingAssetCount = 1 + hive.cells.length;
    const moving = loadedColliders.slice(loadedHiveAssetIndex, loadedHiveAssetIndex + movingAssetCount).flat();
    loadedHiveAssetIndex += movingAssetCount;
    hives.push({ id: hive.id, alliance: hive.alliance as WorldAlliance, pivot: vector(hive.pivot.position), axis: vector(hive.pivot.axis), initialAngle: 0,
      lowerLimit: derived.lowerLimit, upperLimit: derived.upperLimit,
      // Experimental aggregate values, exposed in WORLD_PHYSICAL_PARAMETERS. They are not CAD mass properties.
      physicalParameters: { massKg: "hiveMass", centerOfMassRadius: "hiveComRadius", angularDamping: "hiveBearingDamping" },
      massKg: 2, centerOfMass: { x: 0, y: Math.sqrt(3) / 2 * 0.045, z: (hive.alliance === "red" ? -0.5 : 0.5) * 0.045 }, angularDamping: 0.15,
      colliders: moving, cells: derived.cells.map(({ id, center, halfExtents, openingNormal, volume }) => ({ id, center, halfExtents, openingNormal, volume })), dampers: derived.dampers,
    });
    for (const cell of derived.cells) for (const tag of cell.tags) tags.push({ id: tag.id, parentHive: hive.id, sizeMeters: layout.apriltags.targetSizeMeters, transform: { position: tag.position, rotation: tagRotation(tag.normal, tag.up) } });
  }
  return { seed: request.seed, robots, recordCommands: true, field: {
    preset: "biobuzz-2026-2027", halfSize: INNER_WALL, floorHeight: 0, colliders, hives, tags,
    flowers: flowerScoring.instances.map((flower) => ({ id: flower.id, position: { x: flower.position[0]!, y: 0, z: flower.position[2]! }, scoringRadius: flower.radius, bottom: flower.bottom, top: flower.top })),
    // Tape extents from official STEP, not inferred from nominal two-foot tile spacing.
    gardens: [
      { id: "garden-red", alliance: "red", center: { x: (-1.7805665 - 1.2041897) / 2, y: 0, z: (1.7297665 + 1.7805665) / 2 }, halfExtents: { x: (1.7805665 - 1.2041897) / 2, y: 1000, z: 0.0254 } },
      { id: "garden-blue", alliance: "blue", center: { x: (1.7805665 + 1.2041897) / 2, y: 0, z: (-1.7297665 - 1.7805665) / 2 }, halfExtents: { x: (1.7805665 - 1.2041897) / 2, y: 1000, z: 0.0254 } },
    ],
    loadingZones: (["red", "blue"] as const).map((alliance) => { const sign = alliance === "red" ? -1 : 1; return { alliance, center: { x: sign * (INNER_WALL + 1.5011665) / 2, y: 0, z: sign * (1.1836135 + 0.6072367) / 2 }, halfExtents: { x: (INNER_WALL - 1.5011665) / 2, y: 1000, z: (1.1836135 - 0.6072367) / 2 } }; }),
    spawns: initialElements(robots),
  } };
}
