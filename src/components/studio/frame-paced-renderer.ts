import { WebGLRenderer, type Camera, type Object3D, type WebGLRendererParameters } from "three";
import { createGpuFrameGate } from "@/lib/gpu-frame-gate";

/** A renderer that resizes its drawing buffer only between completed frames. */
export class FramePacedRenderer extends WebGLRenderer {
  private readonly frameGate;

  constructor(parameters: WebGLRendererParameters) {
    super(parameters);
    const context = this.getContext();
    if (!("fenceSync" in context)) throw new Error("WebGL 2 is required for the simulation view.");
    this.frameGate = createGpuFrameGate(context);
    const setSize = this.setSize;
    this.setSize = (width: number, height: number, updateStyle = true) => {
      // Fill the new layout immediately. Coalesce R3F's DPR and size updates
      // before reallocating the buffer, which otherwise drains the GPU twice.
      if (updateStyle) {
        this.domElement.style.width = `${width}px`;
        this.domElement.style.height = `${height}px`;
      }
      this.frameGate.resize(() => setSize.call(this, width, height, false));
    };
    const dispose = this.dispose;
    this.dispose = () => { this.frameGate.dispose(); dispose.call(this); };
  }

  renderFrame(scene: Object3D, camera: Camera): boolean {
    return this.frameGate.draw(() => this.render(scene, camera));
  }
}
