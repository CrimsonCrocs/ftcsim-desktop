import type {
  DriveRole,
  RobotConfigurationCommand,
  RobotConfigurationDocument,
  RobotConfigurationV2,
} from "./index";

export const ROBOT_CONFIGURATION_GRAPH_SCHEMA_VERSION = 1;
export const ROBOT_CONFIGURATION_GRAPH_COORDINATE_LIMIT = 100_000;

export interface RobotConfigurationGraphPoint {
  x: number;
  y: number;
}

export interface RobotConfigurationEditorState {
  schemaVersion: typeof ROBOT_CONFIGURATION_GRAPH_SCHEMA_VERSION;
  nodePositions: Record<string, RobotConfigurationGraphPoint>;
}

export type RobotConfigurationGraphNode =
  | {
      id: string;
      kind: "controller";
      controllerId: string;
      position: RobotConfigurationGraphPoint;
    }
  | {
      id: string;
      kind: "motor";
      deviceId: string;
      position: RobotConfigurationGraphPoint;
    }
  | {
      id: typeof DRIVETRAIN_GRAPH_NODE_ID;
      kind: "drivetrain";
      roles: readonly DriveRole[];
      position: RobotConfigurationGraphPoint;
    };

export type RobotConfigurationGraphEdge =
  | {
      id: string;
      kind: "port";
      deviceId: string;
      source: string;
      sourceHandle: string;
      target: string;
      targetHandle: typeof MOTOR_CONTROLLER_HANDLE_ID;
    }
  | {
      id: string;
      kind: "drive";
      deviceId: string;
      role: DriveRole;
      source: string;
      sourceHandle: typeof MOTOR_SHAFT_HANDLE_ID;
      target: typeof DRIVETRAIN_GRAPH_NODE_ID;
      targetHandle: string;
    };

export interface RobotConfigurationGraph {
  nodes: RobotConfigurationGraphNode[];
  edges: RobotConfigurationGraphEdge[];
}

export interface RobotConfigurationGraphConnection {
  source: string | null;
  sourceHandle: string | null;
  target: string | null;
  targetHandle: string | null;
}

export type RobotConfigurationGraphConnectionPlan =
  | { accepted: true; command: RobotConfigurationCommand }
  | { accepted: false; reason: string };

export const DRIVETRAIN_GRAPH_NODE_ID = "drivetrain" as const;
export const MOTOR_CONTROLLER_HANDLE_ID = "controller" as const;
export const MOTOR_SHAFT_HANDLE_ID = "shaft" as const;

const FOUR_DRIVE_ROLES: readonly DriveRole[] = ["frontLeft", "frontRight", "backLeft", "backRight"];
export const ROBOT_CONFIGURATION_GRAPH_NODE_DIMENSIONS = {
  controller: { width: 240, height: 204 },
  motor: { width: 224, height: 104 },
  drivetrain: { width: 260, height: 208 },
} as const;

export interface RobotConfigurationGraphNodeDimensions {
  width: number;
  height: number;
}

const GRAPH_NODE_GAP = 24;
const GRAPH_COLLISION_GAP = 16;
const LEGACY_GRAPH_COLUMNS = { controller: 0, motor: 330, drivetrain: 1_080 } as const;
const LEGACY_CONTROLLER_ROW_HEIGHT = 340;
const LEGACY_MOTOR_COLUMN_WIDTH = 370;
const LEGACY_MOTOR_ROW_HEIGHT = 300;
const LEGACY_MOTOR_COLUMN_COUNT = 2;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function graphRoles(configuration: RobotConfigurationV2): readonly DriveRole[] {
  return configuration.drivetrain.kind === "h-drive"
    ? [...FOUR_DRIVE_ROLES, "center"]
    : FOUR_DRIVE_ROLES;
}

function roundedBoundedCoordinate(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(
    ROBOT_CONFIGURATION_GRAPH_COORDINATE_LIMIT,
    Math.max(-ROBOT_CONFIGURATION_GRAPH_COORDINATE_LIMIT, Math.round(value)),
  );
}

function normalizedPoint(value: unknown, fallback: RobotConfigurationGraphPoint): RobotConfigurationGraphPoint {
  if (!isRecord(value)) return fallback;
  const x = roundedBoundedCoordinate(value.x);
  const y = roundedBoundedCoordinate(value.y);
  return x === null || y === null ? fallback : { x, y };
}

