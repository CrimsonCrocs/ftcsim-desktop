export const GIT_HEAD_MAX_BYTES = 4 * 1024;
export const GIT_CONFIG_MAX_BYTES = 1024 * 1024;

export type RepositoryControlFileErrorCode =
  | "CREDENTIALS_PRESENT"
  | "INVALID_GIT_CONFIG"
  | "INVALID_GIT_HEAD"
  | "LIMIT_EXCEEDED";

export class RepositoryControlFileError extends Error {
  constructor(
    public readonly code: RepositoryControlFileErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RepositoryControlFileError";
  }
}

function fail(code: RepositoryControlFileErrorCode, message: string): never {
  throw new RepositoryControlFileError(code, message);
}

function decodeUtf8(content: Uint8Array, label: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    return fail(
      label === ".git/HEAD" ? "INVALID_GIT_HEAD" : "INVALID_GIT_CONFIG",
      `${label} is not valid UTF-8.`,
    );
  }
}

function decodeGitConfigEscape(character: string): string {
  switch (character) {
    case "n": return "\n";
    case "t": return "\t";
    case "b": return "\b";
    case "\\":
    case '"':
      return character;
    default:
      return fail(
        "INVALID_GIT_CONFIG",
        `Git configuration contains the invalid \\${character || "(end of line)"} escape.`,
      );
  }
}

function parseGitConfigValue(rawValue: string): string {
  const source = rawValue.trim();
  let value = "";
  let quoted = false;
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (character === "\\") {
      index += 1;
      value += decodeGitConfigEscape(source[index] ?? "");
      continue;
    }
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted
        && (character === "#" || character === ";")
        && (index === 0 || /\s/u.test(source[index - 1] ?? ""))) {
      break;
    }
    value += character;
  }
  if (quoted) {
    fail("INVALID_GIT_CONFIG", "Git configuration contains an unterminated quoted value.");
  }
  return value.trim();
}

function decodeGitConfigSubsection(value: string): string {
  let decoded = "";
  for (let index = 0; index < value.length; index++) {
    if (value[index] !== "\\") {
      decoded += value[index];
      continue;
    }
    index += 1;
    decoded += decodeGitConfigEscape(value[index] ?? "");
  }
  return decoded;
}

export function isRepositoryCredentialPath(path: string): boolean {
  const normalized = path.toLowerCase();
  if (normalized === ".git-credentials"
      || normalized === ".netrc"
      || normalized === "_netrc") {
    return true;
  }
  if (!normalized.startsWith(".git/")) return false;
  const basename = normalized.slice(normalized.lastIndexOf("/") + 1);
  return basename === ".git-credentials"
    || basename === ".netrc"
    || basename === "_netrc"
    || basename === "credentials"
    || basename === "credential-store"
    || normalized === ".git/credential-cache"
    || normalized.startsWith(".git/credential-cache/");
}

export function isRepositoryGitConfigPath(path: string): boolean {
  const normalized = path.toLowerCase();
  if (!normalized.startsWith(".git/")) return false;
  const basename = normalized.slice(normalized.lastIndexOf("/") + 1);
  return basename === "config" || basename === "config.worktree";
}

const SENSITIVE_SSH_USERNAME = /^(?:gh[pousr]_|github_pat_|x-access-token(?:$|[-_])|oauth2?(?:$|[-_])|token(?:$|[-_]))/iu;

function decodeUrlUsername(username: string): string {
  try {
    return decodeURIComponent(username);
  } catch {
    return fail("INVALID_GIT_CONFIG", "Git remote configuration contains an invalid encoded username.");
  }
}

function assertSshUsernameHasNoCredential(username: string): void {
  if (SENSITIVE_SSH_USERNAME.test(decodeUrlUsername(username))) {
    fail("CREDENTIALS_PRESENT", "Git SSH remote configuration contains a token-shaped username.");
  }
}

