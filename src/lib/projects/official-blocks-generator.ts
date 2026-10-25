import { BLOCKS_BRIDGE_VERSION, isBlocksFrameMessage, type BlocksEditorInitMessage, type BlocksEditorFlushMessage } from "@/lib/blocks/protocol";
import { markGeneratedBlocksJavaSync, opModePaths } from "@/lib/blocks/documents";
import { openRobotConfiguration } from "@/lib/robot-configuration";
import type { NewProjectInput } from "./types";
import type { ProjectTemplate } from "./templates";

/** Uses the pinned FTC Blocks editor to compile official .blk sources, not a handwritten approximation. */
export async function generateOfficialBlocksJava(
  input: NewProjectInput,
  project: ProjectTemplate,
): Promise<ProjectTemplate> {
  const ids = input.exampleIds?.filter((id) => id.startsWith("official-blocks:")) ?? [];
  if (!ids.length) return project;
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Official FTC Blocks examples require a browser to generate Java.");
  }
  const configuration = openRobotConfiguration(project.files["ftcsim.project.json"]);
  const hardware = {
    configurationHash: configuration.resolved.configurationHash,
    motors: configuration.configuration.devices.map((device) => ({ id: device.id, name: device.hardwareMapName })),
  };
  for (const id of ids) {
    const className = id.slice("official-blocks:".length);
    const paths = opModePaths(input.javaPackage, className, "blocks");
    const sourceXml = project.files[paths.sourcePath];
    if (!sourceXml || !paths.generatedJavaPath) throw new Error(`Missing official Blocks source: ${className}.`);
    const snapshot = await compileBlocksInFrame({
      className,
      packageName: input.javaPackage,
      sourcePath: paths.sourcePath,
      sourceXml,
      hardware,
    });
    project.files[paths.sourcePath] = snapshot.sourceXml;
    project.files[paths.generatedJavaPath] = markGeneratedBlocksJavaSync(
      snapshot.generatedJava,
      paths.sourcePath,
      snapshot.sourceHash,
      input.javaPackage,
      hardware.configurationHash,
    );
  }
  return project;
}

function compileBlocksInFrame(options: Omit<BlocksEditorInitMessage, "type" | "version" | "nonce" | "documentId" | "readOnly">): Promise<{
  sourceXml: string;
  sourceHash: string;
  generatedJava: string;
}> {
  return new Promise((resolve, reject) => {
    const nonce = crypto.randomUUID();
    const frame = document.createElement("iframe");
    const documentId = options.sourcePath;
    const requestId = crypto.randomUUID();
    frame.src = `/vendor/ftc-blocks/2026-offline-v1/embed.html?project=${encodeURIComponent(options.className)}&bridge=4`;
    frame.sandbox.add("allow-scripts", "allow-same-origin");
    frame.title = `Generate ${options.className} Java`;
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;left:-10000px;top:0;width:800px;height:600px;pointer-events:none";
    const cleanup = () => {
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      frame.remove();
    };
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error(`FTC Blocks could not generate ${options.className} within 30 seconds.`));
    }, 30_000);
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow || !isBlocksFrameMessage(event.data, {
        nonce,
        documentId,
        configurationHash: options.hardware.configurationHash,
      })) return;
      const message = event.data;
      if (message.type === "ftcsim.blocks.ready") {
        const flush: BlocksEditorFlushMessage = {
          type: "ftcsim.blocks.flush",
          version: BLOCKS_BRIDGE_VERSION,
          nonce,
          documentId,
          requestId,
        };
        frame.contentWindow?.postMessage(flush, "*");
      } else if (message.type === "ftcsim.blocks.snapshot" && message.requestId === requestId) {
        cleanup();
        resolve({ sourceXml: message.sourceXml, sourceHash: message.sourceHash, generatedJava: message.generatedJava });
      } else if (message.type === "ftcsim.blocks.error" && (!message.requestId || message.requestId === requestId)) {
        cleanup();
        reject(new Error(`${options.className}: ${message.message}`));
      }
    };
    window.addEventListener("message", onMessage);
    frame.addEventListener("load", () => {
      const init: BlocksEditorInitMessage = {
        type: "ftcsim.blocks.init",
        version: BLOCKS_BRIDGE_VERSION,
        nonce,
        documentId,
        className: options.className,
        packageName: options.packageName,
        sourcePath: options.sourcePath,
        sourceXml: options.sourceXml,
        readOnly: false,
        hardware: options.hardware,
      };
      frame.contentWindow?.postMessage(init, "*");
    }, { once: true });
    document.body.append(frame);
  });
}
