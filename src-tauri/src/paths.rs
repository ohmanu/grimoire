use std::fs;
use std::path::{Path, PathBuf};

/// Carpeta donde viven `grimoire.db` y las copias de seguridad.
///
/// 1. `GRIMOIRE_DATA_DIR`, si está definida.
/// 2. En desarrollo, `data/` en la raíz del proyecto (sobrevive a `cargo clean`).
/// 3. La carpeta del ejecutable: la app es portable, se copia la carpeta y van
///    los datos con ella.
/// 4. Si esa carpeta no admite escritura (p. ej. Archivos de programa), la
///    carpeta de datos de usuario que da el sistema.
pub fn data_dir(fallback: Option<PathBuf>) -> PathBuf {
    if let Some(dir) = std::env::var_os("GRIMOIRE_DATA_DIR") {
        return PathBuf::from(dir);
    }
    if cfg!(debug_assertions) {
        return Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("data");
    }
    let beside_exe = std::env::current_exe().ok().and_then(|exe| exe.parent().map(Path::to_path_buf));
    match (beside_exe, fallback) {
        (Some(dir), _) if is_writable(&dir) => dir,
        (_, Some(fallback)) => fallback,
        (Some(dir), None) => dir,
        (None, None) => PathBuf::from("."),
    }
}

fn is_writable(dir: &Path) -> bool {
    let probe = dir.join(".grimoire-write-test");
    let ok = fs::write(&probe, b"").is_ok();
    let _ = fs::remove_file(&probe);
    ok
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_writable_dir() {
        let dir = tempfile::tempdir().unwrap();
        assert!(is_writable(dir.path()));
        assert!(!is_writable(&dir.path().join("no-existe")));
    }
}
