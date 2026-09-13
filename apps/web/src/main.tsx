import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./tokens.css";
import "./app.css";

const el = document.getElementById("root");
if (!el) throw new Error("Falta #root en index.html");

createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
