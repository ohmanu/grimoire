import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { Book } from "../../lib/api";
import { t } from "../../lib/strings";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Sigil } from "../ui/Sigil";
import { Rating, StatusPill } from "./BookMeta";
import { Cover } from "./Cover";
import styles from "./BookDetail.module.css";

interface BookDetailProps {
  book: Book | null;
  onClose: () => void;
  onEdit: (book: Book) => void;
  onTrash: (book: Book) => void;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

/** Ficha de solo lectura. Desde aquí se edita o se manda a la papelera. */
export function BookDetail({ book: current, onClose, onEdit, onTrash }: BookDetailProps) {
  // Se conserva el último libro mostrado para que la animación de cierre no
  // se quede vacía.
  const [last, setLast] = useState(current);
  useEffect(() => {
    if (current) setLast(current);
  }, [current]);
  const book = current ?? last;

  const rows: [string, string | null][] = book
    ? [
        [t.fields.category, book.category],
        [t.fields.series, book.series && t.seriesEntry(book.series, book.seriesNumber)],
        [t.fields.publisher, book.publisher],
        [t.fields.year, book.year?.toString() ?? null],
        [t.fields.pages, book.pages?.toString() ?? null],
        [t.fields.language, book.language],
        [t.fields.format, t.format[book.format]],
        [t.fields.isbn, book.isbn],
        [t.fields.location, book.location],
        [
          t.fields.lentTo,
          book.lentTo && (book.lentAt ? `${book.lentTo}, ${t.since(formatDate(book.lentAt))}` : book.lentTo),
        ],
      ]
    : [];

  return (
    <Dialog
      open={current !== null}
      onOpenChange={(next) => !next && onClose()}
      title={book?.title ?? ""}
      width={680}
      footer={
        book && (
          <>
            <Button variant="ghost" icon={<Trash2 />} onClick={() => onTrash(book)} className={styles.trash}>
              {t.delete}
            </Button>
            <Button variant="primary" icon={<Pencil />} onClick={() => onEdit(book)}>
              {t.edit}
            </Button>
          </>
        )
      }
    >
      {book && (
        <div className={styles.detail}>
          <Cover book={book} size="lg" />
          <div className={styles.info}>
            {book.subtitle && <p className={styles.subtitle}>{book.subtitle}</p>}
            {book.authors.length > 0 && <p className={styles.authors}>{book.authors.join(", ")}</p>}
            <div className={styles.status}>
              <StatusPill status={book.status} />
              {book.rating != null && <Rating value={book.rating} />}
            </div>
            {book.synopsis && <p className={styles.synopsis}>{book.synopsis}</p>}
            {book.sigils.length > 0 && (
              <ul className={styles.sigils} aria-label={t.sigils}>
                {book.sigils.map((s) => (
                  <li key={s}>
                    <Sigil name={s} size="md" />
                  </li>
                ))}
              </ul>
            )}
            <dl className={styles.meta}>
              {rows
                .filter(([, value]) => value)
                .map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
            </dl>
            {book.notes && (
              <div className={styles.notes}>
                <h3>{t.fields.notes}</h3>
                <p>{book.notes}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
