export default function SelectionBox({ rect }) {
  if (!rect) return null;
  return <div className="contract-selection-box" style={rect} />;
}
