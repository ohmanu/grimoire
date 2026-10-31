interface RoodEmblemProps {
  size?: number;
  className?: string;
}

/**
 * Emblema de los estados vacíos: la cruz de aspa de inspiration-logo2 (punta
 * de lanza con cuernos, aspa en X con tridentes, rombo central, espinas y
 * base con ganchos) dentro de un anillo con marcas. Trazo de línea en un solo
 * color, que hereda del texto.
 */
export function RoodEmblem({ size = 72, className }: RoodEmblemProps) {
  const ticks = Array.from({ length: 24 }, (_, i) => i * 15);
  // Un brazo del aspa apuntando a la derecha desde el centro; se rota cuatro veces.
  const arm = "M7 0 H23 M23 -4.5 L31 0 L23 4.5 Z M21 -2.5 L24 -8 M21 2.5 L24 8";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="50" cy="50" r="46" />
      {ticks.map((a) => (
        <line key={a} x1="50" y1="4" x2="50" y2={a % 45 === 0 ? 10 : 7.5} transform={`rotate(${a} 50 50)`} strokeWidth={2} />
      ))}
      <g transform="translate(50 50) scale(0.8) translate(-50 -50)">
        {/* Punta de lanza con cuernos */}
        <path d="M50 4 L55 14 L50 19 L45 14 Z" />
        <path d="M45.5 17 C40 14 37.5 9.5 38 5 M54.5 17 C60 14 62.5 9.5 62 5" />
        {/* Fuste */}
        <path d="M50 19 V35 M50 53 V82" />
        {/* Aspa en X con tridentes */}
        {[-40, 40, 220, 140].map((a) => (
          <path key={a} d={arm} transform={`translate(50 44) rotate(${a})`} />
        ))}
        {/* Rombo central con celosía */}
        <path d="M50 35 L59 44 L50 53 L41 44 Z" />
        <path d="M46 40 L54 48 M54 40 L46 48" strokeWidth={1.8} />
        {/* Espinas del fuste */}
        <path d="M50 62 L43 67 M50 62 L57 67 M50 70 L44.5 74 M50 70 L55.5 74" />
        {/* Base con ganchos y púa */}
        <path d="M50 82 C46.5 89 40 91.5 34.5 88 M50 82 C53.5 89 60 91.5 65.5 88 M50 82 L50 96" />
      </g>
    </svg>
  );
}
