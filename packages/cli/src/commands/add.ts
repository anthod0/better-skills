import { resolve, toSourceString, type SourceDescriptor } from "../core/resolver.js";
import { fetchAll } from "../core/fetcher.js";
import { hashDirectory } from "../core/hasher.js";
import * as store from "../core/store.js";
import { verifiedLinkSkill } from "../core/store.js";
import { getSkillsPath, getProfilesPath } from "../utils/paths.js";
import { hasSkillMd, readSkillMd } from "../utils/skill-md.js";
import { readProfile, writeProfile, getActiveProfileName, setActiveProfileName } from "../core/profile.js";
import { registerSkill, isManaged, type RemoteVersionMetadata } from "../core/registry.js";
import { stat } from "fs/promises";
import { join, basename } from "path";

export interface AddOptions {
  global?: boolean;
  hardlink?: boolean;
  name?: string;
  force?: boolean;
  skill?: string[];
}

/**
 * Add a skill: Resolve → Fetch → Hash → Store → Link
 */
export async function add(source: string, options: AddOptions = {}): Promise<void> {
  // Validate target context before fetching, hashing, or storing anything.
  getSkillsPath(options.global ?? false);

  // 1. Resolve source
  console.log(`Resolving ${source}...`);
  const descriptor = resolve(source);

  // 2. Fetch all skills
  console.log(`Fetching from ${descriptor.type} source...`);
  const result = await fetchAll(descriptor);

  try {
    let skillDirs = result.skills;

    if (skillDirs.length === 0) {
      console.log("No skills found (no SKILL.md files detected).");
      return;
    }

    if (options.skill && options.skill.length > 0) {
      skillDirs = await filterValidSkillDirs(skillDirs);

      if (skillDirs.length === 0) {
        console.log("No skills found (no SKILL.md files detected).");
        return;
      }

      skillDirs = await selectSkillDirs(skillDirs, options.skill);
    }

    if (options.name && skillDirs.length > 1) {
      throw new Error("--name can only be used when installing a single skill.");
    }

    for (const skillDir of skillDirs) {
      await addSingleSkill(skillDir, descriptor, options, result.remote);
    }
  } finally {
    await result.cleanup();
  }
}

async function filterValidSkillDirs(skillDirs: string[]): Promise<string[]> {
  const valid: string[] = [];

  for (const dir of skillDirs) {
    if (await hasSkillMd(dir)) {
      valid.push(dir);
    }
  }

  return valid;
}

async function selectSkillDirs(skillDirs: string[], requestedSkills?: string[]): Promise<string[]> {
  if (!requestedSkills || requestedSkills.length === 0 || requestedSkills.includes("*")) {
    return skillDirs;
  }

  const selected = await filterSkillDirsByName(skillDirs, requestedSkills);
  if (selected.length > 0) {
    return selected;
  }

  const available = (await getSkillDisplayNames(skillDirs)).sort((a, b) =>
    a.localeCompare(b)
  );
  const availableMessage = available.length > 0
    ? `\nAvailable skills:\n${available.map((name) => `  - ${name}`).join("\n")}`
    : "";

  throw new Error(
    `No matching skills found for: ${requestedSkills.join(", ")}${availableMessage}`
  );
}

async function filterSkillDirsByName(skillDirs: string[], names: string[]): Promise<string[]> {
  const normalized = names.map((name) => name.toLowerCase());
  const matched: string[] = [];

  for (const dir of skillDirs) {
    try {
      const meta = await readSkillMd(dir);
      if (normalized.includes(meta.name.toLowerCase())) {
        matched.push(dir);
      }
    } catch {
      // Ignore invalid candidates during named filtering.
    }
  }

  return matched;
}

async function getSkillDisplayNames(skillDirs: string[]): Promise<string[]> {
  const names: string[] = [];

  for (const dir of skillDirs) {
    try {
      const meta = await readSkillMd(dir);
      names.push(meta.name);
    } catch {
      names.push(basename(dir));
    }
  }

  return names;
}