function assertParsedGitRemoteHasNoCredentials(value: string): void {
  if (!value) fail("INVALID_GIT_CONFIG", "Git remote configuration contains an empty URL.");
  if (/[\u0000-\u001f\u007f\s]/u.test(value)) {
    fail("INVALID_GIT_CONFIG", "Git remote configuration contains an invalid URL.");
  }
  // Remote query strings are not needed by supported GitHub workflows and
  // have no portable way to distinguish routing data from opaque credentials.
  // Rejecting every query keeps this boundary fail-closed for arbitrary hosts.
  if (value.includes("?")) {
    fail("CREDENTIALS_PRESENT", "Git remote configuration cannot contain query parameters.");
  }
  if (value.includes("#")) {
    fail("CREDENTIALS_PRESENT", "Git remote configuration cannot contain a fragment.");
  }

  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//u.test(value)) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return fail("INVALID_GIT_CONFIG", "Git remote configuration contains an invalid URL.");
    }
    const protocol = url.protocol.toLowerCase();
    if (url.password || (url.username && protocol !== "ssh:")) {
      fail("CREDENTIALS_PRESENT", "Git remote configuration contains URL user information.");
    }
    if (protocol === "ssh:" && url.username) assertSshUsernameHasNoCredential(url.username);
    return;
  }

  const scpStyle = /^([^/]+)@([^@/:]+):(.+)$/u.exec(value);
  if (scpStyle) {
    const user = scpStyle[1];
    if (user.includes(":") || user.includes("@")) {
      fail("CREDENTIALS_PRESENT", "Git SSH remote configuration contains password-like user information.");
    }
    assertSshUsernameHasNoCredential(user);
  }
}

/**
 * Validates any URL-like Git configuration value without assuming HTTP.
 * Standard SCP-style SSH remotes remain supported, but password-bearing SSH
 * URLs, fragments, and secret query parameters are rejected.
 */
export function assertGitRemoteHasNoCredentials(rawValue: string): void {
  assertParsedGitRemoteHasNoCredentials(parseGitConfigValue(rawValue));
}

function credentialSetting(section: string, key: string): boolean {
  const normalizedKey = key.toLowerCase();
  return section === "credential"
    || section.startsWith("credential.")
    || normalizedKey === "credential"
    || normalizedKey.startsWith("credential.")
    || normalizedKey === "extraheader"
    || normalizedKey.endsWith(".extraheader")
    || normalizedKey === "authorization"
    || normalizedKey.endsWith(".authorization")
    || normalizedKey === "sshcommand"
    || normalizedKey.endsWith(".sshcommand");
}

function urlSetting(key: string): boolean {
  const normalized = key.toLowerCase();
  return normalized === "url"
    || normalized.endsWith(".url")
    || normalized === "pushurl"
    || normalized.endsWith(".pushurl")
    || normalized === "proxy"
    || normalized.endsWith(".proxy");
}

/**
 * Parses the portable subset of Git config used by synchronized repositories.
 * Unknown valid settings are retained, while malformed syntax, external
 * includes, credential helpers/headers, and credential-bearing remote values
 * fail closed.
 */
