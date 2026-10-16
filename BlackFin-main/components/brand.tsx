/** Original dot-matrix fin. Decorative; the adjacent wordmark supplies its name. */
export function FinMark({ className = "" }: { className?: string }) {
  const rows = ["00000010", "00000110", "00001110", "00011110", "00111110", "01111110", "11111111", "11111111"];
  return <svg className={className} viewBox="0 0 48 48" fill="currentColor" aria-hidden="true" focusable="false">
    {rows.flatMap((row, y) => [...row].map((dot, x) => dot === "1" ? <circle key={`${x}-${y}`} cx={3 + x * 6} cy={3 + y * 6} r={1.8} opacity={x < 2 ? .4 : x < 4 ? .65 : 1} /> : null))}
  </svg>;
}

export function BlackFinWordmark() {
  return <span className="brand-wordmark">BlackFin</span>;
}
