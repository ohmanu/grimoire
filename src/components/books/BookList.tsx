import { HandHelping } from "lucide-react";
import type { Book } from "../../lib/api";
import { t } from "../../lib/strings";
import { Sigil } from "../ui/Sigil";
import { Tooltip } from "../ui/Tooltip";
import { byline, Rating, StatusPill } from "./BookMeta";
import { Cover } from "./Cover";
import styles from "./BookList.module.css";

export type View = "list" | "grid";

const MAX_SIGILS = 3;

export function BookList({ books, view }: { books: Book[]; view: View }) {
  if (view === "grid") {
    return (
      <ul className={styles.grid}>
        {books.map((book) => (
          <li key={book.id} className={styles.card}>
            <Cover book={book} size="lg" />
            <div className={styles.cardText}>
              <span className={styles.cardTitle}>{book.title}</span>
              <span className={styles.byline}>{book.authors.join(", ")}</span>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className={styles.list}>
      {books.map((book) => {
        const hidden = book.sigils.length - MAX_SIGILS;
        return (
          <li key={book.id} className={styles.row}>
            <Cover book={book} size="sm" />
            <div className={styles.main}>
              <span className={styles.title}>{book.title}</span>
              <span className={styles.byline}>{byline(book)}</span>
            </div>
            <div className={styles.sigils}>
              {book.sigils.slice(0, MAX_SIGILS).map((name) => (
                <Sigil key={name} name={name} />
              ))}
              {hidden > 0 && <span className={styles.more}>+{hidden}</span>}
            </div>
            <div className={styles.meta}>
              {book.lentTo && (
                <Tooltip label={t.lentTo(book.lentTo)}>
                  <span className={styles.lent} aria-label={t.lentTo(book.lentTo)}>
                    <HandHelping size={14} />
                  </span>
                </Tooltip>
              )}
              {book.rating != null && <Rating value={book.rating} />}
              <StatusPill status={book.status} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
