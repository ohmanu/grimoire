import { Popover as BasePopover } from "@base-ui/react/popover";
import { FileJson, FileSpreadsheet, MoreHorizontal, Tags, Upload, Volume2, VolumeX } from "lucide-react";
import { useState, type ReactNode } from "react";
import { playSigilAdded, setSoundEnabled, soundEnabled } from "../../lib/sound";
import { t } from "../../lib/strings";
import { Button } from "../ui/Button";
import styles from "./LibraryMenu.module.css";

interface LibraryMenuProps {
  version: string | null;
  dataDir: string | null;
  onImport: () => void;
  onExport: (format: "json" | "csv") => void;
  onManage: () => void;
}

/** Acciones sobre toda la biblioteca. Cada opción cierra el menú al elegirla. */
export function LibraryMenu({ version, dataDir, onImport, onExport, onManage }: LibraryMenuProps) {
  const [open, setOpen] = useState(false);
  const [sound, setSound] = useState(soundEnabled);
  const item = (icon: ReactNode, label: string, action: () => void) => (
    <button
      type="button"
      className={styles.item}
      onClick={() => {
        setOpen(false);
        action();
      }}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <BasePopover.Root open={open} onOpenChange={setOpen}>
      <BasePopover.Trigger
        render={<Button variant="ghost" size="icon" aria-label={t.menu} title={t.menu} icon={<MoreHorizontal />} />}
      />
      <BasePopover.Portal>
        <BasePopover.Positioner side="bottom" align="end" sideOffset={6} collisionPadding={12}>
          <BasePopover.Popup className={styles.menu} aria-label={t.menu}>
            {item(<Upload />, t.importBooks, onImport)}
            {item(<FileJson />, t.exportJson, () => onExport("json"))}
            {item(<FileSpreadsheet />, t.exportCsv, () => onExport("csv"))}
            <hr className={styles.separator} />
            {item(<Tags />, t.manage, onManage)}
            <button
              type="button"
              role="switch"
              aria-checked={sound}
              className={styles.item}
              onClick={() => {
                // No cierra el menú: se ve el cambio al momento.
                setSoundEnabled(!sound);
                setSound(!sound);
                if (!sound) playSigilAdded();
              }}
            >
              {sound ? <Volume2 /> : <VolumeX />}
              {t.sounds}
              <span className={styles.switch} data-on={sound} aria-hidden />
            </button>
            <hr className={styles.separator} />
            <div className={styles.about}>
              <span>
                {t.appName} {version && `v${version}`}
                <br />
                <span className={styles.path} title={dataDir ?? undefined}>
                  {dataDir}
                </span>
              </span>
            </div>
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}
