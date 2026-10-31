import { Star } from "lucide-react";
import type { Book, Status } from "../../lib/api";
import { t } from "../../lib/strings";
import styles from "./BookMeta.module.css";

export function StatusPill({ status }: { status: Status }) {
  return (
    <span className={styles.status} data-status={status}>
      <span className={styles.dot} aria-hidden />
      {t.status[status]}
    </span>
  );
}

export function Rating({ value }: { value: number }) {
  return (
    <span className={styles.rating} title={t.rating(value)} aria-label={t.rating(value)}>
      <Star size={12} aria-hidden />
      {value}
    </span>
  );
}

/** "Autores · año · serie #n", con lo que haya. */
export function byline(book: Book): string {
  return [
    book.authors.join(", "),
    book.year,
    book.series && t.seriesEntry(book.series, book.seriesNumber),
  ]
    .filter(Boolean)
    .join(" · ");
}
