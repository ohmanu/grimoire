import { useState } from "react";
import { t } from "../../lib/strings";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}

/** Confirmación para acciones que no se pueden deshacer. */
export function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onClose }: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && !busy && onClose()}
      title={title}
      description={body}
      width={420}
      footer={
        <>
          <Button onClick={onClose} disabled={busy} autoFocus>
            {t.cancel}
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
