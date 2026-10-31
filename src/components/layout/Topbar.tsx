import { LayoutGrid, List, Plus, Search, X } from "lucide-react";
import { forwardRef } from "react";
import { t } from "../../lib/strings";
import type { View } from "../books/BookList";
import { Button } from "../ui/Button";
import { Input, Kbd } from "../ui/Input";
import { Tooltip } from "../ui/Tooltip";
import styles from "./Topbar.module.css";

interface TopbarProps {
  query: string;
  onQueryChange: (query: string) => void;
  view: View;
  onViewChange: (view: View) => void;
  onNewBook: () => void;
}

export const Topbar = forwardRef<HTMLInputElement, TopbarProps>(function Topbar(
  { query, onQueryChange, view, onViewChange, onNewBook },
  searchRef,
) {
  return (
    <header className={styles.topbar}>
      <Input
        ref={searchRef}
        className={styles.search}
        icon={<Search />}
        type="search"
        placeholder={t.searchPlaceholder}
        aria-label={t.searchPlaceholder}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && query) {
            e.preventDefault();
            onQueryChange("");
          }
        }}
        spellCheck={false}
        end={
          query ? (
            <button type="button" className={styles.clear} onClick={() => onQueryChange("")} aria-label="Borrar búsqueda">
              <X size={14} />
            </button>
          ) : (
            <Kbd>Ctrl K</Kbd>
          )
        }
      />

      <div className={styles.actions}>
        <div className={styles.toggle} role="group" aria-label="Vista">
          <Tooltip label={t.viewList}>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t.viewList}
              aria-pressed={view === "list"}
              onClick={() => onViewChange("list")}
              icon={<List />}
            />
          </Tooltip>
          <Tooltip label={t.viewGrid}>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t.viewGrid}
              aria-pressed={view === "grid"}
              onClick={() => onViewChange("grid")}
              icon={<LayoutGrid />}
            />
          </Tooltip>
        </div>
        <Tooltip label={<>{t.newBook} · Ctrl N</>}>
          <Button variant="primary" onClick={onNewBook} icon={<Plus />}>
            {t.newBook}
          </Button>
        </Tooltip>
      </div>
    </header>
  );
});
