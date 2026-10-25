import type { Monaco } from "@monaco-editor/react";

export function languageForPath(path: string): string {
  const name = path.toLowerCase();
  if (name.endsWith(".java")) return "java";
  if (name.endsWith(".kt") || name.endsWith(".kts")) return "kotlin";
  if (name.endsWith(".json")) return "json";
  if (name.endsWith(".gradle") || name.endsWith(".groovy")) return "groovy";
  if (name.endsWith(".properties")) return "properties";
  if (name.endsWith(".xml")) return "xml";
  if (name.endsWith(".md")) return "markdown";
  return "plaintext";
}

export function registerProjectLanguages(monaco: Monaco): void {
  const registered = new Set(monaco.languages.getLanguages().map(({ id }: { id: string }) => id));
  if (!registered.has("groovy")) {
    monaco.languages.register({ id: "groovy", extensions: [".gradle", ".groovy"] });
    monaco.languages.setLanguageConfiguration("groovy", {
      comments: { lineComment: "//", blockComment: ["/*", "*/"] },
      brackets: [["{", "}"], ["[", "]"], ["(", ")"]],
      autoClosingPairs: [{ open: "{", close: "}" }, { open: "[", close: "]" }, { open: "(", close: ")" }, { open: '"', close: '"', notIn: ["string", "comment"] }, { open: "'", close: "'", notIn: ["string", "comment"] }],
    });
    monaco.languages.setMonarchTokensProvider("groovy", {
      keywords: ["abstract", "as", "assert", "boolean", "break", "byte", "case", "catch", "char", "class", "continue", "def", "default", "do", "double", "else", "enum", "extends", "false", "final", "finally", "float", "for", "if", "implements", "import", "in", "instanceof", "int", "interface", "long", "native", "new", "null", "package", "private", "protected", "public", "return", "short", "static", "super", "switch", "synchronized", "this", "throw", "throws", "trait", "true", "try", "void", "while"],
      tokenizer: {
        root: [
          [/\/\/.*$/, "comment"], [/\/\*/, "comment", "@comment"],
          [/'''/, "string", "@tripleSingle"], [/"""/, "string", "@tripleDouble"],
          [/'/, "string", "@single"], [/"/, "string", "@double"],
          [/@[\w.]+/, "annotation"],
          [/[a-zA-Z_$][\w$]*/, { cases: { "@keywords": "keyword", "@default": "identifier" } }],
          [/0[xX][\da-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?[fFdDlLgG]?/, "number"],
          [/[{}()[\]]/, "@brackets"], [/[+\-*=!<>?:&|%~^]+/, "operator"], [/[.,;]/, "delimiter"],
        ],
        comment: [[/[^*]+/, "comment"], [/\*\//, "comment", "@pop"], [/\*/, "comment"]],
        single: [[/\\./, "string.escape"], [/'/, "string", "@pop"], [/[^'\\]+/, "string"]],
        double: [[/\\./, "string.escape"], [/\$\{[^}]*\}|\$[\w.]+/, "variable"], [/"/, "string", "@pop"], [/[^"\\$]+/, "string"], [/\$/, "string"]],
        tripleSingle: [[/'''/, "string", "@pop"], [/[^']+/, "string"], [/'/, "string"]],
        tripleDouble: [[/"""/, "string", "@pop"], [/\$\{[^}]*\}|\$[\w.]+/, "variable"], [/[^"$]+/, "string"], [/[$"]/, "string"]],
      },
    });
  }
  if (!registered.has("properties")) {
    monaco.languages.register({ id: "properties", extensions: [".properties"] });
    monaco.languages.setLanguageConfiguration("properties", { comments: { lineComment: "#" } });
    monaco.languages.setMonarchTokensProvider("properties", {
      tokenizer: {
        root: [
          [/^\s*[#!].*$/, "comment"],
          [/^\s+/, "white"],
          [/(?:\\.|[^\s:=\\])+/, "key", "@separator"],
        ],
        separator: [[/[ \t]*[:=]?[ \t]*/, "delimiter", "@value"]],
        value: [
          [/\\$/, "string.escape", "@continuation"],
          [/\\(?:u[\da-fA-F]{4}|.)/, "string.escape"],
          [/[^\\]+$/, "string", "@popall"],
          [/$/, "", "@popall"],
        ],
        continuation: [[/^\s+/, "white"], { include: "@value" }],
      },
    });
  }
}
