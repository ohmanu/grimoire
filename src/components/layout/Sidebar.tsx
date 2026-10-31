import { BookCheck, BookMarked, BookOpen, Bookmark, HandHelping, Library, Trash2, type LucideIcon } from "lucide-react";
import type { NamedCount, Status } from "../../lib/api";
import { t } from "../../lib/strings";
import { MagicCircle } from "../ui/MagicCircle";
import { Sigil } from "../ui/Sigil";
import styles from "./Sidebar.module.css";

export type Section = "all" | Status | "lent" | "trash";

interface SidebarProps {
  section: Section;
  onSectionChange: (section: Section) => void;
  counts: Record<Section, number>;
  sigils: NamedCount[];
}

const NAV: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: "all", label: t.all, icon: Library },
  { id: "leyendo", label: t.statusPlural.leyendo, icon: BookOpen },
  { id: "pendiente", label: t.statusPlural.pendiente, icon: Bookmark },
  { id: "leido", label: t.statusPlural.leido, icon: BookCheck },
  { id: "lent", label: t.lent, icon: HandHelping },
];

export function Sidebar({ section, onSectionChange, counts, sigils }: SidebarProps) {
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
        <span className={styles.count}>{counts[id]}</span>
      </button>
    </li>
  );

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <BookMarked size={18} aria-hidden />
        <span>{t.appName}</span>
      </div>

      <nav aria-label={t.library}>
        <h2 className={styles.heading}>{t.library}</h2>
        <ul className={styles.nav}>{NAV.map(({ id, label, icon }) => item(id, label, icon))}</ul>
      </nav>

      <section className={styles.sigils} aria-labelledby="sigils-heading">
        <h2 id="sigils-heading" className={styles.heading}>
          <MagicCircle size={14} className={styles.circle} />
          {t.sigils}
        </h2>
        {sigils.length === 0 ? (
          <p className={styles.hint}>{t.noSigils}</p>
        ) : (
          <ul className={styles.sigilList}>
            {sigils.map((s) => (
              <li key={s.id}>
                <Sigil name={s.name} count={s.count} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <ul className={`${styles.nav} ${styles.bottom}`}>{item("trash", t.trash, Trash2)}</ul>
    </aside>
  );
}
