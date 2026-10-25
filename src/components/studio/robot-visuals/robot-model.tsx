"use client";

import { memo, useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { DoubleSide, FrontSide, Group, Quaternion, Vector3 } from "three";
import { robotGateGeometry, robotLiftPosition, type WorldObservation, type WorldRobotSetup } from "@ftc-studio/sim-core";
import { getRobotVisualState, isLateralWheel } from "@/lib/robot-visual-state";
import { Assembly, type Finish, type GeometryPart } from "./geometry";
import { cameraAssembly, chassisAssembly, fixedMechanismsAssembly, flywheelAssembly, hoodAssembly, liftStageAssemblies, liftTrayAssembly, rollerAssembly, turretAssembly } from "./assemblies";
import { ImportedRobotModel } from "./imported-robot-model";

export const MECANUM_WHEEL_ASSETS = ["/robots/gobilda-mecanum/wheel-left.glb", "/robots/gobilda-mecanum/wheel-right.glb"] as const;
const FINISHES: Record<Finish, { color: string; metalness: number; roughness: number }> = {
  aluminum: { color: "#b7c1ca", metalness: 0.48, roughness: 0.35 },
  edge: { color: "#687782", metalness: 0.45, roughness: 0.42 },
  dark: { color: "#2a333b", metalness: 0.15, roughness: 0.55 },
  rubber: { color: "#171c22", metalness: 0, roughness: 0.88 },
  alliance: { color: "#c5444b", metalness: 0.2, roughness: 0.4 },
  green: { color: "#77ae65", metalness: 0, roughness: 0.8 },
  gold: { color: "#be9950", metalness: 0.5, roughness: 0.35 },
  clear: { color: "#c0d6e0", metalness: 0, roughness: 0.25 },
  lens: { color: "#122938", metalness: 0.35, roughness: 0.12 },
  redWire: { color: "#923841", metalness: 0, roughness: 0.6 },
};

function Parts({ parts, alliance }: { parts: GeometryPart[]; alliance: string }) {
  return <>{parts.map(({ finish, geometry }) => <mesh key={finish} geometry={geometry} castShadow={finish !== "clear"} receiveShadow={finish !== "clear"}>
    <meshStandardMaterial {...FINISHES[finish]} color={finish === "alliance" ? alliance : FINISHES[finish].color}
      transparent={finish === "clear"} opacity={finish === "clear" ? 0.16 : 1} depthWrite={finish !== "clear"} side={finish === "clear" ? DoubleSide : FrontSide} />
  </mesh>)}</>;
}

function isMecanum(angle: number) {
  return Math.abs(Math.sin(angle)) > 0.1 && Math.abs(Math.cos(angle)) > 0.1;
}

export function robotVisualAssets(robots: readonly WorldRobotSetup[]): string[] {
  return robots.some((robot) => !robot.configuration.visualModel && robot.configuration.wheels.some((wheel) => isMecanum(wheel.tractionAngle))) ? [...MECANUM_WHEEL_ASSETS] : [];
}

/** Conventional and omni tires keep their actual drivetrain type; mecanum uses vendor CAD. */
function conventionalWheel(radius: number, omni: boolean) {
  const a = new Assembly();
  a.cylinder(radius * (omni ? 0.73 : 0.96), 0.028, [0, 0, 0], omni ? "aluminum" : "rubber", [0, 0, 1], 40);
  a.cylinder(radius * 0.58, 0.029, [0, 0, 0], "aluminum");
  a.cylinder(radius * 0.2, 0.035, [0, 0, 0], "dark");
  for (let i = 0; i < (omni ? 12 : 20); i++) {
    const t = i * Math.PI * 2 / (omni ? 12 : 20);
    if (omni) a.cylinder(radius * 0.19, 0.022, [Math.cos(t) * radius * 0.81, Math.sin(t) * radius * 0.81, 0], "rubber", [-Math.sin(t), Math.cos(t), 0], 12);
    else a.box([0.008, 0.003, 0.033], [Math.cos(t) * radius * 0.975, Math.sin(t) * radius * 0.975, 0], "rubber", new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), t + Math.PI / 2));
  }
  for (let i = 0; i < 5; i++) {
    const t = i * Math.PI * 2 / 5;
    a.cylinder(radius * 0.085, 0.031, [Math.cos(t) * radius * 0.4, Math.sin(t) * radius * 0.4, 0], "dark", [0, 0, 1], 10);
  }
  return a.finish();
}

