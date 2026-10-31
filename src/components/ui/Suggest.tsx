import { X } from "lucide-react";
import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { fold } from "../../lib/text";
import styles from "./Suggest.module.css";

const MAX_OPTIONS = 8;

interface Option {
  value: string;
  label: ReactNode;
}

/** Sugerencias que contienen lo escrito, sin distinguir acentos; primero las que empiezan igual. */
function match(options: string[], query: string, exclude: string[] = []): string[] {
  const q = fold(query);
  const excluded = new Set(exclude.map(fold));
  const pool = options.filter((o) => !excluded.has(fold(o)));
  if (!q) return pool.slice(0, MAX_OPTIONS);
  const starts: string[] = [];
  const contains: string[] = [];
  for (const o of pool) {
    const f = fold(o);
    if (f.startsWith(q)) starts.push(o);
    else if (f.includes(q)) contains.push(o);
  }
  return [...starts, ...contains].slice(0, MAX_OPTIONS);
}

interface ListProps {
  id: string;
  anchor: RefObject<HTMLElement | null>;
  options: Option[];
  active: number;
  onPick: (value: string) => void;
  onHover: (index: number) => void;
}

/**
 * Lista de sugerencias bajo el campo. Se pinta con posición fija dentro del
 * propio formulario (no en un portal): así el diálogo no la toma por un clic
 * fuera y no la recorta su scroll.
 */
function SuggestList({ id, anchor, options, active, onPick, onHover }: ListProps) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    const update = () => setRect(anchor.current?.getBoundingClientRect() ?? null);
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchor]);

  if (!rect || options.length === 0) return null;
  const below = window.innerHeight - rect.bottom;
  const flip = below < 200 && rect.top > below;
  return (
    <ul
      id={id}
      role="listbox"
      className={styles.list}
      data-side={flip ? "top" : "bottom"}
      style={{
        left: rect.left,
        width: rect.width,
        ...(flip ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      }}
      // Que el clic no quite el foco al campo.
      onMouseDown={(e) => e.preventDefault()}
    >
      {options.map((option, i) => (
        <li
          key={option.value + i}
          id={`${id}-${i}`}
          role="option"
          aria-selected={i === active}
          className={styles.option}
          onMouseMove={() => i !== active && onHover(i)}
          onClick={() => onPick(option.value)}
        >
          {option.label}
        </li>
      ))}
    </ul>
  );
}

/** Teclado común: flechas para moverse, Enter para elegir, Escape para cerrar. */
function useListKeys(count: number, open: boolean, setOpen: (open: boolean) => void) {
  const [active, setActive] = useState(-1);
  const onKeyDown = (e: KeyboardEvent, pick: (index: number) => boolean) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (count === 0) return;
      e.preventDefault();
      setOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => (a + step + count) % count);
    } else if (e.key === "Enter") {
      if (pick(open ? active : -1)) e.preventDefault();
    } else if (e.key === "Escape" && open && count > 0) {
      // Cierra solo la lista, no el diálogo que la contiene.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };
  return { active, setActive, onKeyDown };
}

interface SuggestInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  invalid?: boolean;
  onBlur?: () => void;
}

/** Texto libre con sugerencias de lo que ya existe (categoría, serie, idioma…). */
export function SuggestInput({ id, value, onChange, suggestions, placeholder, invalid, onBlur }: SuggestInputProps) {
  const listId = useId();
  const fieldRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  // Si lo escrito ya es exactamente una opción, no hace falta sugerir nada.
  const matches = useMemo(
    () => match(suggestions, value).filter((s) => fold(s) !== fold(value)),
    [suggestions, value],
  );
  const keys = useListKeys(matches.length, open, setOpen);
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };
  const show = open && matches.length > 0;

  return (
    <div ref={fieldRef} className={`${styles.field} ${invalid ? styles.invalid : ""}`}>
      <input
        id={id}
        className={styles.input}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={show && keys.active >= 0 ? `${listId}-${keys.active}` : undefined}
        aria-invalid={invalid || undefined}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          keys.setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          onBlur?.();
        }}
        onKeyDown={(e) =>
          keys.onKeyDown(e, (i) => {
            if (i < 0 || !matches[i]) return false;
            pick(matches[i]);
            return true;
          })
        }
      />
      {show && (
        <SuggestList
          id={listId}
          anchor={fieldRef}
          options={matches.map((m) => ({ value: m, label: m }))}
          active={keys.active}
          onPick={pick}
          onHover={keys.setActive}
        />
      )}
    </div>
  );
}

