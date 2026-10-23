import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./tv.css";
import "./tv-v3.css";
import "./tv-v4.css";
import "./tv-v5.css";
import "./tv-v6.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
