# Grimoire — plan

Aplicación de escritorio para catalogar libros. Portable: funciona dentro de su
carpeta con una base de datos local (`grimoire.db` junto al ejecutable).

## Decisiones

- **Nombre:** Grimoire (lore de Vagrant Story).
- **Tags = "Sigils"** en la interfaz (los sellos que abren puertas en Lea Monde).
- **Base de datos:** `grimoire.db` (SQLite, modo WAL, migraciones versionadas).
- **Panel de filtros:** icono de círculo mágico pequeño (guiño a los save points).
- **Diseño:** skill `emil-design-eng`. Estética limpia; el lore queda en detalles.
- **Stack:** Tauri 2 + React + TypeScript + SQLite (`rusqlite`, FTS5).
  Validación en el backend (Rust), cada guardado en una transacción.

- **Campos extra:** serie + número en la serie; "prestado a…" + fecha de préstamo.
- **Idioma:** solo castellano.
- **Datos:** en desarrollo, `data/` en la raíz del proyecto; en la app final,
  junto al `.exe` (o en la carpeta de datos de usuario si ahí no se puede
  escribir). `GRIMOIRE_DATA_DIR` lo fuerza.

## Estado

- [x] Fase 0
- [x] Fase 1
- [x] Fase 2
- [x] Fase 3
- [x] Fase 4 (5.000 libros: la búsqueda más pesada tarda 31 ms)
- [ ] Fase 5 · [ ] Fase 6

## Fases

### Fase 0 — Base del proyecto
- Instalar Git, Node LTS, Rust y MSVC Build Tools (no están en el equipo).
- `git init` (pendiente: Git no está instalado).
- Esqueleto Tauri, git, linter y tests.
- Hito: arranca una ventana vacía.

### Fase 1 — Capa de datos
- `books`: título, subtítulo, editorial, año, ISBN, idioma, páginas, formato
  (físico/ebook/audio), estado (pendiente/leyendo/leído), valoración 1–5,
  ubicación, sinopsis, notas, portada opcional, fechas de alta y edición.
- `authors` + `book_authors` (varios autores por libro, con orden).
- `categories`, `sigils` + `book_sigils`.
- Reglas: sinopsis ≤ 5 líneas y ≤ 600 caracteres; ISBN validado; sigils únicos
  sin distinguir mayúsculas ni acentos (la ñ sí cuenta).
- Tests de todo lo anterior.
- Copia de seguridad automática al abrir (se guardan las 10 últimas), solo si
  hubo cambios desde la anterior.
- Hecho además: papelera (borrar → papelera → purgar), índice FTS5 listo para
  la fase 4, comprobación de integridad al abrir, y negativa a abrir una base
  de datos de una versión más nueva de la app.

### Fase 2 — Interfaz base y sistema de diseño
- Tokens de color y tipografía; curvas propias
  (`--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`).
- Componentes: botón, input, combobox, chip de sigil, diálogo, toast.
- Layout: barra lateral de filtros + lista/rejilla de libros.
- Sin animación en acciones de teclado; respeta `prefers-reduced-motion`.

### Fase 3 — Alta y edición de libros
- Formulario con validación en vivo.
- Autores con autocompletado o creación nueva.
- Sigils: se crean escribiendo y pulsando Enter.
- Portada: arrastrar imagen o elegir archivo.
- Borrado con "Deshacer" en un toast, y papelera.
- Hecho además: ficha de solo lectura del libro; aviso al cerrar con cambios
  sin guardar; `Ctrl+Enter` para guardar; las portadas se reducen a 600×900
  WebP antes de guardarse en `covers/`, y se borran al purgar el libro.

### Fase 4 — Buscador
- Texto libre en título, autor y sinopsis.
- Filtros por campo: categoría, autor, año (rango), estado, formato, idioma,
  valoración.
- Sigils con selección múltiple: cada uno estrecha el resultado (Y), con opción
  de O. Cada sigil muestra cuántos libros quedarían; los que dejan cero, atenuados.
- Ordenación; los filtros se recuerdan entre sesiones.

### Fase 5 — Robustez y extras
- Exportar/importar JSON y CSV.
- Gestionar sigils: renombrar y fusionar.
- Atajos: `Ctrl+N` libro nuevo, `Ctrl+K` buscar.
- Errores con mensaje claro, nunca cierres inesperados.

### Fase 6 — Empaquetado y pruebas finales
- `.exe` portable con icono.
- Prueba con 5.000 libros: búsquedas < 50 ms.
- Revisión final de UI con la skill de Emil (tabla antes/después).
