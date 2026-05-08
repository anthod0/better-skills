import { describe, test, expect, mock } from "bun:test";
import { render } from "ink-testing-library";
import React from "react";
import { stripAnsi, flush } from "./helpers.js";

const mockListProfiles = mock(() => Promise.resolve(["default", "work"]));
const mockGetActiveProfileName = mock(() => Promise.resolve("default"));
const mockReadProfile = mock((path: string) => {
  const name = path.replace(/.*\//, "").replace(".json", "");
  return Promise.resolve({
    name,
    skills:
      name === "default"
        ? [
            { skillName: "skill-a", v: 1, source: "owner/repo-a", addedAt: "2025-01-01T00:00:00Z" },
            { skillName: "skill-b", v: 3, source: "owner/repo-b", addedAt: "2025-01-01T00:00:00Z" },
          ]
        : [],
  });
});

mock.module("../../src/core/profile.js", () => ({
  listProfiles: mockListProfiles,
  getActiveProfileName: mockGetActiveProfileName,
  readProfile: mockReadProfile,
}));
const { ProfilesView } = await import(
  "../../src/tui/components/ProfilesView.js"
);

describe("ProfilesView", () => {
  test("renders profile names", async () => {
    const { lastFrame, unmount } = render(
      <ProfilesView focusPane="left" selectedIndex={0} />
    );
    await flush();
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("default");
    expect(frame).toContain("work");
    unmount();
  });

  test("shows active marker for active profile", async () => {
    const { lastFrame, unmount } = render(
      <ProfilesView focusPane="left" selectedIndex={0} />
    );
    await flush();
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("* active");
    unmount();
  });

  test("shows skill count for inactive profile", async () => {
    const { lastFrame, unmount } = render(
      <ProfilesView focusPane="left" selectedIndex={0} />
    );
    await flush();
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("0 skills");
    unmount();
  });

  test("shows detail pane fields for selected profile", async () => {
    const { lastFrame, unmount } = render(
      <ProfilesView focusPane="right" selectedIndex={0} />
    );
    await flush();
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("Name: default");
    expect(frame).toContain("Status: Active");
    expect(frame).toContain("Skills: 2");
    unmount();
  });

  test("shows status bar shortcuts", async () => {
    const { lastFrame, unmount } = render(
      <ProfilesView focusPane="left" selectedIndex={0} />
    );
    await flush();
    const frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("Enter:Sw");
    expect(frame).toContain("p:Apply");
    expect(frame).toContain("q:Qu");
    expect(frame).not.toContain("J/K");
    unmount();
  });

  test("j/k move the focused profile skill list when right pane is focused", async () => {
    const { stdin, lastFrame, unmount } = render(
      <ProfilesView focusPane="right" selectedIndex={0} />
    );
    await flush();

    stdin.write("j");
    await flush();

    let frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("  skill-a");
    expect(frame).toContain("> skill-b");

    stdin.write("k");
    await flush();

    frame = stripAnsi(lastFrame()!);
    expect(frame).toContain("> skill-a");
    expect(frame).toContain("  skill-b");
    unmount();
  });
});
