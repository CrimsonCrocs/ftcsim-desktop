type GpuContext = Pick<WebGL2RenderingContext,
  "fenceSync" | "clientWaitSync" | "deleteSync" | "flush" | "isContextLost"
  | "SYNC_GPU_COMMANDS_COMPLETE" | "TIMEOUT_EXPIRED" | "WAIT_FAILED">;

/** Keep at most one scene frame on the GPU. Never wait on it on the UI thread. */
export function createGpuFrameGate(gl: GpuContext) {
  let fence: WebGLSync | null = null;
  let resize: (() => void) | null = null;
  return {
    resize(update: () => void) { resize = update; },
    draw(render: () => void): boolean {
      if (gl.isContextLost()) {
        // Lost contexts release their GPU objects; never poll that old fence
        // after the browser restores the canvas.
        fence = null;
        return false;
      }
      if (fence) {
        const status = gl.clientWaitSync(fence, 0, 0);
        if (status === gl.TIMEOUT_EXPIRED) return false;
        gl.deleteSync(fence);
        fence = null;
        if (status === gl.WAIT_FAILED) return false;
      }
      // Canvas resizing drains earlier GPU work. Apply only the newest size,
      // after that work has finished, instead of blocking the browser on it.
      const updateSize = resize;
      resize = null;
      updateSize?.();
      render();
      fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      return true;
    },
    dispose() {
      if (fence) gl.deleteSync(fence);
      fence = null;
      resize = null;
    },
  };
}
