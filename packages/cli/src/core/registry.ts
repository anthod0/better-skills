import { readFile, writeFile, mkdir, stat } from "fs/promises";
import { dirname, join } from "path";
import { getRegistryPath, getStorePath } from "../utils/paths.js";
import { remove as removeFromStore } from "./store.js";

export interface RemoteVersionMetadata {
  type: "git";
  url: string;
  commit: string;
  branch?: string;
  subdir?: string;
  fetchedAt: string;
}

export interface VersionEntry {
  v: number;
  hash: string;
  source: string;
  addedAt: string;
  remote?: RemoteVersionMetadata;
}

export interface RegistrySkillEntry {
  versions: VersionEntry[];
}

export interface Registry {
  skills: Record<string, RegistrySkillEntry>;
}

/**
 * Read the global skills registry.
 * Missing file → empty registry. Corrupted JSON → warn + empty registry.
 */
export async function readRegistry(): Promise<Registry> {
  const filePath = getRegistryPath();
  try {
    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.skills === "object") {
      return parsed as Registry;
    }
    console.warn("⚠ Registry has unexpected structure, treating as empty.");
    return { skills: {} };
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return { skills: {} };
    }
    console.warn("⚠ Could not read registry, treating as empty.");
    return { skills: {} };
  }
}

/**
 * Write the registry to disk.
 * Cleans version entries where hash no longer exists in the store.
 * Removes skill entries with no remaining versions.
 */
export async function writeRegistry(
  registry: Registry
): Promise<void> {
  const filePath = getRegistryPath();
  const storeBase = getStorePath();

  const cleaned: Record<string, RegistrySkillEntry> = {};
  for (const [name, entry] of Object.entries(registry.skills)) {
    const validVersions: VersionEntry[] = [];
    for (const ver of entry.versions) {
      try {
        await stat(join(storeBase, ver.hash));
        validVersions.push(ver);
      } catch {
        // Hash missing from store, skip this version
      }
    }
    if (validVersions.length > 0) {
      cleaned[name] = { versions: validVersions };
    }
  }

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    JSON.stringify({ skills: cleaned }, null, 2) + "\n"
  );
}

/**
 * Register a skill version. Appends to versions[] with auto-incremented v.
 * Idempotent: skips if hash already exists in versions[].
 */
export async function registerSkill(
  name: string,
  hash: string,
  source: string,
  remote?: RemoteVersionMetadata
): Promise<number> {
  const registry = await readRegistry();

  if (!registry.skills[name]) {
    registry.skills[name] = { versions: [] };
  }

  const entry = registry.skills[name];

  // Idempotent: skip if hash already registered
  const existing = entry.versions.find((v) => v.hash === hash);
  if (existing) {
    if (remote) {
      existing.remote = remote;
      existing.source = source;
    }
    await writeRegistry(registry);
    return existing.v;
  }

  // Auto-increment v
  const maxV = entry.versions.reduce((max, v) => Math.max(max, v.v), 0);
  const newV = maxV + 1;

  entry.versions.push({
    v: newV,
    hash,
    source,
    addedAt: new Date().toISOString(),
    ...(remote ? { remote } : {}),
  });

  await writeRegistry(registry);
  return newV;
}

/**
 * Unregister a skill (remove all versions).
 * Cleans up orphaned store entries that are no longer referenced by any skill.
 */
export async function updateVersionRemoteMetadata(
  name: string,
  v: number,
  remote: RemoteVersionMetadata
): Promise<void> {
  const registry = await readRegistry();
  const version = registry.skills[name]?.versions.find((entry) => entry.v === v);
  if (!version) {
    throw new Error(`Version not found: ${name}@v${v}`);
  }
  version.remote = remote;
  await writeRegistry(registry);
}

export async function unregisterSkill(
  name: string
): Promise<void> {
  const registry = await readRegistry();
  const removedEntry = registry.skills[name];
  if (!removedEntry) {
    return;
  }

  const removedHashes = new Set(removedEntry.versions.map((v) => v.hash));

  delete registry.skills[name];

  // Collect hashes still referenced by remaining skills
  const referencedHashes = new Set<string>();
  for (const entry of Object.values(registry.skills)) {
    for (const ver of entry.versions) {
      referencedHashes.add(ver.hash);
    }
  }

  // Delete orphaned hashes
  for (const hash of removedHashes) {
    if (!referencedHashes.has(hash)) {
      try {
        await removeFromStore(hash);
      } catch (err) {
        console.warn(`⚠ Failed to remove store entry ${hash.slice(0, 8)}: ${err}`);
      }
    }
  }

  await writeRegistry(registry);
}

/**
 * Check if a skill is managed by bsk.
 */
export async function isManaged(
  name: string
): Promise<boolean> {
  const registry = await readRegistry();
  return name in registry.skills && registry.skills[name].versions.length > 0;
}

/**
 * Get the latest version (highest v) for a skill.
 * Returns null if skill not found or has no versions.
 */
export function getLatestVersion(
  registry: Registry,
  name: string
): VersionEntry | null {
  const entry = registry.skills[name];
  if (!entry || entry.versions.length === 0) return null;
  return entry.versions.reduce((best, v) => (v.v > best.v ? v : best));
}

/**
 * Resolve a version specifier to a VersionEntry.
 * Specifiers: "latest", "previous", "~N", "vN", or hash prefix.
 * Returns null if no match.
 */
export function resolveVersion(
  registry: Registry,
  name: string,
  specifier: string
): VersionEntry | null {
  const entry = registry.skills[name];
  if (!entry || entry.versions.length === 0) return null;

  // Sort descending by v
  const sorted = [...entry.versions].sort((a, b) => b.v - a.v);

  if (specifier === "latest") {
    return sorted[0];
  }

  if (specifier === "previous") {
    return sorted[1] ?? null;
  }

  // ~N: N-th from end (1-indexed, ~1 = previous)
  const tildeMatch = specifier.match(/^~(\d+)$/);
  if (tildeMatch) {
    const n = parseInt(tildeMatch[1], 10);
    return sorted[n] ?? null;
  }

  // vN: exact version number
  const vMatch = specifier.match(/^v(\d+)$/);
  if (vMatch) {
    const target = parseInt(vMatch[1], 10);
    return entry.versions.find((v) => v.v === target) ?? null;
  }

  // Hash prefix match (fallback)
  const matches = entry.versions.filter((v) => v.hash.startsWith(specifier));
  if (matches.length === 1) return matches[0];
  return null;
}