function hasExactLegacyDefaultPositions(
  configuration: RobotConfigurationV2,
  positions: Record<string, unknown>,
): boolean {
  const expected: Record<string, RobotConfigurationGraphPoint> = {};
  configuration.controllers.forEach((controller, index) => {
    expected[controllerGraphNodeId(controller.id)] = {
      x: LEGACY_GRAPH_COLUMNS.controller,
      y: index * LEGACY_CONTROLLER_ROW_HEIGHT,
    };
  });
  configuration.devices.forEach((device, index) => {
    expected[motorGraphNodeId(device.id)] = {
      x: LEGACY_GRAPH_COLUMNS.motor + (index % LEGACY_MOTOR_COLUMN_COUNT) * LEGACY_MOTOR_COLUMN_WIDTH,
      y: Math.floor(index / LEGACY_MOTOR_COLUMN_COUNT) * LEGACY_MOTOR_ROW_HEIGHT,
    };
  });
  expected[DRIVETRAIN_GRAPH_NODE_ID] = { x: LEGACY_GRAPH_COLUMNS.drivetrain, y: 0 };

  const actualIds = Object.keys(positions);
  const expectedIds = Object.keys(expected);
  if (actualIds.length !== expectedIds.length || expectedIds.some((id) => !Object.hasOwn(positions, id))) return false;
  return expectedIds.every((id) => {
    const actual = positions[id];
    const target = expected[id]!;
    return isRecord(actual) && actual.x === target.x && actual.y === target.y;
  });
}

export function controllerGraphNodeId(controllerId: string): string {
  return `controller:${encodeURIComponent(controllerId)}`;
}

export function motorGraphNodeId(deviceId: string): string {
  return `motor:${encodeURIComponent(deviceId)}`;
}

export function hubPortHandleId(port: number): string {
  return `port:${port}`;
}

export function driveRoleHandleId(role: DriveRole): string {
  return `role:${role}`;
}

export function defaultRobotConfigurationNodePositions(
  configuration: RobotConfigurationV2,
): Record<string, RobotConfigurationGraphPoint> {
  const items: RobotConfigurationGraphLayoutItem[] = [
    ...configuration.controllers.map((controller) => ({
      id: controllerGraphNodeId(controller.id),
      kind: "controller" as const,
      position: { x: 0, y: 0 },
    })),
    ...configuration.devices.map((device) => ({
      id: motorGraphNodeId(device.id),
      kind: "motor" as const,
      position: { x: 0, y: 0 },
    })),
    { id: DRIVETRAIN_GRAPH_NODE_ID, kind: "drivetrain" as const, position: { x: 0, y: 0 } },
  ];
  return arrangeRobotConfigurationGraphNodes(items);
}

export type RobotConfigurationGraphLayoutItem = Pick<RobotConfigurationGraphNode, "id" | "kind" | "position">;

function nodeDimensions(
  node: RobotConfigurationGraphLayoutItem,
  measured: Readonly<Record<string, RobotConfigurationGraphNodeDimensions>>,
): RobotConfigurationGraphNodeDimensions {
  return measured[node.id] ?? ROBOT_CONFIGURATION_GRAPH_NODE_DIMENSIONS[node.kind];
}

/** Returns true when any measured or fallback node boxes collide or sit too close together. */
export function hasOverlappingRobotConfigurationGraphNodes(
  nodes: readonly RobotConfigurationGraphLayoutItem[],
  measured: Readonly<Record<string, RobotConfigurationGraphNodeDimensions>> = {},
): boolean {
  for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
    const left = nodes[leftIndex]!;
    const leftSize = nodeDimensions(left, measured);
    for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
      const right = nodes[rightIndex]!;
      const rightSize = nodeDimensions(right, measured);
      const separatedHorizontally = left.position.x + leftSize.width + GRAPH_COLLISION_GAP <= right.position.x
        || right.position.x + rightSize.width + GRAPH_COLLISION_GAP <= left.position.x;
      const separatedVertically = left.position.y + leftSize.height + GRAPH_COLLISION_GAP <= right.position.y
        || right.position.y + rightSize.height + GRAPH_COLLISION_GAP <= left.position.y;
      if (!separatedHorizontally && !separatedVertically) return true;
    }
  }
  return false;
}

