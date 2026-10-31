import books from "../../assets/sigils-32.png";

interface SigilsIconProps {
  size?: number;
  className?: string;
}

/** Icono de los sigils: la pila de libros en pixel art (Mozco, 32 px). */
export function SigilsIcon({ size = 20, className }: SigilsIconProps) {
  return <img src={books} width={size} height={size} alt="" draggable={false} className={className} />;
}
