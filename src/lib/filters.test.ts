import { describe, expect, it } from "vitest";
import { activeFieldFilters, clearFieldFilters, EMPTY_FILTERS, parseFilters, pruneFilters, toQuery } from "./filters";

describe("parseFilters", () => {
  it("devuelve los filtros vacíos ante basura", () => {
    for (const raw of [null, 42, "x", [], undefined]) expect(parseFilters(raw)).toEqual(EMPTY_FILTERS);
  });

  it("descarta campo a campo lo que no es válido", () => {
    const f = parseFilters({
      formats: ["ebook", "papiro", 3],
      categoryIds: [1, 1, "2", 2.5, 3],
      ratingMin: 9,
      yearMin: 1990,
      sigilMode: "any",
      sort: "nope",
      descending: "true",
      text: "no se recupera",
    });
    expect(f.formats).toEqual(["ebook"]);
    expect(f.categoryIds).toEqual([1, 3]);
    expect(f.ratingMin).toBeNull();
    expect(f.yearMin).toBe(1990);
    expect(f.sigilMode).toBe("any");
    expect(f.sort).toBe("title");
    expect(f.descending).toBe(false);
    expect(f.text).toBe("");
  });
});

describe("toQuery", () => {
  it("traduce la sección a estado o préstamo", () => {
    expect(toQuery(EMPTY_FILTERS, "leido").statuses).toEqual(["leido"]);
    expect(toQuery(EMPTY_FILTERS, "lent").lent).toBe(true);
    expect(toQuery(EMPTY_FILTERS, "all")).toMatchObject({ statuses: [], lent: null });
  });
});

describe("filtros activos", () => {
  it("cuenta y limpia solo los de campo", () => {
    const f = { ...EMPTY_FILTERS, text: "dune", sigilIds: [1], categoryIds: [2], yearMin: 1900, yearMax: 2000 };
    expect(activeFieldFilters(f)).toBe(2);
    const clean = clearFieldFilters(f);
    expect(activeFieldFilters(clean)).toBe(0);
    expect(clean).toMatchObject({ text: "dune", sigilIds: [1] });
  });

  it("poda ids desconocidos sin crear objetos nuevos si no hace falta", () => {
    const f = { ...EMPTY_FILTERS, categoryIds: [1, 2], sigilIds: [5] };
    const known = { categories: [1, 2], authors: [], series: [], sigils: [5] };
    expect(pruneFilters(f, known)).toBe(f);
    expect(pruneFilters(f, { ...known, categories: [2] }).categoryIds).toEqual([2]);
  });
});
