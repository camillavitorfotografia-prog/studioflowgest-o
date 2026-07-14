export default function Canvas({ mobileActive, children }) {
  return (
    <main className={`contract-a4-stage ${mobileActive ? 'mobile-active' : ''}`}>
      {children}
    </main>
  );
}
