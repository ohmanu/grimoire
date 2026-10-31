import type { ApiError, Book, BookInput, NamedCount, SearchQuery } from "./api";
import { fold } from "./text";
import { validateBook } from "./validate";

// Backend simulado para abrir la interfaz en un navegador normal durante el
// desarrollo (sin Tauri). Nunca se incluye en la app final: solo se importa
// cuando import.meta.env.DEV es cierto. Los cambios viven en memoria.

const stamp = () => new Date().toISOString();

function toBook(id: number, input: Partial<BookInput> & { title: string }, extra: Partial<Book> = {}): Book {
  return {
    id,
    title: input.title.trim(),
    subtitle: input.subtitle || null,
    authors: input.authors ?? [],
    category: input.category || null,
    series: input.series || null,
    seriesNumber: input.seriesNumber ?? null,
    publisher: input.publisher || null,
    year: input.year ?? null,
    isbn: input.isbn ? input.isbn.replace(/[\s-]/g, "").toUpperCase() : null,
    language: input.language === undefined ? "Español" : input.language || null,
    pages: input.pages ?? null,
    format: input.format ?? "fisico",
    status: input.status ?? "pendiente",
    rating: input.rating ?? null,
    location: input.location || null,
    synopsis: input.synopsis || null,
    notes: input.notes || null,
    lentTo: input.lentTo || null,
    lentAt: input.lentTo ? input.lentAt || null : null,
    sigils: [...(input.sigils ?? [])].sort((a, b) => fold(a).localeCompare(fold(b))),
    cover: null,
    createdAt: stamp(),
    updatedAt: stamp(),
    deletedAt: null,
    ...extra,
  };
}

let nextId = 11;
const books: Book[] = [
  toBook(1, {
    title: "El nombre del viento",
    subtitle: "Crónica del asesino de reyes: Primer día",
    authors: ["Patrick Rothfuss"],
    category: "Fantasía",
    series: "Crónica del asesino de reyes",
    seriesNumber: 1,
    publisher: "Plaza & Janés",
    year: 2009,
    isbn: "978-84-376-0494-7",
    pages: 880,
    status: "leido",
    rating: 5,
    location: "Salón, balda 2",
    synopsis:
      "Kvothe, convertido en posadero, cuenta por fin su historia.\nDe niño en una troupe de artistas a estudiante de la Universidad.",
    sigils: ["Épica", "Magia", "Música"],
  }),
  toBook(2, {
    title: "La mano izquierda de la oscuridad",
    authors: ["Ursula K. Le Guin"],
    category: "Ciencia ficción",
    series: "Ciclo de Ekumen",
    seriesNumber: 4,
    year: 1969,
    pages: 304,
    status: "leyendo",
    sigils: ["Clásico", "Política"],
  }),
  toBook(3, {
    title: "Buenos presagios",
    authors: ["Terry Pratchett", "Neil Gaiman"],
    category: "Fantasía",
    year: 1990,
    status: "leido",
    rating: 4,
    sigils: ["Humor", "Fin del mundo"],
    lentTo: "Lucía",
    lentAt: "2026-10-02",
  }),
  toBook(4, {
    title: "Cien años de soledad",
    authors: ["Gabriel García Márquez"],
    category: "Novela",
    year: 1967,
    pages: 471,
    sigils: ["Clásico", "Realismo mágico"],
  }),
  toBook(5, {
    title: "Dune",
    authors: ["Frank Herbert"],
    category: "Ciencia ficción",
    series: "Dune",
    seriesNumber: 1,
    year: 1965,
    format: "ebook",
    status: "leido",
    rating: 5,
    sigils: ["Épica", "Política", "Desierto"],
  }),
  toBook(6, {
    title: "Ficciones",
    authors: ["Jorge Luis Borges"],
    category: "Relatos",
    year: 1944,
    status: "leyendo",
    rating: 5,
    sigils: ["Clásico", "Laberintos"],
  }),
  toBook(7, {
    title: "Solaris",
    authors: ["Stanisław Lem"],
    category: "Ciencia ficción",
    language: "Polaco",
    year: 1961,
    format: "audio",
    sigils: ["Clásico"],
  }),
  toBook(8, {
    title: "El hobbit",
    authors: ["J. R. R. Tolkien"],
    category: "Fantasía",
    year: 1937,
    status: "leido",
    rating: 4,
    sigils: ["Magia", "Aventura"],
    lentTo: "Marcos",
  }),
  toBook(9, { title: "Rayuela", authors: ["Julio Cortázar"], category: "Novela", year: 1963 }),
  toBook(10, { title: "Un libro repetido", authors: ["Anónimo"] }, { deletedAt: stamp() }),
];

function fail(kind: ApiError["kind"], message: string, fields: ApiError["fields"] = []): never {
  const error: ApiError = { kind, message, fields };
  throw error;
}

