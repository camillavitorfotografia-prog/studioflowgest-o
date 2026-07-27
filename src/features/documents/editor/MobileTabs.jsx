import { FileStack, LayoutTemplate, SlidersHorizontal } from 'lucide-react';

const TABS = [
  { id: 'pages', label: 'Páginas', Icon: FileStack },
  { id: 'canvas', label: 'Documento', Icon: LayoutTemplate },
  { id: 'fields', label: 'Configurações', Icon: SlidersHorizontal },
];

export default function MobileTabs({ value, onChange }) {
  return (
    <nav className="contract-mobile-tabs" aria-label="Áreas do editor">
      {TABS.map(({ id, label, Icon }) => (
        <button
          type="button"
          key={id}
          className={value === id ? 'active' : ''}
          onClick={() => onChange(id)}
          aria-current={value === id ? 'page' : undefined}
        >
          <Icon />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
