import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { api, coverSrc, isApiError, type Book, type BookInput, type Format, type Status } from "../../lib/api";
import { playSigilAdded } from "../../lib/sound";
import { t } from "../../lib/strings";
import {
  SYNOPSIS_MAX_CHARS,
  SYNOPSIS_MAX_LINES,
  synopsisLines,
  validateBook,
  type Errors,
} from "../../lib/validate";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Field, Segmented, StarRating } from "../ui/Field";
import { Input, Kbd, Textarea } from "../ui/Input";
import { Sigil } from "../ui/Sigil";
import { SuggestInput, TokenInput } from "../ui/Suggest";
import { CoverPicker, type CoverChange } from "./CoverPicker";
import styles from "./BookForm.module.css";

export interface Suggestions {
  authors: string[];
  categories: string[];
  series: string[];
  sigils: string[];
  languages: string[];
  publishers: string[];
}

/** Estado del formulario: los números como texto, tal y como se escriben. */
interface FormState {
  title: string;
  subtitle: string;
  authors: string[];
  category: string;
  series: string;
  seriesNumber: string;
  publisher: string;
  year: string;
  isbn: string;
  language: string;
  pages: string;
  format: Format;
  status: Status;
  rating: number | null;
  location: string;
  synopsis: string;
  notes: string;
  lentTo: string;
  lentAt: string;
  sigils: string[];
}

type Key = keyof FormState;

const text = (v: string | number | null | undefined) => (v == null ? "" : String(v));

function fromBook(book: Book | null): FormState {
  return {
    title: text(book?.title),
    subtitle: text(book?.subtitle),
    authors: book?.authors ?? [],
    category: text(book?.category),
    series: text(book?.series),
    seriesNumber: text(book?.seriesNumber),
    publisher: text(book?.publisher),
    year: text(book?.year),
    isbn: text(book?.isbn),
    language: book ? text(book.language) : "Español",
    pages: text(book?.pages),
    format: book?.format ?? "fisico",
    status: book?.status ?? "pendiente",
    rating: book?.rating ?? null,
    location: text(book?.location),
    synopsis: text(book?.synopsis),
    notes: text(book?.notes),
    lentTo: text(book?.lentTo),
    lentAt: text(book?.lentAt),
    sigils: book?.sigils ?? [],
  };
}

/** Texto vacío → null; si no es un número, NaN (y la validación lo marca). */
function num(value: string): number | null {
  const v = value.trim().replace(",", ".");
  return v ? Number(v) : null;
}

function toInput(s: FormState): BookInput {
  const opt = (v: string) => (v.trim() ? v : null);
  return {
    title: s.title,
    subtitle: opt(s.subtitle),
    authors: s.authors,
    category: opt(s.category),
    series: opt(s.series),
    seriesNumber: num(s.seriesNumber),
    publisher: opt(s.publisher),
    year: num(s.year),
    isbn: opt(s.isbn),
    language: opt(s.language),
    pages: num(s.pages),
    format: s.format,
    status: s.status,
    rating: s.rating,
    location: opt(s.location),
    synopsis: opt(s.synopsis),
    notes: opt(s.notes),
    lentTo: opt(s.lentTo),
    lentAt: s.lentTo.trim() ? opt(s.lentAt) : null,
    sigils: s.sigils,
  };
}

// Orden en el que se recorren los errores para llevar el foco al primero.
const FIELD_ORDER: Key[] = [
  "title",
  "subtitle",
  "authors",
  "category",
  "language",
  "series",
  "seriesNumber",
  "publisher",
  "year",
  "pages",
  "isbn",
  "synopsis",
  "sigils",
  "location",
  "lentTo",
  "lentAt",
  "notes",
];

interface BookFormProps {
  open: boolean;
  /** null para un libro nuevo. */
  book: Book | null;
  suggestions: Suggestions;
  onClose: () => void;
  onSaved: (book: Book) => void;
}