export function assertCredentialSafeGitConfig(content: Uint8Array): void {
  if (!(content instanceof Uint8Array)) {
    fail("INVALID_GIT_CONFIG", ".git/config must contain binary file data.");
  }
  if (content.byteLength === 0) {
    fail("INVALID_GIT_CONFIG", ".git/config cannot be empty.");
  }
  if (content.byteLength > GIT_CONFIG_MAX_BYTES) {
    fail("LIMIT_EXCEEDED", "Git configuration exceeds the 1 MiB safety limit.");
  }
  const source = decodeUtf8(content, ".git/config");
  if (source.includes("\0")) {
    fail("INVALID_GIT_CONFIG", ".git/config contains a null byte.");
  }

  let section = "";
  let sawSection = false;
  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const trailingBackslashes = /\\+$/u.exec(line)?.[0].length ?? 0;
    if (trailingBackslashes % 2 === 1) {
      fail("INVALID_GIT_CONFIG", "Git configuration line continuations are not supported.");
    }

    const sectionMatch = /^\[\s*([A-Za-z][A-Za-z0-9.-]*)(?:\s+"((?:\\.|[^"\\])*)")?\s*\](?:\s*[#;].*)?$/u.exec(line);
    if (sectionMatch) {
      section = sectionMatch[1].toLowerCase();
      sawSection = true;
      if (section === "credential" || section.startsWith("credential.")) {
        fail("CREDENTIALS_PRESENT", "Git credential configuration cannot be synchronized.");
      }
      if (section === "include" || section === "includeif") {
        fail("CREDENTIALS_PRESENT", "External Git configuration includes cannot be synchronized.");
      }
      if ((section === "http" || section === "url") && sectionMatch[2]) {
        assertParsedGitRemoteHasNoCredentials(decodeGitConfigSubsection(sectionMatch[2]));
      }
      continue;
    }

    if (!section) {
      fail("INVALID_GIT_CONFIG", "Git configuration contains a setting outside a section.");
    }
    const assignment = /^([A-Za-z][A-Za-z0-9.-]*)(?:(?:\s*=\s*|\s+)(.*))?$/u.exec(line);
    if (!assignment) {
      fail("INVALID_GIT_CONFIG", "Git configuration contains malformed syntax.");
    }
    const key = assignment[1].toLowerCase();
    const value = assignment[2] ?? "";
    const parsedValue = parseGitConfigValue(value);
    if (credentialSetting(section, key)) {
      fail("CREDENTIALS_PRESENT", `Git configuration contains the sensitive ${key} setting.`);
    }
    if (section === "include" || section === "includeif"
        || key === "include.path" || key.startsWith("includeif.")) {
      fail("CREDENTIALS_PRESENT", "External Git configuration includes cannot be synchronized.");
    }
    if (urlSetting(key)) assertParsedGitRemoteHasNoCredentials(parsedValue);
  }
  if (!sawSection) {
    fail("INVALID_GIT_CONFIG", ".git/config must contain at least one configuration section.");
  }
}

function isValidGitRef(ref: string): boolean {
  if (!ref.startsWith("refs/")
      || ref.length > 1024
      || ref.includes("..")
      || ref.includes("@{")
      || ref.includes("//")
      || ref.endsWith("/")
      || ref.endsWith(".")
      || /[\u0000-\u0020\u007f~^:?*[\\]/u.test(ref)) {
    return false;
  }
  const parts = ref.split("/");
  return parts.every((part, index) => (
    index === 0
    || Boolean(part)
      && !part.startsWith(".")
      && !part.endsWith(".lock")
  ));
}

export function assertValidGitHead(content: Uint8Array): void {
  if (!(content instanceof Uint8Array)) {
    fail("INVALID_GIT_HEAD", ".git/HEAD must contain binary file data.");
  }
  if (content.byteLength === 0 || content.byteLength > GIT_HEAD_MAX_BYTES) {
    fail(
      content.byteLength > GIT_HEAD_MAX_BYTES ? "LIMIT_EXCEEDED" : "INVALID_GIT_HEAD",
      `.git/HEAD must contain 1–${GIT_HEAD_MAX_BYTES} bytes.`,
    );
  }
  const source = decodeUtf8(content, ".git/HEAD");
  const value = source.endsWith("\r\n")
    ? source.slice(0, -2)
    : source.endsWith("\n")
      ? source.slice(0, -1)
      : source;
  if (!value || value !== value.trim() || /[\r\n]/u.test(value)) {
    fail("INVALID_GIT_HEAD", ".git/HEAD must contain one canonical ref or object ID.");
  }
  if (/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/iu.test(value)) return;
  if (value.startsWith("ref: ") && isValidGitRef(value.slice(5))) return;
  fail("INVALID_GIT_HEAD", ".git/HEAD does not contain a valid symbolic ref or object ID.");
}
