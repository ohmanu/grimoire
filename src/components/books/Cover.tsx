import type { Book } from "../../lib/api";
import { hashIndex } from "../../lib/text";
import styles from "./Cover.module.css";

// Tonos de encuadernación. El color sale del título, así que cada libro
// conserva siempre el suyo.
const BINDINGS = ["#7b2232", "#28405f", "#3f5b3a", "#8a6a2c", "#4b4757", "#5e3552", "#2f5557"];

interface CoverProps {
  book: Pick<Book, "title" | "authors">;
  size: "sm" | "lg";
}

/** Portada de mientras: un lomo de tela con el título impreso. */
export function Cover({ book, size }: CoverProps) {
  const color = BINDINGS[hashIndex(book.title, BINDINGS.length)];
  return (
    <div className={`${styles.cover} ${styles[size]}`} style={{ backgroundColor: color }} aria-hidden>
      {size === "lg" && (
        <>
          <span className={styles.title}>{book.title}</span>
          {book.authors[0] && <span className={styles.author}>{book.authors[0]}</span>}
        </>
      )}
    </div>
  );
}
