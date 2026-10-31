import { Component, type ErrorInfo, type ReactNode } from "react";
import { t } from "../../lib/strings";
import { Button } from "../ui/Button";
import { EmptyState } from "./EmptyState";

interface State {
  error: Error | null;
}

/**
 * Última red de seguridad: si algo de la interfaz falla al pintarse, en vez
 * de una ventana en blanco se explica y se ofrece recargar. Los datos están a
 * salvo en la base de datos; recargar solo vuelve a pintar la interfaz.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Fallo de la interfaz", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <EmptyState
          title={t.crashTitle}
          body={`${t.crashBody} (${this.state.error.message})`}
          action={
            <Button variant="primary" onClick={() => window.location.reload()}>
              {t.reload}
            </Button>
          }
        />
      </div>
    );
  }
}
