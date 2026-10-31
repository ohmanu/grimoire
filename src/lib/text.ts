/**
 * Igual que `fold` en Rust (src-tauri/src/normalize.rs): minúsculas, sin
 * acentos ni espacios sobrantes, pero conservando la ñ.
 */
export function fold(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/ñ/gi, "\u0000")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\u0000/g, "ñ");
}

/** Índice estable (0..n-1) a partir de un texto, para asignar colores. */
export function hashIndex(value: string, n: number): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h) % n;
}
