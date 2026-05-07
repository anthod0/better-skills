import React from "react";
import { Box, Text, useInput } from "ink";
import { List, type ListItem } from "./List.js";
import { DetailPane, type DetailField } from "./DetailPane.js";
import { StatusBar } from "./StatusBar.js";
import { Notification } from "./Notification.js";
import type { NotificationState } from "../hooks/useNotification.js";
import type { ActionMode } from "../App.js";
import { useStoreLs } from "../hooks/useStoreLs.js";
import { useStore } from "../hooks/useStore.js";

interface StoreViewProps {
  selectedIndex: number;
  focusPane: "left" | "right";
  refreshKey?: number;
  notification?: NotificationState | null;
  actionMode: ActionMode;
  detailHeight?: number;
  detailScrollOffset?: number;
  onPrune: (orphanCount: number) => void;
  onAdopt: (orphanCount: number) => void;
}

export function StoreView({
  selectedIndex,
  focusPane,
  refreshKey = 0,
  notification = null,
  actionMode,
  detailHeight,
  detailScrollOffset = 0,
  onPrune,
  onAdopt,
}: StoreViewProps) {
  const { result: lsResult, loading: lsLoading, refresh: refreshLs } = useStoreLs(refreshKey);
  const { result: verifyResult, loading: verifyLoading, refresh: refreshVerify } = useStore();

  const orphanCount = lsResult
    ? lsResult.entries.filter((e) => e.skills.length === 0).length
    : 0;
  const hasOrphans = orphanCount > 0;

  useInput((input) => {
    if (actionMode) return;
    if (input === "v") refreshVerify();
    if (input === "r") refreshLs();
    if (input === "p" && hasOrphans) onPrune(orphanCount);
    if (input === "a" && hasOrphans) onAdopt(orphanCount);
  });

  if (lsLoading || !lsResult) return <Text>Loading store...</Text>;

  const entries = lsResult.entries;
  const selected = entries[selectedIndex];

  const items: ListItem[] = entries.map((entry) => {
    const skills = entry.skills.length > 0
      ? entry.skills.map((s) => `${s.name}@v${s.v}`).join(", ")
      : entry.orphanName ? `(orphan) ${entry.orphanName}` : "(orphan)";
    return { key: entry.hash, label: entry.hash.slice(0, 12), markers: skills };
  });

  const formatSize = (bytes: number) => {
    if (bytes > 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes > 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  };

  const fields: DetailField[] = selected
    ? [
        { label: "Hash", value: selected.hash },
        { label: "Size", value: formatSize(selected.size) },
        { label: "Skills", value: selected.skills.length > 0
          ? selected.skills.map((s) => `${s.name} v${s.v}`).join(", ")
          : selected.orphanName
            ? `(orphan) ${selected.orphanName} — no registry reference`
            : "(orphan — no registry reference)" },
      ]
    : [];

  const detailContent = selected && selected.skills.length > 0
    ? selected.skills.map((s) => `  ${s.name} v${s.v} (${s.source})`).join("\n")
    : selected?.orphanName ? `  ${selected.orphanName} (orphan — from SKILL.md)` : "";

  const healthLine = verifyResult
    ? `Health: ${verifyResult.total} entries, ${verifyResult.ok} ok${verifyResult.corrupted.length > 0 ? `, ${verifyResult.corrupted.length} corrupted` : ""}`
    : verifyLoading ? "Verifying..." : "";

  return (
    <Box flexDirection="column" flexGrow={1} width="100%">
      {healthLine && (
        <Box paddingX={1}>
          <Text dimColor>{healthLine}</Text>
        </Box>
      )}
      <Box flexGrow={1} flexBasis={0} height={detailHeight}>
        <List items={items} selectedIndex={selectedIndex} title="Store" focused={focusPane === "left"} />
        <DetailPane
          fields={fields}
          content={detailContent}
          contentTitle="Associated skills"
          focused={focusPane === "right"}
          height={detailHeight}
          scrollOffset={detailScrollOffset}
        />
      </Box>
      {actionMode?.type === "confirmPrune" && (
        <Box paddingX={1}>
          <Text color="yellow">
            Delete {actionMode.orphanCount} orphan store {actionMode.orphanCount === 1 ? "entry" : "entries"}? (y/n)
          </Text>
        </Box>
      )}
      {actionMode?.type === "confirmAdopt" && (
        <Box paddingX={1}>
          <Text color="yellow">
            Adopt {actionMode.orphanCount} orphan store {actionMode.orphanCount === 1 ? "entry" : "entries"}? (y/n)
          </Text>
        </Box>
      )}
      <Notification notification={notification} />
      <StatusBar shortcuts={[
        { key: "v", label: "Re-verify" },
        { key: "r", label: "Refresh" },
        ...(hasOrphans ? [
          { key: "p", label: `Prune ${orphanCount} orphans` },
          { key: "a", label: `Adopt ${orphanCount} orphans` },
        ] : []),
        { key: "?", label: "Help" },
        { key: "q", label: "Quit" },
      ]} />
    </Box>
  );
}
