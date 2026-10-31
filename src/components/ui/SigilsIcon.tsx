import books from "../../assets/sigils-32.png";

interface SigilsIconProps {
  /** Ancho en píxeles; el alto sigue la proporción del dibujo (32×26). */
  size?: number;
  className?: string;
}

/**
 * Icono de los sigils: la pila de libros en pixel art (Mozco). La imagen está
 * recortada al dibujo, sin márgenes transparentes, para que al centrarla con
 * el texto quede centrado lo que se ve.
 */
export function SigilsIcon({ size = 20, className }: SigilsIconProps) {
  return (
    <img
      src={books}
      width={size}
      height={Math.round((size * 26) / 32)}
      alt=""
      draggable={false}
      className={className}
    />
  );
}