export function BookForm({ open, book, suggestions, onClose, onSaved }: BookFormProps) {
  const [initial, setInitial] = useState(() => fromBook(book));
  const [state, setState] = useState(initial);
  const [cover, setCover] = useState<CoverChange>({ kind: "keep" });
  const [coverError, setCoverError] = useState<string>();
  const [touched, setTouched] = useState<Set<Key>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Cada vez que se abre, se parte del libro (o de cero).
  useEffect(() => {
    if (!open) return;
    const fresh = fromBook(book);
    setInitial(fresh);
    setState(fresh);
    setCover({ kind: "keep" });
    setCoverError(undefined);
    setTouched(new Set());
    setSubmitted(false);
    setServerErrors({});
    setSaving(false);
    setConfirmDiscard(false);
  }, [open, book]);

  const input = useMemo(() => toInput(state), [state]);
  const clientErrors = useMemo(() => validateBook(input), [input]);
  const dirty = cover.kind !== "keep" || JSON.stringify(state) !== JSON.stringify(initial);

  const errorFor = (key: Key): string | undefined =>
    serverErrors[key] ?? (submitted || touched.has(key) ? clientErrors[key] : undefined);

  const set = <K extends Key>(key: K, value: FormState[K]) => {
    setState((s) => ({ ...s, [key]: value }));
    setConfirmDiscard(false);
    if (serverErrors[key]) setServerErrors(({ [key]: _, ...rest }) => rest);
  };
  const touch = (key: Key) => () => setTouched((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));

  const requestClose = () => {
    if (saving) return;
    if (dirty && !confirmDiscard) setConfirmDiscard(true);
    else onClose();
  };

  const focusFirstError = (errors: Errors) => {
    const first = FIELD_ORDER.find((k) => errors[k]);
    if (first) formRef.current?.querySelector<HTMLElement>(`#bf-${first}`)?.focus();
  };

  const submit = async () => {
    if (saving) return;
    setSubmitted(true);
    if (Object.keys(clientErrors).length) {
      focusFirstError(clientErrors);
      return;
    }
    setSaving(true);
    try {
      let saved = book ? await api.updateBook(book.id, input) : await api.createBook(input);
      // El libro ya está guardado; si la portada falla, se avisa sin perder lo demás.
      try {
        if (cover.kind === "set") saved = await api.setCover(saved.id, cover.image.base64);
        else if (cover.kind === "remove" && saved.cover) saved = await api.removeCover(saved.id);
      } catch (err) {
        toast.error("El libro se ha guardado, pero la portada no", {
          description: isApiError(err) ? err.message : String(err),
        });
      }
      onSaved(saved);
    } catch (err) {
      if (isApiError(err) && err.kind === "validation") {
        const errors = Object.fromEntries(err.fields.map((f) => [f.field, f.message])) as Errors;
        setServerErrors(errors);
        focusFirstError(errors);
      } else {
        toast.error(t.saveError, { description: isApiError(err) ? err.message : String(err) });
      }
    } finally {
      setSaving(false);
    }
  };

  const lines = synopsisLines(state.synopsis);
  const synopsisChars = [...state.synopsis.trim()].length;

  const field = (key: Key, label: string, control: ReactNode, extra: { hint?: ReactNode; required?: boolean; className?: string } = {}) => (
    <Field label={label} htmlFor={`bf-${key}`} error={errorFor(key)} {...extra}>
      {control}
    </Field>
  );

  const textInput = (key: Key, props: { placeholder?: string; inputMode?: "numeric" | "decimal"; type?: string } = {}) => (
    <Input
      id={`bf-${key}`}
      value={state[key] as string}
      onChange={(e) => set(key, e.target.value as never)}
      onBlur={touch(key)}
      invalid={!!errorFor(key)}
      autoComplete="off"
      {...props}
    />
  );

  const suggestInput = (key: Key, options: string[], placeholder?: string) => (
    <SuggestInput
      id={`bf-${key}`}
      value={state[key] as string}
      onChange={(v) => set(key, v as never)}
      onBlur={touch(key)}
      suggestions={options}
      placeholder={placeholder}
      invalid={!!errorFor(key)}
    />
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? undefined : requestClose())}
      title={book ? t.editBook : t.newBook}
      width={820}
      footer={
        confirmDiscard ? (
          <div className={styles.confirm}>
            <span>{t.unsavedChanges}</span>
            <Button onClick={() => setConfirmDiscard(false)}>{t.keepEditing}</Button>
            <Button variant="danger" onClick={onClose}>
              {t.discard}
            </Button>
          </div>
        ) : (
          <>
            <span className={styles.shortcut}>
              <Kbd>Ctrl</Kbd> <Kbd>Enter</Kbd> {t.toSave}
            </span>
            <Button onClick={requestClose} disabled={saving}>
              {t.cancel}
            </Button>
            <Button variant="primary" type="submit" form="book-form" disabled={saving}>
              {saving ? t.saving : book ? t.saveChanges : t.addBook}
            </Button>
          </>
        )
      }
    >
      <form
        id="book-form"
        ref={formRef}
        className={styles.form}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            submit();
          }
        }}
      >
        <div className={styles.top}>
          <CoverPicker
            title={state.title}
            authors={state.authors}
            current={book ? coverSrc(book) : null}
            change={cover}
            onChange={(c) => {
              setCover(c);
              setConfirmDiscard(false);
            }}
            error={coverError ?? serverErrors.cover}
            onError={setCoverError}
          />

          <div className={styles.main}>
            {field(
              "title",
              t.fields.title,
              <Input
                id="bf-title"
                value={state.title}
                onChange={(e) => set("title", e.target.value)}
                onBlur={touch("title")}
                invalid={!!errorFor("title")}
                autoComplete="off"
                autoFocus
                className={styles.title}
              />,
              { required: true },
            )}
            {field("subtitle", t.fields.subtitle, textInput("subtitle"))}
            {field(
              "authors",
              t.fields.authors,
              <TokenInput
                id="bf-authors"
                value={state.authors}
                onChange={(v) => set("authors", v)}
                onBlur={touch("authors")}
                suggestions={suggestions.authors}
                placeholder={t.authorsPlaceholder}
                removeLabel={(n) => `Quitar ${n}`}
                invalid={!!errorFor("authors")}
              />,
            )}
            <div className={styles.row}>
              {field("category", t.fields.category, suggestInput("category", suggestions.categories, "Novela, Ensayo…"))}
              {field("language", t.fields.language, suggestInput("language", suggestions.languages))}
            </div>
            <div className={`${styles.row} ${styles.seriesRow}`}>
              {field("series", t.fields.series, suggestInput("series", suggestions.series))}
              {field("seriesNumber", t.fields.seriesNumber, textInput("seriesNumber", { inputMode: "decimal" }))}
            </div>
          </div>
        </div>

        <div className={`${styles.row} ${styles.editionRow}`}>
          {field("publisher", t.fields.publisher, suggestInput("publisher", suggestions.publishers))}
          {field("year", t.fields.year, textInput("year", { inputMode: "numeric" }))}
          {field("pages", t.fields.pages, textInput("pages", { inputMode: "numeric" }))}
          {field("isbn", t.fields.isbn, textInput("isbn", { placeholder: "978-…" }))}
        </div>

        {field(
          "synopsis",
          t.fields.synopsis,
          <Textarea
            id="bf-synopsis"
            rows={SYNOPSIS_MAX_LINES}
            value={state.synopsis}
            onChange={(e) => set("synopsis", e.target.value)}
            onBlur={touch("synopsis")}
            invalid={!!errorFor("synopsis")}
            className={styles.synopsis}
          />,
          {
            hint: (
              <span className={styles.counter}>
                <span data-over={lines > SYNOPSIS_MAX_LINES}>
                  {lines}/{SYNOPSIS_MAX_LINES} líneas
                </span>
                {" · "}
                <span data-over={synopsisChars > SYNOPSIS_MAX_CHARS}>
                  {synopsisChars}/{SYNOPSIS_MAX_CHARS}
                </span>
              </span>
            ),
          },
        )}

        {field(
          "sigils",
          t.sigils,
          <TokenInput
            id="bf-sigils"
            value={state.sigils}
            onChange={(v) => set("sigils", v)}
            onBlur={touch("sigils")}
            suggestions={suggestions.sigils}
            placeholder={t.sigilsPlaceholder}
            renderToken={(name) => <Sigil name={name} size="md" />}
            removeLabel={(n) => `Quitar el sigil ${n}`}
            onAdd={playSigilAdded}
            commaCommits
            invalid={!!errorFor("sigils")}
          />,
          { hint: t.sigilsHint },
        )}

        <div className={`${styles.row} ${styles.statusRow}`}>
          <Field label={t.fields.status}>
            <Segmented
              label={t.fields.status}
              value={state.status}
              onChange={(v) => set("status", v)}
              options={(["pendiente", "leyendo", "leido"] as const).map((v) => ({ value: v, label: t.status[v] }))}
            />
          </Field>
          <Field label={t.fields.format}>
            <Segmented
              label={t.fields.format}
              value={state.format}
              onChange={(v) => set("format", v)}
              options={(["fisico", "ebook", "audio"] as const).map((v) => ({ value: v, label: t.format[v] }))}
            />
          </Field>
          <Field label={t.fields.rating}>
            <StarRating label={t.fields.rating} value={state.rating} onChange={(v) => set("rating", v)} />
          </Field>
        </div>

        <div className={`${styles.row} ${styles.loanRow}`}>
          {field("location", t.fields.location, textInput("location", { placeholder: "Salón, balda 2…" }))}
          {field("lentTo", t.fields.lentTo, textInput("lentTo", { placeholder: t.lentToPlaceholder }))}
          {state.lentTo.trim() && field("lentAt", t.fields.lentAt, textInput("lentAt", { type: "date" }))}
        </div>

        {field(
          "notes",
          t.fields.notes,
          <Textarea
            id="bf-notes"
            rows={3}
            value={state.notes}
            onChange={(e) => set("notes", e.target.value)}
            onBlur={touch("notes")}
            invalid={!!errorFor("notes")}
          />,
        )}
      </form>
    </Dialog>
  );
}