interface TokenInputProps {
  id?: string;
  value: string[];
  onChange: (value: string[]) => void;
  suggestions: string[];
  placeholder?: string;
  invalid?: boolean;
  /** Cómo pintar cada elemento elegido. */
  renderToken?: (name: string) => ReactNode;
  /** La coma también confirma (para etiquetas; no para nombres de persona). */
  commaCommits?: boolean;
  removeLabel: (name: string) => string;
  onBlur?: () => void;
}

/**
 * Lista de nombres: se escribe y Enter lo añade (o elige la sugerencia
 * resaltada). Si no existe, se ofrece crearlo. Retroceso en vacío quita el último.
 */
export function TokenInput({
  id,
  value,
  onChange,
  suggestions,
  placeholder,
  invalid,
  renderToken,
  commaCommits,
  removeLabel,
  onBlur,
}: TokenInputProps) {
  const listId = useId();
  const fieldRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  // Varias altas seguidas (p. ej. "a, b, c" pegado de golpe) ocurren antes de
  // que React vuelva a pintar: se trabaja siempre sobre la última lista.
  const latest = useRef(value);
  latest.current = value;

  const trimmed = text.trim().replace(/\s+/g, " ");
  const options = useMemo<Option[]>(() => {
    const found = match(suggestions, trimmed, value);
    const exists =
      suggestions.some((s) => fold(s) === fold(trimmed)) || value.some((v) => fold(v) === fold(trimmed));
    const list: Option[] = found.map((f) => ({ value: f, label: f }));
    if (trimmed && !exists) {
      list.push({
        value: trimmed,
        label: (
          <>
            <span className={styles.create}>Crear</span> «{trimmed}»
          </>
        ),
      });
    }
    return list;
  }, [suggestions, trimmed, value]);
  const keys = useListKeys(options.length, open, setOpen);

  const add = (name: string) => {
    const clean = name.trim().replace(/\s+/g, " ");
    if (!clean) return;
    // Si ya existe con otra grafía, se usa la existente.
    const known = suggestions.find((s) => fold(s) === fold(clean)) ?? clean;
    if (!latest.current.some((v) => fold(v) === fold(known))) {
      latest.current = [...latest.current, known];
      onChange(latest.current);
    }
    setText("");
    keys.setActive(-1);
  };
  const remove = (name: string) => {
    latest.current = latest.current.filter((v) => v !== name);
    onChange(latest.current);
  };

  const show = open && trimmed.length > 0 && options.length > 0;

  return (
    <div
      ref={fieldRef}
      className={`${styles.field} ${styles.tokens} ${invalid ? styles.invalid : ""}`}
      onClick={() => inputRef.current?.focus()}
    >
      {value.map((name) => (
        <span key={name} className={styles.token}>
          {renderToken ? renderToken(name) : name}
          <button
            type="button"
            className={styles.remove}
            aria-label={removeLabel(name)}
            onClick={(e) => {
              e.stopPropagation();
              remove(name);
            }}
          >
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        id={id}
        className={styles.input}
        value={text}
        placeholder={value.length ? undefined : placeholder}
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={show && keys.active >= 0 ? `${listId}-${keys.active}` : undefined}
        aria-invalid={invalid || undefined}
        onChange={(e) => {
          let next = e.target.value;
          if (commaCommits && next.includes(",")) {
            next.split(",").slice(0, -1).forEach(add);
            next = next.slice(next.lastIndexOf(",") + 1);
          }
          setText(next);
          setOpen(true);
          // Resalta la primera opción: Enter la elige sin más.
          keys.setActive(next.trim() ? 0 : -1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Lo escrito y no confirmado no se pierde al salir del campo.
          if (trimmed) add(trimmed);
          setOpen(false);
          onBlur?.();
        }}
        onKeyDown={(e) => {
          if (e.key === "Backspace" && !text && value.length) {
            remove(value[value.length - 1]);
            return;
          }
          keys.onKeyDown(e, (i) => {
            if (i >= 0 && options[i]) add(options[i].value);
            else if (trimmed) add(trimmed);
            else return false;
            return true;
          });
        }}
      />
      {show && (
        <SuggestList
          id={listId}
          anchor={fieldRef}
          options={options}
          active={keys.active}
          onPick={add}
          onHover={keys.setActive}
        />
      )}
    </div>
  );
}
