import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { BookDetail } from "./components/books/BookDetail";
import { BookForm, type Suggestions } from "./components/books/BookForm";
import { BookList, type View } from "./components/books/BookList";
import { EmptyState } from "./components/layout/EmptyState";
import { Sidebar, type Section } from "./components/layout/Sidebar";
import { Topbar } from "./components/layout/Topbar";
import { Button } from "./components/ui/Button";
import { ConfirmDialog } from "./components/ui/ConfirmDialog";
import { api, isApiError, type Book, type NamedCount } from "./lib/api";
import { t } from "./lib/strings";
import { fold } from "./lib/text";
import styles from "./App.module.css";

interface Library {
  books: Book[];
  trash: Book[];
  authors: NamedCount[];
  categories: NamedCount[];
  series: NamedCount[];
  sigils: NamedCount[];
}

type Confirm = { kind: "purge"; book: Book } | { kind: "empty" };

const VIEW_KEY = "grimoire.view";

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === "grid" ? "grid" : "list";
  } catch {
    return "list";
  }
}

const names = (list: NamedCount[]) => list.map((d) => d.name);

/** Valores distintos de un campo libre, para sugerirlos. */
function distinct(books: Book[], pick: (b: Book) => string | null): string[] {
  const seen = new Map<string, string>();
  for (const b of books) {
    const v = pick(b);
    if (v && !seen.has(fold(v))) seen.set(fold(v), v);
  }
  return [...seen.values()].sort((a, b) => fold(a).localeCompare(fold(b)));
}

function reportError(err: unknown) {
  toast.error(t.actionError, { description: isApiError(err) ? err.message : String(err) });
}

export default function App() {
  const [library, setLibrary] = useState<Library | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("all");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>(readView);
  const [detail, setDetail] = useState<Book | null>(null);
  const [form, setForm] = useState<{ open: boolean; book: Book | null }>({ open: false, book: null });
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [, books, trash, authors, categories, series, sigils] = await Promise.all([
        api.appInfo(),
        api.listBooks(),
        api.listTrash(),
        api.listDictionary("authors"),
        api.listDictionary("categories"),
        api.listDictionary("series"),
        api.listDictionary("sigils"),
      ]);
      setLibrary({ books, trash, authors, categories, series, sigils });
      setError(null);
    } catch (err) {
      setError(isApiError(err) ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      // Sin almacenamiento local la vista simplemente no se recuerda.
    }
  }, [view]);

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

  const suggestions = useMemo<Suggestions>(() => {
    const all = [...(library?.books ?? []), ...(library?.trash ?? [])];
    return {
      authors: names(library?.authors ?? []),
      categories: names(library?.categories ?? []),
      series: names(library?.series ?? []),
      sigils: names(library?.sigils ?? []),
      languages: distinct(all, (b) => b.language),
      publishers: distinct(all, (b) => b.publisher),
    };
  }, [library]);

  const counts = useMemo<Record<Section, number>>(() => {
    const books = library?.books ?? [];
    return {
      all: books.length,
      pendiente: books.filter((b) => b.status === "pendiente").length,
      leyendo: books.filter((b) => b.status === "leyendo").length,
      leido: books.filter((b) => b.status === "leido").length,
      lent: books.filter((b) => b.lentTo).length,
      trash: library?.trash.length ?? 0,
    };
  }, [library]);

  // Búsqueda sencilla por título y autor. La fase 4 la sustituye por la de
  // texto completo con filtros y sigils.
  const visible = useMemo(() => {
    if (!library) return [];
    const base =
      section === "trash"
        ? library.trash
        : section === "all"
          ? library.books
          : section === "lent"
            ? library.books.filter((b) => b.lentTo)
            : library.books.filter((b) => b.status === section);
    const q = fold(query);
    if (!q) return base;
    return base.filter((b) => fold([b.title, b.subtitle ?? "", ...b.authors].join(" ")).includes(q));
  }, [library, section, query]);

  const handleSaved = async (book: Book) => {
    const wasEditing = form.book !== null;
    setForm((f) => ({ ...f, open: false }));
    await load();
    if (wasEditing) setDetail(book);
    else toast.success(`«${book.title}» ${t.added}`);
  };

  const handleTrash = async (book: Book) => {
    try {
      await api.trashBook(book.id);
      setDetail(null);
      await load();
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
      await load();
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
      await load();
    } catch (err) {
      reportError(err);
    }
  };

  const sectionTitle =
    section === "all" ? t.all : section === "lent" ? t.lent : section === "trash" ? t.trash : t.statusPlural[section];

  let content;
  if (error) {
    content = <EmptyState title={t.loadError} body={error} action={<Button onClick={load}>{t.retry}</Button>} />;
  } else if (!library) {
    content = null;
  } else if (section === "trash" && library.trash.length === 0) {
    content = <EmptyState title={t.trashEmptyTitle} body={t.trashEmptyBody} />;
  } else if (library.books.length === 0 && section !== "trash") {
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
  } else if (visible.length === 0) {
    content = <EmptyState title={t.noResultsTitle} body={t.noResultsBody} />;
  } else {
    content = (
      <BookList
        books={visible}
        view={view}
        onOpen={setDetail}
        trash={
          section === "trash"
            ? { onRestore: (b) => handleRestore(b), onPurge: (b) => setConfirm({ kind: "purge", book: b }) }
            : undefined
        }
      />
    );
  }

  return (
    <div className={styles.app}>
      <Sidebar section={section} onSectionChange={setSection} counts={counts} sigils={library?.sigils ?? []} />
      <div className={styles.workspace}>
        <Topbar
          ref={searchRef}
          query={query}
          onQueryChange={setQuery}
          view={view}
          onViewChange={setView}
          onNewBook={openNew}
        />
        <main className={styles.content}>
          {library && !error && (
            <div className={styles.heading}>
              <h1>{sectionTitle}</h1>
              <span>{t.bookCount(visible.length)}</span>
              {section === "trash" && library.trash.length > 0 && (
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
          confirm?.kind === "purge"
            ? t.purgeBody(confirm.book.title)
            : t.emptyTrashBody(library?.trash.length ?? 0)
        }
        confirmLabel={confirm?.kind === "purge" ? t.purge : t.emptyTrash}
        onConfirm={handleConfirm}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}
