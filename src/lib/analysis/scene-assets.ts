import type { Object3D } from "three";
import type { FieldPresetId } from "../field-configuration";

export const ADVANTAGE_SCOPE_FIELD_GROUP = "advantagescope-field";
export interface SceneAssetIdentity { key: string; projectId: string; projectName: string; configurationHash: string }
export interface SceneAssetSource {
  identity: SceneAssetIdentity;
  fieldPreset: FieldPresetId;
  /** Copies of the displayed trees, with the robot at its local floor origin.
   * Geometry and textures are shared read-only with the simulator. */
  robot: Object3D;
  field: Object3D;
}
export interface SceneAssetRegistration { controller: AdvantageScopeSceneAssets; identity: SceneAssetIdentity }

/** Retain the loaded model when mobile navigation unmounts the field canvas. */
export class AdvantageScopeSceneAssets {
  private identity = "";
  private source?: SceneAssetSource;
  private snapshot = { ready: false };
  private listeners = new Set<() => void>();
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  getSnapshot = () => this.snapshot;
  setIdentity(identity: string) {
    if (identity === this.identity) return;
    this.identity = identity; this.source = undefined; this.snapshot = { ready: false };
    for (const listener of this.listeners) listener();
  }
  capture(source: SceneAssetSource) {
    if (source.identity.key !== this.identity) return false;
    this.source = source;
    if (!this.snapshot.ready) { this.snapshot = { ready: true }; for (const listener of this.listeners) listener(); }
    return true;
  }
  async export() {
    const source = this.source;
    if (!source) throw new Error("Open the Robot Simulator and wait for the robot and field to load, then try again.");
    const { buildAdvantageScopeAssets } = await import("./advantagescope-assets");
    return buildAdvantageScopeAssets(source);
  }
}
