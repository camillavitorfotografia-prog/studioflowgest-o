export default function DashboardPanel({ title, subtitle, action, children, className = '' }) {
  return (
    <section className={`sf-dashboard-panel ${className}`.trim()}>
      <header className="sf-dashboard-panel-header">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
