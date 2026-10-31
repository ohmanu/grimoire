import type { ReactNode } from "react";
import { RoodEmblem } from "../ui/RoodEmblem";
import styles from "./EmptyState.module.css";

interface EmptyStateProps {
  title: string;
  body: string;
  action?: ReactNode;
  /** false para estados frecuentes (p. ej. "sin resultados"), que no se animan. */
  animate?: boolean;
}

export function EmptyState({ title, body, action, animate = true }: EmptyStateProps) {
  return (
    <div className={`${styles.empty} ${animate ? styles.animated : ""}`}>
      <RoodEmblem size={88} className={styles.circle} />
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.body}>{body}</p>
      {action}
    </div>
  );
}
