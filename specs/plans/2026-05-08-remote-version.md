# Remote Version Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add remote update support that records upstream git commit SHAs and creates new local bsk versions when remote skill content changes.

**Architecture:** Extend registry versions with optional remote metadata, make git fetching return commit metadata, and add an `update` command that reuses fetch/hash/store/link/profile flows. Local bsk `vN` remains the profile/rollback version; remote commit is traceability and update detection metadata.

**Tech Stack:** TypeScript ESM, Bun test runner, commander.js CLI, git CLI via `execFile`, existing bsk store/registry/profile/linker utilities.

---

## File Structure

- Modify `packages/cli/src/core/registry.ts`: add `RemoteMetadata`, allow `registerSkill(..., remote?)`, add helper to update remote metadata for an existing hash/version.
- Modify `packages/cli/src/core/fetcher.ts`: return optional git remote metadata from `fetchAll()` and `fetch()`.
- Modify `packages/cli/src/commands/add.ts`: pass remote metadata into registry and active profile update path.
- Create `packages/cli/src/commands/update.ts`: target selection, remote fetch, hash comparison, store/register, relink, active profile update.
- Modify `packages/cli/src/cli.ts`: register `bsk update [skill] --all --hardlink`.
- Modify `packages/cli/src/commands/ls.ts` and README only if display/docs are included in this implementation pass.
- Tests:
  - Modify `packages/cli/tests/registry.test.ts`.
  - Modify `packages/cli/tests/fetcher.test.ts`.
  - Create `packages/cli/tests/update.test.ts`.
  - Add CLI parser test in an existing CLI test file or `packages/cli/tests/update.test.ts` if enough.

## Task 1: Registry remote metadata

**Files:**
- Modify: `packages/cli/src/core/registry.ts`
- Test: `packages/cli/tests/registry.test.ts`

- [ ] **Step 1: Write failing registry tests**

Add tests under `describe("registerSkill")` and a new `describe("updateVersionRemote")`:

```ts
test("stores remote metadata on new version", async () => {
  await mkdir(join(getStorePath(), "abc123"), { recursive: true });
  await registerSkill("my-skill", "abc123", "owner/repo", {
    type: "git",
    url: "https://github.com/owner/repo.git",
    commit: "1111111",
    fetchedAt: "2026-05-08T00:00:00.000Z",
  });

  const reg = await readRegistry();
  expect(reg.skills["my-skill"].versions[0].remote?.commit).toBe("1111111");
});

test("updates remote metadata for existing hash without adding version", async () => {
  await mkdir(join(getStorePath(), "abc123"), { recursive: true });
  await registerSkill("my-skill", "abc123", "owner/repo");

  await updateVersionRemote("my-skill", "abc123", {
    type: "git",
    url: "https://github.com/owner/repo.git",
    commit: "2222222",
    fetchedAt: "2026-05-08T00:00:00.000Z",
  });

  const reg = await readRegistry();
  expect(reg.skills["my-skill"].versions).toHaveLength(1);
  expect(reg.skills["my-skill"].versions[0].remote?.commit).toBe("2222222");
});
```

Import `updateVersionRemote` in the test.

- [ ] **Step 2: Run failing registry tests**

Run:

```bash
bun test packages/cli/tests/registry.test.ts
```

Expected: FAIL because `registerSkill` does not accept remote metadata and `updateVersionRemote` does not exist.

- [ ] **Step 3: Implement minimal registry changes**

In `packages/cli/src/core/registry.ts`:

```ts
export interface RemoteMetadata {
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
  remote?: RemoteMetadata;
}
```

Change signature:

```ts
export async function registerSkill(
  name: string,
  hash: string,
  source: string,
  remote?: RemoteMetadata
): Promise<number>
```

When existing hash is found, update `existing.remote = remote` only if `remote` is provided, then write registry and return existing `v`.

When pushing a new version, include `remote` only when defined:

```ts
entry.versions.push({
  v: newV,
  hash,
  source,
  addedAt: new Date().toISOString(),
  ...(remote ? { remote } : {}),
});
```

Add helper:

```ts
export async function updateVersionRemote(
  name: string,
  hash: string,
  remote: RemoteMetadata
): Promise<boolean> {
  const registry = await readRegistry();
  const version = registry.skills[name]?.versions.find((v) => v.hash === hash);
  if (!version) return false;
  version.remote = remote;
  await writeRegistry(registry);
  return true;
}
```

- [ ] **Step 4: Run registry tests**

Run:

```bash
bun test packages/cli/tests/registry.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/core/registry.ts packages/cli/tests/registry.test.ts
git commit -m "feat: store remote metadata in registry"
```

## Task 2: Fetcher returns git commit metadata

**Files:**
- Modify: `packages/cli/src/core/fetcher.ts`
- Test: `packages/cli/tests/fetcher.test.ts`

- [ ] **Step 1: Write failing fetcher test**

Inspect existing `fetcher.test.ts` helpers first. Add a test using a local temporary git repo if helpers exist; otherwise create one with `git init`, commit a `SKILL.md`, then fetch via a `git` URL/path accepted by the resolver/fetcher.