/** Produces a compact, deterministic three-column layout using live node sizes when available. */
export function arrangeRobotConfigurationGraphNodes(
  nodes: readonly RobotConfigurationGraphLayoutItem[],
  measured: Readonly<Record<string, RobotConfigurationGraphNodeDimensions>> = {},
): Record<string, RobotConfigurationGraphPoint> {
  const controllers = nodes.filter((node) => node.kind === "controller");
  const motors = nodes.filter((node) => node.kind === "motor");
  const drivetrain = nodes.find((node) => node.kind === "drivetrain");
  const positions: Record<string, RobotConfigurationGraphPoint> = {};

  let controllerY = 0;
  for (const controller of controllers) {
    const size = nodeDimensions(controller, measured);
    positions[controller.id] = { x: 0, y: controllerY };
    controllerY += size.height + GRAPH_NODE_GAP;
  }

  const columns = motors.length > 5 ? 2 : 1;
  const controllerColumnWidth = Math.max(
    ...controllers.map((controller) => nodeDimensions(controller, measured).width),
    ROBOT_CONFIGURATION_GRAPH_NODE_DIMENSIONS.controller.width,
  );
  const firstMotorX = controllerColumnWidth + GRAPH_NODE_GAP;
  const motorColumnWidth = Math.max(...motors.map((motor) => nodeDimensions(motor, measured).width), 0);
  const motorRows = Math.ceil(motors.length / columns);
  let motorY = 0;
  for (let row = 0; row < motorRows; row += 1) {
    const rowMotors = motors.slice(row * columns, (row + 1) * columns);
    const rowHeight = Math.max(...rowMotors.map((motor) => nodeDimensions(motor, measured).height));
    rowMotors.forEach((motor, column) => {
      positions[motor.id] = {
        x: firstMotorX + column * (motorColumnWidth + GRAPH_NODE_GAP),
        y: motorY,
      };
    });
    motorY += rowHeight + GRAPH_NODE_GAP;
  }

  if (drivetrain) {
    const drivetrainSize = nodeDimensions(drivetrain, measured);
    const motorColumns = motors.length === 0 ? 0 : columns;
    const drivetrainX = motorColumns > 0
      ? firstMotorX + motorColumns * (motorColumnWidth + GRAPH_NODE_GAP)
      : firstMotorX;
    const motorContentHeight = Math.max(0, motorY - (motorRows > 0 ? GRAPH_NODE_GAP : 0));
    positions[drivetrain.id] = {
      x: drivetrainX,
      y: Math.max(0, Math.round((motorContentHeight - drivetrainSize.height) / 2)),
    };
  }

  return positions;
}

/**
 * Produces a complete, bounded graph layout for the current hardware document.
 * Unknown/stale node ids are intentionally pruned; missing or malformed points
 * receive deterministic defaults without invalidating the hardware schema.
 */
export function normalizeRobotConfigurationEditor(
  configuration: RobotConfigurationV2,
  rawEditor: unknown = configuration.editor,
): RobotConfigurationEditorState {
  const defaults = defaultRobotConfigurationNodePositions(configuration);
  const rawPositions = isRecord(rawEditor)
    && rawEditor.schemaVersion === ROBOT_CONFIGURATION_GRAPH_SCHEMA_VERSION
    && isRecord(rawEditor.nodePositions)
    ? rawEditor.nodePositions
    : {};
  if (hasExactLegacyDefaultPositions(configuration, rawPositions)) {
    return { schemaVersion: ROBOT_CONFIGURATION_GRAPH_SCHEMA_VERSION, nodePositions: defaults };
  }
  const nodePositions = Object.fromEntries(Object.entries(defaults).map(([nodeId, fallback]) => [
    nodeId,
    normalizedPoint(rawPositions[nodeId], fallback),
  ]));
  return {
    schemaVersion: ROBOT_CONFIGURATION_GRAPH_SCHEMA_VERSION,
    nodePositions,
  };
}

