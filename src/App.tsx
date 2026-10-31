import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { BookDetail } from "./components/books/BookDetail";
import { BookForm, type Suggestions } from "./components/books/BookForm";
import { BookList, type View } from "./components/books/BookList";
import { EmptyState } from "./components/layout/EmptyState";
import { Sidebar } from "./components/layout/Sidebar";
import { Topbar } from "./components/layout/Topbar";
import { FilterBar } from "./components/search/FilterBar";
import { Button } from "./components/ui/Button";
import { ConfirmDialog } from "./components/ui/ConfirmDialog";
import { api, isApiError, type Book, type NamedCount, type Stats } from "./lib/api";
import {
  activeFieldFilters,
  clearFieldFilters,
  loadFilters,
  pruneFilters,
  saveFilters,
  toQuery,
  type Filters,
  type Section,
} from "./lib/filters";
import { t } from "./lib/strings";
import styles from "./App.module.css";

/** Datos de apoyo: diccionarios, recuentos y papelera. Se recargan tras cada cambio. */
interface Library {
  stats: Stats;
  trash: Book[];
  authors: NamedCount[];
  categories: NamedCount[];
  series: NamedCount[];
  sigils: NamedCount[];
  languages: string[];
  publishers: string[];
}

type Confirm = { kind: "purge"; book: Book } | { kind: "empty" };

const VIEW_KEY = "grimoire.view";
/** Espera tras la última tecla antes de buscar. */
const TYPING_DELAY = 150;

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === "grid" ? "grid" : "list";
  } catch {
    return "list";
  }
}

const names = (list: NamedCount[]) => list.map((d) => d.name);
const ids = (list: NamedCount[]) => list.map((d) => d.id);

function reportError(err: unknown) {
  toast.error(t.actionError, { description: isApiError(err) ? err.message : String(err) });
}

