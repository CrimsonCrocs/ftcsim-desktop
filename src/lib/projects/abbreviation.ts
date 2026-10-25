/** Up to three initials/digits, preserving name order and reserving room for numbers. */
export function projectAbbreviation(name: string): string {
  const parts = name.toUpperCase().match(/\p{L}[\p{L}\p{M}]*|\p{N}/gu) ?? [];
  const characters = parts.map((part) => Array.from(part)[0]!);
  const isNumber = (character: string) => /\p{N}/u.test(character);
  let lettersRemaining = Math.max(0, 3 - characters.filter(isNumber).length);
  return characters
    .filter((character) => isNumber(character) || lettersRemaining-- > 0)
    .slice(0, 3)
    .join("") || "?";
}
