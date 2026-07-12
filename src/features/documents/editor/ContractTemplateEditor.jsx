import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Copy, FilePlus2, Lock, Save, Trash2, Unlock } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { getTemplate, saveTemplate } from '../storage/documentStorageAdapter';
import { createDraftVersion, publishNewVersion } from '../services/templateVersionManager';
import { createId } from '../utils/documentIds';
import './ContractTemplateEditor.css';

const fieldOptions = ['client.name','client.cpf','client.rg','client.email','client.phone','client.address','work.type','work.date','work.time','work.location','package.name','package.services','pricing.total','pricing.deposit','pricing.installments','pricing.paymentConditions','studio.name','studio.cnpj','studio.address','studio.email','studio.phone','signature.client','signature.studio','signature.witness1','signature.witness2'];
const newPage = (order) => ({ id: createId('page'), name: `Página ${order+1}`, order, active: true, width: 595.28, height: 841.89, background: { type: 'none', opacity: 1 }, elements: [], metadata: { fixedLegalContent: true } });
const newField = (pageId) => ({ id: createId('field'), type: 'dynamicField', placeholderKey: 'client.name', pageId, x: 60, y: 100, width: 220, height: 28, fontFamily: 'Helvetica', fontSize: 12, fontWeight: '400', color: '#222222', align: 'left', lineHeight: 1.2, letterSpacing: 0, opacity: 1, hideIfEmpty: true, locked: false, visible: true });

