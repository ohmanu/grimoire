import { invoke } from "@tauri-apps/api/core";

// Tipos y llamadas al backend (src-tauri/src/commands.rs). Los nombres de los
// campos coinciden con los de Rust en camelCase.

export type Format = "fisico" | "ebook" | "audio";
export type Status = "pendiente" | "leyendo" | "leido";
export type Dictionary = "categories" | "authors" | "series" | "sigils";

export interface BookInput {
  title: string;
  subtitle?: string | null;
  authors: string[];
  category?: string | null;
  series?: string | null;
  seriesNumber?: number | null;
  publisher?: string | null;
  year?: number | null;
  isbn?: string | null;
  language?: string | null;
  pages?: number | null;
  format: Format;
  status: Status;
  rating?: number | null;
  location?: string | null;
  synopsis?: string | null;
  notes?: string | null;
  lentTo?: string | null;
  lentAt?: string | null;
  sigils: string[];
}

export interface Book extends Required<BookInput> {
  id: number;
  cover: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface NamedCount {
  id: number;
  name: string;
  count: number;
}

export interface AppInfo {
  version: string;
  dataDir: string;
}

export interface FieldError {
  field: keyof BookInput;
  message: string;
}

/** Error tal como lo serializa `AppError` en Rust. */
export interface ApiError {
  kind: "validation" | "not_found" | "newer_schema" | "corrupt" | "db" | "io" | "unknown";
  message: string;
  fields: FieldError[];
}

export function isApiError(value: unknown): value is ApiError {
  return typeof value === "object" && value !== null && "kind" in value && "message" in value;
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (err) {
    if (isApiError(err)) throw err;
    const error: ApiError = { kind: "unknown", message: String(err), fields: [] };
    throw error;
  }
}

export const api = {
  appInfo: () => call<AppInfo>("app_info"),
  listBooks: () => call<Book[]>("list_books"),
  getBook: (id: number) => call<Book>("get_book", { id }),
  createBook: (input: BookInput) => call<Book>("create_book", { input }),
  updateBook: (id: number, input: BookInput) => call<Book>("update_book", { id, input }),
  trashBook: (id: number) => call<void>("trash_book", { id }),
  restoreBook: (id: number) => call<Book>("restore_book", { id }),
  listTrash: () => call<Book[]>("list_trash"),
  purgeBook: (id: number) => call<void>("purge_book", { id }),
  emptyTrash: () => call<number>("empty_trash"),
  listDictionary: (kind: Dictionary) => call<NamedCount[]>("list_dictionary", { kind }),
};
