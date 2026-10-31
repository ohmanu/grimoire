import { useState } from "react";
import { coverSrc, type Book } from "../../lib/api";
import { hashIndex } from "../../lib/text";
import styles from "./Cover.module.css";

// Tonos de encuadernación. El color sale del título, así que cada libro
// conserva siempre el suyo.
const BINDINGS = ["#7b2232", "#28405f", "#3f5b3a", "#8a6a2c", "#4b4757", "#5e3552", "#2f5557"];

export function bindingColor(title: string): string {
  return BINDINGS[hashIndex(title, BINDINGS.length)];
}

interface CoverProps {
  book: Pick<Book, "title" | "authors"> & Partial<Pick<Book, "cover">>;
  size: "sm" | "md" | "lg";
  /** Imagen ya resuelta (p. ej. la recién elegida en el formulario). */
  src?: string | null;
}

/**
 * La portada del libro con su propia forma, sin recortes ni bandas; o, si no
 * tiene (o no carga), un lomo de tela con el título.
 */
export function Cover({ book, size, src: given }: CoverProps) {
  const src = given !== undefined ? given : book.cover ? coverSrc({ cover: book.cover }) : null;
  const [failed, setFailed] = useState<string | null>(null);
  const color = bindingColor(book.title);

  if (src && failed !== src) {
    return (
      <div className={`${styles[size]} ${styles.slot}`} aria-hidden>
        <img
          src={src}
          alt=""
          className={styles.image}
          data-cover-face
          loading="lazy"
          draggable={false}
          onError={() => setFailed(src)}
        />
      </div>
    );
  }

  return (
    <div className={`${styles.cover} ${styles[size]}`} style={{ backgroundColor: color }} data-cover-face aria-hidden>
      {size !== "sm" && (
        <>
          <span className={styles.title}>{book.title}</span>
          {book.authors[0] && <span className={styles.author}>{book.authors[0]}</span>}
        </>
      )}
    </div>
  );
}
