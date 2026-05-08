import { basename } from "path";
import { join } from "path";
import { resolve as resolveSource, toSourceString, type SourceDescriptor } from "../core/resolver.js";
import { fetchAll } from "../core/fetcher.js";
import { hashDirectory } from "../core/hasher.js";
import { readSkillMd } from "../utils/skill-md.js";
import * as store from "../core/store.js";
import { verifiedLinkSkill } from "../core/store.js";
import {
  getLatestVersion,
  readRegistry,
  registerSkill,
  type Registry,
  type RemoteVersionMetadata,
  type VersionEntry,
} from "../core/registry.js";
import {
  getActiveProfileName,
  readProfile,
  writeProfile,
  type Profile,
  type ProfileSkillEntry,
} from "../core/profile.js";
import { getGlobalSkillsPath, getProfilesPath } from "../utils/paths.js";

export interface UpdateOptions {
  all?: boolean;
  hardlink?: boolean;
}

interface UpdateTarget {
  skillName: string;
  source: string;
  activeEntry?: ProfileSkillEntry;
  latest: VersionEntry;
}

export async function update(skillName?: string, options: UpdateOptions = {}): Promise<void> {
  if (skillName && options.all) {
    throw new Error("Specify either a skill name or --all, not both.");
  }

  const registry = await readRegistry();
  const active = await readActiveProfile();
  const targets = buildTargets(registry, active.profile, skillName, options.all ?? false);

  if (targets.length === 0) {
    console.log(options.all ? "No managed skills found to update." : "No active profile skills found to update.");
    return;
  }

  for (const target of targets) {
    try {
      await updateOne(target, active.profile, options);
    } catch (err: any) {
      if (skillName) throw err;
      console.log(`✗ ${target.skillName} update failed: ${err.message ?? err}`);
    }
  }
}

function buildTargets(
  registry: Registry,
  activeProfile: Profile | null,
  skillName: string | undefined,
  all: boolean
): UpdateTarget[] {
  if (skillName) {
    const latest = getLatestVersion(registry, skillName);
    if (!latest) throw new Error(`Skill '${skillName}' is not managed by bsk.`);
    const activeEntry = activeProfile?.skills.find((s) => s.skillName === skillName);
    return [{ skillName, source: activeEntry?.source ?? latest.source, activeEntry, latest }];
  }

  if (all) {
    return Object.entries(registry.skills).flatMap(([name]) => {
      const latest = getLatestVersion(registry, name);
      if (!latest) return [];
      const activeEntry = activeProfile?.skills.find((s) => s.skillName === name);
      return [{ skillName: name, source: activeEntry?.source ?? latest.source, activeEntry, latest }];
    });
  }

  if (!activeProfile) return [];
  return activeProfile.skills.flatMap((entry) => {
    const latest = getLatestVersion(registry, entry.skillName);
    if (!latest) return [];
    return [{ skillName: entry.skillName, source: entry.source, activeEntry: entry, latest }];
  });
}

async function readActiveProfile(): Promise<{ profile: Profile | null; path: string | null }> {
  const activeName = await getActiveProfileName();
  if (!activeName) return { profile: null, path: null };

  const path = join(getProfilesPath(), `${activeName}.json`);
  try {
    return { profile: await readProfile(path), path };
  } catch {
    return { profile: null, path: null };
  }
}

async function updateOne(
  target: UpdateTarget,
  activeProfile: Profile | null,
  options: UpdateOptions
): Promise<void> {
  const descriptor = resolveSource(target.source);
  if (descriptor.type === "local") {
    console.log(`- ${target.skillName} skipped: local path sources cannot be remotely updated`);
    return;
  }

  const sourceString = toSourceString(descriptor);
  const result = await fetchAll(descriptor);
  try {
    if (!result.remote) {
      console.log(`- ${target.skillName} skipped: source has no remote metadata`);
      return;
    }

    const skillDir = await selectFetchedSkillDir(result.skills, target.skillName, descriptor);
    const hash = await hashDirectory(skillDir);
    await store.store(hash, skillDir);

    const remote: RemoteVersionMetadata = {
      ...result.remote,
      fetchedAt: new Date().toISOString(),
    };

    const previousRemote = target.latest.remote?.commit;
    const v = await registerSkill(target.skillName, hash, sourceString, remote);
    const registryAfter = await readRegistry();
    const selected = registryAfter.skills[target.skillName]?.versions.find((entry) => entry.v === v);
    if (!selected) throw new Error(`Version not found after update: ${target.skillName}@v${v}`);

    if (target.activeEntry) {
      await relinkActiveSkill(target.skillName, selected, activeProfile, options);
    }

    if (target.latest.hash === hash && target.latest.remote?.commit === remote.commit) {
      console.log(`✓ ${target.skillName} already up to date  v${v}  remote: ${short(remote.commit)}`);
    } else if (target.latest.hash === hash) {
      console.log(`- ${target.skillName} remote changed but skill content is unchanged  remote: ${short(remote.commit)}`);
    } else {
      const previous = previousRemote ? `${short(previousRemote)} → ${short(remote.commit)}` : `remote: ${short(remote.commit)}`;
      console.log(`✓ ${target.skillName} updated v${target.latest.v} → v${v}  ${previous}`);
    }
  } finally {
    await result.cleanup();
  }
}

async function selectFetchedSkillDir(
  skillDirs: string[],
  skillName: string,
  descriptor: SourceDescriptor
): Promise<string> {
  const matches: string[] = [];

  for (const dir of skillDirs) {
    try {
      const meta = await readSkillMd(dir);
      if (meta.name.toLowerCase() === skillName.toLowerCase()) {
        matches.push(dir);
      }
    } catch {
      if (deriveNameFromSource(descriptor).toLowerCase() === skillName.toLowerCase()) {
        matches.push(dir);
      }
    }
  }

  if (matches.length > 0) return matches[0];
  if (skillDirs.length === 1) return skillDirs[0];

  throw new Error(`Skill '${skillName}' was not found in fetched source.`);
}

async function relinkActiveSkill(
  skillName: string,
  version: VersionEntry,
  activeProfile: Profile | null,
  options: UpdateOptions
): Promise<void> {
  const targetDir = join(getGlobalSkillsPath(), skillName);
  await verifiedLinkSkill(version.hash, targetDir, { hardlink: options.hardlink });

  const activeName = await getActiveProfileName();
  if (!activeName || !activeProfile) return;

  const entry = activeProfile.skills.find((skill) => skill.skillName === skillName);
  if (!entry) return;
  entry.v = version.v;
  entry.source = version.source;
  entry.addedAt = new Date().toISOString();
  await writeProfile(join(getProfilesPath(), `${activeName}.json`), activeProfile);
}

function deriveNameFromSource(desc: SourceDescriptor): string {
  switch (desc.type) {
    case "github":
      if (desc.subdir) return basename(desc.subdir);
      return desc.repo;
    case "git": {
      const match = desc.url.match(/\/([^/]+?)(?:\.git)?$/);
      return match?.[1] ?? "unnamed-skill";
    }
    case "local":
      return basename(desc.path);
  }
}

function short(commit: string): string {
  return commit.slice(0, 7);
}
