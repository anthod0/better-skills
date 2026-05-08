// packages/cli/tests/tui/keyboard.test.tsx
import { describe, test, expect, mock } from "bun:test";
import { render } from "ink-testing-library";
import React from "react";
import { Text } from "ink";
import { flush } from "./helpers.js";
import {
  useKeyboard,
  type KeyboardHandlers,
} from "../../src/tui/hooks/useKeyboard.js";

function KeyboardHarness({ handlers }: { handlers: KeyboardHandlers }) {
  useKeyboard(handlers);
  return <Text>ready</Text>;
}

describe("useKeyboard", () => {
  test("q triggers onQuit", async () => {
    const onQuit = mock();
    const { stdin, unmount } = render(
      <KeyboardHarness handlers={{ onQuit }} />
    );
    stdin.write("q");
    await flush();
    expect(onQuit).toHaveBeenCalledTimes(1);
    unmount();
  });

  test("j triggers onDown", async () => {
    const onDown = mock();
    const { stdin, unmount } = render(
      <KeyboardHarness handlers={{ onDown }} />
    );
    stdin.write("j");
    await flush();
    expect(onDown).toHaveBeenCalledTimes(1);
    unmount();
  });

  test("k triggers onUp", async () => {
    const onUp = mock();
    const { stdin, unmount } = render(
      <KeyboardHarness handlers={{ onUp }} />
    );
    stdin.write("k");
    await flush();
    expect(onUp).toHaveBeenCalledTimes(1);
    unmount();
  });

  test("h triggers onLeft", async () => {
    const onLeft = mock();
    const { stdin, unmount } = render(
      <KeyboardHarness handlers={{ onLeft }} />
    );
    stdin.write("h");
    await flush();
    expect(onLeft).toHaveBeenCalledTimes(1);
    unmount();
  });

  test("l triggers onRight", async () => {
    const onRight = mock();
    const { stdin, unmount } = render(
      <KeyboardHarness handlers={{ onRight }} />
    );
    stdin.write("l");
    await flush();
    expect(onRight).toHaveBeenCalledTimes(1);
    unmount();
  });

  test("number keys 1-4 forwarded via onKey", async () => {
    const onKey = mock();
    const { stdin, unmount } = render(
      <KeyboardHarness handlers={{ onKey }} />
    );
    stdin.write("1");
    stdin.write("3");
    await flush();
    expect(onKey).toHaveBeenCalledWith("1");
    expect(onKey).toHaveBeenCalledWith("3");
    unmount();
  });

  test("enter triggers onEnter", async () => {
    const onEnter = mock();
    const { stdin, unmount } = render(
      <KeyboardHarness handlers={{ onEnter }} />
    );
    stdin.write("\r");
    await flush();
    expect(onEnter).toHaveBeenCalledTimes(1);
    unmount();
  });

  test("escape triggers onEscape", async () => {
    const onEscape = mock();
    const { stdin, unmount } = render(
      <KeyboardHarness handlers={{ onEscape }} />
    );
    stdin.write("\x1b");
    await flush();
    expect(onEscape).toHaveBeenCalledTimes(1);
    unmount();
  });

  test("single char keys forwarded via onKey", async () => {
    const onKey = mock();
    const { stdin, unmount } = render(
      <KeyboardHarness handlers={{ onKey }} />
    );
    stdin.write("a");
    stdin.write("x");
    await flush();
    expect(onKey).toHaveBeenCalledWith("a");
    expect(onKey).toHaveBeenCalledWith("x");
    unmount();
  });

  test("Ctrl-D and Ctrl-U trigger half-page detail scroll handlers", async () => {
    const onScrollHalfDown = mock();
    const onScrollHalfUp = mock();
    const { stdin, unmount } = render(
      <KeyboardHarness handlers={{ onScrollHalfDown, onScrollHalfUp }} />
    );

    stdin.write("\x04");
    stdin.write("\x15");
    await flush();

    expect(onScrollHalfDown).toHaveBeenCalledTimes(1);
    expect(onScrollHalfUp).toHaveBeenCalledTimes(1);
    unmount();
  });

  test("Ctrl-E and Ctrl-Y trigger single-line detail scroll handlers", async () => {
    const onScrollLineDown = mock();
    const onScrollLineUp = mock();
    const { stdin, unmount } = render(
      <KeyboardHarness handlers={{ onScrollLineDown, onScrollLineUp }} />
    );

    stdin.write("\x05");
    stdin.write("\x19");
    await flush();

    expect(onScrollLineDown).toHaveBeenCalledTimes(1);
    expect(onScrollLineUp).toHaveBeenCalledTimes(1);
    unmount();
  });
});
