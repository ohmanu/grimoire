interface SigilMarkProps {
  size?: number;
  className?: string;
}

/** Logo de Grimoire: el rombo de sigil sobre pergamino, igual que el icono de la app. */
export function SigilMark({ size = 22, className }: SigilMarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden>
      <rect x="6" y="6" width="88" height="88" rx="22" fill="#efe3c8" />
      <path d="M50 18 L82 50 L50 82 L18 50 Z" fill="#8e1f33" />
      <path d="M50 28 L72 50 L50 72 L28 50 Z" fill="none" stroke="#f6d9dd" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M50 43 L57 50 L50 57 L43 50 Z" fill="#f6d9dd" />
    </svg>
  );
}
