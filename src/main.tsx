import React from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "sonner";
import App from "./App";
import { TooltipProvider } from "./components/ui/Tooltip";
import "./styles/base.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <TooltipProvider>
      <App />
    </TooltipProvider>
    <Toaster theme="system" position="bottom-right" toastOptions={{ style: { fontFamily: "var(--font-ui)" } }} />
  </React.StrictMode>,
);