export const RobotModel = memo(function RobotModel({ setup, observation, renderCad }: {
  setup: WorldRobotSetup;
  observation: MutableRefObject<WorldObservation | null>;
  renderCad: (url: string) => ReactNode;
}) {
  return setup.configuration.visualModel ? <ImportedRobotModel setup={setup} observation={observation} /> : <BuiltInRobotModel setup={setup} observation={observation} renderCad={renderCad} />;
});

function BuiltInRobotModel({ setup, observation, renderCad }: { setup: WorldRobotSetup; observation: MutableRefObject<WorldObservation | null>; renderCad: (url: string) => ReactNode }) {
  const root = useRef<Group>(null);
  const turret = useRef<Group>(null);
  const hood = useRef<Group>(null);
  const flywheel = useRef<Group>(null);
  const intake = useRef<Group>(null);
  const feeders = useRef<(Group | null)[]>([]);
  const wheels = useRef<(Group | null)[]>([]);
  const stages = useRef<(Group | null)[]>([]);
  const carriage = useRef<Group>(null);
  const release = useRef<Group>(null);
  const gate = useRef<Group>(null);
  const config = setup.configuration;
  const m = config.mechanisms;
  const color = setup.alliance === "red" ? "#c5444b" : "#427ac7";
  const visual = useMemo(() => {
    const gateParts = new Assembly();
    if (m) {
      gateParts.box([0.14, config.chassis.size.y * 0.8, 0.004], [0.07, 0, 0], "clear");
      gateParts.box([0.14, 0.009, 0.006], [0.07, config.chassis.size.y * 0.4, 0], "edge");
      gateParts.cylinder(0.004, config.chassis.size.y, [0, 0, 0], "gold", [0, 1, 0]);
      gateParts.box([0.025, 0.015, 0.028], [0, -config.chassis.size.y / 2, 0], "dark");
    }
    return {
      chassis: chassisAssembly(config), cameras: cameraAssembly(config), gate: gateParts.finish(),
      wheels: config.wheels.map((wheel) => isMecanum(wheel.tractionAngle) ? [] : conventionalWheel(wheel.radius, wheel.rollerGrip < wheel.grip * 0.2)),
      ...(m ? {
        fixed: fixedMechanismsAssembly(config), intake: rollerAssembly(m.intake.radius, m.intake.width, true),
        feeder: rollerAssembly(0.018, m.storage.width * 0.65), turret: turretAssembly(), hood: hoodAssembly(m.shooter.wheelRadius),
        flywheel: flywheelAssembly(m.shooter.wheelRadius), tray: liftTrayAssembly(m.storage.width),
        stages: liftStageAssemblies(config),
      } : {}),
    };
  }, [config, m]);
  useEffect(() => () => {
    // Geometry passed by reference is not replaced/disposed by R3F's JSX geometry lifecycle.
    for (const part of Object.values(visual).flat(2)) part.geometry.dispose();
  }, [visual]);
  const axis = m?.lift.axis ?? { x: 0, y: 1, z: 0 };
  const liftRotation = useMemo(() => new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(axis.x, axis.y, axis.z)), [axis.x, axis.y, axis.z]);
  const fallback = useMemo(() => getRobotVisualState(config, undefined), [config]);
  const gatePosition = m ? robotGateGeometry(config) : null;
  const feederPositions = useMemo(() => {
    if (!m) return [];
    const floor = m.storage.mount.y - config.chassis.size.y / 2 + 0.014;
    return [
      [-m.storage.length * 0.32 + m.storage.mount.x, floor + 0.014, m.storage.mount.z],
      [m.storage.length * 0.27 + m.storage.mount.x, floor + 0.014, m.storage.mount.z],
      [m.shooter.mount.x - 0.098, floor + 0.034, m.shooter.mount.z],
      [m.shooter.mount.x - 0.098, m.shooter.mount.y - 0.033, m.shooter.mount.z],
    ] as [number, number, number][];
  }, [config.chassis.size.y, m]);
  useFrame(() => {
    const state = observation.current?.robots.find((robot) => robot.id === setup.id);
    if (!state || !root.current) return;
    root.current.position.set(state.position.x, state.position.y, state.position.z);
    root.current.quaternion.set(state.rotation.x, state.rotation.y, state.rotation.z, state.rotation.w);
    const pose = getRobotVisualState(config, state);
    wheels.current.forEach((wheel, index) => {
      if (!wheel) return;
      // The axle's parent orientation handles the lateral H-drive wheel.
      wheel.rotation.z = pose.wheelAngles[index]!;
    });
    if (!m) return;
    if (turret.current) turret.current.rotation.y = pose.turretAngle;
    if (hood.current) hood.current.rotation.z = pose.hoodAngle;
    if (flywheel.current) flywheel.current.rotation.z = pose.flywheelAngle;
    // Intake contacts the lower rim; feeder rollers contact their upper rim.
    if (intake.current) intake.current.rotation.z = -pose.intakeAngle;
    feeders.current.forEach((roller) => { if (roller) roller.rotation.z = pose.feederAngle; });
    if (carriage.current) {
      const position = robotLiftPosition(config, pose.liftHeight);
      carriage.current.position.set(position.x, position.y, position.z);
    }
    if (release.current) release.current.rotation.z = -pose.releaseAngle;
    if (gate.current) gate.current.rotation.y = -pose.gateAngle;
    stages.current.forEach((stage, index) => { if (stage) stage.position.y = pose.liftHeight / axis.y * index / 3; });
  });
  return <group ref={root} name={`robot:${setup.id}`} position={[setup.position.x, setup.position.y, setup.position.z]} rotation={[0, setup.heading, 0]}>
    <Parts parts={visual.chassis} alliance={color} />
    <Parts parts={visual.cameras} alliance={color} />
    {config.wheels.map((wheel, index) => <group key={wheel.motor} position={[wheel.mount.x, wheel.mount.y - wheel.suspensionTravel + 0.004, wheel.mount.z]} rotation={[0, isLateralWheel(wheel) ? Math.PI / 2 : 0, 0]}>
      <group name={`wheel:${wheel.motor}`} ref={(node: Group | null) => { wheels.current[index] = node; }}>
        {isMecanum(wheel.tractionAngle) ? <group scale={wheel.radius / 0.048}>{renderCad(MECANUM_WHEEL_ASSETS[wheel.tractionAngle < 0 ? 0 : 1])}</group> : <Parts parts={visual.wheels[index]!} alliance={color} />}
      </group>
    </group>)}
    {m && <>
      <Parts parts={visual.fixed!} alliance={color} />
      <group name="intake" ref={intake} position={[m.intake.mount.x, m.intake.mount.y, m.intake.mount.z]}><Parts parts={visual.intake!} alliance={color} /></group>
      {feederPositions.map((position, index) => <group key={index} name={`feeder:${index}`} ref={(node: Group | null) => { feeders.current[index] = node; }} position={position}><Parts parts={visual.feeder!} alliance={color} /></group>)}
      <group name="turret" ref={turret} position={[m.shooter.mount.x, m.shooter.mount.y, m.shooter.mount.z]} rotation={[0, fallback.turretAngle, 0]}>
        <Parts parts={visual.turret!} alliance={color} />
        <group name="hood" ref={hood} rotation={[0, 0, fallback.hoodAngle]}>
          <Parts parts={visual.hood!} alliance={color} />
          <group name="flywheel" ref={flywheel}><Parts parts={visual.flywheel!} alliance={color} /></group>
        </group>
      </group>
      <group position={[m.lift.mount.x, m.lift.mount.y, m.lift.mount.z]} quaternion={liftRotation}>
        {visual.stages!.map((parts, index) => <group key={index} name={`lift-stage:${index}`} ref={(node: Group | null) => { stages.current[index] = node; }}><Parts parts={parts} alliance={color} /></group>)}
      </group>
      <group name="lift-carriage" ref={carriage} position={[m.lift.mount.x, m.lift.mount.y, m.lift.mount.z]}>
        <group name="release" ref={release} rotation={[0, 0, -fallback.releaseAngle]}><Parts parts={visual.tray!} alliance={color} /></group>
      </group>
      <group name="sorting-gate" ref={gate} position={[gatePosition!.x - 0.07, gatePosition!.y, gatePosition!.z]} rotation={[0, -fallback.gateAngle, 0]}><Parts parts={visual.gate} alliance={color} /></group>
    </>}
  </group>;
}
