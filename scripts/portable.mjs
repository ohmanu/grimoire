// Compila Grimoire y deja una carpeta portable en release/Grimoire:
// el .exe y unas instrucciones. Los datos (grimoire.db, covers/, backups/)
// se crean junto al .exe la primera vez que se abre.
import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const exe = join(root, "src-tauri", "target", "release", "grimoire.exe");
const out = join(root, "release", "Grimoire");

execSync("npx tauri build --no-bundle", { cwd: root, stdio: "inherit" });

mkdirSync(out, { recursive: true });
copyFileSync(exe, join(out, "Grimoire.exe"));
writeFileSync(
  join(out, "LEEME.txt"),
  `Grimoire ${version}

Abre Grimoire.exe. No hace falta instalar nada.

Tus datos se guardan en esta misma carpeta:
  grimoire.db   tus libros
  covers\\       las portadas
  backups\\      copias automáticas (las 10 últimas, al abrir la app si hubo cambios)

Para llevarte la biblioteca a otro equipo, copia la carpeta entera.

Si Grimoire avisa de que la base de datos está dañada: ciérralo, abre la
carpeta más reciente de backups\\ y copia su grimoire.db y su carpeta covers\\
aquí, sustituyendo las actuales.

Si esta carpeta no admite escritura (por ejemplo, dentro de Archivos de
programa), Grimoire guarda los datos en %APPDATA%\\com.grimoire.app.
`.replace(/\n/g, "\r\n"),
);

const mb = (statSync(join(out, "Grimoire.exe")).size / 1024 / 1024).toFixed(1);
console.log(`\nListo: ${out}\\Grimoire.exe (${mb} MB)`);
