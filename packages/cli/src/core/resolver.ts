export type SourceType = "github" | "git" | "local";

export interface GithubSource {
  type: "github";
  owner: string;
  repo: string;
  subdir?: string;
}

export interface GitSource {
  type: "git";
  url: string;
}

export interface LocalSource {
  type: "local";
  path: string;
}

export type SourceDescriptor = GithubSource | GitSource | LocalSource;

/**
 * Parse a source string into a SourceDescriptor
 *
 * Supported formats:
 * - owner/repo                          → github
 * - owner/repo/sub/dir                  → github with subdir
 * - https://github.com/owner/repo       → github
 * - https://github.com/owner/repo/tree/main/sub/dir → github with subdir
 * - git@github.com:owner/repo.git       → git
 * - ./path or /abs/path                 → local
 */
export function resolve(source: string): SourceDescriptor {
  // Local paths
  if (source.startsWith("./") || source.startsWith("/") || source.startsWith("../")) {
    return { type: "local", path: source };
  }

  // Git SSH URLs
  if (source.startsWith("git@")) {
    return { type: "git", url: source };
  }

  // HTTPS GitHub URLs
  if (source.startsWith("https://github.com/")) {
    const path = source.replace("https://github.com/", "");
    const parts = path.replace(/\.git$/, "").split("/");
    const owner = parts[0];
    const repo = parts[1];

    if (!owner || !repo) {
      throw new Error(`Invalid GitHub URL: ${source}`);
    }

    // Handle /tree/<branch>/subdir format
    if (parts[2] === "tree" && parts.length > 3) {
      // parts[3] is the branch, rest is subdir
      const subdir = parts.slice(4).join("/");
      return subdir
        ? { type: "github", owner, repo, subdir }
        : { type: "github", owner, repo };
    }

    // Handle direct subdir path in URL
    if (parts.length > 2) {
      const subdir = parts.slice(2).join("/");
      return { type: "github", owner, repo, subdir };
    }

    return { type: "github", owner, repo };
  }

  // Other git URLs
  if (source.startsWith("https://") || source.startsWith("http://") || source.startsWith("file://")) {
    return { type: "git", url: source };
  }

  // Short form: owner/repo or owner/repo/sub/dir
  const parts = source.split("/");
  if (parts.length >= 2) {
    const owner = parts[0];
    const repo = parts[1];
    const subdir = parts.length > 2 ? parts.slice(2).join("/") : undefined;
    return subdir
      ? { type: "github", owner, repo, subdir }
      : { type: "github", owner, repo };
  }

  throw new Error(`Cannot resolve source: ${source}`);
}

/** Convert a SourceDescriptor back to a source string for the lock file */
export function toSourceString(desc: SourceDescriptor): string {
  switch (desc.type) {
    case "github":
      const base = `${desc.owner}/${desc.repo}`;
      return desc.subdir ? `${base}/${desc.subdir}` : base;
    case "git":
      return desc.url;
    case "local":
      return desc.path;
  }
}

/** Derive the git clone URL from a source descriptor */
export function toGitUrl(desc: SourceDescriptor): string {
  switch (desc.type) {
    case "github":
      return `https://github.com/${desc.owner}/${desc.repo}.git`;
    case "git":
      return desc.url;
    case "local":
      throw new Error("Cannot derive git URL from local source");
  }
}
