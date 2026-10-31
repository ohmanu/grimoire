import type { ImportReport } from "../../lib/api";
import { t } from "../../lib/strings";
import { Button } from "../ui/Button";
import { Dialog, DialogClose } from "../ui/Dialog";
import styles from "./ImportReportDialog.module.css";

interface ImportReportDialogProps {
  report: ImportReport | null;
  onClose: () => void;
}

/** Qué entró, qué se omitió por repetido y qué falló, fila a fila. */
export function ImportReportDialog({ report, onClose }: ImportReportDialogProps) {
  return (
    <Dialog
      open={report !== null}
      onOpenChange={(next) => !next && onClose()}
      title={t.importTitle}
      width={520}
      footer={<DialogClose render={<Button variant="primary" />}>{t.close}</DialogClose>}
    >
      {report && (
        <div className={styles.report}>
          <p className={styles.ok}>{t.imported(report.imported)}</p>
          {report.duplicates > 0 && <p className={styles.muted}>{t.duplicates(report.duplicates)}</p>}
          {report.failed > 0 && (
            <>
              <p className={styles.bad}>{t.failed(report.failed)}</p>
              <ul className={styles.issues}>
                {report.issues.map((issue) => (
                  <li key={issue.row}>
                    <span className={styles.row}>{t.row(issue.row)}</span>
                    {issue.title && <span className={styles.title}>{issue.title}</span>}
                    <span className={styles.message}>{issue.message}</span>
                  </li>
                ))}
              </ul>
              {report.failed > report.issues.length && (
                <p className={styles.muted}>{t.moreIssues(report.failed - report.issues.length)}</p>
              )}
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}
