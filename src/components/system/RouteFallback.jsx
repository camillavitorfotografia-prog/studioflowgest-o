export default function RouteFallback() {
  return (
    <main className="system-state-page" aria-busy="true" aria-live="polite">
      <section className="system-state-card system-state-card--loading">
        <span className="system-state-spinner" aria-hidden="true" />
        <p className="system-state-eyebrow">StudioFlow</p>
        <h1>Carregando módulo</h1>
        <p>Aguarde enquanto preparamos esta área.</p>
      </section>
    </main>
  );
}
