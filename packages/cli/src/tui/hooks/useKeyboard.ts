import { useInput } from "ink";

export interface KeyboardHandlers {
  onQuit?: () => void;
  onUp?: () => void;
  onDown?: () => void;
  onLeft?: () => void;
  onRight?: () => void;
  onEnter?: () => void;
  onEscape?: () => void;
  onTab?: () => void;
  onScrollLineUp?: () => void;
  onScrollLineDown?: () => void;
  onScrollHalfUp?: () => void;
  onScrollHalfDown?: () => void;
  onKey?: (key: string) => void;
}

export function useKeyboard(handlers: KeyboardHandlers) {
  useInput((input, key) => {
    // Quit
    if (input === "q" && !key.ctrl) {
      handlers.onQuit?.();
      return;
    }

    // Vim-style detail scrolling
    if ((key.ctrl && input === "e") || input === "\x05") {
      handlers.onScrollLineDown?.();
      return;
    }
    if ((key.ctrl && input === "y") || input === "\x19") {
      handlers.onScrollLineUp?.();
      return;
    }
    if ((key.ctrl && input === "d") || input === "\x04") {
      handlers.onScrollHalfDown?.();
      return;
    }
    if ((key.ctrl && input === "u") || input === "\x15") {
      handlers.onScrollHalfUp?.();
      return;
    }

    // Vim-style navigation
    if (input === "j" || key.downArrow) {
      handlers.onDown?.();
      return;
    }
    if (input === "k" || key.upArrow) {
      handlers.onUp?.();
      return;
    }
    if (input === "h" || key.leftArrow) {
      handlers.onLeft?.();
      return;
    }
    if (input === "l" || key.rightArrow) {
      handlers.onRight?.();
      return;
    }

    // Tab switching via number keys
    if (input === "1" || input === "2" || input === "3" || input === "4") {
      handlers.onKey?.(input);
      return;
    }

    if (key.return) {
      handlers.onEnter?.();
      return;
    }
    if (key.escape) {
      handlers.onEscape?.();
      return;
    }
    if (key.tab) {
      handlers.onTab?.();
      return;
    }

    // Forward other single-char keys
    if (input.length === 1) {
      handlers.onKey?.(input);
    }
  });
}
