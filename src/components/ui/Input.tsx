import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import styles from "./Input.module.css";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode;
  /** Contenido a la derecha, p. ej. un atajo de teclado. */
  end?: ReactNode;
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { icon, end, invalid, className, ...props },
  ref,
) {
  return (
    <div className={[styles.field, invalid && styles.invalid, className].filter(Boolean).join(" ")}>
      {icon && <span className={styles.icon}>{icon}</span>}
      <input ref={ref} className={styles.input} aria-invalid={invalid || undefined} {...props} />
      {end && <span className={styles.end}>{end}</span>}
    </div>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, className, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={[styles.field, styles.textarea, invalid && styles.invalid, className].filter(Boolean).join(" ")}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
});

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className={styles.kbd}>{children}</kbd>;
}
