import {
  ArrowDown,
  ArrowUp,
  Copy,
  FilePlus2,
  Trash2,
} from 'lucide-react';

export default function PagesPanel({
  pages,
  pageId,
  mobileActive,
  onAddPage,
  onSelectPage,
  onRenamePage,
  onTogglePage,
  onMovePage,
  onDuplicatePage,
  onDeletePage,
}) {
  return (
    <aside className={`contract-pages ${mobileActive ? 'mobile-active' : ''}`}>
      <button type="button" onClick={onAddPage}>
        <FilePlus2 />
        Adicionar página
      </button>

      {pages.map((item, index) => (
        <article
          key={item.id}
          className={item.id === pageId ? 'active' : ''}
          onClick={() => onSelectPage(item.id)}
        >
          <span>{index + 1}</span>

          <input
            value={item.name}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onRenamePage(item.id, event.target.value)}
          />

          <input
            aria-label="Ativar página"
            type="checkbox"
            checked={item.active}
            onChange={(event) => onTogglePage(item.id, event.target.checked)}
          />

          <div>
            <button
              type="button"
              disabled={index === 0}
              onClick={(event) => {
                event.stopPropagation();
                onMovePage(index, -1);
              }}
            >
              <ArrowUp />
            </button>

            <button
              type="button"
              disabled={index === pages.length - 1}
              onClick={(event) => {
                event.stopPropagation();
                onMovePage(index, 1);
              }}
            >
              <ArrowDown />
            </button>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onDuplicatePage(item, index);
              }}
            >
              <Copy />
            </button>

            <button
              type="button"
              disabled={pages.length === 1}
              onClick={(event) => {
                event.stopPropagation();
                onDeletePage(item.id);
              }}
            >
              <Trash2 />
            </button>
          </div>
        </article>
      ))}
    </aside>
  );
}
