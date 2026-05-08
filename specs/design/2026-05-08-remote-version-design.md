# Remote Version Design

## Goal

Add remote update support so skills installed from git/GitHub sources can be refreshed when the upstream repository changes. Each content change should create a new local bsk version while also recording the upstream commit SHA as the remote version.

## Current Context

`bsk` already stores content-addressed skill versions in `~/.better-skills/store/{hash}` and tracks local versions in `registry.json` as `v1`, `v2`, etc. Profiles reference local versions by `{ skillName, v, source }`. `bsk add` currently fetches the latest source, hashes the skill directory, stores it, links it, and registers a local version when installed globally.

The missing behavior is explicit remote refresh: re-check the original remote source, detect whether upstream has changed, register new local versions when skill content changes, and update active installs/profiles accordingly.

## Design Summary

Use two version concepts:

- **Local version**: existing `v` number managed by bsk, used for profile pinning, rollback, `latest`, `previous`, and `vN` references.
- **Remote version**: upstream git commit SHA recorded as metadata on each local version.

Remote commits do not replace local versions. They provide traceability and update detection.

## Registry Data Model

Extend `VersionEntry` with optional remote metadata:

```ts
interface VersionEntry {
  v: number;
  hash: string;
  source: string;
  addedAt: string;
  remote?: {
    type: "git";
    url: string;
    commit: string;
    branch?: string;
    subdir?: string;
    fetchedAt: string;
  };
}
```

Compatibility rules:

- Existing registry entries without `remote` remain valid.
- Local path sources do not get `remote` metadata.
- GitHub and git URL sources can get `remote` metadata on add/update.

## Fetcher Changes

Extend git/GitHub fetching to return repository metadata in addition to discovered skill directories:

```ts
interface FetchAllResult {
  skills: string[];
  cleanup: () => Promise<void>;
  remote?: {
    type: "git";
    url: string;
    commit: string;
    branch?: string;
  };
}
```

For git sources, after shallow clone:

```bash
git rev-parse HEAD
```

This commit SHA is the authoritative remote version for first implementation. Branch tracking can be recorded if cheap, but update correctness should rely on commit SHA and content hash.

## CLI Behavior

Add a new command:

```bash
bsk update [skill]
bsk update --all
```

Semantics:

- `bsk update`: update remote-backed skills in the active profile.
- `bsk update <skill>`: update one named skill.
- `bsk update --all`: update all remote-backed skills in the registry, including inactive skills.

Local path sources are skipped with a clear message.

Enhance `bsk add <source>`:

- If the source installs a skill name that already exists and is managed, adding it again acts as an update/install-to-latest operation.
- If content hash is new, register a new local version and relink/profile to it.
- If hash already exists, do not create a duplicate version; ensure the live install/profile points at that version.

## Update Flow

For each target skill:

1. Resolve candidate source from the active profile or registry latest version.
2. Skip local sources.
3. Fetch the remote source and collect commit SHA.
4. Discover/select the relevant skill directory.
5. Compute the content hash.
6. Compare with registry versions:
   - Same commit and same hash: no-op.
   - Different commit but same hash: update remote metadata for the matching version, but do not create a new local version.
   - New hash: store content, register `v + 1`, attach remote metadata.
7. If the skill is in the active profile, relink the global skill directory to the selected/new version and update the profile's `v`.
8. Print a concise status.

Example outputs:

```text
✓ my-skill already up to date  v3  remote: 9f2c1aa
✓ my-skill updated v2 → v3  abc1234 → def5678  remote: 9f2c1aa
- my-skill remote changed but skill content is unchanged  remote: 9f2c1aa
- local-skill skipped: local path sources cannot be remotely updated
```

## Component Boundaries

- `core/fetcher.ts`: fetch remote/local sources and return optional remote commit metadata.
- `core/registry.ts`: support remote metadata on `VersionEntry`; add helper(s) to update metadata without creating a new local version.
- `commands/add.ts`: keep install behavior, but pass remote metadata into registry registration.
- `commands/update.ts`: orchestrate update target selection, fetch/hash/store/register/relink/profile update.
- `core/profile.ts` / existing profile command helpers: continue storing local `v`; update active profile entries when the installed version changes.

## Error Handling

- Network/git clone failure: fail that skill with a useful message; batch updates should continue to other skills where practical.
- Missing skill in fetched source: report and leave current version untouched.
- Existing unmanaged global skill: keep current add conflict behavior; update should only operate on managed registry/profile skills.
- Corrupted/missing store entries: rely on existing verified linking errors and recommend `bsk store verify` / re-add.

## Testing Plan

Cover these cases:

1. Registry reads old entries without `remote`.
2. Registering a new version stores remote metadata.
3. Re-registering the same hash returns the existing `v` and avoids duplicates.
4. Commit changed but skill content hash unchanged updates metadata without creating a new version.
5. New content hash creates `v + 1`.
6. `bsk update <skill>` updates active profile version and relinks the global skill.
7. `bsk update` only targets active profile remote skills.
8. `bsk update --all` targets all registry remote skills.
9. Local sources are skipped.
10. `bsk add <same-source>` behaves as update/install-latest for managed skills.

## Deferred Work

- Pinning to branches/tags in source syntax.
- Fetching remote HEAD without cloning before deciding whether to clone.
- Showing remote commit in all TUI views.
- Automatic background update checks.
