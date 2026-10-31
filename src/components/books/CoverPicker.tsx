import { ImagePlus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { prepareCover, type PreparedImage } from "../../lib/image";
import { Button } from "../ui/Button";
import { Cover } from "./Cover";
import styles from "./CoverPicker.module.css";

export type CoverChange = { kind: "keep" } | { kind: "set"; image: PreparedImage } | { kind: "remove" };

interface CoverPickerProps {
  title: string;
  authors: string[];
  /** Portada guardada ahora mismo (URL), si la hay. */
  current: string | null;
  change: CoverChange;
  onChange: (change: CoverChange) => void;
  error?: string;
  onError: (message: string | undefined) => void;
}

/** Zona para soltar una imagen o elegir un archivo. */
export function CoverPicker({ title, authors, current, change, onChange, error, onError }: CoverPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  const shown = change.kind === "set" ? change.image.dataUrl : change.kind === "remove" ? null : current;

  const accept = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange({ kind: "set", image: await prepareCover(file) });
      onError(undefined);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.picker}>
      <button
        type="button"
        className={styles.drop}
        data-dragging={dragging}
        data-invalid={!!error}
        aria-busy={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          accept(e.dataTransfer.files[0]);
        }}
      >
        <Cover book={{ title: title || " ", authors }} size="lg" src={shown} />
        <span className={styles.overlay}>
          <ImagePlus size={18} />
          {shown ? "Cambiar portada" : "Arrastra una imagen o haz clic"}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          accept(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error && <p className={styles.error}>{error}</p>}
      {shown && (
        <Button
          variant="ghost"
          size="sm"
          icon={<Trash2 />}
          onClick={() => onChange(change.kind === "set" && !current ? { kind: "keep" } : { kind: "remove" })}
        >
          Quitar portada
        </Button>
      )}
    </div>
  );
}
