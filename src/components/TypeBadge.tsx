export function TypeBadge({ type }: { type: string }) {
  return <span className={`type-badge type-${type}`}>{type}</span>;
}
