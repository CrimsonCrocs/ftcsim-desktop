export interface NormalizedGitHubRepository {
  owner: string;
  repository: string;
  slug: string;
  cloneUrl: string;
}

const SEGMENT = /^[A-Za-z0-9_.-]+$/u;

export function normalizeGitHubRepository(value: string): NormalizedGitHubRepository {
  const input = value.trim();
  let path = input;
  if (/^https?:\/\//iu.test(input)) {
    let url: URL;
    try {
      url = new URL(input);
    } catch {
      throw new Error("Enter a GitHub repository as owner/repo or a complete GitHub URL.");
    }
    if (url.hostname.toLocaleLowerCase() !== "github.com" || url.username || url.password) {
      throw new Error("Only github.com repository URLs are supported.");
    }
    path = url.pathname;
  }
  const segments = path.replace(/^\/+|\/+$/gu, "").split("/");
  if (segments.length !== 2) {
    throw new Error("Enter a GitHub repository as owner/repo or https://github.com/owner/repo.");
  }
  const owner = segments[0];
  const repository = segments[1].replace(/\.git$/iu, "");
  if (!owner || !repository || !SEGMENT.test(owner) || !SEGMENT.test(repository)) {
    throw new Error("The GitHub owner or repository name contains unsupported characters.");
  }
  return {
    owner,
    repository,
    slug: `${owner}/${repository}`,
    cloneUrl: `https://github.com/${owner}/${repository}.git`,
  };
}
