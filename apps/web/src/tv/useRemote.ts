// Fire TV remote input. D-pad and Select arrive as keydown (ArrowLeft…, Enter). Back is intercepted by the
// Kotlin shell and re-dispatched as a "tv-back" window event; Escape/Backspace stand in for it on a laptop.
import { useEffect, useRef } from "react";

export type RemoteKey = "left" | "right" | "up" | "down" | "select" | "back" | "playpause";

const KEYS: Record<string, RemoteKey> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
  Enter: "select",
  " ": "select",
  Escape: "back",
  Backspace: "back",
  MediaPlayPause: "playpause",
  MediaPlay: "playpause",
  MediaPause: "playpause",
};

export function useRemote(handler: (k: RemoteKey, fromInput: boolean) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // While typing in a text field (Fire TV on-screen keyboard), only Up/Down/Enter navigate; everything else types.
      const typing = (document.activeElement as HTMLElement | null)?.tagName === "INPUT";
      if (typing && !["ArrowUp", "ArrowDown", "Enter"].includes(e.key)) return;
      const k = KEYS[e.key] ?? (e.keyCode === 179 ? "playpause" : undefined);
      if (!k) return;
      if (typing) (document.activeElement as HTMLElement).blur();
      e.preventDefault();
      ref.current(k, typing);
    };
    const onBack = () => ref.current("back", false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("tv-back", onBack);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("tv-back", onBack);
    };
  }, []);
}
