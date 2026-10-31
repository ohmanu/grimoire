interface MagicCircleProps {
  size?: number;
  className?: string;
  title?: string;
}

/**
 * Círculo mágico de los puntos de guardado: dos anillos, un octagrama y marcas
 * de runa. Hereda el color del texto.
 */
export function MagicCircle({ size = 16, className, title }: MagicCircleProps) {
  const ticks = Array.from({ length: 16 }, (_, i) => i * 22.5);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinejoin="round"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      <circle cx="12" cy="12" r="10.5" />
      <circle cx="12" cy="12" r="7.5" />
      <rect x="6.7" y="6.7" width="10.6" height="10.6" />
      <rect x="6.7" y="6.7" width="10.6" height="10.6" transform="rotate(45 12 12)" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      {ticks.map((angle) => (
        <line key={angle} x1="12" y1="1.5" x2="12" y2="3" transform={`rotate(${angle} 12 12)`} strokeWidth={1} />
      ))}
    </svg>
  );
}
