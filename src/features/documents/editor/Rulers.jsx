export default function Rulers({ width = 595, height = 842, visible = false }) {
  if (!visible) return null;

  return (
    <div className="contract-rulers" aria-hidden="true">
      <div className="contract-ruler horizontal" style={{ width }} />
      <div className="contract-ruler vertical" style={{ height }} />
    </div>
  );
}
