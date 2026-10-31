import { describe, expect, it } from "vitest";
import type { BookInput } from "./api";
import { isValidDate, isValidIsbn, synopsisLines, validateBook } from "./validate";

const book = (patch: Partial<BookInput> = {}): BookInput => ({
  title: "Dune",
  authors: [],
  sigils: [],
  format: "fisico",
  status: "pendiente",
  ...patch,
});

describe("validateBook", () => {
  it("acepta un libro mínimo", () => {
    expect(validateBook(book())).toEqual({});
  });

  it("exige título", () => {
    expect(validateBook(book({ title: "   " })).title).toBeDefined();
  });

  it("limita la sinopsis a 5 líneas y 600 caracteres", () => {
    expect(validateBook(book({ synopsis: "1\n2\n3\n4\n5" })).synopsis).toBeUndefined();
    expect(validateBook(book({ synopsis: "1\n2\n3\n4\n5\n6" })).synopsis).toMatch(/líneas/);
    expect(validateBook(book({ synopsis: "a".repeat(601) })).synopsis).toMatch(/600/);
    // Las líneas vacías del final no cuentan, igual que en el backend.
    expect(validateBook(book({ synopsis: "1\n2\n3\n4\n5\n\n" })).synopsis).toBeUndefined();
  });

  it("comprueba rangos y dependencias", () => {
    const e = validateBook(book({ year: 2101, pages: 0, seriesNumber: 2 }));
    expect(Object.keys(e).sort()).toEqual(["pages", "seriesNumber", "year"]);
    expect(validateBook(book({ seriesNumber: 2, series: "Dune" }))).toEqual({});
  });

  it("valida la fecha de préstamo solo si hay a quién", () => {
    expect(validateBook(book({ lentAt: "nope" }))).toEqual({});
    expect(validateBook(book({ lentTo: "Lucía", lentAt: "2026-02-30" })).lentAt).toBeDefined();
  });

  it("limita la longitud de cada sigil", () => {
    expect(validateBook(book({ sigils: ["s".repeat(41)] })).sigils).toBeDefined();
  });
});

describe("isValidIsbn", () => {
  it.each([
    ["978-84-376-0494-7", true],
    ["0-306-40615-2", true],
    ["0-8044-2957-x", true],
    ["978-84-376-0494-8", false],
    ["X306406152", false],
    ["12345", false],
  ])("%s → %s", (isbn, ok) => expect(isValidIsbn(isbn)).toBe(ok));
});

describe("fechas y líneas", () => {
  it("valida fechas reales", () => {
    expect(isValidDate("2024-02-29")).toBe(true);
    expect(isValidDate("2023-02-29")).toBe(false);
    expect(isValidDate("2023-1-01")).toBe(false);
  });

  it("cuenta líneas", () => {
    expect(synopsisLines("")).toBe(0);
    expect(synopsisLines("\na\r\nb\n")).toBe(2);
  });
});
