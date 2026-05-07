import React from "react";
import { Box, Text } from "ink";

export interface DetailField {
  label: string;
  value: string;
}

interface DetailPaneProps {
  fields: DetailField[];
  content?: string;
  contentTitle?: string;
  focused?: boolean;
  height?: number;
  scrollOffset?: number;
}

type DetailLine =
  | { type: "field"; label: string; value: string }
  | { type: "text"; value: string; dim?: boolean };

function buildDetailLines(fields: DetailField[], content?: string, contentTitle?: string): DetailLine[] {
  const lines: DetailLine[] = fields.map((f) => ({ type: "field", label: f.label, value: f.value }));

  if (content) {
    if (lines.length > 0) lines.push({ type: "text", value: "" });
    if (contentTitle) {
      lines.push({ type: "text", value: "\u2500\u2500\u2500 " + contentTitle + " " + "\u2500".repeat(20), dim: true });
    }
    lines.push(...content.split("\n").map((value) => ({ type: "text" as const, value })));
  }

  return lines;
}

function renderDetailLine(line: DetailLine, key: number) {
  if (line.type === "field") {
    return (
      <Text key={key} wrap="truncate">
        <Text dimColor>{line.label}: </Text>
        <Text>{line.value}</Text>
      </Text>
    );
  }

  return (
    <Text key={key} dimColor={line.dim} wrap="truncate">
      {line.value}
    </Text>
  );
}

function renderScrollbar(totalLines: number, viewportHeight: number, scrollOffset: number) {
  const maxScroll = Math.max(0, totalLines - viewportHeight);
  const thumbSize = Math.max(1, Math.floor((viewportHeight * viewportHeight) / totalLines));
  const thumbStart = maxScroll === 0
    ? 0
    : Math.floor((scrollOffset * (viewportHeight - thumbSize)) / maxScroll);

  return Array.from({ length: viewportHeight }, (_, i) => (
    <Text key={i} color="cyan">
      {i >= thumbStart && i < thumbStart + thumbSize ? "█" : "│"}
    </Text>
  ));
}

export function DetailPane({ fields, content, contentTitle, focused = false, height, scrollOffset = 0 }: DetailPaneProps) {
  const lines = buildDetailLines(fields, content, contentTitle);
  const viewportHeight = height == null ? lines.length : Math.max(1, height - 2);
  const maxScroll = Math.max(0, lines.length - viewportHeight);
  const effectiveScrollOffset = Math.min(Math.max(0, scrollOffset), maxScroll);
  const visibleLines = lines.slice(effectiveScrollOffset, effectiveScrollOffset + viewportHeight);
  const showScrollbar = height != null && lines.length > viewportHeight;

  return (
    <Box
      flexDirection="row"
      flexGrow={2}
      flexBasis={0}
      height={height}
      borderStyle="single"
      borderColor={focused ? "cyan" : "gray"}
      paddingX={1}
    >
      <Box flexDirection="column" flexGrow={1} flexBasis={0}>
        {visibleLines.map((line, i) => renderDetailLine(line, effectiveScrollOffset + i))}
      </Box>
      {showScrollbar && (
        <Box flexDirection="column" marginLeft={1}>
          {renderScrollbar(lines.length, viewportHeight, effectiveScrollOffset)}
        </Box>
      )}
    </Box>
  );
}
