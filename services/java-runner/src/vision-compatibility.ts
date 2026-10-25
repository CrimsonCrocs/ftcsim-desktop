import surface from "./vision-runtime-surface.json";

export interface VisionMemberReference { owner: string; kind: string; name: string; descriptor: string }
export function isRenderedVisionClass(name: string): boolean { return surface.some((entry) => entry.name === name); }
export function isRenderedVisionMember(reference: VisionMemberReference, owner = reference.owner, visited = new Set<string>()): boolean {
  if (visited.has(owner)) return false;
  visited.add(owner);
  const entry = surface.find((candidate) => candidate.name === owner);
  return Boolean(entry && (entry.members.some((member) => member.name === reference.name
    && member.kind === reference.kind && member.descriptor === reference.descriptor)
    || (reference.kind !== "constructor" && entry.parents.some((parent) => isRenderedVisionMember(reference, parent, visited)))));
}
