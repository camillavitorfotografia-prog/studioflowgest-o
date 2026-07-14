export default function PropertiesPanel({ children, mobileActive }) {
  return (
    <aside className={`contract-field-panel ${mobileActive ? 'mobile-active' : ''}`}>
      {children}
    </aside>
  );
}
