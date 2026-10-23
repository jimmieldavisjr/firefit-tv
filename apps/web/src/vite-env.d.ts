/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API Gateway HTTP API invoke URL (cdk-outputs.json -> ApiUrl). */
  readonly VITE_API_URL: string;
  /** Optional: origin the TV puts in the pairing QR (dev: https://<laptop-ip>:5174). Defaults to the TV's own origin. */
  readonly VITE_PHONE_ORIGIN?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Injected by the Kotlin WebView shell (apps/tv-shell).
interface Window {
  FireFitHost?: {
    exit(): void;
    hasNativeAudio?(): boolean;
    music?(mode: string): void;
    sfx?(name: string): void;
    setVolumes?(music: number, effects: number): void;
    volumes?(): string;
  };
}
