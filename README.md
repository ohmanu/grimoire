# Grimoire

Catálogo local de libros para escritorio (Windows). Portable: un solo `.exe`
y los datos en su misma carpeta. Plan y decisiones: [PLAN.md](PLAN.md).

## Usarlo

```bash
npm install
npm run portable
```

Deja `release/Grimoire/` con `Grimoire.exe` y `LEEME.txt`. Se copia esa
carpeta donde se quiera y se abre el `.exe`; no hace falta instalar nada
(Windows 10/11 ya trae WebView2).

Junto al `.exe` se crean:

| | |
| --- | --- |
| `grimoire.db` | los libros (SQLite) |
| `covers/` | las portadas |
| `backups/` | copias automáticas: al abrir, si hubo cambios; se guardan las 10 últimas, cada una con su `grimoire.db` y sus portadas |

Si esa carpeta no admite escritura, los datos van a `%APPDATA%\com.grimoire.app`.

**Restaurar una copia:** cerrar Grimoire, copiar `grimoire.db` y `covers/`
de la carpeta más reciente de `backups/` sobre los actuales, y volver a abrir.

**Importar/exportar:** menú «⋯» → JSON (copia completa) o CSV (Excel). La
importación acepta CSV de otras apps y omite duplicados.

## Desarrollo

```bash
npm run tauri dev
```

En desarrollo los datos van a `data/` en la raíz del proyecto
(`GRIMOIRE_DATA_DIR` lo cambia).

`npm run dev` sirve solo la interfaz en http://localhost:1420 con datos de
ejemplo (`src/lib/mock.ts`), para revisarla en un navegador sin Tauri.

`npm run check` ejecuta typecheck, tests de frontend y tests de Rust. La
prueba de rendimiento con 5.000 libros:

```bash
cargo test --manifest-path src-tauri/Cargo.toml --lib --release perf_5000 -- --ignored --nocapture
```