export default function ContractTemplateEditor() {
  const { templateId: paramTemplateId, modelId: paramModelId } = useParams();
  const templateId = paramTemplateId || paramModelId;
  const navigate = useNavigate();
  const [template, setTemplate] = useState(null);
  const [pageId, setPageId] = useState(null);
  const [fieldId, setFieldId] = useState(null);
  const [mobileTab, setMobileTab] = useState('pages');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    // reset state asynchronously to avoid synchronous setState inside effect
    Promise.resolve().then(() => {
      setTemplate(null);
      setPageId(null);
      setFieldId(null);
      setLoading(true);
    });

    (async () => {
      const data = await getTemplate(templateId);
      if (!active) return;
      setTemplate(data);
      setPageId(data?.pages?.[0]?.id || null);
      setLoading(false);
    })();

    return () => { active = false; };
  }, [templateId]);

  const pages = useMemo(() => [...(template?.pages || [])].sort((a, b) => (a.order || 0) - (b.order || 0)), [template]);
  const page = pages.find((item) => item.id === pageId) || null;
  const field = page?.elements?.find((item) => item.id === fieldId) || null;

  const updatePages = (next) => setTemplate((current) => ({ ...current, pages: next.map((item, index) => ({ ...item, order: index })), updatedAt: new Date().toISOString() }));

  const save = async () => {
    if (!template) return;
    if (template.isPublished) {
      const draft = await createDraftVersion({ ...template, status: 'draft' });
      setMessage('Modelo publicado preservado; nova versão em rascunho criada.');
      navigate(`/configuracoes/modelos-contratos/${draft.id}`, { replace: true });
      return;
    }
    await saveTemplate({ ...template, status: 'draft' });
    setMessage('Modelo salvo.');
  };

  const publish = async () => {
    if (!template) return;
    const published = await publishNewVersion({ ...template, status: 'published' });
    setMessage(`Versão ${published.version} publicada.`);
    navigate(`/configuracoes/modelos-contratos/${published.id}`, { replace: true });
  };

  const updatePage = (patch) => updatePages(pages.map((item) => item.id === page.id ? { ...item, ...patch } : item));
  const updateField = (patch) => updatePage({ elements: page.elements.map((item) => item.id === field.id ? { ...item, ...patch } : item) });

  if (loading) return <p>Carregando editor...</p>;
  if (!template) return (
    <div className="editor-empty">
      <p>Modelo não encontrado.</p>
      <div>
        <button onClick={() => navigate('/configuracoes/modelos-contratos')}>Voltar</button>
      </div>
    </div>
  );

  return (
    <section className="contract-template-editor">
      <header>
        <button onClick={() => navigate('/configuracoes/modelos-contratos')}><ArrowLeft />Voltar</button>
        <div>
          <input value={template.name} onChange={(e) => setTemplate({ ...template, name: e.target.value })} />
          <span>{template.category} · v{template.version} · {template.isPublished ? 'Publicado' : 'Rascunho'}</span>
        </div>
        <button onClick={save}><Save />Salvar</button>
        <button className="publish" onClick={publish}>Publicar nova versão</button>
      </header>

      <nav className="contract-mobile-tabs">
        {['pages', 'canvas', 'fields'].map((tab) => <button key={tab} className={mobileTab === tab ? 'active' : ''} onClick={() => setMobileTab(tab)}>{tab === 'pages' ? 'Páginas' : tab === 'canvas' ? 'Visualização' : 'Campos'}</button>)}
      </nav>

      <div className="contract-editor-grid">
        <aside className={`contract-pages ${mobileTab === 'pages' ? 'mobile-active' : ''}`}>
          <button onClick={() => { const item = newPage(pages.length); updatePages([...pages, item]); setPageId(item.id); }}><FilePlus2 />Adicionar página</button>
          {pages.map((item, index) => (
            <article key={item.id} className={item.id === pageId ? 'active' : ''} onClick={() => { setPageId(item.id); setFieldId(null); }}>
              <span>{index + 1}</span>
              <input value={item.name} onClick={(e) => e.stopPropagation()} onChange={(e) => updatePages(pages.map((entry) => entry.id === item.id ? { ...entry, name: e.target.value } : entry))} />
              <input aria-label="Ativar página" type="checkbox" checked={item.active} onChange={(e) => updatePages(pages.map((entry) => entry.id === item.id ? { ...entry, active: e.target.checked } : entry))} />
              <div>
                <button disabled={index === 0} onClick={() => { const next = [...pages]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; updatePages(next); }}><ArrowUp /></button>
                <button disabled={index === pages.length - 1} onClick={() => { const next = [...pages]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; updatePages(next); }}><ArrowDown /></button>
                <button onClick={() => updatePages([...pages.slice(0, index + 1), { ...item, id: createId('page'), name: `${item.name} cópia` }, ...pages.slice(index + 1)])}><Copy /></button>
                <button disabled={pages.length === 1} onClick={() => updatePages(pages.filter((entry) => entry.id !== item.id))}><Trash2 /></button>
              </div>
            </article>
          ))}
        </aside>

        <main className={`contract-a4-stage ${mobileTab === 'canvas' ? 'mobile-active' : ''}`}>
          <div className="contract-a4">
            {page?.metadata?.fixedLegalContent && <div className="legal-protected">Conteúdo jurídico fixo protegido</div>}
            {page?.elements?.filter((item) => item.visible).map((item) => (
              <button key={item.id} className={item.id === fieldId ? 'selected' : ''} onClick={() => setFieldId(item.id)} style={{ left: item.x, top: item.y, width: item.width, height: item.height, fontFamily: item.fontFamily, fontSize: item.fontSize, fontWeight: item.fontWeight, color: item.color, textAlign: item.align, opacity: item.opacity }}>{`{{${item.placeholderKey}}}`}</button>
            ))}
          </div>
        </main>

        <aside className={`contract-field-panel ${mobileTab === 'fields' ? 'mobile-active' : ''}`}>
          <h2>Configurações</h2>
          <label>Fundo
            <select value={page?.background?.type || 'none'} onChange={(e) => updatePage({ background: { ...page.background, type: e.target.value } })}>
              <option value="none">Sem fundo</option>
              <option value="pdf">PDF original</option>
              <option value="image">Imagem</option>
            </select>
          </label>
          <button onClick={() => { const item = newField(page.id); updatePage({ elements: [...(page.elements || []), item] }); setFieldId(item.id); }}>Adicionar campo variável</button>
          <div className="contract-field-list">{page?.elements?.map((item) => <button key={item.id} className={item.id === fieldId ? 'active' : ''} onClick={() => setFieldId(item.id)}>{item.placeholderKey}</button>)}</div>
          {field && <div className="contract-field-properties">
            <label>Campo
              <select value={field.placeholderKey} onChange={(e) => updateField({ placeholderKey: e.target.value })}>
                {fieldOptions.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            {[['x','X'],['y','Y'],['width','Largura'],['height','Altura'],['fontSize','Tamanho'],['letterSpacing','Espaçamento'],['opacity','Opacidade']].map(([key,label]) => <label key={key}>{label}<input type="number" step={key === 'opacity' ? '.1' : '1'} value={field[key]} onChange={(e) => updateField({ [key]: Number(e.target.value) })} /></label>)}
            <label>Fonte
              <select value={field.fontFamily} onChange={(e) => updateField({ fontFamily: e.target.value })}>
                <option>Helvetica</option>
                <option>Times-Roman</option>
                <option>Courier</option>
              </select>
            </label>
            <label>Peso
              <select value={field.fontWeight} onChange={(e) => updateField({ fontWeight: e.target.value })}>
                <option value="400">Regular</option>
                <option value="700">Negrito</option>
              </select>
            </label>
            <label>Cor<input type="color" value={field.color} onChange={(e) => updateField({ color: e.target.value })} /></label>
            <button onClick={() => updateField({ locked: !field.locked })}>{field.locked ? <Unlock /> : <Lock />}{field.locked ? 'Desbloquear' : 'Bloquear posição'}</button>
            <button onClick={() => { updatePage({ elements: page.elements.filter((item) => item.id !== field.id) }); setFieldId(null); }}><Trash2 />Remover campo</button>
          </div>}
        </aside>
      </div>

      {message && <div className="contract-editor-message">{message}</div>}
    </section>
  );
}
