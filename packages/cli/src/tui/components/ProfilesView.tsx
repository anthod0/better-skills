import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { List, type ListItem } from "./List.js";
import { DetailPane, type DetailField } from "./DetailPane.js";
import { StatusBar } from "./StatusBar.js";
import { Notification } from "./Notification.js";
import type { NotificationState } from "../hooks/useNotification.js";
import { useProfiles } from "../hooks/useProfiles.js";
import { type ActionMode } from "../App.js";

interface ProfilesViewProps {
  focusPane: "left" | "right";
  selectedIndex: number;
  refreshKey?: number;
  actionMode?: ActionMode;
  profileInput?: string;
  modalListIndex?: number;
  onSwitchProfile?: (profileName: string) => void;
  onCreateProfile?: () => void;
  onDeleteProfile?: (name: string) => void;
  onRenameProfile?: (name: string) => void;
  onCloneProfile?: (name: string) => void;
  onAddSkill?: (profileName: string, profileSkills: string[], registrySkills: string[]) => void;
  onRemoveSkill?: (profileName: string, profileSkills: string[]) => void;
  onSwitchVersion?: (profileName: string, skillName: string, versions: { v: number; hash: string; source: string }[], currentV: number) => void;
  onApplyToProject?: (profileName: string) => void;
  notification?: NotificationState | null;
  detailHeight?: number;
  detailScrollOffset?: number;
}

