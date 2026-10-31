import type { ApiError, Book, BookInput, NamedCount } from "./api";

// Backend simulado para abrir la interfaz en un navegador normal durante el
// desarrollo (sin Tauri). Nunca se incluye en la app final: solo se importa
// cuando import.meta.env.DEV es cierto.

const now = "2026-10-31T12:00:00.000Z";

function book(id: number, input: Partial<BookInput> & { title: string }, extra: Partial<Book> = {}): Book {
  return {
    id,
    title: input.title,
    subtitle: input.subtitle ?? null,
    authors: input.authors ?? [],
    category: input.category ?? null,
    series: input.series ?? null,
    seriesNumber: input.seriesNumber ?? null,
    publisher: input.publisher ?? null,
    year: input.year ?? null,
    isbn: input.isbn ?? null,
    language: input.language ?? "Español",
    pages: input.pages ?? null,
    format: input.format ?? "fisico",
    status: input.status ?? "pendiente",
    rating: input.rating ?? null,
    location: input.location ?? null,
    synopsis: input.synopsis ?? null,
    notes: input.notes ?? null,
    lentTo: input.lentTo ?? null,
    lentAt: input.lentAt ?? null,
    sigils: input.sigils ?? [],
    cover: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...extra,
  };
}

const books: Book[] = [
  book(1, {
    title: "El nombre del viento",
    authors: ["Patrick Rothfuss"],
    category: "Fantasía",
    series: "Crónica del asesino de reyes",
    seriesNumber: 1,
    year: 2009,
    pages: 880,
    status: "leido",
    rating: 5,
    sigils: ["Épica", "Magia", "Música"],
  }),
  book(2, {
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
  book(3, {
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
  book(4, {
    title: "Cien años de soledad",
    authors: ["Gabriel García Márquez"],
    category: "Novela",
    year: 1967,
    pages: 471,
    status: "pendiente",
    sigils: ["Clásico", "Realismo mágico"],
  }),
  book(5, {
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
  book(6, {
    title: "Ficciones",
    authors: ["Jorge Luis Borges"],
    category: "Relatos",
    year: 1944,
    status: "leyendo",
    rating: 5,
    sigils: ["Clásico", "Laberintos"],
  }),
  book(7, {
    title: "Solaris",
    authors: ["Stanisław Lem"],
    category: "Ciencia ficción",
    year: 1961,
    format: "audio",
    status: "pendiente",
    sigils: ["Clásico"],
  }),
  book(8, {
    title: "El hobbit",
    authors: ["J. R. R. Tolkien"],
    category: "Fantasía",
    year: 1937,
    status: "leido",
    rating: 4,
    sigils: ["Magia", "Aventura"],
    lentTo: "Marcos",
  }),
  book(9, {
    title: "Rayuela",
    authors: ["Julio Cortázar"],
    category: "Novela",
    year: 1963,
    status: "pendiente",
    sigils: [],
  }),
];

const trash: Book[] = [
  book(10, { title: "Un libro repetido", authors: ["Anónimo"] }, { deletedAt: now }),
];

function dictionary(kind: string): NamedCount[] {
  const counts = new Map<string, number>();
  for (const b of books) {
    const names =
      kind === "sigils" ? b.sigils : kind === "authors" ? b.authors : [kind === "series" ? b.series : b.category];
    for (const name of names) if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts]
    .map(([name, count], i) => ({ id: i + 1, name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export async function mockInvoke(command: string, args?: Record<string, unknown>): Promise<unknown> {
  // Una pequeña espera para que los estados de carga se vean como en la app.
  await new Promise((resolve) => setTimeout(resolve, 120));
  switch (command) {
    case "app_info":
      return { version: "0.1.0-dev", dataDir: "(navegador · datos de ejemplo)" };
    case "list_books":
      return books;
    case "list_trash":
      return trash;
    case "list_dictionary":
      return dictionary(String(args?.kind));
    default: {
      const error: ApiError = { kind: "unknown", message: `Sin simulación para «${command}»`, fields: [] };
      throw error;
    }
  }
}
