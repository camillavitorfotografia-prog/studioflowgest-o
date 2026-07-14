export default function MobileTabs({ value, onChange }) {
  return (
    <nav className="contract-mobile-tabs">
      {['pages', 'canvas', 'fields'].map((tab) => (
        <button
          type="button"
          key={tab}
          className={value === tab ? 'active' : ''}
          onClick={() => onChange(tab)}
        >
          {tab === 'pages'
            ? 'Páginas'
            : tab === 'canvas'
              ? 'Visualização'
              : 'Elementos'}
        </button>
      ))}
    </nav>
  );
}
