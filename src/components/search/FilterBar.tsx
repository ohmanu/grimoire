import { ArrowDownWideNarrow, ArrowUpNarrowWide, ChevronDown, X } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { Format, NamedCount, Sort } from "../../lib/api";
import { activeFieldFilters, clearFieldFilters, type Filters } from "../../lib/filters";
import { t } from "../../lib/strings";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Popover } from "../ui/Popover";
import { Checklist, RadioList, Range } from "./FilterControls";
import styles from "./FilterBar.module.css";

export interface FilterOptions {
  categories: NamedCount[];
  authors: NamedCount[];
  series: NamedCount[];
  publishers: string[];
  languages: string[];
}

interface TriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  summary: string | null;
}

/** Botón de un filtro: muestra qué hay elegido y se marca cuando está activo. */
const Trigger = forwardRef<HTMLButtonElement, TriggerProps>(function Trigger({ label, summary, ...props }, ref) {
  return (
    <button ref={ref} type="button" className={styles.trigger} data-active={summary !== null} {...props}>
      <span>{label}</span>
      {summary && <span className={styles.summary}>{summary}</span>}
      <ChevronDown size={14} className={styles.chevron} aria-hidden />
    </button>
  );
});

function listSummary<T>(selected: T[], options: { value: T; label: string }[]): string | null {
  if (selected.length === 0) return null;
  if (selected.length > 1) return String(selected.length);
  return options.find((o) => o.value === selected[0])?.label ?? "1";
}

function rangeSummary(min: number | null, max: number | null): string | null {
  if (min != null && max != null) return `${min}–${max}`;
  if (min != null) return `≥ ${min}`;
  if (max != null) return `≤ ${max}`;
  return null;
}

const SORTS: { value: Sort; label: string }[] = [
  { value: "title", label: "Título" },
  { value: "author", label: "Autor" },
  { value: "year", label: "Año" },
  { value: "added", label: "Fecha de alta" },
  { value: "rating", label: "Valoración" },
];

interface FilterBarProps {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  options: FilterOptions;
}

export function FilterBar({ filters: f, onChange, options }: FilterBarProps) {
  const named = (list: NamedCount[]) => list.map((d) => ({ value: d.id, label: d.name, count: d.count }));
  const plain = (list: string[]) => list.map((v) => ({ value: v, label: v }));
  const formats = (["fisico", "ebook", "audio"] as Format[]).map((v) => ({ value: v, label: t.format[v] }));

  const list = <K extends "categoryIds" | "authorIds" | "seriesIds" | "publishers" | "languages" | "formats">(
    key: K,
    label: string,
    opts: { value: Filters[K][number]; label: string; count?: number }[],
  ): ReactNode => (
    <Popover
      label={label}
      trigger={<Trigger label={label} summary={listSummary(f[key] as Filters[K][number][], opts)} />}
    >
      <Checklist
        options={opts as { value: string | number; label: string }[]}
        selected={f[key] as (string | number)[]}
        onChange={(v) => onChange({ [key]: v } as Partial<Filters>)}
        emptyText={t.noOptions}
      />
    </Popover>
  );

  const active = activeFieldFilters(f);

  return (
    <div className={styles.bar} role="toolbar" aria-label={t.filters}>
      <div className={styles.filters}>
        {list("categoryIds", t.fields.category, named(options.categories))}
        {list("authorIds", t.fields.authors, named(options.authors))}
        {list("seriesIds", t.fields.series, named(options.series))}
        {list("publishers", t.fields.publisher, plain(options.publishers))}
        {list("languages", t.fields.language, plain(options.languages))}
        {list("formats", t.fields.format, formats)}

        <Popover
          label={t.fields.year}
          width={240}
          trigger={<Trigger label={t.fields.year} summary={rangeSummary(f.yearMin, f.yearMax)} />}
        >
          <Range
            min={f.yearMin}
            max={f.yearMax}
            placeholder={["Desde", "Hasta"]}
            onChange={(yearMin, yearMax) => onChange({ yearMin, yearMax })}
          />
        </Popover>

        <Popover
          label={t.fields.pages}
          width={240}
          trigger={<Trigger label={t.fields.pages} summary={rangeSummary(f.pagesMin, f.pagesMax)} />}
        >
          <Range
            min={f.pagesMin}
            max={f.pagesMax}
            placeholder={["Mínimo", "Máximo"]}
            onChange={(pagesMin, pagesMax) => onChange({ pagesMin, pagesMax })}
          />
        </Popover>

        <Popover
          label={t.fields.rating}
          width={200}
          trigger={<Trigger label={t.fields.rating} summary={f.ratingMin ? `≥ ${f.ratingMin}★` : null} />}
        >
          <RadioList
            value={f.ratingMin}
            onChange={(ratingMin) => onChange({ ratingMin })}
            options={[
              { value: null, label: "Cualquiera" },
              ...[5, 4, 3, 2, 1].map((n) => ({ value: n, label: n === 5 ? "★★★★★" : `${"★".repeat(n)} o más` })),
            ]}
          />
        </Popover>

        <Popover
          label={t.fields.location}
          width={260}
          trigger={<Trigger label={t.fields.location} summary={f.location.trim() || null} />}
        >
          <div className={styles.text}>
            <Input
              placeholder="Contiene…"
              aria-label={t.fields.location}
              value={f.location}
              onChange={(e) => onChange({ location: e.target.value })}
              autoFocus
            />
          </div>
        </Popover>

        {active > 0 && (
          <Button size="sm" variant="ghost" icon={<X />} onClick={() => onChange(clearFieldFilters(f))}>
            {t.clearFilters}
          </Button>
        )}
      </div>

      <div className={styles.sort}>
        <Popover
          label={t.sortBy}
          width={200}
          align="end"
          trigger={<Trigger label={t.sortBy} summary={SORTS.find((s) => s.value === f.sort)?.label ?? null} />}
        >
          <RadioList value={f.sort} onChange={(sort) => onChange({ sort })} options={SORTS} />
        </Popover>
        <Button
          size="icon"
          variant="ghost"
          aria-label={f.descending ? t.descending : t.ascending}
          title={f.descending ? t.descending : t.ascending}
          onClick={() => onChange({ descending: !f.descending })}
          icon={f.descending ? <ArrowDownWideNarrow /> : <ArrowUpNarrowWide />}
        />
      </div>
    </div>
  );
}
