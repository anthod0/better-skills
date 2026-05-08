import React from "react";
import { Box, Text } from "ink";
import type { TabName } from "./TabBar.js";

interface Binding {
  keys: string;
  action: string;
}

const GLOBAL_BINDINGS: Binding[] = [
  { keys: "j/k  \u2191/\u2193", action: "Navigate focused list" },
  { keys: "Ctrl-E/Y", action: "Scroll details one line down/up" },
  { keys: "Ctrl-D/U", action: "Scroll details half page down/up" },
  { keys: "h/l  \u2190/\u2192", action: "Switch pane" },
  { keys: "Tab", action: "Next tab" },
  { keys: "1-4", action: "Jump to tab" },
  { keys: "?", action: "Toggle help" },
  { keys: "q", action: "Quit" },
];

const TAB_BINDINGS: Record<TabName, Binding[]> = {
  Skills: [
    { keys: "a", action: "Add skill source, then choose all or select skills" },
    { keys: "e", action: "Edit skill in $EDITOR" },
    { keys: "d", action: "Delete skill" },
    { keys: "m", action: "Move skill (global/project)" },
    { keys: "/", action: "Search skills" },
  ],
  Profiles: [
    { keys: "Enter", action: "Switch to selected profile" },
  ],
  Store: [
    { keys: "v", action: "Re-verify store integrity" },
  ],
  Clients: [
    { keys: "a", action: "Enable client" },
    { keys: "d", action: "Disable client" },
  ],
};

interface HelpOverlayProps {
  tab: TabName;
}

export function HelpOverlay({ tab }: HelpOverlayProps) {
  const tabBindings = TAB_BINDINGS[tab];

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      borderStyle="single"
      borderColor="yellow"
      paddingX={2}
      paddingY={1}
    >
      <Text bold color="yellow">
        Keybindings — {tab}
      </Text>
      <Text dimColor>Press Esc or ? to close</Text>
      <Box marginTop={1} flexDirection="column">
        <Text bold underline>
          {tab} Tab
        </Text>
        {tabBindings.map((b) => (
          <Text key={b.keys}>
            <Text bold color="yellow">
              {b.keys.padEnd(14)}
            </Text>
            <Text>{b.action}</Text>
          </Text>
        ))}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold underline>
          Global
        </Text>
        {GLOBAL_BINDINGS.map((b) => (
          <Text key={b.keys}>
            <Text bold color="yellow">
              {b.keys.padEnd(14)}
            </Text>
            <Text>{b.action}</Text>
          </Text>
        ))}
      </Box>
    </Box>
  );
}
