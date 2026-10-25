import { Group, Object3D, Vector3 } from "three";
import type { ImportedRobotVisual } from "../../../packages/ftc-sim-core/src/world-types";

/** Resolve all paths before reparenting; nested moving components then receive
 * their own world-frame pivots without applying an ancestor's motion twice. */
export function prepareCadMotion(scene: Object3D, model: ImportedRobotVisual) {
  const sourceRoot = scene.children[0];
  const bindings = model.motionBindings ?? model.wheelBindings.map((binding) => ({ ...binding, phase: "wheel" as const, ratio: 1 }));
  const targets = bindings.map((binding) => { let node = sourceRoot; for (const index of binding.path) node = node?.children[index]; return { binding, node }; });
  scene.updateMatrixWorld(true);
  return targets.flatMap(({ binding, node }) => {
    if (!node?.parent) return [];
    const pivot = new Group(); pivot.name = `cad-motion:${binding.motor}`;
    pivot.position.set(binding.pivot.x, binding.pivot.y, binding.pivot.z);
    scene.add(pivot); pivot.updateMatrixWorld(true); pivot.attach(node);
    return [{ pivot, motor: binding.motor, phase: binding.phase, ratio: binding.ratio, axis: new Vector3(binding.axis.x, binding.axis.y, binding.axis.z).normalize() }];
  });
}
