// Static entry point for the GitHub Pages build. The app is a single client
// component, so it mounts directly with no server runtime — unlike the vinext
// build, which emits a Cloudflare Worker that Pages cannot run.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Home from "../app/page";
import "../app/globals.css";

const el = document.getElementById("root");
if (!el) throw new Error("Missing #root mount element");
createRoot(el).render(
  <StrictMode>
    <Home />
  </StrictMode>,
);
