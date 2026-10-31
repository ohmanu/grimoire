import { HandHelping, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Book } from "../../lib/api";
import { t } from "../../lib/strings";
import { Button } from "../ui/Button";
import { Sigil } from "../ui/Sigil";
import { Tooltip } from "../ui/Tooltip";
import { byline, Rating, StatusPill } from "./BookMeta";
import { Cover } from "./Cover";
import styles from "./BookList.module.css";

export type View = "list" | "grid";

const MAX_SIGILS = 3;

interface BookListProps {
  books: Book[];
  view: View;
  onOpen: (book: Book) => void;
  /** Si se pasan, la lista es la de la papelera. */
  trash?: {
    onRestore: (book: Book) => void;
    onPurge: (book: Book) => void;
  };
}

// Se pinta por tandas: con miles de libros, la primera tanda aparece al
// instante y el resto se añade al acercarse al final de la lista.
const BATCH = 120;

function useProgressive<T>(items: T[]) {
  const [limit, setLimit] = useState(BATCH);
  const sentinel = useRef<HTMLLIElement>(null);

  useEffect(() => setLimit(BATCH), [items]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setLimit((l) => l + BATCH),
      // La raíz es el contenedor con scroll, para que el margen adelante la carga.
      { root: el.closest("main"), rootMargin: "600px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [limit, items]);

  const more = items.length > limit ? <li ref={sentinel} className={styles.sentinel} aria-hidden /> : null;
  return { visible: items.slice(0, limit), more };
}

export function BookList({ books: all, view, onOpen, trash }: BookListProps) {
  const { visible: books, more } = useProgressive(all);

  if (trash) {
    return (
      <ul className={styles.list}>
        {books.map((book) => (
          <li key={book.id} className={`${styles.row} ${styles.trashRow}`}>
            <Cover book={book} size="sm" />
            <div className={styles.main}>
              <span className={styles.title}>{book.title}</span>
              <span className={styles.byline}>{byline(book)}</span>
            </div>
            <div className={styles.actions}>
              <Button size="sm" icon={<RotateCcw />} onClick={() => trash.onRestore(book)}>
                {t.restore}
              </Button>
              <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => trash.onPurge(book)}>
                {t.purge}
              </Button>
            </div>
          </li>
        ))}
        {more}
      </ul>
    );
  }

  if (view === "grid") {
    return (
      <ul className={styles.grid}>
        {books.map((book) => (
          <li key={book.id}>
            <button type="button" className={styles.card} onClick={() => onOpen(book)}>
              <Cover book={book} size="lg" />
              <span className={styles.cardText}>
                <span className={styles.cardTitle}>{book.title}</span>
                <span className={styles.byline}>{book.authors.join(", ")}</span>
              </span>
            </button>
          </li>
        ))}
        {more}
      </ul>
    );
  }

  return (
    <ul className={styles.list}>
      {books.map((book) => {
        const hidden = book.sigils.length - MAX_SIGILS;
        return (
          <li key={book.id}>
            <button type="button" className={styles.row} onClick={() => onOpen(book)}>
              <Cover book={book} size="sm" />
              <span className={styles.main}>
                <span className={styles.title}>{book.title}</span>
                <span className={styles.byline}>{byline(book)}</span>
              </span>
              <span className={styles.sigils}>
                {book.sigils.slice(0, MAX_SIGILS).map((name) => (
                  <Sigil key={name} name={name} />
                ))}
                {hidden > 0 && <span className={styles.more}>+{hidden}</span>}
              </span>
              <span className={styles.meta}>
                {book.lentTo && (
                  <Tooltip label={t.lentTo(book.lentTo)}>
                    <span className={styles.lent} aria-label={t.lentTo(book.lentTo)}>
                      <HandHelping size={14} />
                    </span>
                  </Tooltip>
                )}
                {book.rating != null && <Rating value={book.rating} />}
                <StatusPill status={book.status} />
              </span>
            </button>
          </li>
        );
      })}
      {more}
    </ul>
  );
}
