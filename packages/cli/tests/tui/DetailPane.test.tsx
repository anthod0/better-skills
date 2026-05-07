import { describe, test, expect } from "bun:test";
import { render } from "ink-testing-library";
import React from "react";
import { stripAnsi } from "./helpers.js";
import { DetailPane } from "../../src/tui/components/DetailPane.js";

describe("DetailPane", () => {
  test("clips overflowing content to the viewport and shows a scrollbar", () => {
    const content = Array.from({ length: 10 }, (_, i) => `line-${i + 1}`).join("\n");

    const { lastFrame, unmount } = render(
      <DetailPane
        fields={[{ label: "Name", value: "example" }]}
        content={content}
        contentTitle="SKILL.md"
        height={6}
        scrollOffset={0}
      />
    );

    const frame = stripAnsi(lastFrame()!);

    expect(frame).toContain("line-1");
    expect(frame).not.toContain("line-10");
    expect(frame).toContain("█");

    unmount();
  });

  test("renders later content when scrolled", () => {
    const content = Array.from({ length: 10 }, (_, i) => `line-${i + 1}`).join("\n");

    const { lastFrame, unmount } = render(
      <DetailPane
        fields={[]}
        content={content}
        height={7}
        scrollOffset={5}
      />
    );

    const frame = stripAnsi(lastFrame()!);

    expect(frame).not.toMatch(/line-1(?!0)/);
    expect(frame).toContain("line-6");
    expect(frame).toContain("line-10");
    expect(frame).toContain("█");

    unmount();
  });
});
