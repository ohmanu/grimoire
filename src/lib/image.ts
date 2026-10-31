// Prepara una portada: la reduce a un tamaño razonable y la convierte a WebP
// (o JPEG si el navegador no sabe codificar WebP). Así las portadas pesan
// decenas de KB aunque la foto original pese varios MB.

const MAX_WIDTH = 600;
const MAX_HEIGHT = 900;
export const MAX_SOURCE_BYTES = 30 * 1024 * 1024;

export interface PreparedImage {
  /** Para mostrarla ya en el formulario. */
  dataUrl: string;
  /** Lo que se envía al backend. */
  base64: string;
}

export async function prepareCover(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith("image/")) throw new Error("El archivo no es una imagen");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("La imagen es demasiado grande (máximo 30 MB)");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("No se ha podido leer la imagen");
  }
  const scale = Math.min(1, MAX_WIDTH / bitmap.width, MAX_HEIGHT / bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se ha podido procesar la imagen");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  let dataUrl = canvas.toDataURL("image/webp", 0.86);
  if (!dataUrl.startsWith("data:image/webp")) dataUrl = canvas.toDataURL("image/jpeg", 0.88);
  return { dataUrl, base64: dataUrl.slice(dataUrl.indexOf(",") + 1) };
}