function find(id: unknown, deleted: boolean): Book {
  const book = books.find((b) => b.id === id && !!b.deletedAt === deleted);
  return book ?? fail("not_found", deleted ? "No se ha encontrado el libro en la papelera" : "No se ha encontrado el libro");
}

function check(input: BookInput) {
  const errors = validateBook(input);
  const fields = Object.entries(errors).map(([field, message]) => ({ field, message })) as ApiError["fields"];
  if (fields.length) fail("validation", "Revisa los campos marcados", fields);
}

/** Reutiliza el nombre ya escrito antes, como hace el backend real. */
function canonical(names: string[], kind: "authors" | "sigils"): string[] {
  const known = new Map(books.flatMap((b) => b[kind]).map((n) => [fold(n), n]));
  const seen = new Set<string>();
  return names
    .map((n) => n.trim())
    .filter((n) => n && !seen.has(fold(n)) && seen.add(fold(n)))
    .map((n) => known.get(fold(n)) ?? n);
}

// Ids estables por nombre, como en la base de datos real.
const registry = new Map<string, number>();
let nextRegistryId = 1;
const idOf = (kind: string, name: string) => {
  const key = `${kind}:${fold(name)}`;
  if (!registry.has(key)) registry.set(key, nextRegistryId++);
  return registry.get(key)!;
};

const namesOf = (b: Book, kind: string): string[] =>
  (kind === "sigils" ? b.sigils : kind === "authors" ? b.authors : [kind === "series" ? b.series : b.category]).filter(
    (n): n is string => !!n,
  );

// Se registran de entrada en orden fijo: así los ids no dependen de qué
// petición llegue antes y sobreviven a una recarga (como en la app real).
for (const kind of ["categories", "authors", "series", "sigils"])
  for (const b of books) for (const n of namesOf(b, kind)) idOf(kind, n);

function dictionary(kind: string, scope: Book[] = books.filter((b) => !b.deletedAt)): NamedCount[] {
  const all = new Map<string, string>();
  for (const b of books) for (const n of namesOf(b, kind)) all.set(fold(n), n);
  return [...all.values()]
    .map((name) => ({
      id: idOf(kind, name),
      name,
      count: scope.filter((b) => namesOf(b, kind).some((n) => fold(n) === fold(name))).length,
    }))
    .sort((a, b) => fold(a.name).localeCompare(fold(b.name)));
}

function search(q: SearchQuery) {
  const has = (b: Book, kind: string, ids: number[]) => namesOf(b, kind).some((n) => ids.includes(idOf(kind, n)));
  const words = fold(q.text).split(" ").filter(Boolean);
  const base = books.filter((b) => {
    if (b.deletedAt) return false;
    if (words.length) {
      const hay = fold([b.title, b.subtitle, ...b.authors, b.series, b.synopsis].join(" "));
      const isbn = q.text.replace(/[^0-9xX]/g, "").toUpperCase();
      if (!words.every((w) => hay.includes(w)) && !(isbn.length >= 4 && b.isbn?.includes(isbn))) return false;
    }
    if (q.statuses.length && !q.statuses.includes(b.status)) return false;
    if (q.lent != null && !!b.lentTo !== q.lent) return false;
    if (q.formats.length && !q.formats.includes(b.format)) return false;
    if (q.categoryIds.length && !has(b, "categories", q.categoryIds)) return false;
    if (q.authorIds.length && !has(b, "authors", q.authorIds)) return false;
    if (q.seriesIds.length && !has(b, "series", q.seriesIds)) return false;
    if (q.publishers.length && !q.publishers.some((p) => fold(p) === fold(b.publisher ?? ""))) return false;
    if (q.languages.length && !q.languages.some((l) => fold(l) === fold(b.language ?? ""))) return false;
    const out = (v: number | null, min: number | null, max: number | null) =>
      (min != null && (v == null || v < min)) || (max != null && (v == null || v > max));
    if (out(b.year, q.yearMin, q.yearMax) || out(b.pages, q.pagesMin, null) || out(b.pages, null, q.pagesMax)) return false;
    if (out(b.rating, q.ratingMin, null)) return false;
    if (q.location.trim() && !fold(b.location ?? "").includes(fold(q.location))) return false;
    return true;
  });
  const sigilIds = [...new Set(q.sigilIds)];
  const filtered = !sigilIds.length
    ? base
    : base.filter((b) => {
        const mine = b.sigils.map((s) => idOf("sigils", s));
        return q.sigilMode === "all" ? sigilIds.every((id) => mine.includes(id)) : sigilIds.some((id) => mine.includes(id));
      });
  const key = (b: Book): string | number | null =>
    q.sort === "author"
      ? (b.authors[0] ? fold(b.authors[0]) : null)
      : q.sort === "year"
        ? b.year
        : q.sort === "added"
          ? b.createdAt
          : q.sort === "rating"
            ? b.rating
            : fold(b.title);
  const sorted = [...filtered].sort((a, b) => {
    const [ka, kb] = [key(a), key(b)];
    if (ka == null || kb == null) return ka == null && kb == null ? 0 : ka == null ? 1 : -1;
    const c = ka < kb ? -1 : ka > kb ? 1 : 0;
    return (q.descending ? -c : c) || fold(a.title).localeCompare(fold(b.title));
  });
  return { books: sorted, sigils: dictionary("sigils", q.sigilMode === "all" ? filtered : base) };
}