export default function App() {
  const [library, setLibrary] = useState<Library | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("all");
  const [filters, setFilters] = useState<Filters>(loadFilters);
  const [results, setResults] = useState<{ books: Book[]; sigils: NamedCount[] } | null>(null);
  const [revision, setRevision] = useState(0);
  const [view, setView] = useState<View>(readView);
  const [detail, setDetail] = useState<Book | null>(null);
  const [form, setForm] = useState<{ open: boolean; book: Book | null }>({ open: false, book: null });
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const loadLibrary = useCallback(async () => {
    try {
      const [, stats, trash, authors, categories, series, sigils, languages, publishers] = await Promise.all([
        api.appInfo(),
        api.libraryStats(),
        api.listTrash(),
        api.listDictionary("authors"),
        api.listDictionary("categories"),
        api.listDictionary("series"),
        api.listDictionary("sigils"),
        api.distinctValues("language"),
        api.distinctValues("publisher"),
      ]);
      setLibrary({ stats, trash, authors, categories, series, sigils, languages, publishers });
      // Filtros que apuntaban a algo que ya no existe se quitan solos.
      setFilters((f) =>
        pruneFilters(f, {
          categories: ids(categories),
          authors: ids(authors),
          series: ids(series),
          sigils: ids(sigils),
        }),
      );
      setError(null);
    } catch (err) {
      setError(isApiError(err) ? err.message : String(err));
    }
  }, []);

  /** Tras cualquier cambio: datos de apoyo y resultados de nuevo. */
  const refresh = useCallback(async () => {
    setRevision((r) => r + 1);
    await loadLibrary();
  }, [loadLibrary]);

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  useEffect(() => saveFilters(filters), [filters]);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      // Sin almacenamiento local la vista simplemente no se recuerda.
    }
  }, [view]);

  // Búsqueda. Al escribir se espera un instante; el resto de cambios es
  // inmediato. Si llega una respuesta de una búsqueda anterior, se descarta.
  const lastText = useRef(filters.text);
  useEffect(() => {
    if (section === "trash") return;
    let stale = false;
    const typing = filters.text !== lastText.current;
    lastText.current = filters.text;
    const timer = setTimeout(
      async () => {
        try {
          const result = await api.searchBooks(toQuery(filters, section));
          if (!stale) setResults(result);
        } catch (err) {
          if (!stale) reportError(err);
        }
      },
      typing ? TYPING_DELAY : 0,
    );
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [filters, section, revision]);

  const patchFilters = useCallback((patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch })), []);

  const openNew = useCallback(() => setForm({ open: true, book: null }), []);
  const anyDialogOpen = detail !== null || form.open || confirm !== null;

  // Atajos globales. Sin animación: se usan a todas horas.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || anyDialogOpen) return;
      const key = e.key.toLowerCase();
      if (key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (key === "n") {
        e.preventDefault();
        openNew();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anyDialogOpen, openNew]);

  const suggestions = useMemo<Suggestions>(
    () => ({
      authors: names(library?.authors ?? []),
      categories: names(library?.categories ?? []),
      series: names(library?.series ?? []),
      sigils: names(library?.sigils ?? []),
      languages: library?.languages ?? [],
      publishers: library?.publishers ?? [],
    }),
    [library],
  );

  const handleSaved = async (book: Book) => {
    const wasEditing = form.book !== null;
    setForm((f) => ({ ...f, open: false }));
    await refresh();
    if (wasEditing) setDetail(book);
    else toast.success(`«${book.title}» ${t.added}`);
  };

  const handleTrash = async (book: Book) => {
    try {
      await api.trashBook(book.id);
      setDetail(null);
      await refresh();
      toast(t.movedToTrash(book.title), {
        // Tiempo de sobra para arrepentirse.
        duration: 8000,
        action: { label: t.undo, onClick: () => handleRestore(book, false) },
      });
    } catch (err) {
      reportError(err);
    }
  };

  const handleRestore = async (book: Book, announce = true) => {
    try {
      await api.restoreBook(book.id);
      await refresh();
      if (announce) toast.success(t.restored(book.title));
    } catch (err) {
      reportError(err);
    }
  };

  const handleConfirm = async () => {
    if (!confirm) return;
    try {
      if (confirm.kind === "purge") await api.purgeBook(confirm.book.id);
      else await api.emptyTrash();
      setConfirm(null);
      await refresh();
    } catch (err) {
      reportError(err);
    }
  };

  const toggleSigil = (id: number) =>
    setFilters((f) => ({
      ...f,
      sigilIds: f.sigilIds.includes(id) ? f.sigilIds.filter((s) => s !== id) : [...f.sigilIds, id],
    }));

  const inTrash = section === "trash";
  const books = inTrash ? (library?.trash ?? []) : (results?.books ?? []);
  const filtering = filters.text.trim() !== "" || filters.sigilIds.length > 0 || activeFieldFilters(filters) > 0;
  const sectionTitle =
    section === "all" ? t.all : section === "lent" ? t.lent : inTrash ? t.trash : t.statusPlural[section];

  let content;
  if (error) {
    content = <EmptyState title={t.loadError} body={error} action={<Button onClick={loadLibrary}>{t.retry}</Button>} />;
  } else if (!library || (!inTrash && !results)) {
    content = null;
  } else if (inTrash && library.trash.length === 0) {
    content = <EmptyState title={t.trashEmptyTitle} body={t.trashEmptyBody} />;
  } else if (!inTrash && library.stats.all === 0) {
    content = (
      <EmptyState
        title={t.emptyTitle}
        body={t.emptyBody}
        action={
          <Button variant="primary" icon={<Plus />} onClick={openNew}>
            {t.newBook}
          </Button>
        }
      />
    );
  } else if (books.length === 0) {
    content = (
      <EmptyState
        title={t.noResultsTitle}
        body={t.noResultsBody}
        action={
          filtering && (
            <Button
              onClick={() => setFilters((f) => ({ ...clearFieldFilters(f), text: "", sigilIds: [] }))}
            >
              {t.clearFilters}
            </Button>
          )
        }
      />
    );
  } else {
    content = (
      <BookList
        books={books}
        view={view}
        onOpen={setDetail}
        trash={
          inTrash
            ? { onRestore: (b) => handleRestore(b), onPurge: (b) => setConfirm({ kind: "purge", book: b }) }
            : undefined
        }
      />
    );
  }

  return (
    <div className={styles.app}>
      <Sidebar
        section={section}
        onSectionChange={setSection}
        stats={library?.stats ?? null}
        sigils={results?.sigils ?? library?.sigils ?? []}
        selected={filters.sigilIds}
        mode={filters.sigilMode}
        onToggleSigil={toggleSigil}
        onModeChange={(sigilMode) => patchFilters({ sigilMode })}
        onClearSigils={() => patchFilters({ sigilIds: [] })}
      />
      <div className={styles.workspace}>
        <Topbar
          ref={searchRef}
          query={filters.text}
          onQueryChange={(text) => patchFilters({ text })}
          view={view}
          onViewChange={setView}
          onNewBook={openNew}
        />
        {!inTrash && library && library.stats.all > 0 && (
          <FilterBar
            filters={filters}
            onChange={patchFilters}
            options={{
              categories: library.categories,
              authors: library.authors,
              series: library.series,
              publishers: library.publishers,
              languages: library.languages,
            }}
          />
        )}
        <main className={styles.content}>
          {library && !error && (
            <div className={styles.heading}>
              <h1>{sectionTitle}</h1>
              <span>{t.bookCount(books.length)}</span>
              {inTrash && library.trash.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 />}
                  className={styles.headingAction}
                  onClick={() => setConfirm({ kind: "empty" })}
                >
                  {t.emptyTrash}
                </Button>
              )}
            </div>
          )}
          {content}
        </main>
      </div>

      <BookDetail
        book={detail}
        onClose={() => setDetail(null)}
        onEdit={(book) => {
          setDetail(null);
          setForm({ open: true, book });
        }}
        onTrash={handleTrash}
      />

      <BookForm
        open={form.open}
        book={form.book}
        suggestions={suggestions}
        onClose={() => setForm((f) => ({ ...f, open: false }))}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.kind === "purge" ? t.purgeTitle : t.emptyTrashTitle}
        body={
          confirm?.kind === "purge" ? t.purgeBody(confirm.book.title) : t.emptyTrashBody(library?.trash.length ?? 0)
        }
        confirmLabel={confirm?.kind === "purge" ? t.purge : t.emptyTrash}
        onConfirm={handleConfirm}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}
