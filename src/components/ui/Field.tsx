import { Star } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./Field.module.css";

interface FieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

/** Etiqueta + control + error (o ayuda). El error sustituye a la ayuda. */
export function Field({ label, htmlFor, error, hint, required, className, children }: FieldProps) {
  return (
    <div className={[styles.field, className].filter(Boolean).join(" ")}>
      <label className={styles.label} htmlFor={htmlFor}>
        {label}
        {required && <span className={styles.required}>*</span>}
      </label>
      {children}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : (
        hint && <p className={styles.hint}>{hint}</p>
      )}
    </div>
  );
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

/** Elección única entre pocas opciones, todas a la vista. */
export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <div className={styles.segmented} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={styles.segment}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

interface StarRatingProps {
  value: number | null;
  onChange: (value: number | null) => void;
  label: string;
}

/** Valoración de 1 a 5. Pulsar la estrella marcada la quita. */
export function StarRating({ value, onChange, label }: StarRatingProps) {
  return (
    <div className={styles.stars} role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} de 5`}
          className={styles.star}
          data-on={value != null && n <= value}
          onClick={() => onChange(value === n ? null : n)}
        >
          <Star size={18} />
        </button>
      ))}
    </div>
  );
}
