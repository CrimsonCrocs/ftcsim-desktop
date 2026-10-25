import { Float32BufferAttribute, Group, type Object3D, type Mesh, type BufferGeometry } from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { zipSync, strToU8 } from "fflate";
import { sha256 } from "@noble/hashes/sha2.js";
import type { SceneAssetSource } from "./scene-assets";

const MAX_ASSET_BYTES = 128 * 1024 * 1024;
const FIELD_NAMES = { "biobuzz-2026-2027": "BIOBUZZ 2026–2027", "decode-2025-2026": "DECODE 2025–2026", empty: "Empty field" };
const json = (value: unknown) => strToU8(JSON.stringify(value, null, 2));

/** Simulator +X forward/+Y up/+Z right -> AdvantageScope +X forward/+Y left/+Z up.
 * Poses already use (world.x, -world.z, yaw), so Center/Red requires no extra turn. */
function toAdvantageScopeModel(source: Object3D) {
  const root = new Group(); root.name = "FTC Simulator — meters, X forward, Z up";
  root.rotation.x = Math.PI / 2;
  root.add(source.clone(true));
  const copies = new Map<BufferGeometry, BufferGeometry>();
  root.traverse((node) => {
    if (!(node as Mesh).isMesh) return;
    const mesh = node as Mesh, original = mesh.geometry;
    const quantized = ["position", "normal", "tangent"].filter((name) => {
      const attribute = original.getAttribute(name);
      return attribute && !(attribute.array instanceof Float32Array);
    });
    if (!quantized.length && original.index && original.getAttribute("normal")) return;
    let geometry = copies.get(original);
    if (!geometry) {
      geometry = original.clone(); copies.set(original, geometry);
      for (const name of quantized) {
        const attribute = original.getAttribute(name), values = new Float32Array(attribute.count * attribute.itemSize);
        for (let index = 0; index < attribute.count; index++) {
          const components = [attribute.getX(index), attribute.getY(index), attribute.getZ(index), attribute.itemSize === 4 ? attribute.getW(index) : 0];
          for (let axis = 0; axis < attribute.itemSize; axis++) values[index * attribute.itemSize + axis] = components[axis];
        }
        geometry.setAttribute(name, new Float32BufferAttribute(values, attribute.itemSize));
      }
      if (!geometry.index) geometry.setIndex(Array.from({ length: geometry.getAttribute("position").count }, (_, index) => index));
      if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
      geometry.normalizeNormals();
    }
    // AdvantageScope bakes world transforms into vertex buffers. Integer CAD
    // positions wrap/truncate during that operation; normalized normals do too.
    mesh.geometry = geometry;
  });
  root.updateMatrixWorld(true);
  return { root, dispose: () => { for (const geometry of copies.values()) geometry.dispose(); } };
}

/** Layout contract tested against AdvantageScope 26.0.2. Both layouts select the
 * same assets; its native FTC Dashboard source names poses differently to logs. */
export function advantageScopeLayout(fieldName: string, robotName: string, live: boolean) {
  return {
    version: "26.0.2", satellites: [], hubs: [{ x: 80, y: 80, width: 1200, height: 760, state: {
      sidebar: { width: 250, expanded: ["/Robot", "Robot", "/Motors", "/Telemetry"] },
      tabs: { selected: 0, tabs: [{ type: 3, title: "FTC Simulator", controllerUUID: "ftc-simulator-field3d", controlsHeight: 160,
        controller: { game: `FTC:${fieldName}`, sources: [{ type: "robot", logKey: live ? "Robot Pose" : "/Robot/Pose", logType: "Pose2d", visible: true, options: { model: robotName } }] },
        renderer: { cameraIndex: -1, orbitFov: 50, cameraPosition: [3, 3, -5], cameraTarget: [0, .2, 0] },
      }] },
    } }] };
}

function checkGeometryBudget(objects: Object3D[]) {
  const geometries = new Set<BufferGeometry>(); let bytes = 0, meshes = 0;
  for (const object of objects) object.traverse((node) => {
    if (!(node as Mesh).isMesh) return;
    meshes++;
    const geometry = (node as Mesh).geometry;
    if (geometries.has(geometry)) return;
    geometries.add(geometry);
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      bytes += ["position", "normal", "tangent"].includes(name) ? attribute.count * attribute.itemSize * 4 : attribute.array.byteLength;
    }
    bytes += geometry.index?.array.byteLength ?? 0;
  });
  if (!meshes) throw new Error("The robot or field model is still loading. Open the Robot Simulator, then try again.");
  if (bytes > MAX_ASSET_BYTES) throw new Error("The 3D models exceed the 128 MiB export limit. Simplify the imported CAD assembly and try again.");
}

