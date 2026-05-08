#!/usr/bin/env node
import { Command } from "commander";

declare const __BSK_VERSION__: string | undefined;
const version =
  typeof __BSK_VERSION__ !== "undefined"
    ? __BSK_VERSION__
    : "0.0.0-dev";
import { startTui } from "./tui/index.js";
import { add } from "./commands/add.js";
import { clientAdd, clientRm, clientLs } from "./commands/client.js";
import { rm } from "./commands/rm.js";
import { ls, printLs, lsAll, printLsAll } from "./commands/ls.js";
import { save } from "./commands/save.js";
import { update } from "./commands/update.js";
import { storeVerify, storeLs, storePrune, storeAdopt } from "./commands/store-cmd.js";
import { mvToProject, mvToGlobal } from "./commands/mv.js";
import {
  profileCreate,
  profileLs,
  profileShow,
  profileUse,
  profileAdd,
  profileRm,
  profileDelete,
  profileRename,
  profileClone,
  profileApply,
} from "./commands/profile.js";
import { syncRestore, syncExport, syncImport, bskCd } from "./commands/sync.js";
import { printCompletionScript, runComplete } from "./commands/completion.js";
import { getActiveProfileName } from "./core/profile.js";
import {
  getGlobalSkillsPath,
} from "./utils/paths.js";

export interface BuildProgramOptions {
  enableActions?: boolean;
}

