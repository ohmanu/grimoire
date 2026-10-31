import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type { ReactElement, ReactNode } from "react";
import styles from "./Tooltip.module.css";

/**
 * Envuelve la app una vez. Con un tooltip ya abierto, los vecinos aparecen al
 * instante y sin animación: la barra de herramientas se siente más rápida.
 */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <BaseTooltip.Provider delay={500} closeDelay={0}>
      {children}
    </BaseTooltip.Provider>
  );
}

interface TooltipProps {
  label: ReactNode;
  children: ReactElement;
  side?: "top" | "bottom" | "left" | "right";
}

export function Tooltip({ label, children, side = "bottom" }: TooltipProps) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner side={side} sideOffset={6}>
          <BaseTooltip.Popup className={styles.popup}>{label}</BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