export async function buildAdvantageScopeAssets(source: SceneAssetSource) {
  checkGeometryBudget([source.robot, source.field]);
  const projectKey = Array.from(sha256(strToU8(source.identity.projectId)).slice(0, 5), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const configurationKey = source.identity.configurationHash.replace(/[^a-z0-9]/giu, "").slice(0, 10) || "default";
  const projectName = source.identity.projectName.replace(/[\u0000-\u001f\u007f]/gu, "").trim().slice(0, 64) || "Project";
  const robotName = `FTC Simulator · ${projectName} [${projectKey}-${configurationKey}]`;
  const fieldName = `FTC Simulator · ${FIELD_NAMES[source.fieldPreset]}`;
  const robotFolder = `Robot_FTCSim_${projectKey}_${configurationKey}`;
  const fieldFolder = `Field3d_FTCSim_${source.fieldPreset}`;
  const robotModel = toAdvantageScopeModel(source.robot), fieldModel = toAdvantageScopeModel(source.field);
  let robot: ArrayBuffer | object, field: ArrayBuffer | object;
  try {
    robot = await new GLTFExporter().parseAsync(robotModel.root, { binary: true, onlyVisible: true, maxTextureSize: 2048 });
    field = await new GLTFExporter().parseAsync(fieldModel.root, { binary: true, onlyVisible: true, maxTextureSize: 2048 });
  } finally { robotModel.dispose(); fieldModel.dispose(); }
  if (!(robot instanceof ArrayBuffer) || !(field instanceof ArrayBuffer)) throw new Error("The 3D model export could not be encoded.");
  if (robot.byteLength + field.byteLength > MAX_ASSET_BYTES) throw new Error("The 3D model package exceeds the 128 MiB export limit. Simplify the imported CAD assembly and try again.");
  const files = {
    [`${robotFolder}/config.json`]: json({ name: robotName, isFTC: true, disableSimplification: true, rotations: [], position: [0, 0, 0], cameras: [], components: [] }),
    [`${robotFolder}/model.glb`]: new Uint8Array(robot),
    [`${fieldFolder}/config.json`]: json({ name: fieldName, isFTC: true, coordinateSystem: "center-red", rotations: [], position: [0, 0, 0], widthInches: 144, heightInches: 144, gamePieces: [], aprilTags: [] }),
    [`${fieldFolder}/model.glb`]: new Uint8Array(field),
    "layout-recorded.json": json(advantageScopeLayout(fieldName, robotName, false)),
    "layout-live.json": json(advantageScopeLayout(fieldName, robotName, true)),
    "README.txt": strToU8(`FTC Simulator — AdvantageScope 3D assets\n\nRobot: ${robotName}\nField: ${fieldName}\n\n1. Extract this ZIP. In AdvantageScope, choose AdvantageScope/App > Show Assets Folder. Copy the Robot_ and Field3d_ folders into that folder. The app reloads assets automatically.\n2. Choose File > Import Layout and open layout-recorded.json (for a .wpilog recording) or layout-live.json (for the live bridge). These layouts replace the current window layout; export your existing layout first if you want to keep it.\n3. Open the simulator's .wpilog, or connect with File > Connect to Simulator > FTC Dashboard. The robot model follows the recorded/live pose on the selected field.\n\nManual setup: choose this field in the 3D Field tab, drag /Robot/Pose (logs) or Robot Pose (live) into Poses, and select this robot model. Set Coordinate System to Automatic or Center/Red if you previously changed the global setting.\n\nUnits: meters and radians. The field origin is its center, +X away from the red wall, +Y left, +Z up (Center/Red). Simulator (x,y,z) maps to (x,-z,y). The robot includes its configured floor clearance; live poses are planar. Geometry and mechanism positions are captured from the loaded simulator; articulated joints and moving field objects are not streamed as separate models. Re-export after changing the robot or field.\n\nLayouts tested with AdvantageScope 26.0.2. Other releases may show a version warning; you can also use manual setup. Custom asset documentation: https://docs.advantagescope.org/more-features/custom-assets/\n\nAssets are copies of the project's displayed models, including imported CAD. Original asset provenance and licensing continue to apply. Field source: ${source.fieldPreset === "biobuzz-2026-2027" ? "FIRST Tech Challenge BIOBUZZ official field CAD; see the simulator's BIOBUZZ asset provenance." : source.fieldPreset === "decode-2025-2026" ? "FIRST Tech Challenge DECODE field CAD; see the simulator's field asset provenance." : "FTC practice field perimeter and tiles; see the simulator's field asset provenance."}\n`),
  };
  // GLBs are already binary; storing them avoids a large blocking deflate pass.
  return { bytes: zipSync(files, { level: 0 }), filename: `ftc-advantagescope-${projectKey}.zip`, robotName, fieldName };
}
