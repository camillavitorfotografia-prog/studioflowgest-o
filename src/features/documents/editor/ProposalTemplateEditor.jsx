import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Eye, Redo2, Save, Undo2 } from 'lucide-react';
import { createPage } from '../schemas/documentTemplateSchema';
import { createId } from '../utils/documentIds';
import { saveTemplate, getTemplate } from '../api/documentTemplateApi';
import { publishNewVersion } from '../services/templateVersionManager';
import PageSidebar from './PageSidebar';
import PageCanvas from './PageCanvas';
import PageSettingsPanel from './PageSettingsPanel';
import LayoutLibraryModal from './LayoutLibraryModal';
import { createPageFromLayout } from './proposalLayoutLibrary';
import './ProposalTemplateEditor.css';
import './ProposalTemplateEditorEnhancements.css';

export default function ProposalTemplateEditor() {
  const { templateId: paramTemplateId, modelId: paramModelId } = useParams();
  const templateId = paramTemplateId || paramModelId;
  const navigate = useNavigate();
  const [template, setTemplate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isDirty, setIsDirty] = useState(false);
  const [selectedPageId, setSelectedPageId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedElementId, setSelectedElementId] = useState(null);
  const [zoom, setZoom] = useState(.78);
  const [preview, setPreview] = useState(false);
  const [leftOpen, setLeftOpen] = useState(() => sessionStorage.getItem('pte_left_open') !== 'false');
  const [rightOpen, setRightOpen] = useState(() => sessionStorage.getItem('pte_right_open') !== 'false');
  const [editingElementId, setEditingElementId] = useState(null);
  const [clipboardElement, setClipboardElement] = useState(null);
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [layoutLibraryOpen, setLayoutLibraryOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState('editor');

  useEffect(() => {
    let active = true;
    // reset state asynchronously to avoid synchronous setState inside effect
    Promise.resolve().then(() => {
      setTemplate(null);
      setSelectedPageId(null);
      setSelectedElementId(null);
      setLoading(true);
    });

    async function loadTemplate() {
      const data = await getTemplate(templateId);
      if (!active) return;
      setTemplate(data);
      setSelectedPageId(data?.pages?.[0]?.id || null);
      setLoading(false);
    }

    loadTemplate();
    return () => { active = false; };
  }, [templateId]);

  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (!template) return;
    if (!template.pages || template.pages.length === 0) {
      Promise.resolve().then(() => {
        setTemplate((current) => ({
          ...current,
          pages: [createPage({ id: createId('page'), name: 'Capa', order: 0 })],
        }));
      });
      return;
    }
    if (!selectedPageId || (selectedPageId && !template.pages.some((page) => page.id === selectedPageId))) {
      Promise.resolve().then(() => {
        setSelectedPageId(template.pages[0]?.id || null);
      });
    }
  }, [template, selectedPageId]);

  const pages = useMemo(() => (template?.pages || []).slice().sort((a, b) => Number(a.order || 0) - Number(b.order || 0)), [template]);
  const selectedPage = pages.find((page) => page.id === selectedPageId) || pages[0] || null;

  const updateTemplate = (patch) => {
    setHistory((items) => [...items.slice(-29), template]);
    setFuture([]);
    setTemplate((current) => {
      const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
      return next;
    });
    setIsDirty(true);
  };

  const updatePage = (pageId, patch, commit = true) => {
    if (!template) return;
    if (commit) { setHistory((items) => [...items.slice(-29), template]); setFuture([]); }
    const nextPages = (template.pages || []).map((page) => (page.id === pageId ? { ...page, ...patch } : page));
    setTemplate((current) => ({ ...current, pages: nextPages, updatedAt: new Date().toISOString() }));
    setIsDirty(true);
  };

  const handleAddPage = () => {
    setLayoutLibraryOpen(true);
  };

  const insertPage = (nextPage) => {
    const selectedIndex = pages.findIndex((item) => item.id === selectedPageId);
    const index = selectedIndex < 0 ? pages.length : selectedIndex + 1;
    const next = [...pages]; next.splice(index, 0, nextPage);
    updateTemplate({ pages: next.map((item, order) => ({ ...item, order })) });
    setSelectedPageId(nextPage.id); setSelectedElementId(null); setLayoutLibraryOpen(false); setMobileTab('editor');
  };

  const chooseLayout = (layoutId) => {
    if (layoutId === 'duplicate') { handleDuplicatePage(selectedPageId); setLayoutLibraryOpen(false); return; }
    insertPage(createPageFromLayout(layoutId));
  };

  const importFullPage = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => insertPage({ ...createPageFromLayout('import-jpeg', 'Página importada'), background: { type: 'jpeg', url: reader.result, opacity: 1, overlayColor: '#000000', overlayOpacity: 0, positionX: 50, positionY: 50, zoom: 1 } });
    reader.readAsDataURL(file);
  };

  const handleDuplicatePage = (pageId) => {
    const page = pages.find((item) => item.id === pageId);
    if (!page) return;
    const duplicate = {
      ...page,
      id: createId('page'),
      name: `${page.name} (cópia)`,
      order: pages.length,
      elements: (page.elements || []).map((element) => ({ ...element, id: createId(element.type) })),
    };
    updateTemplate({ pages: [...pages, duplicate] });
    setSelectedPageId(duplicate.id);
  };

  const handleRemovePage = (pageId) => {
    if (pages.length === 1) return;
    const filtered = pages.filter((page) => page.id !== pageId).map((page, index) => ({ ...page, order: index }));
    updateTemplate({ pages: filtered });
  };

  const handleTogglePageActive = (pageId) => {
    const page = pages.find((item) => item.id === pageId);
    if (!page) return;
    handlePageUpdate(pageId, { active: !page.active });
  };

  const handlePageUpdate = (pageId, patch) => {
    const page = pages.find((item) => item.id === pageId);
    if (!page) return;
    updatePage(pageId, { ...patch });
  };

  const changeElement = (elementId, patch, commit = true) => {
    if (patch.selected) { setSelectedElementId(elementId); return; }
    if (!selectedPage) return;
    updatePage(selectedPage.id, { elements: (selectedPage.elements || []).map((element) => element.id === elementId ? { ...element, ...patch } : element) }, commit);
  };
  const addText = () => {
    const element = { id: createId('text'), type: 'text', content: 'Novo texto', x: 70, y: 100, width: 300, height: 60, rotation: 0, opacity: 1, zIndex: (selectedPage.elements?.length || 0) + 1, locked: false, visible: true, fontFamily: 'Helvetica', fontSize: 24, fontWeight: '400', fontStyle: 'normal', color: '#ffffff', align: 'left', lineHeight: 1.2, letterSpacing: 0, hideIfEmpty: true };
    updatePage(selectedPage.id, { elements: [...(selectedPage.elements || []), element] }); setSelectedElementId(element.id);
  };
  const addElement = (type) => {
    if (type === 'text') { addText(); return; }
    const labels = { logo: 'Logo', rectangle: 'Retângulo', line: 'Linha', circle: 'Círculo', overlay: 'Overlay', package: 'Nome do pacote', price: 'R$ 0.000,00', services: 'Lista de serviços', payment: 'Condições de pagamento', testimonial: 'Depoimento', dynamic: 'Campo dinâmico' };
    const isDynamic = ['package','price','services','payment','dynamic'].includes(type);
    const element = isDynamic ? { id: createId(type), name: labels[type], type: 'pricing', dynamicKey: type, content: labels[type], x: 70, y: 120, width: 360, height: type === 'services' ? 180 : 55, fontFamily: 'Arial', fontSize: type === 'price' ? 34 : 20, fontWeight: '600', color: '#ffffff', align: 'left', lineHeight: 1.2, letterSpacing: 0, hideIfEmpty: true } : { id: createId(type), name: labels[type], type, x: 70, y: 120, width: type === 'line' ? 360 : 220, height: type === 'line' ? 4 : 120, fill: type === 'overlay' ? '#000000' : '#c9a06c', stroke: '#c9a06c', borderRadius: type === 'circle' ? 999 : 0 };
    Object.assign(element, { rotation: 0, opacity: type === 'overlay' ? .45 : 1, zIndex: (selectedPage.elements?.length || 0) + 1, locked: false, visible: true });
    updatePage(selectedPage.id, { elements: [...(selectedPage.elements || []), element] }); setSelectedElementId(element.id);
  };
  const addImage = (file, replaceId) => {
    if (!file || !selectedPage) return; const reader = new FileReader(); reader.onload = () => { if (replaceId) { changeElement(replaceId, { src: reader.result }); return; } const element = { id: createId('image'), type: 'image', src: reader.result, x: 60, y: 80, width: 470, height: 300, rotation: 0, opacity: 1, zoom: 1, positionX: 50, positionY: 50, zIndex: (selectedPage.elements?.length || 0) + 1, locked: false, visible: true }; updatePage(selectedPage.id, { elements: [...(selectedPage.elements || []), element] }); setSelectedElementId(element.id); }; reader.readAsDataURL(file);
  };
  const duplicateElement = (id) => { const source = selectedPage.elements.find((item) => item.id === id); if (!source) return; const copy = { ...source, id: createId(source.type), x: source.x + 12, y: source.y + 12, zIndex: (selectedPage.elements?.length || 0) + 1 }; updatePage(selectedPage.id, { elements: [...selectedPage.elements, copy] }); setSelectedElementId(copy.id); };
  const deleteElement = (id) => { updatePage(selectedPage.id, { elements: selectedPage.elements.filter((item) => item.id !== id) }); setSelectedElementId(null); };
  const moveLayer = (id, direction) => changeElement(id, { zIndex: Math.max(0, Number(selectedPage.elements.find((item) => item.id === id)?.zIndex || 0) + direction) });
  const undo = () => { const previous = history.at(-1); if (!previous) return; setFuture((items) => [template, ...items]); setTemplate(previous); setHistory((items) => items.slice(0, -1)); setIsDirty(true); };
  const redo = () => { const next = future[0]; if (!next) return; setHistory((items) => [...items, template]); setTemplate(next); setFuture((items) => items.slice(1)); setIsDirty(true); };

  useEffect(() => {
    const handleShortcut = (event) => {
      const active = document.activeElement;
      const typing = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
      if (typing) return;

      // Undo/redo
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }

      // Delete
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedElementId && !editingElementId) { event.preventDefault(); deleteElement(selectedElementId); }
      }

      // Duplicate
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
        if (selectedElementId && !typing) { event.preventDefault(); duplicateElement(selectedElementId); }
      }

      // Copy/Paste (simple internal clipboard)
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
        if (selectedElementId && !typing) { const source = selectedPage?.elements?.find((e) => e.id === selectedElementId); if (source) { setClipboardElement(source); } }
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
        if (clipboardElement && !typing) { event.preventDefault(); const copy = { ...clipboardElement, id: createId(clipboardElement.type), x: (clipboardElement.x || 0) + 12, y: (clipboardElement.y || 0) + 12, zIndex: (selectedPage.elements?.length || 0) + 1 }; updatePage(selectedPage.id, { elements: [...selectedPage.elements, copy] }); setSelectedElementId(copy.id); }
      }

      // Arrow moves
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)) {
        if (!selectedElementId || editingElementId) return;
        event.preventDefault();
        const delta = event.shiftKey ? 10 : 1;
        const dx = event.key === 'ArrowLeft' ? -delta : event.key === 'ArrowRight' ? delta : 0;
        const dy = event.key === 'ArrowUp' ? -delta : event.key === 'ArrowDown' ? delta : 0;
        const el = selectedPage.elements.find((e) => e.id === selectedElementId);
        if (!el) return;
        changeElement(selectedElementId, { x: (el.x || 0) + dx, y: (el.y || 0) + dy });
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  });

  useEffect(() => { sessionStorage.setItem('pte_left_open', leftOpen ? 'true' : 'false'); }, [leftOpen]);
  useEffect(() => { sessionStorage.setItem('pte_right_open', rightOpen ? 'true' : 'false'); }, [rightOpen]);

  const handleReorderPage = (pageId, direction) => {
    const index = pages.findIndex((page) => page.id === pageId);
    if (index < 0) return;
    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= pages.length) return;
    const nextPages = [...pages];
    const page = nextPages[index];
    nextPages[index] = nextPages[nextIndex];
    nextPages[nextIndex] = page;
    const reordered = nextPages.map((page, idx) => ({ ...page, order: idx }));
    updateTemplate({ pages: reordered });
  };

  const handleUploadImage = (file) => {
    if (!selectedPage) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!file || !allowed.includes(file.type)) return;
    const reader = new FileReader();
    reader.onload = () => {
      handlePageUpdate(selectedPage.id, {
        background: {
          ...selectedPage.background,
          type: 'jpeg',
          url: reader.result,
          opacity: selectedPage.background.opacity || 1,
          zoom: selectedPage.background.zoom || 1,
          positionX: selectedPage.background.positionX || 50,
          positionY: selectedPage.background.positionY || 50,
        },
      });
    };
    reader.readAsDataURL(file);
  };

  const enterEdit = (id) => {
    setEditingElementId(id);
    setSelectedElementId(id);
  };

  const exitEdit = () => setEditingElementId(null);

  const handleRemoveImage = () => {
    if (!selectedPage) return;
    handlePageUpdate(selectedPage.id, {
      background: { ...selectedPage.background, url: null, type: 'none' },
    });
  };

  const handleSave = async () => {
    if (!template) return;
    setSaving(true);
    try {
      const nextTemplate = {
        ...template,
        status: 'draft',
        updatedAt: new Date().toISOString(),
      };
      const saved = await saveTemplate(nextTemplate);
      setTemplate(saved);
      setIsDirty(false);
      setMessage('Modelo salvo com sucesso.');
      window.setTimeout(() => setMessage(''), 3000);
      if (!template.id && saved.id) {
        navigate(`/configuracoes/modelos-propostas/${saved.id}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!template) return;
    setPublishing(true);
    try {
      const maybeSaved = template.id ? template : await saveTemplate(template);
      const published = await publishNewVersion(maybeSaved);
      setTemplate(published);
      setIsDirty(false);
      setMessage('Nova versão publicada com sucesso.');
      window.setTimeout(() => setMessage(''), 3000);
      if (published.id) {
        navigate(`/configuracoes/modelos-propostas/${published.id}`);
      }
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return <div className="editor-loading">Carregando editor...</div>;
  }

  if (!template) {
    return (
      <div className="editor-empty">
        <p>Modelo não encontrado.</p>
        <div>
          <button type="button" onClick={() => navigate('/configuracoes/modelos-propostas')}>Voltar</button>
        </div>
      </div>
    );
  }

  return (
    <section className={`proposal-template-editor ${leftOpen ? '' : 'left-collapsed'} ${rightOpen ? '' : 'right-collapsed'}`}>
      <header className="editor-header">
        <div className="editor-header-left">
          <button type="button" className="editor-back" onClick={() => navigate('/configuracoes/modelos-propostas')}>
            Voltar
          </button>
          <div>
            <span>Editor de Modelos</span>
            <h1>{template.name || 'Novo modelo de proposta'}</h1>
          </div>
        </div>
        <div className="editor-header-right">
          {/* Panel toggles (visible on medium desktop and tablet) */}
          <button type="button" className="editor-action" title="Mostrar páginas" aria-label="Mostrar páginas" onClick={() => setLeftOpen((v) => !v)}>{leftOpen ? 'Ocultar páginas' : 'Mostrar páginas'}</button>
          <button type="button" className="editor-action" title="Mostrar propriedades" aria-label="Mostrar propriedades" onClick={() => setRightOpen((v) => !v)}>{rightOpen ? 'Ocultar propriedades' : 'Mostrar propriedades'}</button>
          <span className="editor-version">v{template.version || 1}</span>
          <button type="button" className="editor-icon-action" aria-label="Desfazer" onClick={undo} disabled={!history.length}><Undo2 /></button>
          <button type="button" className="editor-icon-action" aria-label="Refazer" onClick={redo} disabled={!future.length}><Redo2 /></button>
          <button type="button" className="editor-action" onClick={() => setPreview((value) => !value)}><Eye /> {preview ? 'Editar' : 'Pré-visualizar'}</button>
          <button type="button" className="editor-action" onClick={handleSave} disabled={saving || publishing}>
            <Save /> {saving ? 'Salvando…' : 'Salvar'}
          </button>
          <button type="button" className="editor-action primary" onClick={handlePublish} disabled={publishing || saving}>
            {publishing ? 'Publicando…' : 'Publicar nova versão'}
          </button>
        </div>
      </header>

      {message && <div className="editor-message">{message}</div>}

      <nav className="editor-mobile-tabs" aria-label="Áreas do editor"><button type="button" className={mobileTab === 'pages' ? 'active' : ''} onClick={() => setMobileTab('pages')}>Páginas</button><button type="button" className={mobileTab === 'editor' ? 'active' : ''} onClick={() => setMobileTab('editor')}>Editor</button><button type="button" className={mobileTab === 'properties' ? 'active' : ''} onClick={() => setMobileTab('properties')}>Propriedades</button></nav>

      <div className="editor-body">
        <div className={`editor-mobile-panel pages-panel${mobileTab === 'pages' ? ' mobile-active' : ''}`} style={{ display: leftOpen ? undefined : 'none' }}><PageSidebar
          pages={pages}
          selectedPageId={selectedPageId}
          onSelect={(id) => setSelectedPageId(id)}
          onAdd={handleAddPage}
          onDuplicate={handleDuplicatePage}
          onDelete={handleRemovePage}
          onToggleActive={handleTogglePageActive}
          onMoveUp={(id) => handleReorderPage(id, 'up')}
          onMoveDown={(id) => handleReorderPage(id, 'down')}
        /></div>

        <main className={`editor-canvas-column editor-mobile-panel${mobileTab === 'editor' ? ' mobile-active' : ''}`}>
          <div className="canvas-toolbar">
            <div className="canvas-zoom-controls">
              <button type="button" onClick={() => setZoom(0.5)}>50%</button>
              <button type="button" onClick={() => setZoom(0.75)}>75%</button>
              <button type="button" onClick={() => setZoom(1)}>100%</button>
              <button type="button" onClick={() => setZoom(1.25)}>125%</button>
              <button type="button" onClick={() => setZoom(1.5)}>150%</button>
            </div>
            <div className="canvas-zoom-fit">
              <button type="button" onClick={() => {
                // fit to screen: measure frame and compute zoom
                setTimeout(() => {
                  const frame = document.querySelector('.page-frame');
                  if (!frame || !selectedPage) return;
                  const container = frame.parentElement; const available = container.clientWidth - 40; const ratio = available / frame.getBoundingClientRect().width;
                  const computed = Math.max(0.45, Math.min(1.5, ratio));
                  setZoom(computed);
                }, 40);
              }}>Ajustar à tela</button>
            </div>
            <div className="canvas-zoom-indicator">Zoom {Math.round(zoom * 100)}%</div>
            <input aria-label="Zoom do canvas" className="canvas-zoom-range" type="range" min=".45" max="1.5" step=".01" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
          </div>
          <PageCanvas page={selectedPage} selectedElementId={selectedElementId} onSelectElement={setSelectedElementId} onChangeElement={changeElement} zoom={zoom} preview={preview} editingElementId={editingElementId} onEnterEdit={enterEdit} onExitEdit={exitEdit} onRequestFit={() => { /* noop - handled above */ }} />
          <div className="canvas-meta">
            <label>Nome do modelo</label>
            <input
              type="text"
              value={template.name}
              onChange={(event) => updateTemplate({ name: event.target.value })}
            />
          </div>
        </main>

        <div className={`editor-mobile-panel properties-panel${mobileTab === 'properties' ? ' mobile-active' : ''}`}><PageSettingsPanel
          page={selectedPage}
          selectedElement={(selectedPage?.elements || []).find((element) => element.id === selectedElementId)}
          onChange={(patch) => handlePageUpdate(selectedPage?.id, patch)}
          onUploadImage={handleUploadImage}
          onRemoveImage={handleRemoveImage}
          onChangeElement={changeElement}
          onSelectElement={setSelectedElementId}
          onAddText={addText}
          onAddElement={addElement}
          onAddImage={addImage}
          onDuplicateElement={duplicateElement}
          onDeleteElement={deleteElement}
          onMoveLayer={moveLayer}
        /></div>
      </div>
      <LayoutLibraryModal open={layoutLibraryOpen} onClose={() => setLayoutLibraryOpen(false)} onChoose={chooseLayout} onImport={importFullPage} canDuplicate={Boolean(selectedPage)} />
    </section>
  );
}
