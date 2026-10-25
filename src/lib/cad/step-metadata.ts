import type { StepResult } from "./scene";
import { CAD_MAX_PARTS } from "./types";

/** STEP stores both an identifier and a display name. Readers commonly expose
 * only the latter, discarding manufacturer SKUs or useful component identities.
 * Scan in bounded chunks and keep an identifier only when the name maps to one
 * unambiguous prototype (instance suffixes do not change that prototype). */
export function stepProductIdentifiers(bytes: Uint8Array): Map<string, string> {
  const candidates = new Map<string, Set<string>>(), decoder = new TextDecoder();
  let carry = "";
  for (let offset = 0; offset < bytes.length; offset += 1024 * 1024) {
    const text = carry + decoder.decode(bytes.subarray(offset, offset + 1024 * 1024), { stream: offset + 1024 * 1024 < bytes.length });
    const complete = offset + 1024 * 1024 >= bytes.length ? text.length : Math.max(0, text.lastIndexOf(";"));
    const records = text.slice(0, complete);
    for (const match of records.matchAll(/#\d+\s*=\s*PRODUCT\s*\(\s*'((?:[^']|'')*)'\s*,\s*'((?:[^']|'')*)'/g)) {
      const identifier = match[1]!.replace(/''/g, "'").replace(/_\d+$/, "").trim(), name = match[2]!.replace(/''/g, "'").trim();
      if (!identifier || !name || identifier.length > 4096 || name.length > 4096) continue;
      const ids = candidates.get(name) ?? new Set<string>(); ids.add(identifier); candidates.set(name, ids);
    }
    carry = text.slice(complete).slice(-65536);
  }
  return new Map([...candidates].flatMap(([name, ids]) => ids.size === 1 ? [[name, [...ids][0]!] as const] : []));
}

export function stepProductLabel(name: string, identifiers: ReadonlyMap<string, string>): string {
  const identifier = identifiers.get(name) ?? identifiers.get(name.replace(/:\d+$/, ""));
  return identifier && !name.toLowerCase().includes(identifier.toLowerCase()) ? `${identifier} · ${name}` : name;
}
export function retainStepProductIdentifiers(result: StepResult, identifiers: ReadonlyMap<string, string>): void {
  let count = 0;
  const visit = (node: StepResult["root"], depth: number) => { if (++count > CAD_MAX_PARTS || depth > 64) throw new Error("This assembly exceeds the supported hierarchy size. Export a simpler assembly."); node.name = stepProductLabel(node.name, identifiers); for (const child of node.children) visit(child, depth + 1); };
  visit(result.root, 0); for (const mesh of result.meshes) mesh.name = stepProductLabel(mesh.name, identifiers);
}
