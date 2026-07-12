import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listTemplates, saveTemplate } from '../../features/documents/api/documentTemplateApi';
import { createEmptyTemplate } from '../../features/documents/schemas/documentTemplateSchema';
import { DEFAULT_PROPOSAL_MODELS, createDefaultModelPages } from '../../features/documents/editor/proposalLayoutLibrary';
import { createId } from '../../features/documents/utils/documentIds';
import './ModelosPropostas.css';


const statusLabel = (status) => {
  if (!status) return 'Rascunho';
  if (status === 'published' || status === 'Publicado') return 'Publicado';
  return status;
};

export default function ModelosPropostas() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newModel, setNewModel] = useState({ name: '', category: '', jobType: '', description: '', color: '#c9a06c', order: 0, baseTemplateId: '', startMode: 'blank' });
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    async function loadDefaults() {
      setLoading(true);
      const existing = await listTemplates({ documentType: 'proposal' });
      if (!active) return;

      const byName = new Map((existing || []).map((template) => [template.name, template]));
      const createdMissing = await Promise.all(
          DEFAULT_PROPOSAL_MODELS.filter((item) => !byName.has(item.name)).map(async (item) => {
            const template = createEmptyTemplate({ name: item.name, category: item.category });
            return saveTemplate({
              ...template,
              pages: createDefaultModelPages(item),
              status: 'draft', isPublished: false, version: 1,
            });
          }));
      const allTemplates = [...(existing || []), ...createdMissing];
      const migrated = await Promise.all(allTemplates.map((template) => { const definition = DEFAULT_PROPOSAL_MODELS.find((item) => item.name === template.name); return definition && template.pages?.length <= 1 ? saveTemplate({ ...template, pages: createDefaultModelPages(definition) }) : template; }));
      setTemplates(migrated);
      if (active) setLoading(false);
    }

    loadDefaults();
    return () => {
      active = false;
    };
  }, []);

  const openNew = () => {
    setNewModel({ name: '', category: '', jobType: '', description: '', color: '#c9a06c', order: templates.length, baseTemplateId: '', startMode: 'blank' });
    setShowNew(true);
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    const template = createEmptyTemplate({ name: newModel.name || 'Novo Modelo', category: newModel.category || '' });
    const base = templates.find((item) => item.id === newModel.baseTemplateId);
    const clonedPages = base?.pages?.map((page, order) => ({ ...page, id: createId('page'), order, elements: (page.elements || []).map((element) => ({ ...element, id: createId(element.type) })) }));
    const toSave = {
      ...template,
      pages: newModel.startMode === 'duplicate' && clonedPages?.length ? clonedPages : template.pages,
      metadata: {
        ...(template.metadata || {}),
        jobType: newModel.jobType || '',
        description: newModel.description || '',
        color: newModel.color || '#c9a06c',
      },
      order: Number(newModel.order) || 0,
      baseTemplateId: newModel.baseTemplateId || null,
    };

    const saved = await saveTemplate(toSave);
    setTemplates((prev) => [saved, ...prev]);
    setShowNew(false);
    navigate(`/configuracoes/modelos-propostas/${saved.id}`);
  };

  const cancelCreate = () => {
    setShowNew(false);
  };

  return (
    <section className="modelos-propostas-page">
      <header className="modelos-propostas-header">
        <div>
          <span>Modelos de Propostas</span>
          <h1>Escolha um modelo para editar</h1>
          <p>Use os modelos padrão do StudioFlow como ponto de partida para suas propostas.</p>
        </div>
        <div className="modelos-actions">
          <button type="button" onClick={openNew}>Criar novo modelo</button>
        </div>
      </header>

      {loading ? (
        <div className="modelos-propostas-loading">Carregando modelos...</div>
      ) : (
        <div className="modelos-propostas-grid">
          {templates.map((template) => (
            <article key={template.id} className="modelos-propostas-card">
              <div className="card-header">
                <h2>{template.name}</h2>
                <span>{template.category}</span>
              </div>
              <div className="card-meta">
                <div>
                  <strong>Status</strong>
                  <p>{statusLabel(template.status)}</p>
                </div>
                <div>
                  <strong>Versão</strong>
                  <p>{template.version || 1}</p>
                </div>
              </div>
              <button type="button" onClick={() => navigate(`/configuracoes/modelos-propostas/${template.id}`)}>
                Editar modelo
              </button>
            </article>
          ))}
          <article className="modelos-propostas-card new-card" key="__new">
            <div className="card-header">
              <h2>Novo modelo</h2>
              <span>Personalizável</span>
            </div>
            <div className="card-meta">
              <div>
                <strong>Itens</strong>
                <p>vazio</p>
              </div>
              <div>
                <strong>Versão</strong>
                <p>—</p>
              </div>
            </div>
            <button type="button" onClick={openNew}>Criar modelo</button>
          </article>
        </div>
      )}

      {showNew && (
        <div className="new-model-overlay">
          <form className="new-model-form" onSubmit={handleCreate}>
            <h3>Novo Modelo de Proposta</h3>
            <label>Nome<input required value={newModel.name} onChange={(e) => setNewModel({ ...newModel, name: e.target.value })} /></label>
            <label>Categoria<input value={newModel.category} onChange={(e) => setNewModel({ ...newModel, category: e.target.value })} /></label>
            <label>Tipo de trabalho<input value={newModel.jobType} onChange={(e) => setNewModel({ ...newModel, jobType: e.target.value })} /></label>
            <label>Descrição<textarea value={newModel.description} onChange={(e) => setNewModel({ ...newModel, description: e.target.value })} /></label>
            <label>Como começar<select value={newModel.startMode} onChange={(e) => setNewModel({ ...newModel, startMode: e.target.value })}><option value="blank">Começar em branco</option><option value="duplicate">Duplicar modelo existente</option></select></label>
            <label>Cor de identificação<input type="color" value={newModel.color} onChange={(e) => setNewModel({ ...newModel, color: e.target.value })} /></label>
            <label>Ordem na lista<input type="number" value={newModel.order} onChange={(e) => setNewModel({ ...newModel, order: Number(e.target.value) })} /></label>
            <label>Modelo base opcional
              <select value={newModel.baseTemplateId || ''} onChange={(e) => setNewModel({ ...newModel, baseTemplateId: e.target.value || '' })}>
                <option value="">Nenhum</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <div className="new-model-actions">
              <button type="button" onClick={cancelCreate}>Cancelar</button>
              <button type="submit">Criar e editar</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
