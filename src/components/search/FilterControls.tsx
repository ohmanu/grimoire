import { Check, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { fold } from "../../lib/text";
import { Input } from "../ui/Input";
import styles from "./FilterControls.module.css";

export interface CheckOption<T> {
  value: T;
  label: string;
  count?: number;
}

interface ChecklistProps<T> {
  options: CheckOption<T>[];
  selected: T[];
  onChange: (selected: T[]) => void;
  emptyText: string;
}

/** Lista de casillas con buscador si hay muchas opciones. Las elegidas van primero. */
export function Checklist<T extends string | number>({ options, selected, onChange, emptyText }: ChecklistProps<T>) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = fold(query);
    const matches = q ? options.filter((o) => fold(o.label).includes(q)) : options;
    return [...matches.filter((o) => selected.includes(o.value)), ...matches.filter((o) => !selected.includes(o.value))];
  }, [options, selected, query]);

  const toggle = (value: T) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);

  if (options.length === 0) return <p className={styles.empty}>{emptyText}</p>;
  return (
    <div className={styles.checklist}>
      {options.length > 8 && (
        <div className={styles.search}>
          <Input icon={<Search />} placeholder="Buscar…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
        </div>
      )}
      <ul className={styles.options} role="group">
        {shown.map((o) => {
          const on = selected.includes(o.value);
          return (
            <li key={String(o.value)}>
              <button type="button" role="checkbox" aria-checked={on} className={styles.option} onClick={() => toggle(o.value)}>
                <span className={styles.box} data-on={on}>
                  {on && <Check size={12} strokeWidth={3} />}
                </span>
                <span className={styles.label}>{o.label}</span>
                {o.count !== undefined && <span className={styles.count}>{o.count}</span>}
              </button>
            </li>
          );
        })}
        {shown.length === 0 && <li className={styles.empty}>Sin coincidencias</li>}
      </ul>
    </div>
  );
}

interface RangeProps {
  min: number | null;
  max: number | null;
  onChange: (min: number | null, max: number | null) => void;
  placeholder: [string, string];
}

/** Desde–hasta con enteros. Lo que no es un número no se aplica (y se marca). */
export function Range({ min, max, onChange, placeholder }: RangeProps) {
  const [from, setFrom] = useState(min?.toString() ?? "");
  const [to, setTo] = useState(max?.toString() ?? "");
  // Si se limpian desde fuera, los campos también.
  useEffect(() => setFrom(min?.toString() ?? ""), [min]);
  useEffect(() => setTo(max?.toString() ?? ""), [max]);

  const parse = (s: string) => (s.trim() === "" ? null : /^-?\d+$/.test(s.trim()) ? Number(s.trim()) : NaN);
  const apply = (nextFrom: string, nextTo: string) => {
    const [a, b] = [parse(nextFrom), parse(nextTo)];
    if (!Number.isNaN(a) && !Number.isNaN(b)) onChange(a, b);
  };

  return (
    <div className={styles.range}>
      <Input
        inputMode="numeric"
        placeholder={placeholder[0]}
        aria-label={placeholder[0]}
        value={from}
        invalid={Number.isNaN(parse(from))}
        onChange={(e) => {
          setFrom(e.target.value);
          apply(e.target.value, to);
        }}
        autoFocus
      />
      <span className={styles.dash}>–</span>
      <Input
        inputMode="numeric"
        placeholder={placeholder[1]}
        aria-label={placeholder[1]}
        value={to}
        invalid={Number.isNaN(parse(to))}
        onChange={(e) => {
          setTo(e.target.value);
          apply(from, e.target.value);
        }}
      />
    </div>
  );
}

interface RadioListProps<T> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

export function RadioList<T extends string | number | null>({ options, value, onChange }: RadioListProps<T>) {
  return (
    <ul className={styles.options} role="radiogroup">
      {options.map((o) => (
        <li key={String(o.value)}>
          <button
            type="button"
            role="radio"
            aria-checked={value === o.value}
            className={styles.option}
            onClick={() => onChange(o.value)}
          >
            <span className={styles.radio} data-on={value === o.value} />
            <span className={styles.label}>{o.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
