import { useState } from "react";
import { coverSrc, type Book } from "../../lib/api";
import { hashIndex } from "../../lib/text";
import styles from "./Cover.module.css";

// Tonos de encuadernación. El color sale del título, así que cada libro
// conserva siempre el suyo.
const BINDINGS = ["#7b2232", "#28405f", "#3f5b3a", "#8a6a2c", "#4b4757", "#5e3552", "#2f5557"];

interface CoverProps {
  book: Pick<Book, "title" | "authors"> & Partial<Pick<Book, "cover">>;
  size: "sm" | "md" | "lg";
}

/** La portada del libro o, si no tiene (o no carga), un lomo de tela con el título impreso. */
export function Cover({ book, size }: CoverProps) {
  const src = book.cover ? coverSrc({ cover: book.cover }) : null;
  const [failed, setFailed] = useState<string | null>(null);

  if (src && failed !== src) {
    return (
      <img
        src={src}
        alt=""
        className={`${styles.cover} ${styles.image} ${styles[size]}`}
        loading="lazy"
        draggable={false}
        onError={() => setFailed(src)}
      />
    );
  }

  const color = BINDINGS[hashIndex(book.title, BINDINGS.length)];
  return (
    <div className={`${styles.cover} ${styles[size]}`} style={{ backgroundColor: color }} aria-hidden>
      {size !== "sm" && (
        <>
          <span className={styles.title}>{book.title}</span>
          {book.authors[0] && <span className={styles.author}>{book.authors[0]}</span>}
        </>
      )}
    </div>
  );
}
