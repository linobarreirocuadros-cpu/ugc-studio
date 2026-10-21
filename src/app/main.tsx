import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "@fontsource/poppins/latin-400.css";
import "@fontsource/poppins/latin-500.css";
import "@fontsource/poppins/latin-600.css";
import "./styles.css";
import "./studio-theme.css";
import "./workspace.css";
import "./timeline-panels.css";
import "./shortcuts.css";
import "./compact-ui.css";
import "./monitors.css";
import "./assistant.css";
import "./editing-actions.css";
import "./project-panel.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
