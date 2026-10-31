import styles from "./Sigil.module.css";

interface SigilProps {
  name: string;
  count?: number;
  size?: "sm" | "md";
}

/** Chip de un sigil. El rombo es su marca: la misma en toda la app. */
export function Sigil({ name, count, size = "sm" }: SigilProps) {
  return (
    <span className={`${styles.sigil} ${styles[size]}`}>
      <span className={styles.glyph} aria-hidden />
      <span className={styles.name}>{name}</span>
      {count !== undefined && <span className={styles.count}>{count}</span>}
    </span>
  );
}
