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

export function useRemote(handler: (k: RemoteKey) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = KEYS[e.key] ?? (e.keyCode === 179 ? "playpause" : undefined);
      if (!k) return;
      e.preventDefault();
      ref.current(k);
    };
    const onBack = () => ref.current("back");
    window.addEventListener("keydown", onKey);
    window.addEventListener("tv-back", onBack);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("tv-back", onBack);
    };
  }, []);
}
