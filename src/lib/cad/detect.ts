import { CAD_PRODUCTS, getCadProduct } from "./catalog";
import { compareCadShapes } from "./geometry";
import references from "./reference-shapes.json";
import type { CadMatch, CadPart, CadReference } from "./types";

const normalize = (value: string) => value.toLowerCase().replace(/[_\s-]+/g, "");
const ancestor = (a: CadPart, b: CadPart) => a.path.length < b.path.length && a.path.every((v, i) => b.path[i] === v);

export function detectCadComponents(parts: CadPart[], shapes: readonly CadReference[] = references): CadMatch[] {
  const matches: (CadMatch & { part: CadPart; priority: number })[] = [];
  for (const part of parts) {
    // Never inherit an assembly label into all of its screws and internal solids.
    const label = normalize(part.name);
    let found = CAD_PRODUCTS.filter((product) => product.aliases.some((alias) => label.includes(normalize(alias))));
    // A product number on a replacement cap, shaft or sticker is not a motor.
    const accessory = /\b(cap|shield|shaft|sticker|screw|pins|housing|body|horn|bracket|mount|spacer)\b/i.test(part.name);
    if (accessory) found = found.filter((product) => !["motor", "servo"].includes(product.kind));
    const exact = found.filter((product) => product.aliases.some((alias) => /\d{4}|rev-\d/i.test(alias) && label.includes(normalize(alias))));
    if (exact.length) found = exact;
    if (!accessory && !found.length && /yellowjacket|gobilda520[234]|520[234]series/.test(label)) {
      const series = label.match(/520[234]/)?.[0];
      found = CAD_PRODUCTS.filter((product) => product.kind === "motor" && /^520[234]-/.test(product.id) && (!series || product.id.startsWith(series)));
    }
    if (!accessory && !found.length && /hdhex/.test(label)) found = CAD_PRODUCTS.filter((product) => ["REV-41-1301", "REV-41-1211", "REV-41-1291", "REV-41-1600"].includes(product.id));
    if (!accessory && !found.length && /axon/.test(label)) {
      const family = label.match(/max|mini|micro/)?.[0];
      found = CAD_PRODUCTS.filter((product) => product.id.startsWith("axon-") && (!family || product.id.includes(`-${family}-`)));
    }
    let candidates = found.map((p) => p.id), method: CadMatch["method"] = exact.length ? "part-number" : found.length ? "name" : "unknown";
    let evidence = method === "part-number" ? "Part number in CAD component name" : "Component name";
    if (!candidates.length) {
      const scores = shapes.flatMap((reference) => {
        const score = compareCadShapes(part.shape, reference.shape);
        return score === null ? [] : [{ reference, score }];
      }).sort((a, b) => a.score - b.score);
      if (scores.length) {
        candidates = [...new Set(scores.filter((entry) => entry.score <= scores[0]!.score + .012).flatMap((entry) => entry.reference.productIds))];
        method = "geometry"; evidence = "Dimensions and 3D shape compared with manufacturer CAD";
      }
    }
    if (!candidates.length) continue;
    const product = candidates.length === 1 ? getCadProduct(candidates[0]) : null;
    matches.push({ partId: part.id, part, priority: method === "part-number" ? 3 : method === "name" ? 2 : 1,
      productId: product?.id ?? null, candidates, method, evidence, enabled: Boolean(product), hardwareName: "" });
  }
  // The enclosing product assembly wins over its internal CAD solids. Different
  // product assemblies under a shared robot branch remain separate instances.
  const selected = matches.filter((match) => !matches.some((other) => other !== match && ancestor(other.part, match.part)
    && other.priority >= match.priority && (other.candidates.some((id) => match.candidates.includes(id))
      || other.candidates.every((id) => getCadProduct(id)?.kind === "motor") && match.candidates.every((id) => getCadProduct(id)?.kind === "motor"))));
  const unambiguous = selected.filter((match) => !selected.some((other) => other !== match && ancestor(match.part, other.part)
    && other.priority > match.priority));
  return unambiguous.map((entry) => ({ partId: entry.partId, productId: entry.productId, candidates: entry.candidates, method: entry.method, evidence: entry.evidence, enabled: entry.enabled, hardwareName: entry.hardwareName }));
}
