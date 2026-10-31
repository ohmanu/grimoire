import { BookCheck, BookOpen, Bookmark, HandHelping, Library, Search, Trash2, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import type { NamedCount, SigilMode, Stats } from "../../lib/api";
import type { Section } from "../../lib/filters";
import { t } from "../../lib/strings";
import { fold } from "../../lib/text";
import { SigilsIcon } from "../ui/SigilsIcon";
import logo from "../../assets/logo.png";
import { Tooltip } from "../ui/Tooltip";
import styles from "./Sidebar.module.css";

interface SidebarProps {
  section: Section;
  onSectionChange: (section: Section) => void;
  stats: Stats | null;
  /** Sigils con el recuento que daría elegir cada uno. */
  sigils: NamedCount[];
  selected: number[];
  mode: SigilMode;
  onToggleSigil: (id: number) => void;
  onModeChange: (mode: SigilMode) => void;
  onClearSigils: () => void;
}

const NAV: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: "all", label: t.all, icon: Library },
  { id: "leyendo", label: t.statusPlural.leyendo, icon: BookOpen },
  { id: "pendiente", label: t.statusPlural.pendiente, icon: Bookmark },
  { id: "leido", label: t.statusPlural.leido, icon: BookCheck },
  { id: "lent", label: t.lent, icon: HandHelping },
];

const SIGIL_FILTER_FROM = 16;

export function Sidebar(props: SidebarProps) {
  const { section, onSectionChange, stats, sigils, selected, mode } = props;
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = fold(query);
    return q ? sigils.filter((s) => selected.includes(s.id) || fold(s.name).includes(q)) : sigils;
  }, [sigils, selected, query]);

  const item = (id: Section, label: string, Icon: LucideIcon) => (
    <li key={id}>
      <button
        type="button"
        className={styles.item}
        aria-current={section === id ? "page" : undefined}
        onClick={() => onSectionChange(id)}
      >
        <Icon size={16} aria-hidden />
        <span className={styles.label}>{label}</span>
        <span className={styles.count}>{stats?.[id] ?? ""}</span>
      </button>
    </li>
  );

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <img src={logo} alt="" className={styles.logo} draggable={false} />
        <span>{t.appName}</span>
      </div>

      <nav aria-label={t.library}>
        <h2 className={styles.heading}>{t.library}</h2>
        <ul className={styles.nav}>{NAV.map(({ id, label, icon }) => item(id, label, icon))}</ul>
      </nav>

      <section className={styles.sigils} aria-labelledby="sigils-heading" data-disabled={section === "trash"}>
        <div className={styles.sigilsHeader}>
          <h2 id="sigils-heading" className={styles.heading}>
            <SigilsIcon size={20} />
            {t.sigils}
          </h2>
          {selected.length > 0 && (
            <button type="button" className={styles.clear} onClick={props.onClearSigils}>
              {t.clear}
            </button>
          )}
        </div>

        {sigils.length === 0 ? (
          <p className={styles.hint}>{t.noSigils}</p>
        ) : (
          <>
            <Tooltip label={t.sigilModeHint} side="right">
              <div className={styles.mode} role="radiogroup" aria-label={t.sigilModeHint}>
                {(["all", "any"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={mode === m}
                    onClick={() => props.onModeChange(m)}
                  >
                    {m === "all" ? t.sigilModeAll : t.sigilModeAny}
                  </button>
                ))}
              </div>
            </Tooltip>

            {sigils.length >= SIGIL_FILTER_FROM && (
              <label className={styles.filter}>
                <Search size={13} aria-hidden />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t.filterSigils}
                  aria-label={t.filterSigils}
                />
              </label>
            )}

            <ul className={styles.sigilList}>
              {shown.map((s) => {
                const on = selected.includes(s.id);
                // Un sigil que no aportaría ningún libro no se puede elegir.
                const dead = !on && s.count === 0;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      className={styles.sigil}
                      aria-pressed={on}
                      disabled={dead}
                      onClick={() => props.onToggleSigil(s.id)}
                    >
                      <span className={styles.glyph} aria-hidden />
                      <span className={styles.sigilName}>{s.name}</span>
                      <span className={styles.sigilCount}>{s.count}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      <ul className={`${styles.nav} ${styles.bottom}`}>{item("trash", t.trash, Trash2)}</ul>
    </aside>
  );
}
