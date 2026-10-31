fn main() {
    // El icono del .exe se incrusta aquí. Sin esto, cambiar icons/ no vuelve a
    // ejecutar este paso y el .exe conserva el icono anterior.
    println!("cargo:rerun-if-changed=icons");
    tauri_build::build()
}
