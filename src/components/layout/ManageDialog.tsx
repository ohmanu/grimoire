import { Check, Pencil, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api, isApiError, type NamedCount } from "../../lib/api";
import { t } from "../../lib/strings";
import { fold } from "../../lib/text";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Segmented } from "../ui/Field";
import styles from "./ManageDialog.module.css";

type Kind = "sigils" | "categories";

interface ManageDialogProps {
  open: boolean;
  sigils: NamedCount[];
  categories: NamedCount[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}

/** Renombrar, fusionar (renombrando a un nombre existente) y borrar. */
export function ManageDialog({ open, sigils, categories, onClose, onChanged }: ManageDialogProps) {
  const [kind, setKind] = useState<Kind>("sigils");
  const entries = kind === "sigils" ? sigils : categories;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()} title={t.manageTitle} width={520}>
      <div className={styles.body}>
        <Segmented
          label={t.manageTitle}
          value={kind}
          onChange={setKind}
          options={[
            { value: "sigils", label: t.sigils },
            { value: "categories", label: t.categories },
          ]}
        />
        {entries.length === 0 ? (
          <p className={styles.empty}>{t.nothingToManage}</p>
        ) : (
          <ul className={styles.list}>
            {entries.map((entry) => (
              <Row key={`${kind}-${entry.id}`} kind={kind} entry={entry} all={entries} onChanged={onChanged} />
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}

interface RowProps {
  kind: Kind;
  entry: NamedCount;
  all: NamedCount[];
  onChanged: () => Promise<void>;
}

function Row({ kind, entry, all, onChanged }: RowProps) {
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [name, setName] = useState(entry.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clash = all.find((o) => o.id !== entry.id && fold(o.name) === fold(name));

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
      setMode("view");
    } catch (err) {
      if (isApiError(err) && err.fields.length) setError(err.fields[0].message);
      else toast.error(t.actionError, { description: isApiError(err) ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (name.trim() === entry.name) return setMode("view");
    run(() => api.renameEntry(kind, entry.id, name));
  };

  if (mode === "edit") {
    return (
      <li className={styles.row}>
        <form
          className={styles.edit}
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <input
            className={styles.input}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                // Cancela la edición, no el diálogo.
                e.stopPropagation();
                setName(entry.name);
                setMode("view");
              }
            }}
            aria-label={t.rename}
            aria-invalid={!!error}
            autoFocus
            disabled={busy}
          />
          <Button size="icon" variant="primary" type="submit" aria-label={t.rename} icon={<Check />} disabled={busy} />
          <Button
            size="icon"
            variant="ghost"
            aria-label={t.cancel}
            icon={<X />}
            onClick={() => {
              setName(entry.name);
              setMode("view");
            }}
          />
        </form>
        {(error || clash) && (
          <p className={error ? styles.error : styles.hint}>{error ?? t.willMerge(clash!.name)}</p>
        )}
      </li>
    );
  }

  if (mode === "delete") {
    return (
      <li className={`${styles.row} ${styles.confirm}`}>
        <div className={styles.text}>
          <span className={styles.name}>{t.confirmDelete} «{entry.name}»</span>
          <span className={styles.hint}>
            {kind === "sigils" ? t.deleteSigilHint(entry.count) : t.deleteCategoryHint(entry.count)}
          </span>
        </div>
        <Button size="sm" onClick={() => setMode("view")} disabled={busy}>
          {t.cancel}
        </Button>
        <Button size="sm" variant="danger" onClick={() => run(() => api.deleteEntry(kind, entry.id))} disabled={busy}>
          {t.delete}
        </Button>
      </li>
    );
  }

  return (
    <li className={styles.row}>
      <div className={styles.text}>
        <span className={styles.name}>
          {kind === "sigils" && <span className={styles.glyph} aria-hidden />}
          {entry.name}
        </span>
        <span className={styles.count}>{t.bookCount(entry.count)}</span>
      </div>
      <Button
        size="icon"
        variant="ghost"
        aria-label={`${t.rename} ${entry.name}`}
        icon={<Pencil />}
        onClick={() => {
          setName(entry.name);
          setMode("edit");
        }}
      />
      <Button
        size="icon"
        variant="ghost"
        aria-label={`${t.delete} ${entry.name}`}
        icon={<Trash2 />}
        onClick={() => setMode("delete")}
      />
    </li>
  );
}
