import { describe, expect, it } from "vitest";
import { fold, hashIndex } from "./text";

describe("fold", () => {
  it("ignora mayúsculas, acentos y espacios", () => {
    expect(fold("  Ciencia   Ficción ")).toBe("ciencia ficcion");
    expect(fold("GARCÍA MÁRQUEZ")).toBe("garcia marquez");
  });

  it("conserva la ñ", () => {
    expect(fold("Año")).toBe("año");
    expect(fold("AÑO")).toBe("año");
    expect(fold("Año")).not.toBe(fold("Ano"));
  });
});

describe("hashIndex", () => {
  it("es estable y está dentro del rango", () => {
    expect(hashIndex("Dune", 6)).toBe(hashIndex("Dune", 6));
    for (const s of ["", "a", "El nombre del viento", "Ñ".repeat(500)]) {
      const i = hashIndex(s, 6);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(6);
    }
  });
});
