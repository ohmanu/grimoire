import type { Format, Status } from "./api";

// Todos los textos de la interfaz en un solo sitio, para poder traducirla más
// adelante sin tocar componentes.
export const t = {
  appName: "Grimoire",
  library: "Biblioteca",
  all: "Todos los libros",
  lent: "Prestados",
  trash: "Papelera",
  sigils: "Sigils",
  noSigils: "Aún no hay sigils. Se crean al añadirlos a un libro.",
  searchPlaceholder: "Buscar en el grimorio…",
  newBook: "Nuevo libro",
  viewList: "Vista de lista",
  viewGrid: "Vista de cuadrícula",
  emptyTitle: "Tu grimorio está vacío",
  emptyBody: "Añade tu primer libro para empezar a catalogar.",
  noResultsTitle: "Nada por aquí",
  noResultsBody: "Ningún libro coincide con lo que buscas.",
  loading: "Abriendo el grimorio…",
  loadError: "No se ha podido cargar la biblioteca",
  retry: "Reintentar",
  close: "Cerrar",
  cancel: "Cancelar",
  comingSoonTitle: "Nuevo libro",
  comingSoonBody: "El formulario para registrar libros llega en la fase 3.",
  bookCount: (n: number) => (n === 1 ? "1 libro" : `${n} libros`),
  lentTo: (name: string) => `Prestado a ${name}`,
  seriesEntry: (series: string, n: number | null) => (n ? `${series} #${n}` : series),
  rating: (n: number) => `${n} de 5`,
  status: {
    pendiente: "Pendiente",
    leyendo: "Leyendo",
    leido: "Leído",
  } satisfies Record<Status, string>,
  statusPlural: {
    pendiente: "Pendientes",
    leyendo: "Leyendo",
    leido: "Leídos",
  } satisfies Record<Status, string>,
  format: {
    fisico: "Físico",
    ebook: "Ebook",
    audio: "Audiolibro",
  } satisfies Record<Format, string>,
};
