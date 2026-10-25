import { compactStepMeshes } from "./step-mesh";
import type { StepResult } from "./scene";
import { stepProductIdentifiers, retainStepProductIdentifiers } from "./step-metadata";

// Classic worker: OCCT stays an unmodified, replaceable LGPL library loaded on demand.
const scope = globalThis as unknown as {
  importScripts: (...urls: string[]) => void;
  occtimportjs: (options: { locateFile: (file: string) => string }) => Promise<{ ReadStepFile: ReadCad; ReadIgesFile: ReadCad }>;
  onmessage: (event: { data: { bytes: ArrayBuffer; iges: boolean } }) => Promise<void>;
  postMessage: (data: unknown, transfer?: ArrayBuffer[]) => void;
};
type ReadCad = (bytes: Uint8Array, options: object) => StepResult;
scope.onmessage = async ({ data }) => {
  try {
    scope.postMessage({ progress: "Loading CAD converter…" });
    scope.importScripts("/vendor/occt-import-js/0.0.23/occt-import-js.js");
    const occt = await scope.occtimportjs({ locateFile: (file) => "/vendor/occt-import-js/0.0.23/" + file });
    scope.postMessage({ progress: "Converting CAD solids. Large assemblies can take several minutes…" });
    const input = new Uint8Array(data.bytes), identifiers = data.iges ? new Map<string, string>() : stepProductIdentifiers(input);
    const result = (data.iges ? occt.ReadIgesFile : occt.ReadStepFile)(input, {
      linearUnit: "meter", linearDeflectionType: "absolute_value", linearDeflection: .0005, angularDeflection: .35,
    });
    if (!result.success) throw new Error("The CAD file contains no readable solids. Export a STEP assembly with geometry included.");
    retainStepProductIdentifiers(result, identifiers);
    scope.postMessage({ progress: "Preparing display geometry…" });
    const compact = await compactStepMeshes(result);
    const transfer = compact.meshes.flatMap((mesh) => [mesh.attributes.position.array, mesh.attributes.normal?.array, mesh.index.array, mesh.sourceGeometry?.samples]
      .filter((array): array is Float32Array | Uint32Array => ArrayBuffer.isView(array)).map((array) => array.buffer as ArrayBuffer));
    scope.postMessage({ result: compact }, transfer);
  } catch (error) { scope.postMessage({ error: error instanceof Error ? error.message : String(error) }); }
};
