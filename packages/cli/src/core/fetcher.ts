import { mkdir, readdir, rm, cp, stat } from "fs/promises";
import { join, resolve } from "path";
import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { type SourceDescriptor, toGitUrl } from "./resolver.js";
import type { RemoteVersionMetadata } from "./registry.js";
import { getTempPath } from "../utils/paths.js";
import { hasSkillMd } from "../utils/skill-md.js";

const execFileAsync = promisify(execFile);

export interface FetchRemoteMetadata extends Omit<RemoteVersionMetadata, "fetchedAt"> {}

export interface FetchResult {
  /** Path to the fetched skill directory (in temp) */
  dir: string;
  /** Cleanup function to remove temp files */
  cleanup: () => Promise<void>;
  /** Remote repository metadata for git-backed sources */
  remote?: FetchRemoteMetadata;
}

/** Execute a shell command and return stdout */
async function exec(cmd: string[], cwd?: string): Promise<string> {
  const [bin, ...args] = cmd;
  const { stdout } = await execFileAsync(bin, args, cwd ? { cwd, encoding: "utf8" } : { encoding: "utf8" });
  return stdout.toString();
}

/** Shallow clone a git repo into a temp directory */
async function gitClone(url: string, dest: string): Promise<void> {
  try {
    await exec(["git", "clone", "--depth", "1", url, dest]);
  } catch (err: any) {
    const stderr = err.stderr ?? "";
    if (stderr.includes("not found")) {
      throw new Error(`Failed to clone repository: ${url}\nRepository not found. Check the URL and your access permissions.`);
    }
    throw new Error(`Failed to clone repository: ${url}\n${stderr.trim() || err.message}`);
  }
}

const SKIP_DIRS = new Set(["node_modules"]);

/**
 * Discover skill directories within a cloned repo.
 * A skill directory is one that contains a SKILL.md file.
 * Recursively walks the directory tree to find all SKILL.md files.
 */
export async function discoverSkills(dir: string): Promise<string[]> {
  const skills: string[] = [];

  // Check if the root itself is a skill
  if (await hasSkillMd(dir)) {
    return [dir];
  }

  // Recursively search subdirectories
  await walkForSkills(dir, skills);
  return skills;
}

async function walkForSkills(dir: string, results: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
    const subdir = join(dir, entry.name);
    if (await hasSkillMd(subdir)) {
      results.push(subdir);
      // Don't recurse into skill directories — a skill is its own unit
    } else {
      await walkForSkills(subdir, results);
    }
  }
}

/** Fetch a skill from a source descriptor */
export async function fetch(source: SourceDescriptor): Promise<FetchResult> {
  if (source.type === "local") {
    // For local sources, just reference the path directly (no temp)
    const resolvedPath = resolve(source.path);
    return {
      dir: resolvedPath,
      cleanup: async () => {},
    };
  }

  // Git-based sources (github or git)
  const tmpBase = getTempPath();
  await mkdir(tmpBase, { recursive: true });
  const tmpDir = join(tmpBase, randomUUID());

  const url = toGitUrl(source);
  await gitClone(url, tmpDir);
  const commit = (await exec(["git", "rev-parse", "HEAD"], tmpDir)).trim();
  const remote: FetchRemoteMetadata = {
    type: "git",
    url,
    commit,
    ...((source.type === "github" && source.subdir) ? { subdir: source.subdir } : {}),
  };

  // Determine the skill directory
  let skillDir: string;

  const searchDir = (source.type === "github" && source.subdir)
    ? join(tmpDir, source.subdir)
    : tmpDir;

  if (source.type === "github" && source.subdir) {
    // Verify subdir exists
    try {
      await stat(searchDir);
    } catch {
      throw new Error(`Subdirectory not found: ${source.subdir}`);
    }
  }

  {
    // Auto-discover skills
    const discovered = await discoverSkills(searchDir);
    if (discovered.length === 0) {
      skillDir = searchDir;
    } else if (discovered.length === 1) {
      skillDir = discovered[0];
    } else {
      // Multiple skills found — for now, use the first one
      skillDir = discovered[0];
    }
  }

  return {
    dir: skillDir,
    cleanup: async () => {
      await rm(tmpDir, { recursive: true, force: true });
    },
    remote,
  };
}

/**
 * Fetch a skill and return multiple discovered skills.
 * Used for repos that contain multiple skills.
 */
export async function fetchAll(source: SourceDescriptor): Promise<{
  skills: string[];
  cleanup: () => Promise<void>;
  remote?: FetchRemoteMetadata;
}> {
  if (source.type === "local") {
    const resolvedPath = resolve(source.path);
    const discovered = await discoverSkills(resolvedPath);
    return {
      skills: discovered.length > 0 ? discovered : [resolvedPath],
      cleanup: async () => {},
    };
  }

  const tmpBase = getTempPath();
  await mkdir(tmpBase, { recursive: true });
  const tmpDir = join(tmpBase, randomUUID());

  const url = toGitUrl(source);
  await gitClone(url, tmpDir);
  const commit = (await exec(["git", "rev-parse", "HEAD"], tmpDir)).trim();
  const remote: FetchRemoteMetadata = {
    type: "git",
    url,
    commit,
    ...((source.type === "github" && source.subdir) ? { subdir: source.subdir } : {}),
  };

  let searchDir = tmpDir;
  if (source.type === "github" && source.subdir) {
    searchDir = join(tmpDir, source.subdir);
  }

  const discovered = await discoverSkills(searchDir);

  return {
    skills: discovered.length > 0 ? discovered : [searchDir],
    cleanup: async () => {
      await rm(tmpDir, { recursive: true, force: true });
    },
    remote,
  };
}