export function deriveRobotConfigurationGraph(
  document: RobotConfigurationDocument,
): RobotConfigurationGraph {
  const configuration = document.configuration;
  const editor = normalizeRobotConfigurationEditor(configuration);
  const roles = graphRoles(configuration);
  const controllerIds = new Set(configuration.controllers.map((controller) => controller.id));
  const deviceIds = new Set(configuration.devices.map((device) => device.id));
  const nodes: RobotConfigurationGraphNode[] = [
    ...configuration.controllers.map((controller) => ({
      id: controllerGraphNodeId(controller.id),
      kind: "controller" as const,
      controllerId: controller.id,
      position: editor.nodePositions[controllerGraphNodeId(controller.id)],
    })),
    ...configuration.devices.map((device) => ({
      id: motorGraphNodeId(device.id),
      kind: "motor" as const,
      deviceId: device.id,
      position: editor.nodePositions[motorGraphNodeId(device.id)],
    })),
    {
      id: DRIVETRAIN_GRAPH_NODE_ID,
      kind: "drivetrain" as const,
      roles,
      position: editor.nodePositions[DRIVETRAIN_GRAPH_NODE_ID],
    },
  ];
  const edges: RobotConfigurationGraphEdge[] = [];

  for (const device of configuration.devices) {
    if (controllerIds.has(device.controllerId)
        && Number.isInteger(device.port)
        && device.port >= 0
        && device.port <= 3) {
      edges.push({
        id: `port:${encodeURIComponent(device.id)}`,
        kind: "port",
        deviceId: device.id,
        source: controllerGraphNodeId(device.controllerId),
        sourceHandle: hubPortHandleId(device.port),
        target: motorGraphNodeId(device.id),
        targetHandle: MOTOR_CONTROLLER_HANDLE_ID,
      });
    }
  }

  for (const role of roles) {
    const deviceId = configuration.drivetrain.bindings[role];
    if (!deviceId || !deviceIds.has(deviceId)) continue;
    edges.push({
      id: `drive:${role}`,
      kind: "drive",
      deviceId,
      role,
      source: motorGraphNodeId(deviceId),
      sourceHandle: MOTOR_SHAFT_HANDLE_ID,
      target: DRIVETRAIN_GRAPH_NODE_ID,
      targetHandle: driveRoleHandleId(role),
    });
  }

  return { nodes, edges };
}

function parsePortHandle(handleId: string | null): number | null {
  const match = /^port:([0-3])$/u.exec(handleId ?? "");
  return match ? Number(match[1]) : null;
}

function parseRoleHandle(handleId: string | null): DriveRole | null {
  const match = /^role:(frontLeft|frontRight|backLeft|backRight|center)$/u.exec(handleId ?? "");
  return match ? match[1] as DriveRole : null;
}

export function planRobotConfigurationGraphConnection(
  document: RobotConfigurationDocument,
  connection: RobotConfigurationGraphConnection,
): RobotConfigurationGraphConnectionPlan {
  if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) {
    return { accepted: false, reason: "Choose both graph endpoints before connecting them." };
  }

  const controller = document.configuration.controllers.find((candidate) => (
    controllerGraphNodeId(candidate.id) === connection.source
  ));
  const targetMotor = document.configuration.devices.find((candidate) => (
    motorGraphNodeId(candidate.id) === connection.target
  ));
  const port = parsePortHandle(connection.sourceHandle);
  if (controller && targetMotor && port !== null && connection.targetHandle === MOTOR_CONTROLLER_HANDLE_ID) {
    return {
      accepted: true,
      command: {
        type: "connect-motor-port",
        deviceId: targetMotor.id,
        controllerId: controller.id,
        port,
      },
    };
  }

  const sourceMotor = document.configuration.devices.find((candidate) => (
    motorGraphNodeId(candidate.id) === connection.source
  ));
  const role = parseRoleHandle(connection.targetHandle);
  if (sourceMotor
      && connection.sourceHandle === MOTOR_SHAFT_HANDLE_ID
      && connection.target === DRIVETRAIN_GRAPH_NODE_ID
      && role
      && graphRoles(document.configuration).includes(role)) {
    return {
      accepted: true,
      command: { type: "bind-drive-role", role, deviceId: sourceMotor.id },
    };
  }

  return {
    accepted: false,
    reason: "Connect a REV hub motor port to a motor, or a motor shaft to a drivetrain role.",
  };
}
