import type { Format, SearchQuery, SigilMode, Sort, Status } from "./api";

/** Lo que el usuario ha elegido en el buscador (sin la sección de la barra lateral). */
export interface Filters {
  text: string;
  formats: Format[];
  categoryIds: number[];
  authorIds: number[];
  seriesIds: number[];
  publishers: string[];
  languages: string[];
  yearMin: number | null;
  yearMax: number | null;
  pagesMin: number | null;
  pagesMax: number | null;
  ratingMin: number | null;
  location: string;
  sigilIds: number[];
  sigilMode: SigilMode;
  sort: Sort;
  descending: boolean;
}

export type Section = "all" | Status | "lent" | "trash";

export const EMPTY_FILTERS: Filters = {
  text: "",
  formats: [],
  categoryIds: [],
  authorIds: [],
  seriesIds: [],
  publishers: [],
  languages: [],
  yearMin: null,
  yearMax: null,
  pagesMin: null,
  pagesMax: null,
  ratingMin: null,
  location: "",
  sigilIds: [],
  sigilMode: "all",
  sort: "title",
  descending: false,
};

const STORAGE_KEY = "grimoire.filters.v1";
const FORMATS: Format[] = ["fisico", "ebook", "audio"];
const SORTS: Sort[] = ["title", "author", "year", "added", "rating"];

const intList = (v: unknown) =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is number => Number.isSafeInteger(x)))] : [];
const strList = (v: unknown) =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.trim() !== ""))] : [];
const intOrNull = (v: unknown) => (Number.isSafeInteger(v) ? (v as number) : null);

/**
 * Filtros guardados de la sesión anterior. Lo que no tenga la forma esperada
 * se descarta campo a campo: un dato corrupto nunca rompe el arranque.
 */
export function parseFilters(raw: unknown): Filters {
  if (typeof raw !== "object" || raw === null) return { ...EMPTY_FILTERS };
  const r = raw as Record<string, unknown>;
  const rating = intOrNull(r.ratingMin);
  return {
    ...EMPTY_FILTERS,
    formats: strList(r.formats).filter((f): f is Format => FORMATS.includes(f as Format)),
    categoryIds: intList(r.categoryIds),
    authorIds: intList(r.authorIds),
    seriesIds: intList(r.seriesIds),
    publishers: strList(r.publishers),
    languages: strList(r.languages),
    yearMin: intOrNull(r.yearMin),
    yearMax: intOrNull(r.yearMax),
    pagesMin: intOrNull(r.pagesMin),
    pagesMax: intOrNull(r.pagesMax),
    ratingMin: rating != null && rating >= 1 && rating <= 5 ? rating : null,
    location: typeof r.location === "string" ? r.location : "",
    sigilIds: intList(r.sigilIds),
    sigilMode: r.sigilMode === "any" ? "any" : "all",
    sort: SORTS.includes(r.sort as Sort) ? (r.sort as Sort) : "title",
    descending: r.descending === true,
  };
}

export function loadFilters(): Filters {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? parseFilters(JSON.parse(stored)) : { ...EMPTY_FILTERS };
  } catch {
    return { ...EMPTY_FILTERS };
  }
}

/** El texto buscado no se guarda: al volver, se empieza con el buscador vacío. */
export function saveFilters(filters: Filters) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...filters, text: "" }));
  } catch {
    // Sin almacenamiento local, los filtros simplemente no se recuerdan.
  }
}

export function toQuery(filters: Filters, section: Section): SearchQuery {
  const statuses: Status[] = section === "pendiente" || section === "leyendo" || section === "leido" ? [section] : [];
  return {
    ...filters,
    statuses,
    lent: section === "lent" ? true : null,
  };
}

/** Cuántos filtros de campo hay activos (sin contar texto, sigils ni orden). */
export function activeFieldFilters(f: Filters): number {
  return [
    f.formats.length > 0,
    f.categoryIds.length > 0,
    f.authorIds.length > 0,
    f.seriesIds.length > 0,
    f.publishers.length > 0,
    f.languages.length > 0,
    f.yearMin != null || f.yearMax != null,
    f.pagesMin != null || f.pagesMax != null,
    f.ratingMin != null,
    f.location.trim() !== "",
  ].filter(Boolean).length;
}

export function clearFieldFilters(f: Filters): Filters {
  return { ...EMPTY_FILTERS, text: f.text, sigilIds: f.sigilIds, sigilMode: f.sigilMode, sort: f.sort, descending: f.descending };
}

/**
 * Quita ids que ya no existen (p. ej. un autor que desapareció al borrar su
 * último libro). Si no cambia nada devuelve el mismo objeto, para no
 * provocar una búsqueda de más.
 */
export function pruneFilters(f: Filters, known: { categories: number[]; authors: number[]; series: number[]; sigils: number[] }): Filters {
  const keep = (ids: number[], valid: number[]) => {
    const set = new Set(valid);
    const next = ids.filter((id) => set.has(id));
    return next.length === ids.length ? ids : next;
  };
  const next = {
    ...f,
    categoryIds: keep(f.categoryIds, known.categories),
    authorIds: keep(f.authorIds, known.authors),
    seriesIds: keep(f.seriesIds, known.series),
    sigilIds: keep(f.sigilIds, known.sigils),
  };
  const changed =
    next.categoryIds !== f.categoryIds ||
    next.authorIds !== f.authorIds ||
    next.seriesIds !== f.seriesIds ||
    next.sigilIds !== f.sigilIds;
  return changed ? next : f;
}