Expected assertion shape:

```ts
const result = await fetchAll({ type: "git", url: repoPath });
try {
  expect(result.remote?.type).toBe("git");
  expect(result.remote?.commit).toMatch(/^[0-9a-f]{40}$/);
  expect(result.remote?.url).toBe(repoPath);
} finally {
  await result.cleanup();
}
```

Also add a local source assertion:

```ts
const result = await fetchAll({ type: "local", path: skillPath });
expect(result.remote).toBeUndefined();
```

- [ ] **Step 2: Run failing fetcher tests**

```bash
bun test packages/cli/tests/fetcher.test.ts
```

Expected: FAIL because `remote` is undefined for git fetches.

- [ ] **Step 3: Implement fetcher metadata**

In `packages/cli/src/core/fetcher.ts`, add interfaces:

```ts
export interface FetchRemoteMetadata {
  type: "git";
  url: string;
  commit: string;
  branch?: string;
}
```

Extend result types for `fetch()` and `fetchAll()` with `remote?: FetchRemoteMetadata`.

Add helper:

```ts
async function gitRevParseHead(repoDir: string): Promise<string> {
  return (await exec(["git", "-C", repoDir, "rev-parse", "HEAD"])).trim();
}
```

After `gitClone(url, tmpDir)` in both `fetch()` and `fetchAll()`, call `gitRevParseHead(tmpDir)` and return:

```ts
remote: {
  type: "git",
  url,
  commit,
}
```

Local source branches continue returning no `remote`.

- [ ] **Step 4: Run fetcher tests**

```bash
bun test packages/cli/tests/fetcher.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/core/fetcher.ts packages/cli/tests/fetcher.test.ts
git commit -m "feat: return remote commit from fetcher"
```

## Task 3: Add command records remote metadata

**Files:**
- Modify: `packages/cli/src/commands/add.ts`
- Test: `packages/cli/tests/add-skill-option.test.ts` or a focused new add test if existing add tests are not suitable

- [ ] **Step 1: Write failing add test**

Mock or create a real temp git repo, run `add(source, { global: true })`, then assert latest registry version has `remote.commit`.

Minimal assertion:

```ts
const reg = await readRegistry();
const latest = getLatestVersion(reg, "my-skill");
expect(latest?.remote?.commit).toMatch(/^[0-9a-f]{40}$/);
```

- [ ] **Step 2: Run failing add-related test**

```bash
bun test packages/cli/tests/add-skill-option.test.ts
```

If the new test is in another file, run that exact file. Expected: FAIL because add does not pass remote metadata to registry.

- [ ] **Step 3: Pass fetch remote metadata into `addSingleSkill`**

In `packages/cli/src/commands/add.ts`, change the loop to pass `result.remote`:

```ts
for (const skillDir of skillDirs) {
  await addSingleSkill(skillDir, descriptor, options, result.remote);
}
```

Update `addSingleSkill` signature and import `type FetchRemoteMetadata` from fetcher.

Build registry remote metadata from fetcher metadata:

```ts
const remote = remoteInfo
  ? {
      ...remoteInfo,
      subdir: descriptor.type === "github" ? descriptor.subdir : undefined,
      fetchedAt: new Date().toISOString(),
    }
  : undefined;
```

Pass to registry:

```ts
v = await registerSkill(skillName, hash, sourceStr, remote);
```

- [ ] **Step 4: Run add test and affected registry/fetcher tests**

```bash
bun test packages/cli/tests/add-skill-option.test.ts packages/cli/tests/registry.test.ts packages/cli/tests/fetcher.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/add.ts packages/cli/tests/add-skill-option.test.ts
git commit -m "feat: record remote commit when adding skills"
```

## Task 4: Implement update command core behavior

**Files:**
- Create: `packages/cli/src/commands/update.ts`
- Test: `packages/cli/tests/update.test.ts`

- [ ] **Step 1: Write failing update tests**

Create `packages/cli/tests/update.test.ts`. Use temp git repos rather than network. Cover at least:

1. `update({ skill: "my-skill" })` creates a new version after remote content changes.
2. Commit changes outside the skill directory do not create a new version but update remote metadata.
3. Local source is skipped.

Test structure:

```ts
import { beforeEach, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { update } from "../src/commands/update.js";
import { add } from "../src/commands/add.js";
import { readRegistry, getLatestVersion } from "../src/core/registry.js";
import { cleanTestHome } from "../src/utils/paths.js";
```

Create helper functions for `git init`, `git add`, `git commit`, and writing `SKILL.md`. Use `execFile` not shell strings.

- [ ] **Step 2: Run failing update test**

```bash
bun test packages/cli/tests/update.test.ts
```

Expected: FAIL because `commands/update.ts` does not exist.

- [ ] **Step 3: Implement target selection and update flow**

Create `packages/cli/src/commands/update.ts` with:

