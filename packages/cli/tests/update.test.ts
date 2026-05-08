import { beforeEach, describe, expect, test } from "bun:test";
import { $ } from "bun";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { add } from "../src/commands/add.js";
import { update } from "../src/commands/update.js";
import { readProfile, setActiveProfileName, writeProfile } from "../src/core/profile.js";
import { readRegistry } from "../src/core/registry.js";
import {
  cleanTestHome,
  getGlobalSkillsPath,
  getProfilesPath,
  home,
} from "../src/utils/paths.js";

async function createGitSkillRepo(name = "remote-skill"): Promise<string> {
  const repo = join(home(), `${name}-repo`);
  await mkdir(repo, { recursive: true });
  await $`git init`.cwd(repo).quiet();
  await $`git config user.email test@example.com`.cwd(repo).quiet();
  await $`git config user.name Test`.cwd(repo).quiet();
  await writeFile(
    join(repo, "SKILL.md"),
    `---\nname: ${name}\ndescription: Test skill\n---\n# ${name}\n`
  );
  await $`git add SKILL.md`.cwd(repo).quiet();
  await $`git commit -m initial`.cwd(repo).quiet();
  return repo;
}

async function commitSkillChange(repo: string, content: string, message = "change"): Promise<void> {
  await writeFile(join(repo, "extra.md"), content);
  await $`git add extra.md`.cwd(repo).quiet();
  await $`git commit -m ${message}`.cwd(repo).quiet();
}

async function commitNonSkillChange(repo: string): Promise<void> {
  await mkdir(join(repo, "docs"), { recursive: true });
  await writeFile(join(repo, "docs", "note.md"), "outside skill\n");
  await $`git add docs/note.md`.cwd(repo).quiet();
  await $`git commit -m docs`.cwd(repo).quiet();
}

function fileUrl(path: string): string {
  return `file://${path}`;
}

describe("update command", () => {
  beforeEach(async () => {
    await cleanTestHome();
  });

  test("add stores git remote metadata for global installs", async () => {
    const repo = await createGitSkillRepo();

    await add(fileUrl(repo), { global: true });

    const reg = await readRegistry();
    const version = reg.skills["remote-skill"].versions[0];
    expect(version.remote?.type).toBe("git");
    expect(version.remote?.url).toBe(fileUrl(repo));
    expect(version.remote?.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(version.remote?.fetchedAt).toBeDefined();
  });

  test("updates an active profile skill when remote content changes", async () => {
    const repo = await createGitSkillRepo();
    await add(fileUrl(repo), { global: true });
    const before = await readRegistry();
    const beforeVersion = before.skills["remote-skill"].versions[0];

    await commitSkillChange(repo, "new content\n");
    await update("remote-skill");

    const reg = await readRegistry();
    const versions = reg.skills["remote-skill"].versions;
    expect(versions).toHaveLength(2);
    expect(versions[1].v).toBe(2);
    expect(versions[1].hash).not.toBe(beforeVersion.hash);
    expect(versions[1].remote?.commit).not.toBe(beforeVersion.remote?.commit);

    const profile = await readProfile(join(getProfilesPath(), "default.json"));
    expect(profile.skills.find((s) => s.skillName === "remote-skill")?.v).toBe(2);

    const linked = await readFile(join(getGlobalSkillsPath(), "remote-skill", "extra.md"), "utf-8");
    expect(linked).toBe("new content\n");
  });

  test("remote commit change with unchanged skill content updates metadata without new version", async () => {
    const repoRoot = join(home(), "monorepo");
    const skillDir = join(repoRoot, "skills", "remote-skill");
    await mkdir(skillDir, { recursive: true });
    await $`git init`.cwd(repoRoot).quiet();
    await $`git config user.email test@example.com`.cwd(repoRoot).quiet();
    await $`git config user.name Test`.cwd(repoRoot).quiet();
    await writeFile(
      join(skillDir, "SKILL.md"),
      "---\nname: remote-skill\ndescription: Test skill\n---\n# remote-skill\n"
    );
    await $`git add skills/remote-skill/SKILL.md`.cwd(repoRoot).quiet();
    await $`git commit -m initial`.cwd(repoRoot).quiet();

    await add(fileUrl(repoRoot), { global: true });
    const before = await readRegistry();
    const beforeVersion = before.skills["remote-skill"].versions[0];

    await commitNonSkillChange(repoRoot);
    await update("remote-skill");

    const reg = await readRegistry();
    const versions = reg.skills["remote-skill"].versions;
    expect(versions).toHaveLength(1);
    expect(versions[0].v).toBe(1);
    expect(versions[0].hash).toBe(beforeVersion.hash);
    expect(versions[0].remote?.commit).not.toBe(beforeVersion.remote?.commit);
  });

  test("bare update targets active profile remote skills only", async () => {
    const activeRepo = await createGitSkillRepo("active-skill");
    await add(fileUrl(activeRepo), { global: true });

    const inactiveRepo = await createGitSkillRepo("inactive-skill");
    await add(fileUrl(inactiveRepo), { global: true });
    await writeProfile(join(getProfilesPath(), "default.json"), {
      name: "default",
      skills: [
        {
          skillName: "active-skill",
          v: 1,
          source: fileUrl(activeRepo),
          addedAt: new Date().toISOString(),
        },
      ],
    });
    await setActiveProfileName("default");

    await commitSkillChange(activeRepo, "active change\n");
    await commitSkillChange(inactiveRepo, "inactive change\n");
    await update();

    const reg = await readRegistry();
    expect(reg.skills["active-skill"].versions).toHaveLength(2);
    expect(reg.skills["inactive-skill"].versions).toHaveLength(1);
  });

  test("update --all targets inactive registry remote skills", async () => {
    const repo = await createGitSkillRepo("inactive-skill");
    await add(fileUrl(repo), { global: true });
    await writeProfile(join(getProfilesPath(), "default.json"), { name: "default", skills: [] });
    await commitSkillChange(repo, "inactive change\n");

    await update(undefined, { all: true });

    const reg = await readRegistry();
    expect(reg.skills["inactive-skill"].versions).toHaveLength(2);
  });
});
