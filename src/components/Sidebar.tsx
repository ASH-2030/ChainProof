const navItems = [
  { label: 'Overview', active: true },
  { label: 'Signals', active: false },
  { label: 'Reports', active: false },
  { label: 'Assets', active: false },
]

export function Sidebar() {
  return (
    <aside className="sidebar" aria-label="Sidebar navigation">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-name">ChainProof</span>
      </div>

      <ul className="nav-list">
        {navItems.map((item) => (
          <li key={item.label} className={`nav-item ${item.active ? 'active' : ''}`}>
            <span className="nav-icon" aria-hidden="true" />
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </aside>
  )
}
