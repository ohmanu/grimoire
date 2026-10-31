import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { t } from "../../lib/strings";
import styles from "./Dialog.module.css";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
}

/**
 * Diálogo modal centrado. Base UI se encarga del foco, Escape y clic fuera;
 * aquí solo va el aspecto y la animación (entrada 200 ms, salida 150 ms).
 */
export function Dialog({ open, onOpenChange, title, description, children, footer, width = 480 }: DialogProps) {
  return (
    <BaseDialog.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className={styles.backdrop} />
        <BaseDialog.Viewport className={styles.viewport}>
          <BaseDialog.Popup className={styles.popup} style={{ width }}>
            <header className={styles.header}>
              <BaseDialog.Title className={styles.title}>{title}</BaseDialog.Title>
              <BaseDialog.Close className={styles.close} aria-label={t.close}>
                <X size={16} />
              </BaseDialog.Close>
            </header>
            {description && (
              <BaseDialog.Description className={styles.description}>{description}</BaseDialog.Description>
            )}
            {children && <div className={styles.body}>{children}</div>}
            {footer && <footer className={styles.footer}>{footer}</footer>}
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

export const DialogClose = BaseDialog.Close;
