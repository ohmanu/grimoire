import React from "react";
import ReactDOM from "react-dom/client";
import { toast, Toaster } from "sonner";
import App from "./App";
import { ErrorBoundary } from "./components/layout/ErrorBoundary";
import { TooltipProvider } from "./components/ui/Tooltip";
import { isApiError } from "./lib/api";
import { t } from "./lib/strings";
import "./styles/base.css";

// Una promesa que falla sin que nadie la atienda se avisa, en lugar de
// perderse en silencio.
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  toast.error(t.actionError, { description: isApiError(reason) ? reason.message : String(reason) });
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </ErrorBoundary>
    <Toaster theme="system" position="bottom-right" toastOptions={{ style: { fontFamily: "var(--font-ui)" } }} />
  </React.StrictMode>,
);