```ts
export interface UpdateOptions {
  skill?: string;
  all?: boolean;
  hardlink?: boolean;
}

export async function update(options: UpdateOptions = {}): Promise<void> {
  // choose targets, then call updateOne for each
}
```

Target rules:

- If `options.skill`, read registry and update that skill by latest/source.
- Else if `options.all`, update every registry skill whose latest version source is not local.
- Else read active profile using `getActiveProfileName`, `readProfile`, and update profile skills.

Implement `isRemoteSource(source: string)` by using `resolve(source)` and checking `desc.type !== "local"`; catch resolver errors and skip.

For each target:

1. Resolve source from profile entry or latest registry version.
2. Fetch all skills from source.
3. Select skill dir by matching `SKILL.md` name to target skill; if one skill only, allow it.
4. Hash selected dir.
5. Store hash.
6. Build remote metadata from `result.remote`.
7. If hash already exists for this skill, call `registerSkill` anyway to get existing `v` and update remote metadata.
8. If hash is new, `registerSkill` creates `v+1`.
9. If active profile contains this skill, relink global skill path with `verifiedLinkSkill(hash, join(getGlobalSkillsPath(), skillName), { hardlink })` and update profile entry `v`/`source`/`addedAt`.

Keep first implementation simple: sequential updates and console logging.

- [ ] **Step 4: Run update tests**

```bash
bun test packages/cli/tests/update.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/update.ts packages/cli/tests/update.test.ts
git commit -m "feat: add remote update command"
```

## Task 5: Wire CLI command

**Files:**
- Modify: `packages/cli/src/cli.ts`
- Test: existing CLI command tests or `packages/cli/tests/update.test.ts`

- [ ] **Step 1: Write failing CLI parser test**

Add a test that builds the program and verifies `update` exists. Follow patterns in `cli-install-alias.test.ts` or `cli-default-tui.test.ts`.

Assert command names include `update`, or mock `commands/update.js` and parse `update my-skill` to verify action receives `{ skill: "my-skill" }`.

- [ ] **Step 2: Run failing CLI test**

```bash
bun test packages/cli/tests/cli-install-alias.test.ts
```

Use the actual file containing the new test. Expected: FAIL.

- [ ] **Step 3: Register command in CLI**

In `packages/cli/src/cli.ts` import:

```ts
import { update } from "./commands/update.js";
```

Add command near other skill management commands:

```ts
program
  .command("update [skill]")
  .description("Update remote-backed skills and register new local versions")
  .option("-a, --all", "Update all remote-backed managed skills")
  .option("--hardlink", "Use hard links instead of file copy")
  .action(async (skill: string | undefined, opts) => {
    await update({ skill, all: opts.all, hardlink: opts.hardlink });
  });
```

- [ ] **Step 4: Run CLI test**

```bash
bun test packages/cli/tests/cli-install-alias.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/cli.ts packages/cli/tests/cli-install-alias.test.ts
git commit -m "feat: expose update command"
```

## Task 6: Update listing/docs display

**Files:**
- Modify: `packages/cli/src/commands/ls.ts`
- Modify: `README.md`
- Test: `packages/cli/tests/ls.test.ts`

- [ ] **Step 1: Write failing ls test for remote commit**

Update `lsAll` test data to include `remote.commit` and assert returned entry includes `remoteCommit` or similar field.

Suggested interface addition:

```ts
export interface LsAllEntry {
  name: string;
  hash: string;
  source: string;
  v: number;
  remoteCommit?: string;
}
```

- [ ] **Step 2: Run failing ls test**

```bash
bun test packages/cli/tests/ls.test.ts
```

Expected: FAIL until `lsAll` returns remote commit.

- [ ] **Step 3: Implement display**

In `lsAll()`, include `remoteCommit: latest.remote?.commit`.

In `printLsAll()`, add a `Remote` column or append compact text:

```ts
const remote = entry.remoteCommit ? entry.remoteCommit.slice(0, 8) : "-";
console.log(`${entry.name.padEnd(30)} ${("v" + entry.v).padEnd(10)} ${entry.hash.slice(0, 8).padEnd(12)} ${remote.padEnd(10)} ${entry.source}`);
```

Update README commands:

```bash
bsk update [skill]        # Update remote-backed skills
bsk update --all          # Update all managed remote-backed skills
```

Add a short Remote Versions section explaining local `vN` vs remote commit SHA.

- [ ] **Step 4: Run docs/display tests**

```bash
bun test packages/cli/tests/ls.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/ls.ts packages/cli/tests/ls.test.ts README.md
git commit -m "docs: document remote version updates"
```

## Task 7: Final verification

**Files:**
- All touched files

- [ ] **Step 1: Run full test suite**

```bash
bun run test
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run build**

```bash
bun run build
```

Expected: PASS and generate `packages/cli/dist/cli.mjs`.

- [ ] **Step 4: Inspect git status**

```bash
git status --short
```

Expected: clean, or only intentional uncommitted generated artifacts ignored by project policy.

- [ ] **Step 5: If not already committed, commit final adjustments**

```bash
git add <files>
git commit -m "test: verify remote version updates"
```
