# Grimoire

Catálogo local de libros para escritorio (Tauri 2 + React + SQLite).
Los datos viven en `grimoire.db`, junto al ejecutable. Plan y decisiones: [PLAN.md](PLAN.md).

## Desarrollo

```bash
npm install
npm run tauri dev
```

`npm run dev` sirve la interfaz en http://localhost:1420 con datos de ejemplo
(`src/lib/mock.ts`), para revisarla en un navegador sin Tauri.

`npm run check` ejecuta typecheck, tests de frontend y tests de Rust.