export function buildProgram(options: BuildProgramOptions = {}): Command {
  const program = new Command();
    const enableActions = options.enableActions ?? true;

    program
      .name("bsk")
      .description("A pnpm-inspired skills management CLI with content-addressable storage")
      .version(version);

    if (enableActions) {
      program.action(() => {
        startTui(version);
      });
    }

  program
    .command("add <source>")
    .description("Add a skill from a source (github, git, or local path)")
    .option("-g, --global", "Install to global skills directory")
    .option("--hardlink", "Use hard links instead of file copy")
    .option("-n, --name <name>", "Override the skill name")
    .option("-f, --force", "Overwrite unmanaged skills")
    .option("-s, --skill <skills...>", "Install specific skills by name (use '*' for all)")
    .option("-y, --yes", "Skip confirmation prompts")
    .action(async (source: string, opts) => {
      await add(source, {
        global: opts.global,
        hardlink: opts.hardlink,
        name: opts.name,
        force: opts.force,
        skill: opts.skill,
      });
    });

  program
    .command("install <source>")
    .alias("i")
    .description("Add a skill from a source (github, git, or local path)")
    .option("-g, --global", "Install to global skills directory")
    .option("--hardlink", "Use hard links instead of file copy")
    .option("-n, --name <name>", "Override the skill name")
    .option("-f, --force", "Overwrite unmanaged skills")
    .option("-s, --skill <skills...>", "Install specific skills by name (use '*' for all)")
    .option("-y, --yes", "Skip confirmation prompts")
    .action(async (source: string, opts) => {
      await add(source, {
        global: opts.global,
        hardlink: opts.hardlink,
        name: opts.name,
        force: opts.force,
        skill: opts.skill,
      });
    });

  program
    .command("rm <name>")
    .alias("remove")
    .description("Remove a skill")
    .option("-g, --global", "Remove from global skills directory")
    .action(async (name: string, opts) => {
      await rm(name, { global: opts.global });
    });

  program
    .command("list")
    .alias("ls")
    .description("Show all active skills with their source (global / project)")
    .option("-a, --all", "List all skills managed by bsk (from registry)")
    .action(async (opts) => {
      if (opts.all) {
        const entries = await lsAll();
        printLsAll(entries);
      } else {
        const entries = await ls();
        printLs(entries);
      }
    });

  program
    .command("save [skill-name]")
    .description("Save new or changed skills to bsk management")
    .action(async (skillName: string | undefined) => {
      await save({ skillName });
    });

  program
    .command("update [skill]")
    .description("Refresh remote-backed skills from their original source")
    .option("--all", "Update all remote-backed skills in the registry")
    .option("--hardlink", "Use hard links instead of file copy")
    .action(async (skill: string | undefined, opts) => {
      await update(skill, {
        all: opts.all,
        hardlink: opts.hardlink,
      });
    });

  program
    .command("mv <skill-name> <target>")
    .alias("move")
    .description("Move a skill between project and global scope")
    .option("-f, --force", "Overwrite if skill already exists in target")
    .option("--hardlink", "Use hard links instead of file copy (project → global only)")
    .action(async (skillName: string, target: string, opts) => {
      if (target === "global") {
        await mvToGlobal(skillName, {
          force: opts.force,
          hardlink: opts.hardlink,
        });
      } else if (target === "project") {
        await mvToProject(skillName, {
          force: opts.force,
        });
      } else {
        console.error(`Unknown target '${target}'. Use 'global' or 'project'.`);
        process.exit(1);
      }
    });

  const client = program
    .command("client")
    .description("Manage multi-client skill directories");

  client
    .command("add <client>")
    .description("Enable a client for skill syncing")
    .action(async (client: string) => {
      await clientAdd(client);
    });

  client
    .command("rm <client>")
    .alias("remove")
    .description("Disable a client and remove its skills symlink")
    .action(async (client: string) => {
      await clientRm(client);
    });

  client
    .command("ls")
    .alias("list")
    .description("Show all supported clients and their status")
    .action(async () => {
      const items = await clientLs();
      console.log("");
      console.log("  agents".padEnd(14) + getGlobalSkillsPath().padEnd(38) + "(always enabled)");
      for (const item of items) {
        const marker = item.enabled ? "* " : "  ";
        console.log(marker + item.id.padEnd(12) + item.path);
      }
      console.log("");
    });

  const profile = program
    .command("profile")
    .description("Manage skill profiles");

  profile
    .command("create <name>")
    .description("Create a new profile")
    .option("--from-existing", "Snapshot current global skills into the profile")
    .action(async (name: string, opts) => {
      await profileCreate(name, {
        fromExisting: opts.fromExisting,
      });
    });

  profile
    .command("ls")
    .alias("list")
    .description("List all profiles")
    .action(async () => {
      const items = await profileLs();
      if (items.length === 0) {
        console.log("No profiles found. Create one with: bsk profile create <name>");
        return;
      }
      console.log("");
      for (const item of items) {
        const marker = item.active ? " (active)" : "";
        console.log(`  ${item.name}${marker}`);
      }
      console.log("");
    });

  profile
    .command("show [name]")
    .description("Show skills in a profile (defaults to active profile)")
    .action(async (name?: string) => {
      const targetName = name ?? await getActiveProfileName();
      if (!targetName) {
        console.error("No active profile. Specify a name or create one first.");
        process.exit(1);
      }
      const p = await profileShow(targetName);
      console.log(`\nProfile: ${p.name} (${p.skills.length} skills)\n`);
      if (p.skills.length === 0) {
        console.log("  (empty)");
      } else {
        console.log(`${"  Name".padEnd(32)} ${"Version".padEnd(10)} ${"Source"}`);
        console.log("  " + "-".repeat(60));
        for (const s of p.skills) {
          console.log(`  ${s.skillName.padEnd(30)} ${"v" + s.v.toString().padEnd(9)} ${s.source}`);
        }
      }
      console.log("");
    });

  profile
    .command("use <name>")
    .description("Switch to a profile (re-links global skills)")
    .option("--hardlink", "Use hard links instead of file copy")
    .action(async (name: string, opts) => {
      await profileUse(name, {
        hardlink: opts.hardlink,
      });
    });

  profile
    .command("add <source>")
    .description("Add a skill to a profile")
    .option("-p, --profile <name>", "Target profile (defaults to active)")
    .option("--hardlink", "Use hard links instead of file copy")
    .option("-n, --name <name>", "Override the skill name")
    .action(async (source: string, opts) => {
      await profileAdd(source, {
        profileName: opts.profile,
        hardlink: opts.hardlink,
        name: opts.name,
      });
    });

  profile
    .command("rm <skill-name>")
    .alias("remove")
    .description("Remove a skill from a profile")
    .option("-p, --profile <name>", "Target profile (defaults to active)")
    .action(async (skillName: string, opts) => {
      await profileRm(skillName, {
        profileName: opts.profile,
      });
    });

  profile
    .command("delete [name]")
    .description("Delete a profile (cannot delete active profile)")
    .option("-p, --profile <name>", "Profile to delete")
    .action(async (name: string | undefined, opts) => {
      const target = opts.profile ?? name;
      if (!target) {
        console.error("Specify a profile name: bsk profile delete <name>");
        process.exit(1);
      }
      await profileDelete(target);
    });

  profile
    .command("rename [old] [new]")
    .description("Rename a profile")
    .option("-p, --profile <name>", "Profile to rename")
    .action(async (old: string | undefined, newName: string | undefined, opts) => {
      let oldName: string;
      let targetName: string;
      if (opts.profile) {
        oldName = opts.profile;
        targetName = old!;
      } else {
        oldName = old!;
        targetName = newName!;
      }
      if (!oldName || !targetName) {
        console.error("Usage: bsk profile rename <old> <new>");
        process.exit(1);
      }
      await profileRename(oldName, targetName);
    });

  profile
    .command("clone [source] [target]")
    .description("Clone a profile as a new profile")
    .option("-p, --profile <name>", "Source profile to clone")
    .action(async (source: string | undefined, target: string | undefined, opts) => {
      let sourceName: string;
      let targetName: string;
      if (opts.profile) {
        sourceName = opts.profile;
        targetName = source!;
      } else {
        sourceName = source!;
        targetName = target!;
      }
      if (!sourceName || !targetName) {
        console.error("Usage: bsk profile clone <source> <target>");
        process.exit(1);
      }
      await profileClone(sourceName, targetName);
    });

  profile
    .command("apply <name>")
    .description("Deploy a profile's skills to the project .agents/skills/ directory")
    .option("--replace", "Replace all existing project skills with the profile's skills")
    .action(async (name: string, opts) => {
      await profileApply(name, {
        replace: opts.replace,
      });
    });

  const storeCmd = program
    .command("store")
    .description("Manage the content-addressable store");

  storeCmd
    .command("verify")
    .description("Check integrity of all store entries")
    .action(async () => {
      const result = await storeVerify();
      console.log(`\nStore: ${result.total} entries, ${result.ok} ok, ${result.corrupted.length} corrupted`);
      if (result.corrupted.length > 0) {
        console.log("");
        for (const entry of result.corrupted) {
          const skills = entry.skills.length > 0 ? ` (${entry.skills.join(", ")})` : "";
          console.log(`  ✗ ${entry.hash.slice(0, 8)}${skills}`);
        }
        console.log("\nRe-add affected skills to repair: bsk add <source> --force");
      }
      console.log("");
    });

  storeCmd
    .command("ls")
    .alias("list")
    .description("List all store entries with skill/version info")
    .action(async () => {
      const result = await storeLs();
      if (result.entries.length === 0) {
        console.log("Store is empty.");
        return;
      }
      console.log(`\nStore: ${result.entries.length} entries\n`);
      console.log(`${"  Hash".padEnd(14)} ${"Skills".padEnd(30)} ${"Size"}`);
      console.log("  " + "-".repeat(50));
      for (const entry of result.entries) {
        const skills = entry.skills.length > 0
          ? entry.skills.map((s) => `${s.name}@v${s.v}`).join(", ")
          : entry.orphanName ? `(orphan) ${entry.orphanName}` : "(orphan)";
        const sizeStr = entry.size > 1024 * 1024
          ? `${(entry.size / (1024 * 1024)).toFixed(1)} MB`
          : entry.size > 1024
          ? `${(entry.size / 1024).toFixed(1)} KB`
          : `${entry.size} B`;
        console.log(`  ${entry.hash.slice(0, 12).padEnd(14)} ${skills.padEnd(30)} ${sizeStr}`);
      }
      console.log("");
    });

  storeCmd
    .command("prune")
    .description("Delete all orphan entries from the store")
    .action(async () => {
      const result = await storePrune();
      if (result.pruned === 0) {
        console.log("No orphan entries found. Store is clean.");
      } else {
        console.log(`\nPruned ${result.pruned} orphan ${result.pruned !== 1 ? "entries" : "entry"}:\n`);
        for (const hash of result.prunedHashes) {
          console.log(`  - ${hash.slice(0, 12)}`);
        }
        console.log("");
      }
    });

  storeCmd
    .command("adopt")
    .description("Re-register orphan store entries into registry and active profile")
    .action(async () => {
      const result = await storeAdopt();
      if (result.adopted === 0) {
        console.log("No orphan entries found to adopt.");
      } else {
        console.log(`\nAdopted ${result.adopted} orphan ${result.adopted !== 1 ? "entries" : "entry"}.`);
      }
    });

  const sync = program
    .command("sync")
    .description("Sync and backup utilities");

  sync
    .command("restore")
    .description("Restore skills from active profile and rebuild client symlinks")
    .option("--hardlink", "Use hard links instead of file copy")
    .action(async (opts) => {
      await syncRestore({
        hardlink: opts.hardlink,
      });
    });

  sync
    .command("export")
    .description("Export bsk data directory to a tar.gz archive")
    .option("-o, --output <path>", "Output file path")
    .action(async (opts) => {
      await syncExport({
        output: opts.output,
      });
    });

  sync
    .command("import <file>")
    .description("Import bsk data from a tar.gz archive and restore")
    .option("-y, --yes", "Skip confirmation prompt")
    .option("--hardlink", "Use hard links instead of file copy")
    .action(async (file: string, opts) => {
      await syncImport(file, {
        yes: opts.yes,
        hardlink: opts.hardlink,
      });
    });

  const completionCmd = program
    .command("completion <shell>")
    .description("Generate shell completion script");
  if (enableActions) {
    completionCmd.action(async (shell: string) => {
      await printCompletionScript(shell);
    });
  }

  const completeCmd = program
    .command("__complete", { hidden: true })
    .description("Internal completion command")
    .allowUnknownOption()
    .option("--shell <shell>")
    .option("--line <line>")
    .option("--point <point>");
  if (enableActions) {
    completeCmd.action(async (opts) => {
      await runComplete(opts);
    });
  }

  program
    .command("cd")
    .description("Open a shell in the bsk data directory (~/.better-skills)")
    .action(async () => {
      await bskCd();
    });

  program
    .command("tui")
    .description("Launch interactive TUI")
    .action(() => {
      startTui(version);
    });


  return program;
}

if (import.meta.main) {
  buildProgram().parseAsync().catch((err: Error) => {
    console.error(err.message);
    process.exit(1);
  });
}
