export type SyntaxKind = "plain" | "comment" | "string" | "annotation" | "number" | "keyword" | "type";
export interface SyntaxToken { kind: SyntaxKind; text: string }

const JAVA = new Set("abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new package private protected public record return sealed short static strictfp super switch synchronized this throw throws transient try var void volatile while true false null permits non-sealed yield".split(" "));
const KOTLIN = new Set("abstract actual annotation as break by catch class companion const constructor continue crossinline data delegate do dynamic else enum expect external false field file final finally for fun get if import in infix init inline inner interface internal is lateinit noinline null object open operator out override package param private property protected public receiver reified return sealed set setparam super suspend tailrec this throw true try typealias typeof val value var vararg when where while".split(" "));

// A small lexical projection for the native touch editor. No HTML parsing or
// generated markup: tokens always concatenate to the exact editable source.
const TOKEN = /(?<comment>\/\/[^\r\n]*|\/\*[\s\S]*?(?:\*\/|$))|(?<string>"""[\s\S]*?(?:"""|$)|"(?:\\[\s\S]|[^"\\\r\n])*(?:"|(?=\r?\n|$))|'(?:\\[\s\S]|[^'\\\r\n])*(?:'|(?=\r?\n|$)))|(?<annotation>@[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)|(?<number>\b(?:0[xX][\da-fA-F_]+|0[bB][01_]+|\d[\d_]*(?:\.[\d_]+)?(?:[eE][+-]?[\d_]+)?)[fFdDlLuU]*)|(?<word>[A-Za-z_$][\w$]*)/g;

export function mobileSyntax(source: string, path: string): SyntaxToken[] {
  const keywords = /\.java$/i.test(path) ? JAVA : /\.kts?$/i.test(path) ? KOTLIN : null;
  if (!keywords) return [{ kind: "plain", text: source }];
  const tokens: SyntaxToken[] = [];
  let cursor = 0;
  for (const match of source.matchAll(TOKEN)) {
    if (match.index > cursor) tokens.push({ kind: "plain", text: source.slice(cursor, match.index) });
    const groups = match.groups!;
    const kind: SyntaxKind = groups.comment ? "comment" : groups.string ? "string"
      : groups.annotation ? "annotation" : groups.number ? "number"
        : keywords.has(match[0]) ? "keyword" : /^[A-Z]/.test(match[0]) ? "type" : "plain";
    tokens.push({ kind, text: match[0] });
    cursor = match.index + match[0].length;
  }
  if (cursor < source.length) tokens.push({ kind: "plain", text: source.slice(cursor) });
  return tokens;
}
