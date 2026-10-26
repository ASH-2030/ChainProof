type StatCardProps = {
  label: string
  value: string
  change: string
  accent: 'cyan' | 'amber' | 'emerald' | 'rose'
}

export function StatCard({ label, value, change, accent }: StatCardProps) {
  return (
    <article className={`stat-card ${accent}`} aria-label={label}>
      <div className="stat-topline">
        <span className="stat-label">{label}</span>
        <span className="stat-dot" aria-hidden="true" />
      </div>
      <span className="stat-value">{value}</span>
      <span className="stat-change">{change}</span>
    </article>
  )
}
