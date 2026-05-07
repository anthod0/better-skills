import React, { useState, useCallback, useRef, useEffect } from "react";
import { Box, useApp, useInput, useStdout } from "ink";
import { join } from "node:path";
import { useKeyboard } from "./hooks/useKeyboard.js";
import { TabBar, TABS, type TabName } from "./components/TabBar.js";
import { SkillsView } from "./components/SkillsView.js";
import { ProfilesView } from "./components/ProfilesView.js";
import { StoreView } from "./components/StoreView.js";
import { ClientsView } from "./components/ClientsView.js";
import {
  getGlobalSkillsPath,
  getProjectSkillsPath,
} from "../utils/paths.js";
import { HelpOverlay } from "./components/HelpOverlay.js";
import { useNotification } from "./hooks/useNotification.js";
import { openInEditor } from "./utils/openEditor.js";

export type ActionMode =
  | null
  | { type: "editing" }
  | { type: "search" }
  | { type: "confirmDelete"; skillName: string; isGlobal: boolean; deleteBoth?: boolean }
  | { type: "confirmDeleteScope"; skillName: string }
  | { type: "confirmMove"; skillName: string; isGlobal: boolean }
  | { type: "addInput" }
  | { type: "addSkillMode"; source: string; loading?: boolean; requestId?: number }
  | {
    type: "addSkillSelect";
    source: string;
    skills: string[];
    selectedSkills: string[];
    error?: string;
  }
  | { type: "addScope"; source: string; skill?: string[] }
  | { type: "help" }
  | { type: "profileCreate" }
  | { type: "profileDelete"; profileName: string }
  | { type: "profileRename"; profileName: string }
  | { type: "profileClone"; profileName: string }
  | { type: "profileRemoveSkillList"; profileName: string; skills: string[] }
  | { type: "profileAddSkillList"; profileName: string; registrySkills: string[]; manualInput: boolean }
  | { type: "profileSwitchVersion"; profileName: string; skillName: string; versions: { v: number; hash: string; source: string }[]; currentV: number }
  | { type: "profileApply"; profileName: string }
  | { type: "confirmPrune"; orphanCount: number }
  | { type: "confirmAdopt"; orphanCount: number };

interface AppProps {
  version: string;
}

