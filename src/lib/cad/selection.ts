import type { CadMatch, CadPart } from "./types";

/** First select a recognized assembly. Repeated picking can reach its exact
 * child surface without an assigned parent swallowing every future click. */
export function cadPartForHit(ancestors: CadPart[], matches: CadMatch[], selectedId: string | null) {
  const assigned = new Set(matches.map((match) => match.partId));
  const matched = ancestors.find((part) => assigned.has(part.id));
  return matched && selectedId !== matched.id ? matched : ancestors[0];
}
