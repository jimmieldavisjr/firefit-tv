import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

// Two dev servers:
//   pnpm dev        -> http://<laptop-ip>:5173   (Fire TV WebView: plain HTTP, no self-signed cert prompts)
//   pnpm dev:phone  -> https://<laptop-ip>:5174  (phone: camera needs a secure context; accept the cert once)
// In production both pages are served from CloudFront over HTTPS.
const https = process.env.HTTPS === "1";

export default defineConfig({
  plugins: [react(), ...(https ? [basicSsl()] : [])],
  server: { port: https ? 5174 : 5173, strictPort: true },
  build: {
    target: "es2020", // Fire OS WebView is Chromium-based but can lag behind desktop Chrome
    rollupOptions: {
      input: {
        tv: resolve(import.meta.dirname, "tv.html"),
        phone: resolve(import.meta.dirname, "phone.html"),
        probe: resolve(import.meta.dirname, "probe.html"),
      },
    },
  },
});
