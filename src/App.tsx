import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookList, type View } from "./components/books/BookList";
import { EmptyState } from "./components/layout/EmptyState";
import { Sidebar, type Section } from "./components/layout/Sidebar";
import { Topbar } from "./components/layout/Topbar";
import { Button } from "./components/ui/Button";
import { Dialog, DialogClose } from "./components/ui/Dialog";
import { api, type Book, type NamedCount } from "./lib/api";
import { t } from "./lib/strings";
import { fold } from "./lib/text";
import styles from "./App.module.css";

interface Library {
  books: Book[];
  trash: Book[];
  sigils: NamedCount[];
}

const VIEW_KEY = "grimoire.view";

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === "grid" ? "grid" : "list";
  } catch {
    return "list";
  }
}

export default function App() {
  const [library, setLibrary] = useState<Library | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("all");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>(readView);
  const [newOpen, setNewOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [books, trash, sigils] = await Promise.all([
        api.listBooks(),
        api.listTrash(),
        api.listDictionary("sigils"),
      ]);
      setLibrary({ books, trash, sigils });
    } catch (err) {
      setError((err as { message?: string }).message ?? String(err));
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

  // Atajos globales. Sin animación: se usan a todas horas.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      const key = e.key.toLowerCase();
      if (key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (key === "n") {
        e.preventDefault();
        setNewOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  const sectionTitle =
    section === "all"
      ? t.all
      : section === "lent"
        ? t.lent
        : section === "trash"
          ? t.trash
          : t.statusPlural[section];

  const newBookButton = (
    <Button variant="primary" icon={<Plus />} onClick={() => setNewOpen(true)}>
      {t.newBook}
    </Button>
  );

  let content;
  if (error) {
    content = <EmptyState title={t.loadError} body={error} action={<Button onClick={load}>{t.retry}</Button>} />;
  } else if (!library) {
    content = null;
  } else if (library.books.length === 0 && section !== "trash") {
    content = <EmptyState title={t.emptyTitle} body={t.emptyBody} action={newBookButton} />;
  } else if (visible.length === 0) {
    content = <EmptyState title={t.noResultsTitle} body={t.noResultsBody} />;
  } else {
    content = <BookList books={visible} view={view} />;
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
          onNewBook={() => setNewOpen(true)}
        />
        <main className={styles.content}>
          {library && !error && (
            <div className={styles.heading}>
              <h1>{sectionTitle}</h1>
              <span>{t.bookCount(visible.length)}</span>
            </div>
          )}
          {content}
        </main>
      </div>

      <Dialog
        open={newOpen}
        onOpenChange={setNewOpen}
        title={t.comingSoonTitle}
        description={t.comingSoonBody}
        footer={<DialogClose render={<Button variant="primary" />}>{t.close}</DialogClose>}
      />
    </div>
  );
}