export function ProfilesView({
  focusPane,
  selectedIndex,
  refreshKey = 0,
  actionMode = null,
  profileInput = "",
  modalListIndex = 0,
  onSwitchProfile,
  onCreateProfile,
  onDeleteProfile,
  onRenameProfile,
  onCloneProfile,
  onAddSkill,
  onRemoveSkill,
  onSwitchVersion,
  onApplyToProject,
  notification = null,
  detailHeight,
  detailScrollOffset = 0,
}: ProfilesViewProps) {
  const { profiles, registrySkillNames, loading } = useProfiles(refreshKey);
  const [skillIndex, setSkillIndex] = useState(0);

  const selected = profiles[selectedIndex];

  // Reset skill index when profile changes
  React.useEffect(() => {
    setSkillIndex(0);
  }, [selectedIndex]);

  // Handle profile action keys (only when no modal is open)
  useInput((input, key) => {
    if (key.return && selected && onSwitchProfile) {
      onSwitchProfile(selected.name);
      return;
    }
    if (!selected && input !== "c") return;
    if (input === "c" && onCreateProfile) onCreateProfile();
    if (input === "d" && selected && onDeleteProfile) onDeleteProfile(selected.name);
    if (input === "r" && selected && onRenameProfile) onRenameProfile(selected.name);
    if (input === "C" && selected && onCloneProfile) onCloneProfile(selected.name);
    if (input === "a" && selected && onAddSkill) {
      const profileSkills = selected.skills.map((s) => s.skillName);
      onAddSkill(selected.name, profileSkills, registrySkillNames);
    }
    if (input === "p" && selected && onApplyToProject) onApplyToProject(selected.name);
    if (input === "x" && selected && onRemoveSkill) {
      const profileSkills = selected.skills.map((s) => s.skillName);
      onRemoveSkill(selected.name, profileSkills);
    }
    if (input === "v" && selected && selected.skills.length > 0 && onSwitchVersion) {
      const skill = selected.skills[skillIndex] ?? selected.skills[0];
      if (skill.allVersions.length > 1) {
        onSwitchVersion(
          selected.name,
          skill.skillName,
          skill.allVersions.map((ver) => ({ v: ver.v, hash: ver.hash, source: ver.source })),
          skill.v,
        );
      }
    }
    if (input === "J" && selected) {
      setSkillIndex((i) => Math.min(i + 1, selected.skills.length - 1));
    }
    if (input === "K" && selected) {
      setSkillIndex((i) => Math.max(0, i - 1));
    }
  }, { isActive: actionMode === null });

  if (loading) return <Text>Loading profiles...</Text>;

  const items: ListItem[] = profiles.map((p) => ({
    key: p.name,
    label: p.name,
    markers: p.active ? "* active" : `${p.skillCount} skills`,
  }));

  const fields: DetailField[] = selected
    ? [
        { label: "Name", value: selected.name },
        { label: "Status", value: selected.active ? "Active" : "Inactive" },
        { label: "Skills", value: String(selected.skillCount) },
      ]
    : [];

  const skillList = selected
    ? selected.skills
        .map((s, idx) => {
          const focused = idx === skillIndex ? ">" : " ";
          const currentMarker = (v: number) => (v === s.v ? " <-- current" : "");
          const versionLines = s.allVersions.length > 0
            ? s.allVersions
                .sort((a, b) => b.v - a.v)
                .map((ver) => `    v${ver.v} ${ver.hash?.slice(0, 8) ?? "?"} (${ver.source})${currentMarker(ver.v)}`)
                .join("\n")
            : `    v${s.v} (${s.source})`;
          return `${focused} ${s.skillName}\n${versionLines}`;
        })
        .join("\n")
    : "";

  return (
    <Box flexDirection="column" flexGrow={1} width="100%">
      {actionMode?.type === "profileCreate" && (
        <Box paddingX={1}>
          <Text>
            <Text bold color="green">New profile name: </Text>
            <Text>{profileInput}</Text>
            <Text dimColor>_</Text>
          </Text>
        </Box>
      )}
      {actionMode?.type === "profileDelete" && (
        <Box paddingX={1}>
          <Text bold color="red">Delete profile {actionMode.profileName}? (y/n)</Text>
        </Box>
      )}
      {actionMode?.type === "profileRename" && (
        <Box paddingX={1}>
          <Text>
            <Text bold color="blue">Rename {actionMode.profileName} to: </Text>
            <Text>{profileInput}</Text>
            <Text dimColor>_</Text>
          </Text>
        </Box>
      )}
      {actionMode?.type === "profileClone" && (
        <Box paddingX={1}>
          <Text>
            <Text bold color="blue">Clone {actionMode.profileName} as: </Text>
            <Text>{profileInput}</Text>
            <Text dimColor>_</Text>
          </Text>
        </Box>
      )}
      {actionMode?.type === "profileRemoveSkillList" && (
        <Box flexDirection="column" paddingX={1}>
          <Text bold color="red">Remove skill from {actionMode.profileName}:</Text>
          {actionMode.skills.length === 0 ? (
            <Text dimColor>(no skills in profile)</Text>
          ) : (
            actionMode.skills.map((s, i) => (
              <Text key={s} inverse={i === modalListIndex}>
                {i === modalListIndex ? "\u25B8 " : "  "}{s}
              </Text>
            ))
          )}
          <Text dimColor>j/k:navigate  Enter:remove  Esc:cancel</Text>
        </Box>
      )}
      {actionMode?.type === "profileAddSkillList" && !actionMode.manualInput && (
        <Box flexDirection="column" paddingX={1}>
          <Text bold color="green">Add skill to {actionMode.profileName}:</Text>
          {actionMode.registrySkills.length === 0 ? (
            <Text dimColor>(no registry skills available — press / for manual input)</Text>
          ) : (
            actionMode.registrySkills.map((s, i) => (
              <Text key={s} inverse={i === modalListIndex}>
                {i === modalListIndex ? "\u25B8 " : "  "}{s}
              </Text>
            ))
          )}
          <Text dimColor>j/k:navigate  Enter:add  /:manual input  Esc:cancel</Text>
        </Box>
      )}
      {actionMode?.type === "profileAddSkillList" && actionMode.manualInput && (
        <Box paddingX={1}>
          <Text>
            <Text bold color="green">Add skill to {actionMode.profileName}: </Text>
            <Text>{profileInput}</Text>
            <Text dimColor>_</Text>
          </Text>
        </Box>
      )}
      {actionMode?.type === "profileApply" && (
        <Box paddingX={1}>
          <Text bold color="cyan">
            Apply profile {actionMode.profileName} to project? (y:merge / r:replace / n:cancel)
          </Text>
        </Box>
      )}
      {actionMode?.type === "profileSwitchVersion" && (
        <Box flexDirection="column" paddingX={1}>
          <Text bold color="cyan">Switch version for {actionMode.skillName}:</Text>
          {actionMode.versions
            .sort((a, b) => b.v - a.v)
            .map((ver, i) => (
              <Text key={ver.v} inverse={i === modalListIndex}>
                {i === modalListIndex ? "\u25B8 " : "  "}
                v{ver.v} {ver.hash.slice(0, 8)} ({ver.source})
                {ver.v === actionMode.currentV ? " (current)" : ""}
              </Text>
            ))}
          <Text dimColor>j/k:navigate  Enter:switch  Esc:cancel</Text>
        </Box>
      )}
      <Box flexGrow={1} flexBasis={0} height={detailHeight}>
        <List items={items} selectedIndex={selectedIndex} title="Profiles" focused={focusPane === "left"} />
        <DetailPane
          fields={fields}
          content={skillList}
          contentTitle="Skills in profile"
          focused={focusPane === "right"}
          height={detailHeight}
          scrollOffset={detailScrollOffset}
        />
      </Box>
      <Notification notification={notification} />
      <StatusBar shortcuts={[
        { key: "Enter", label: "Switch" },
        { key: "c", label: "Create" },
        { key: "d", label: "Delete" },
        { key: "r", label: "Rename" },
        { key: "C", label: "Clone" },
        { key: "a", label: "Add skill" },
        { key: "x", label: "Rm skill" },
        { key: "p", label: "Apply to project" },
        { key: "v", label: "Version" },
        { key: "J/K", label: "Skill nav" },
        { key: "?", label: "Help" },
        { key: "q", label: "Quit" },
      ]} />
    </Box>
  );
}
