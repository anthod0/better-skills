import React from "react";
import { Box, Text, useInput } from "ink";
import { List, type ListItem } from "./List.js";
import { DetailPane, type DetailField } from "./DetailPane.js";
import { StatusBar, type Shortcut } from "./StatusBar.js";
import { Notification } from "./Notification.js";
import type { NotificationState } from "../hooks/useNotification.js";
import { useSkills, type SkillDetail } from "../hooks/useSkills.js";
import { type ActionMode } from "../App.js";
import { SkillSelectModal } from "./SkillSelectModal.js";

interface SkillsViewProps {
  focusPane: "left" | "right";
  selectedIndex: number;
  filterQuery?: string;
  searchMode?: boolean;
  actionMode?: ActionMode;
  onDelete?: (name: string, isGlobal: boolean, isProject: boolean) => void;
  onMove?: (name: string, isGlobal: boolean) => void;
  onAdd?: () => void;
  onSave?: (skillName?: string) => void;
  onEdit?: (skill: SkillDetail) => void;
  addSource?: string;
  refreshKey?: number;
  showAll?: boolean;
  notification?: NotificationState | null;
  modalListIndex?: number;
  detailHeight?: number;
  detailScrollOffset?: number;
}

export function SkillsView({
  focusPane,
  selectedIndex,
  filterQuery = "",
  searchMode = false,
  actionMode = null,
  onDelete,
  onMove,
  onAdd,
  onSave,
  onEdit,
  addSource = "",
  refreshKey = 0,
  showAll = false,
  notification = null,
  modalListIndex = 0,
  detailHeight,
  detailScrollOffset = 0,
}: SkillsViewProps) {
  const { skills, loading } = useSkills(refreshKey, showAll);

  const filteredSkills = filterQuery
    ? skills.filter((s) => s.name.toLowerCase().includes(filterQuery.toLowerCase()))
    : skills;

  const selected = filteredSkills[selectedIndex] as SkillDetail | undefined;

  // Handle d/m/a keys to trigger actions
  useInput((input) => {
    if (searchMode || actionMode !== null) return;

    if (input === "a" && onAdd) {
      onAdd();
      return;
    }
    if (input === "S" && onSave) {
      onSave();
      return;
    }
    if (!selected) return;
    if (input === "e" && onEdit) {
      onEdit(selected);
      return;
    }
    if (input === "d" && onDelete) {
      onDelete(selected.name, selected.global, selected.project);
    }
    if (input === "m" && onMove) {
      onMove(selected.name, selected.global);
    }
    if (input === "s" && onSave) {
      onSave(selected.name);
    }
  }, { isActive: !searchMode && actionMode === null });

  if (loading) {
    return <Text>Loading skills...</Text>;
  }

  const items: ListItem[] = filteredSkills.map((s) => {
    const scope = s.inactive
      ? "inactive"
      : `${s.global ? "G" : " "} ${s.project ? "P" : " "}`;
    return { key: s.name, label: s.name, markers: scope };
  });

  const fields: DetailField[] = selected
    ? [
        { label: "Name", value: selected.name },
        { label: "Scope", value: selected.inactive ? "Inactive (not linked)" : [selected.global ? "Global" : "", selected.project ? "Project" : ""].filter(Boolean).join(" + ") },
        ...(selected.source ? [{ label: "Source", value: selected.source }] : []),
        ...(selected.version != null ? [{ label: "Version", value: `v${selected.version}` }] : []),
        ...(selected.hash ? [{ label: "Hash", value: selected.hash.slice(0, 8) }] : []),
        ...(selected.addedAt ? [{ label: "Added", value: selected.addedAt.split("T")[0] }] : []),
      ]
    : [];

  const shortcuts: Shortcut[] = [
    { key: "a", label: "Add" },
    { key: "e", label: "Edit" },
    { key: "d", label: "Delete" },
    { key: "m", label: "Move" },
    { key: "s", label: "Save" },
    { key: "A", label: showAll ? "Active only" : "Show all" },
    { key: "/", label: "Search" },
    { key: "?", label: "Help" },
    { key: "q", label: "Quit" },
  ];

  return (
    <Box flexDirection="column" flexGrow={1} width="100%">
      {searchMode && (
        <Box paddingX={1}>
          <Text>
            <Text bold color="yellow">/</Text>
            <Text>{filterQuery}</Text>
            <Text dimColor>_</Text>
          </Text>
        </Box>
      )}
      {!searchMode && filterQuery && (
        <Box paddingX={1}>
          <Text dimColor>filter: {filterQuery} ({filteredSkills.length} match{filteredSkills.length !== 1 ? "es" : ""})</Text>
        </Box>
      )}
      {actionMode?.type === "confirmDelete" && (
        <Box paddingX={1}>
          <Text bold color="red">
            {actionMode.deleteBoth
              ? `Delete "${actionMode.skillName}" from both global and project? This will remove from registry and all profiles. (y/n)`
              : actionMode.isGlobal
                ? `Delete "${actionMode.skillName}" from global? This will also remove from registry and all profiles. (y/n)`
                : `Delete "${actionMode.skillName}" from project? (y/n)`}
          </Text>
        </Box>
      )}
      {actionMode?.type === "confirmDeleteScope" && (
        <Box paddingX={1}>
          <Text bold color="red">
            Delete "{actionMode.skillName}" from (g)lobal, (p)roject, or (b)oth?  Esc to cancel
          </Text>
        </Box>
      )}
      {actionMode?.type === "confirmMove" && (
        <Box paddingX={1}>
          <Text bold color="blue">Move {actionMode.skillName} to (g)lobal or (p)roject?  Esc to cancel</Text>
        </Box>
      )}
      {actionMode?.type === "addInput" && (
        <Box paddingX={1}>
          <Text>
            <Text bold color="green">Add source: </Text>
            <Text>{addSource}</Text>
            <Text dimColor>_</Text>
          </Text>
        </Box>
      )}
      {actionMode?.type === "addSkillMode" && (
        <Box paddingX={1}>
          <Text bold color="blue">
            {actionMode.loading
              ? `Discovering skills from "${actionMode.source}"... Esc to cancel`
              : `Install from "${actionMode.source}": (a)ll or (s)elect skills?  Esc to cancel`}
          </Text>
        </Box>
      )}
      {actionMode?.type === "addSkillSelect" && (
        <SkillSelectModal
          source={actionMode.source}
          skills={actionMode.skills}
          selectedSkills={actionMode.selectedSkills}
          cursorIndex={modalListIndex}
          error={actionMode.error}
        />
      )}
      {actionMode?.type === "addScope" && (
        <Box paddingX={1}>
          <Text bold color="blue">
            {actionMode.skill?.length
              ? `Add ${actionMode.skill.length} selected skill${actionMode.skill.length === 1 ? "" : "s"} from "${actionMode.source}" to (g)lobal or (p)roject?  Esc to cancel`
              : `Add "${actionMode.source}" to (g)lobal or (p)roject?  Esc to cancel`}
          </Text>
        </Box>
      )}
      <Box flexGrow={1} flexBasis={0} height={detailHeight}>
        <List
          items={items}
          selectedIndex={selectedIndex}
          title="Skills"
          focused={focusPane === "left"}
        />
        <DetailPane
          fields={fields}
          content={selected?.skillMdContent}
          contentTitle="SKILL.md"
          focused={focusPane === "right"}
          height={detailHeight}
          scrollOffset={detailScrollOffset}
        />
      </Box>
      <Notification notification={notification} />
      <StatusBar shortcuts={shortcuts} />
    </Box>
  );
}
