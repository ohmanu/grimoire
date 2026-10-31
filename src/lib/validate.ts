import type { BookInput } from "./api";

// Validación inmediata en el formulario. Repite las reglas de
// src-tauri/src/validate.rs para avisar mientras se escribe; la del backend
// sigue siendo la que manda.

export const SYNOPSIS_MAX_LINES = 5;
export const SYNOPSIS_MAX_CHARS = 600;
export const SIGIL_MAX_CHARS = 40;

export type Errors = Partial<Record<keyof BookInput | "cover", string>>;

const LIMITS: [keyof BookInput, number][] = [
  ["title", 300],
  ["subtitle", 300],
  ["category", 80],
  ["series", 200],
  ["publisher", 200],
  ["language", 50],
  ["location", 200],
  ["lentTo", 200],
  ["notes", 5000],
];

const chars = (s: string) => [...s].length;
const filled = (s: string | null | undefined): s is string => !!s && s.trim().length > 0;

export function synopsisLines(text: string): number {
  const trimmed = text.replace(/\r\n?/g, "\n").replace(/^\n+|\n+$/g, "");
  return trimmed ? trimmed.split("\n").length : 0;
}

export function validateBook(b: BookInput): Errors {
  const e: Errors = {};

  if (!filled(b.title)) e.title = "El título es obligatorio";
  for (const [field, max] of LIMITS) {
    const value = b[field];
    if (!e[field] && typeof value === "string" && chars(value.trim()) > max) e[field] = `Máximo ${max} caracteres`;
  }

  if (filled(b.synopsis)) {
    if (synopsisLines(b.synopsis) > SYNOPSIS_MAX_LINES) {
      e.synopsis = `La sinopsis admite como máximo ${SYNOPSIS_MAX_LINES} líneas`;
    } else if (chars(b.synopsis.trim()) > SYNOPSIS_MAX_CHARS) {
      e.synopsis = `Máximo ${SYNOPSIS_MAX_CHARS} caracteres`;
    }
  }

  if (b.sigils.some((s) => chars(s.trim()) > SIGIL_MAX_CHARS)) {
    e.sigils = `Cada nombre admite como máximo ${SIGIL_MAX_CHARS} caracteres`;
  }

  if (b.seriesNumber != null) {
    if (!Number.isFinite(b.seriesNumber) || b.seriesNumber <= 0 || b.seriesNumber > 100_000) {
      e.seriesNumber = "El número en la serie debe ser mayor que 0";
    } else if (!filled(b.series)) {
      e.seriesNumber = "Indica la serie a la que pertenece";
    }
  }
  if (b.year != null && (!Number.isInteger(b.year) || b.year < -3000 || b.year > 2100)) {
    e.year = "El año debe estar entre -3000 y 2100";
  }
  if (b.pages != null && (!Number.isInteger(b.pages) || b.pages < 1 || b.pages > 100_000)) {
    e.pages = "El número de páginas debe ser mayor que 0";
  }
  if (filled(b.isbn) && !isValidIsbn(b.isbn)) {
    e.isbn = "El ISBN no es válido (debe tener 10 o 13 cifras y la de control correcta)";
  }
  if (filled(b.lentTo) && filled(b.lentAt) && !isValidDate(b.lentAt.trim())) {
    e.lentAt = "La fecha de préstamo debe tener el formato AAAA-MM-DD";
  }
  return e;
}

export function isValidIsbn(raw: string): boolean {
  const s = raw.replace(/[\s-]/g, "").toUpperCase();
  if (/^\d{9}[\dX]$/.test(s)) {
    const sum = [...s].reduce((acc, c, i) => acc + (c === "X" ? 10 : Number(c)) * (10 - i), 0);
    return sum % 11 === 0;
  }
  if (/^\d{13}$/.test(s)) {
    const sum = [...s].reduce((acc, c, i) => acc + Number(c) * (i % 2 === 0 ? 1 : 3), 0);
    return sum % 10 === 0;
  }
  return false;
}

export function isValidDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}