export function App({ version }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [activeTab, setActiveTab] = useState<TabName>("Skills");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [focusPane, setFocusPane] = useState<"left" | "right">("left");
  const [rightScrollOffset, setRightScrollOffset] = useState(0);
  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [addSource, setAddSource] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [profileInput, setProfileInput] = useState("");
  const [modalListIndex, setModalListIndex] = useState(0);
  const { notification, show: showNotification, clear: clearNotification } = useNotification();
  const discoveryRequestId = useRef(0);

  const isModal = actionMode !== null;
  const isSearch = actionMode?.type === "search";
  const detailHeight = Math.max(3, (stdout.rows ?? 24) - 6);

  useEffect(() => {
    setRightScrollOffset(0);
  }, [activeTab, selectedIndex]);

  const switchTab = useCallback((tab: TabName) => {
    setActiveTab(tab);
    setSelectedIndex(0);
    setFocusPane("left");
    setRightScrollOffset(0);
    setActionMode(null);
    setSearchQuery("");
  }, []);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const runAction = useCallback(
    (loadingMsg: string, successMsg: string, action: () => Promise<void>, onDone?: () => void) => {
      showNotification(loadingMsg, "loading");
      action()
        .then(() => {
          showNotification(successMsg, "success");
          onDone?.();
        })
        .catch((e) => {
          showNotification(e instanceof Error ? e.message : String(e), "error");
        });
    },
    [showNotification]
  );

  // Modal input handler (search, confirmDelete, confirmMove)
  useInput((input, key) => {
    if (!isModal) return;

    if (actionMode.type === "help") {
      if (key.escape || input === "?") {
        setActionMode(null);
      }
      return;
    }

    if (actionMode.type === "search") {
      if (key.escape) {
        setActionMode(null);
        setSearchQuery("");
        setSelectedIndex(0);
        return;
      }
      if (key.return) {
        setActionMode(null);
        return;
      }
      if (key.backspace || key.delete) {
        setSearchQuery((q) => q.slice(0, -1));
        setSelectedIndex(0);
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setSearchQuery((q) => q + input);
        setSelectedIndex(0);
      }
      return;
    }

    if (actionMode.type === "confirmDelete") {
      if (input === "y" || input === "Y") {
        const { skillName, isGlobal, deleteBoth } = actionMode;
        setActionMode(null);
        setSelectedIndex(0);
        runAction("Deleting skill...", "Skill deleted", async () => {
          const { rm } = await import("../commands/rm.js");
          if (deleteBoth) {
            await rm(skillName, { global: true });
            await rm(skillName, { global: false });
          } else {
            await rm(skillName, { global: isGlobal });
          }
        }, refresh);
        return;
      }
      if (input === "n" || input === "N" || key.escape) {
        setActionMode(null);
      }
      return;
    }

    if (actionMode.type === "confirmDeleteScope") {
      if (input === "g" || input === "G") {
        setActionMode({ type: "confirmDelete", skillName: actionMode.skillName, isGlobal: true });
        return;
      }
      if (input === "p" || input === "P") {
        setActionMode({ type: "confirmDelete", skillName: actionMode.skillName, isGlobal: false });
        return;
      }
      if (input === "b" || input === "B") {
        setActionMode({ type: "confirmDelete", skillName: actionMode.skillName, isGlobal: true, deleteBoth: true });
        return;
      }
      if (key.escape) {
        setActionMode(null);
      }
      return;
    }

    if (actionMode.type === "confirmMove") {
      if (input === "g" || input === "G") {
        const { skillName } = actionMode;
        setActionMode(null);
        setSelectedIndex(0);
        runAction("Moving to global...", "Moved to global", async () => {
          const { mvToGlobal } = await import("../commands/mv.js");
          await mvToGlobal(skillName, {});
        }, refresh);
        return;
      }
      if (input === "p" || input === "P") {
        const { skillName } = actionMode;
        setActionMode(null);
        setSelectedIndex(0);
        runAction("Moving to project...", "Moved to project", async () => {
          const { mvToProject } = await import("../commands/mv.js");
          await mvToProject(skillName, {});
        }, refresh);
        return;
      }
      if (key.escape) {
        setActionMode(null);
      }
      return;
    }

    if (actionMode.type === "addInput") {
      if (key.escape) {
        setActionMode(null);
        setAddSource("");
        return;
      }
      if (key.return && addSource.trim()) {
        const source = addSource.trim();
        setAddSource("");
        setActionMode({ type: "addSkillMode", source });
        return;
      }
      if (key.backspace || key.delete) {
        setAddSource((s) => s.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setAddSource((s) => s + input);
      }
      return;
    }

    if (actionMode.type === "addSkillMode") {
      if (key.escape) {
        clearNotification();
        setActionMode(null);
        return;
      }
      if (actionMode.loading) {
        return;
      }
      if (input === "a" || input === "A") {
        setActionMode({ type: "addScope", source: actionMode.source });
        return;
      }
      if (input === "s" || input === "S") {
        const source = actionMode.source;
        const requestId = ++discoveryRequestId.current;
        setActionMode({ type: "addSkillMode", source, loading: true, requestId });
        showNotification("Discovering skills...", "loading");

        void (async () => {
          try {
            const { listAddableSkills } = await import("../commands/add.js");
            const skills = await listAddableSkills(source);

            setActionMode((current) => {
              if (
                current?.type !== "addSkillMode" ||
                current.source !== source ||
                current.requestId !== requestId
              ) {
                return current;
              }

              setModalListIndex(0);
              showNotification("Skills discovered", "success");
              return { type: "addSkillSelect", source, skills, selectedSkills: [] };
            });
          } catch (e) {
            setActionMode((current) => {
              if (
                current?.type !== "addSkillMode" ||
                current.source !== source ||
                current.requestId !== requestId
              ) {
                return current;
              }

              showNotification(e instanceof Error ? e.message : String(e), "error");
              return { type: "addSkillMode", source };
            });
          }
        })();

        return;
      }
      return;
    }

    if (actionMode.type === "addSkillSelect") {
      if (key.escape) {
        setActionMode({ type: "addSkillMode", source: actionMode.source });
        setModalListIndex(0);
        return;
      }

      if (key.return) {
        if (actionMode.selectedSkills.length === 0) {
          setActionMode({ ...actionMode, error: "Select at least one skill." });
          return;
        }

        setActionMode({
          type: "addScope",
          source: actionMode.source,
          skill: actionMode.selectedSkills,
        });
        setModalListIndex(0);
        return;
      }

      if (actionMode.skills.length === 0) {
        return;
      }

      if (input === "j" || key.downArrow) {
        setModalListIndex((i) => Math.min(i + 1, actionMode.skills.length - 1));
        return;
      }

      if (input === "k" || key.upArrow) {
        setModalListIndex((i) => Math.max(0, i - 1));
        return;
      }

      if (input === " ") {
        const current = actionMode.skills[modalListIndex];
        if (!current) return;

        const selectedSkills = actionMode.selectedSkills.includes(current)
          ? actionMode.selectedSkills.filter((s) => s !== current)
          : [...actionMode.selectedSkills, current];

        setActionMode({ ...actionMode, selectedSkills, error: undefined });
        return;
      }

      if (input === "a" || input === "A") {
        setActionMode({ ...actionMode, selectedSkills: [...actionMode.skills], error: undefined });
        return;
      }

      if (input === "n" || input === "N") {
        setActionMode({ ...actionMode, selectedSkills: [], error: undefined });
        return;
      }

      return;
    }

    if (actionMode.type === "addScope") {
      if (input === "g" || input === "G") {
        const source = actionMode.source;
        const skill = actionMode.skill;
        setActionMode(null);
        runAction("Adding skill...", "Skill added", async () => {
          const { add } = await import("../commands/add.js");
          await add(source, { global: true, skill });
        }, () => { setSelectedIndex(0); refresh(); });
        return;
      }
      if (input === "p" || input === "P") {
        const source = actionMode.source;
        const skill = actionMode.skill;
        setActionMode(null);
        runAction("Adding skill...", "Skill added", async () => {
          const { add } = await import("../commands/add.js");
          await add(source, { global: false, skill });
        }, () => { setSelectedIndex(0); refresh(); });
        return;
      }
      if (key.escape) {
        setActionMode(null);
      }
      return;
    }

    // Profile text-input modals: create, rename, clone
    if (
      actionMode.type === "profileCreate" ||
      actionMode.type === "profileRename" ||
      actionMode.type === "profileClone"
    ) {
      if (key.escape) {
        setActionMode(null);
        setProfileInput("");
        return;
      }
      if (key.return && profileInput.trim()) {
        const value = profileInput.trim();
        const mode = actionMode;
        setActionMode(null);
        setProfileInput("");
        runAction("Working...", "Done", async () => {
          const {
            profileCreate: createProfile,
            profileRename: renameProfile,
            profileClone: cloneProfile,
          } = await import("../commands/profile.js");
          if (mode.type === "profileCreate") {
            await createProfile(value, {});
          } else if (mode.type === "profileRename") {
            await renameProfile(mode.profileName, value);
          } else if (mode.type === "profileClone") {
            await cloneProfile(mode.profileName, value);
          }
        }, () => { setSelectedIndex(0); refresh(); });
        return;
      }
      if (key.backspace || key.delete) {
        setProfileInput((s) => s.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setProfileInput((s) => s + input);
      }
      return;
    }

    // Profile list-based remove skill modal
    if (actionMode.type === "profileRemoveSkillList") {
      if (key.escape) {
        setActionMode(null);
        setModalListIndex(0);
        return;
      }
      if (input === "j") {
        setModalListIndex((i) => Math.min(i + 1, actionMode.skills.length - 1));
        return;
      }
      if (input === "k") {
        setModalListIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key.return && actionMode.skills.length > 0) {
        const skillName = actionMode.skills[modalListIndex];
        const profileName = actionMode.profileName;
        setActionMode(null);
        setModalListIndex(0);
        runAction("Removing skill...", "Skill removed", async () => {
          const { profileRm: rmFromProfile } = await import("../commands/profile.js");
          await rmFromProfile(skillName, {
            profileName,
          });
        }, () => { setSelectedIndex(0); refresh(); });
        return;
      }
      return;
    }

    // Profile list-based add skill modal
    if (actionMode.type === "profileAddSkillList") {
      // Manual input sub-mode: type a source string
      if (actionMode.manualInput) {
        if (key.escape) {
          // Escape from manual input goes back to list (or closes if list is empty)
          if (actionMode.registrySkills.length > 0) {
            setActionMode({ ...actionMode, manualInput: false });
            setProfileInput("");
          } else {
            setActionMode(null);
            setProfileInput("");
            setModalListIndex(0);
          }
          return;
        }
        if (key.return && profileInput.trim()) {
          const value = profileInput.trim();
          const profileName = actionMode.profileName;
          setActionMode(null);
          setProfileInput("");
          setModalListIndex(0);
          runAction("Adding skill...", "Skill added", async () => {
            const { profileAdd: addToProfile } = await import("../commands/profile.js");
            await addToProfile(value, {
              profileName,
            });
          }, () => { setSelectedIndex(0); refresh(); });
          return;
        }
        if (key.backspace || key.delete) {
          setProfileInput((s) => s.slice(0, -1));
          return;
        }
        if (input && !key.ctrl && !key.meta) {
          setProfileInput((s) => s + input);
        }
        return;
      }

      // List selection sub-mode
      if (key.escape) {
        setActionMode(null);
        setModalListIndex(0);
        return;
      }
      if (input === "/") {
        setActionMode({ ...actionMode, manualInput: true });
        setProfileInput("");
        return;
      }
      if (input === "j") {
        setModalListIndex((i) => Math.min(i + 1, actionMode.registrySkills.length - 1));
        return;
      }
      if (input === "k") {
        setModalListIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key.return && actionMode.registrySkills.length > 0) {
        const skillName = actionMode.registrySkills[modalListIndex];
        const profileName = actionMode.profileName;
        setActionMode(null);
        setModalListIndex(0);
        runAction("Adding skill...", "Skill added", async () => {
          const { profileAdd: addToProfile } = await import("../commands/profile.js");
          await addToProfile(skillName, {
            profileName,
          });
        }, () => { setSelectedIndex(0); refresh(); });
        return;
      }
      return;
    }

    // Profile version switch modal
    if (actionMode.type === "profileSwitchVersion") {
      if (key.escape) {
        setActionMode(null);
        setModalListIndex(0);
        return;
      }
      if (input === "j") {
        setModalListIndex((i) => Math.min(i + 1, actionMode.versions.length - 1));
        return;
      }
      if (input === "k") {
        setModalListIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key.return && actionMode.versions.length > 0) {
        const sorted = [...actionMode.versions].sort((a, b) => b.v - a.v);
        const version = sorted[modalListIndex];
        if (version.v === actionMode.currentV) {
          // Already on this version, just close
          setActionMode(null);
          setModalListIndex(0);
          return;
        }
        const { profileName, skillName } = actionMode;
        setActionMode(null);
        setModalListIndex(0);
        runAction("Switching version...", `Switched ${skillName} to v${version.v}`, async () => {
          const { profileAdd: addToProfile } = await import("../commands/profile.js");
          await addToProfile(`${skillName}@v${version.v}`, {
            profileName,
          });
        }, () => { setSelectedIndex(0); refresh(); });
        return;
      }
      return;
    }

    // Profile apply to project modal
    if (actionMode.type === "profileApply") {
      if (input === "y" || input === "Y") {
        const name = actionMode.profileName;
        setActionMode(null);
        runAction("Applying to project...", `Applied ${name} to project`, async () => {
          const { profileApply } = await import("../commands/profile.js");
          await profileApply(name, {
            replace: false,
          });
        }, refresh);
        return;
      }
      if (input === "r" || input === "R") {
        const name = actionMode.profileName;
        setActionMode(null);
        runAction("Replacing project skills...", `Applied ${name} to project (replaced)`, async () => {
          const { profileApply } = await import("../commands/profile.js");
          await profileApply(name, {
            replace: true,
          });
        }, refresh);
        return;
      }
      if (input === "n" || input === "N" || key.escape) {
        setActionMode(null);
      }
      return;
    }

    // Profile confirm modal: delete
    if (actionMode.type === "profileDelete") {
      if (input === "y" || input === "Y") {
        const name = actionMode.profileName;
        setActionMode(null);
        runAction("Deleting profile...", "Profile deleted", async () => {
          const { profileDelete: deleteProfile } = await import("../commands/profile.js");
          await deleteProfile(name);
        }, () => { setSelectedIndex(0); refresh(); });
        return;
      }
      if (input === "n" || input === "N" || key.escape) {
        setActionMode(null);
      }
      return;
    }

    if (actionMode.type === "confirmPrune") {
      if (input === "y" || input === "Y") {
        const count = actionMode.orphanCount;
        setActionMode(null);
        runAction("Pruning orphans...", `Pruned ${count} orphan(s)`, async () => {
          const { storePrune } = await import("../commands/store-cmd.js");
          await storePrune();
        }, refresh);
        return;
      }
      if (input === "n" || input === "N" || key.escape) {
        setActionMode(null);
      }
      return;
    }

    if (actionMode.type === "confirmAdopt") {
      if (input === "y" || input === "Y") {
        const count = actionMode.orphanCount;
        setActionMode(null);
        runAction("Adopting orphans...", `Adopted ${count} orphan(s)`, async () => {
          const { storeAdopt } = await import("../commands/store-cmd.js");
          await storeAdopt();
        }, refresh);
        return;
      }
      if (input === "n" || input === "N" || key.escape) {
        setActionMode(null);
      }
      return;
    }
  }, { isActive: isModal });

  useKeyboard({
    onQuit: () => { if (!isModal) exit(); },
    onUp: () => {
      if (isModal) return;
      if (focusPane === "right") {
        setRightScrollOffset((i) => Math.max(0, i - 1));
        return;
      }
      setSelectedIndex((i) => Math.max(0, i - 1));
    },
    onDown: () => {
      if (isModal) return;
      if (focusPane === "right") {
        setRightScrollOffset((i) => i + 1);
        return;
      }
      setSelectedIndex((i) => i + 1);
    },
    onLeft: () => { if (!isModal) setFocusPane("left"); },
    onRight: () => { if (!isModal) setFocusPane("right"); },
    onTab: () => {
      if (isModal) return;
      const idx = TABS.indexOf(activeTab);
      switchTab(TABS[(idx + 1) % TABS.length]);
    },
    onKey: (key) => {
      if (isModal) return;
      const num = parseInt(key, 10);
      if (num >= 1 && num <= 4) {
        switchTab(TABS[num - 1]);
        return;
      }
      if (key === "?") {
        setActionMode({ type: "help" });
        return;
      }
      if (activeTab === "Skills") {
        if (key === "/") {
          setActionMode({ type: "search" });
          setSearchQuery("");
          setSelectedIndex(0);
        }
        if (key === "A") {
          setShowAll((v) => !v);
          setSelectedIndex(0);
        }
      }
    },
  });

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <TabBar active={activeTab} version={version} />
      {actionMode?.type === "help" ? (
        <HelpOverlay tab={activeTab} />
      ) : (
        <>
          {activeTab === "Skills" && (
            <SkillsView
              selectedIndex={selectedIndex}
              focusPane={focusPane}
              filterQuery={searchQuery}
              searchMode={isSearch}
              actionMode={actionMode}
              notification={notification}
              modalListIndex={modalListIndex}
              detailHeight={detailHeight}
              detailScrollOffset={rightScrollOffset}
              onDelete={(name, isGlobal, isProject) => {
                if (isGlobal && isProject) {
                  setActionMode({ type: "confirmDeleteScope", skillName: name });
                } else {
                  setActionMode({ type: "confirmDelete", skillName: name, isGlobal });
                }
              }}
              onMove={(name, isGlobal) => setActionMode({ type: "confirmMove", skillName: name, isGlobal })}
              onAdd={() => { setActionMode({ type: "addInput" }); setAddSource(""); }}
              addSource={addSource}
              refreshKey={refreshKey}
              showAll={showAll}
              onSave={(skillName) => {
                runAction("Saving...", "Skill saved", async () => {
                  const { save } = await import("../commands/save.js");
                  await save({ skillName });
                }, () => { setSelectedIndex(0); refresh(); });
              }}
              onEdit={(skill) => {
                if (skill.inactive) {
                  showNotification("Skill has no linked directory", "error");
                  return;
                }

                const projectSkillsPath = getProjectSkillsPath();
                const dir = skill.global
                  ? join(getGlobalSkillsPath(), skill.name)
                  : projectSkillsPath
                    ? join(projectSkillsPath, skill.name)
                    : null;

                if (!dir) {
                  showNotification("No project context in current directory.", "error");
                  return;
                }

                setActionMode({ type: "editing" });
                openInEditor(dir)
                  .catch((err) => {
                    showNotification(`Failed to open editor: ${err instanceof Error ? err.message : String(err)}`, "error");
                  })
                  .finally(() => {
                    setActionMode(null);
                    refresh();
                  });
              }}
            />
          )}
          {activeTab === "Profiles" && (
            <ProfilesView
              selectedIndex={selectedIndex}
              focusPane={focusPane}
              refreshKey={refreshKey}
              actionMode={actionMode}
              profileInput={profileInput}
              modalListIndex={modalListIndex}
              notification={notification}
              detailHeight={detailHeight}
              detailScrollOffset={rightScrollOffset}
              onSwitchProfile={(name) => {
                runAction("Switching profile...", `Switched to ${name}`, async () => {
                  const { profileUse } = await import("../commands/profile.js");
                  await profileUse(name, {});
                }, refresh);
              }}
              onCreateProfile={() => { setActionMode({ type: "profileCreate" }); setProfileInput(""); }}
              onDeleteProfile={(name) => setActionMode({ type: "profileDelete", profileName: name })}
              onRenameProfile={(name) => { setActionMode({ type: "profileRename", profileName: name }); setProfileInput(""); }}
              onCloneProfile={(name) => { setActionMode({ type: "profileClone", profileName: name }); setProfileInput(""); }}
              onAddSkill={(profileName, profileSkills, registrySkills) => {
                const profileSkillSet = new Set(profileSkills);
                const available = registrySkills.filter((n) => !profileSkillSet.has(n));
                setModalListIndex(0);
                setActionMode({ type: "profileAddSkillList", profileName, registrySkills: available, manualInput: false });
                setProfileInput("");
              }}
              onRemoveSkill={(profileName, profileSkills) => {
                setModalListIndex(0);
                setActionMode({ type: "profileRemoveSkillList", profileName, skills: profileSkills });
              }}
              onApplyToProject={(name) => setActionMode({ type: "profileApply", profileName: name })}
              onSwitchVersion={(profileName, skillName, versions, currentV) => {
                setModalListIndex(0);
                setActionMode({ type: "profileSwitchVersion", profileName, skillName, versions, currentV });
              }}
            />
          )}
          {activeTab === "Store" && (
            <StoreView
              selectedIndex={selectedIndex}
              focusPane={focusPane}
              refreshKey={refreshKey}
              notification={notification}
              actionMode={actionMode}
              detailHeight={detailHeight}
              detailScrollOffset={rightScrollOffset}
              onPrune={(orphanCount) => setActionMode({ type: "confirmPrune", orphanCount })}
              onAdopt={(orphanCount) => setActionMode({ type: "confirmAdopt", orphanCount })}
            />
          )}
          {activeTab === "Clients" && (
            <ClientsView
              selectedIndex={selectedIndex}
              refreshKey={refreshKey}
              notification={notification}
              onEnableClient={(clientId) => {
                runAction("Enabling client...", `${clientId} enabled`, async () => {
                  const { clientAdd } = await import("../commands/client.js");
                  await clientAdd(clientId);
                }, refresh);
              }}
              onDisableClient={(clientId) => {
                runAction("Disabling client...", `${clientId} disabled`, async () => {
                  const { clientRm } = await import("../commands/client.js");
                  await clientRm(clientId);
                }, refresh);
              }}
            />
          )}
        </>
      )}
    </Box>
  );
}
