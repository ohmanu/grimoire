import { Popover as BasePopover } from "@base-ui/react/popover";
import type { ReactElement, ReactNode } from "react";
import styles from "./Popover.module.css";

interface PopoverProps {
  trigger: ReactElement;
  children: ReactNode;
  align?: "start" | "center" | "end";
  width?: number;
  label?: string;
}

/** Panel flotante anclado a su botón. Escala desde el botón que lo abre. */
export function Popover({ trigger, children, align = "start", width = 260, label }: PopoverProps) {
  return (
    <BasePopover.Root>
      <BasePopover.Trigger render={trigger} />
      <BasePopover.Portal>
        <BasePopover.Positioner side="bottom" align={align} sideOffset={6} collisionPadding={12}>
          <BasePopover.Popup className={styles.popup} style={{ width }} aria-label={label}>
            {children}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}