export async function mockInvoke(command: string, args: Record<string, unknown> = {}): Promise<unknown> {
  // Una pequeña espera para que los estados de carga se vean como en la app.
  await new Promise((resolve) => setTimeout(resolve, 120));
  const input = args.input as BookInput;
  switch (command) {
    case "app_info":
      return { version: "0.1.0-dev", dataDir: "(navegador · datos de ejemplo)", coversDir: "", startupError: null };
    case "rename_entry": {
      const kind = args.kind === "categories" ? "categories" : "sigils";
      const old = [...registry].find(([key, id]) => id === args.id && key.startsWith(`${kind}:`));
      if (!old) return fail("not_found", "No se ha encontrado");
      const name = String(args.name).trim().replace(/\s+/g, " ");
      if (!name) return fail("validation", "Revisa los campos marcados", [{ field: "name" as never, message: "El nombre no puede quedar vacío" }]);
      const oldNorm = old[0].slice(kind.length + 1);
      for (const b of books) {
        if (kind === "sigils") {
          const kept = b.sigils.filter((s) => fold(s) !== oldNorm);
          if (kept.length !== b.sigils.length) b.sigils = canonical([...kept, name], "sigils");
        } else if (b.category && fold(b.category) === oldNorm) {
          b.category = books.map((x) => x.category).find((c) => c && fold(c) === fold(name)) ?? name;
        }
      }
      registry.delete(old[0]);
      return idOf(kind, name);
    }
    case "delete_entry": {
      const kind = args.kind === "categories" ? "categories" : "sigils";
      const old = [...registry].find(([key, id]) => id === args.id && key.startsWith(`${kind}:`));
      if (!old) return fail("not_found", "No se ha encontrado");
      const norm = old[0].slice(kind.length + 1);
      for (const b of books) {
        if (kind === "sigils") b.sigils = b.sigils.filter((s) => fold(s) !== norm);
        else if (b.category && fold(b.category) === norm) b.category = null;
      }
      registry.delete(old[0]);
      return null;
    }
    case "list_books":
      return books.filter((b) => !b.deletedAt).sort((a, b) => fold(a.title).localeCompare(fold(b.title)));
    case "list_trash":
      return books.filter((b) => b.deletedAt);
    case "list_dictionary":
      return dictionary(String(args.kind));
    case "search_books":
      return search(args.query as SearchQuery);
    case "library_stats": {
      const live = books.filter((b) => !b.deletedAt);
      return {
        all: live.length,
        pendiente: live.filter((b) => b.status === "pendiente").length,
        leyendo: live.filter((b) => b.status === "leyendo").length,
        leido: live.filter((b) => b.status === "leido").length,
        lent: live.filter((b) => b.lentTo).length,
        trash: books.length - live.length,
      };
    }
    case "distinct_values": {
      const field = args.field === "language" ? "language" : "publisher";
      const seen = new Map<string, string>();
      for (const b of books) if (b[field] && !seen.has(fold(b[field]!))) seen.set(fold(b[field]!), b[field]!);
      return [...seen.values()].sort((a, b) => fold(a).localeCompare(fold(b)));
    }
    case "get_book":
      return books.find((b) => b.id === args.id) ?? fail("not_found", "No se ha encontrado el libro");
    case "create_book": {
      check(input);
      const book = toBook(nextId++, {
        ...input,
        authors: canonical(input.authors, "authors"),
        sigils: canonical(input.sigils, "sigils"),
      });
      books.push(book);
      return book;
    }
    case "update_book": {
      check(input);
      const old = find(args.id, false);
      const book = toBook(
        old.id,
        { ...input, authors: canonical(input.authors, "authors"), sigils: canonical(input.sigils, "sigils") },
        { cover: old.cover, createdAt: old.createdAt },
      );
      books[books.indexOf(old)] = book;
      return book;
    }
    case "trash_book":
      find(args.id, false).deletedAt = stamp();
      return null;
    case "restore_book": {
      const book = find(args.id, true);
      book.deletedAt = null;
      return book;
    }
    case "purge_book":
      books.splice(books.indexOf(find(args.id, true)), 1);
      return null;
    case "empty_trash": {
      const trashed = books.filter((b) => b.deletedAt);
      for (const b of trashed) books.splice(books.indexOf(b), 1);
      return trashed.length;
    }
    case "set_cover": {
      const book = find(args.id, false);
      book.cover = `data:image/webp;base64,${args.data}`;
      return book;
    }
    case "remove_cover": {
      const book = find(args.id, false);
      book.cover = null;
      return book;
    }
    default:
      return fail("unknown", `Sin simulación para «${command}»`);
  }
}