export async function listAddableSkills(source: string): Promise<string[]> {
  const descriptor = resolve(source);
  const result = await fetchAll(descriptor);

  try {
    const names: string[] = [];

    for (const dir of result.skills) {
      try {
        if (await hasSkillMd(dir)) {
          const meta = await readSkillMd(dir);
          names.push(meta.name);
        }
      } catch {
        // Ignore malformed SKILL.md files. The TUI should not show
        // candidates that add(source, { skill }) cannot install by name.
      }
    }

    return names.sort((a, b) => a.localeCompare(b));
  } finally {
    await result.cleanup();
  }
}

async function addSingleSkill(
  skillDir: string,
  descriptor: SourceDescriptor,
  options: AddOptions,
  remote?: Omit<RemoteVersionMetadata, "fetchedAt">
): Promise<void> {
  // 3. Determine skill name
  let skillName: string;
  if (options.name) {
    skillName = options.name;
  } else {
    try {
      const meta = await readSkillMd(skillDir);
      skillName = meta.name;
    } catch {
      skillName = deriveNameFromSource(descriptor);
    }
  }

  // 4. Hash
  console.log(`Hashing ${skillName}...`);
  const hash = await hashDirectory(skillDir);

  // 5. Store
  console.log(`Storing ${hash.slice(0, 8)}...`);
  await store.store(hash, skillDir);

  // 6. Conflict detection (global only)
  const targetBase = getSkillsPath(options.global ?? false);
  const targetDir = join(targetBase, skillName);

  if (options.global) {
    const exists = await dirExists(targetDir);
    if (exists) {
      const managed = await isManaged(skillName);
      if (!managed && !options.force) {
        throw new Error(
          `Skill '${skillName}' exists but is not managed by bsk. Use --force to overwrite.`
        );
      }
    }
  }

  // 7. Link
  console.log(`Linking to ${targetDir}...`);
  await verifiedLinkSkill(hash, targetDir, { hardlink: options.hardlink });

  console.log(`✓ Added ${skillName} (${hash.slice(0, 8)})`);

  // 8. Register in registry (global only)
  let v = 0;
  if (options.global) {
    const sourceStr = toSourceString(descriptor);
    v = await registerSkill(
      skillName,
      hash,
      sourceStr,
      remote ? { ...remote, fetchedAt: new Date().toISOString() } : undefined
    );
  }

  // 9. Record in active profile (only for global skills)
  await addSkillToProfile({
    skillName,
    v,
    source: toSourceString(descriptor),
    global: options.global ?? false,
  });
}

export interface AddToProfileOptions {
  skillName: string;
  v: number;
  source: string;
  global: boolean;
}

/**
 * Record a skill addition in the active profile.
 * Auto-creates a "default" profile when no active profile exists.
 */
export async function addSkillToProfile(opts: AddToProfileOptions): Promise<void> {
  if (!opts.global) return;

  let activeName = await getActiveProfileName();

  if (!activeName) {
    // Auto-create default profile
    activeName = "default";
    const filePath = join(getProfilesPath(), `${activeName}.json`);
    await writeProfile(filePath, { name: activeName, skills: [] });
    await setActiveProfileName(activeName);
    console.log("Created default profile.");
  }

  const filePath = join(getProfilesPath(), `${activeName}.json`);
  let profile;
  try {
    profile = await readProfile(filePath);
  } catch {
    return; // Profile file missing, skip
  }

  // Remove existing entry with same name (update scenario)
  profile.skills = profile.skills.filter((s) => s.skillName !== opts.skillName);
  profile.skills.push({
    skillName: opts.skillName,
    v: opts.v,
    source: opts.source,
    addedAt: new Date().toISOString(),
  });

  await writeProfile(filePath, profile);
}

async function dirExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

function deriveNameFromSource(desc: SourceDescriptor): string {
  switch (desc.type) {
    case "github":
      if (desc.subdir) {
        return basename(desc.subdir);
      }
      return desc.repo;
    case "git":
      // Extract repo name from URL
      const match = desc.url.match(/\/([^/]+?)(?:\.git)?$/);
      return match?.[1] ?? "unnamed-skill";
    case "local":
      return basename(desc.path);
  }
}
