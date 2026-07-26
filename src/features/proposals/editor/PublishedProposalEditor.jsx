import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, Download, FileText, Save, Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getTemplate } from '../../documents/api/documentTemplateApi';
import { saveProposalInstance } from '../../documents/api/proposalApi';
import PageCanvas from '../../documents/editor/PageCanvas';
import { createId } from '../../documents/utils/documentIds';
import { enrichPricingOptions } from '../services/packageSuggestions';
import { generatePublishedProposalPdf } from '../services/publishedProposalPdf';
import { saveLeadRow } from '../../../utils/dbData';
import './PublishedProposalEditor.css';

const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function packagePageIndexes(pages = []) {
  return pages.map((page, index) => ({ page, index })).filter(({ page }) => {
    const key = normalize(`${page.name || ''} ${page.pageType || ''}`);
    return /pacote|investimento/.test(key) && !/pagamento|condicoes/.test(key);
  });
}

function createTextElement(content, x, y, width, height, style = {}) {
  return {
    id: createId('proposal-field'), type: 'text', name: 'Conteúdo automático da proposta', content,
    x, y, width, height, rotation: 0, opacity: 1, zIndex: 100, locked: false, visible: true,
    fontFamily: 'Arial', fontSize: 18, fontWeight: '500', color: '#ffffff', align: 'left',
    lineHeight: 1.28, letterSpacing: 0, hideIfEmpty: true, ...style,
  };
}

function hydratePages(template, options) {
  const pages = structuredClone(template?.pages || []);
  const targets = packagePageIndexes(pages);
  targets.forEach(({ index }, packageIndex) => {
    const details = options[packageIndex]?.proposalPackage;
    if (!details) return;
    const page = pages[index];
    const autoElements = [
      createTextElement(details.priceLabel, 405, 112, 155, 52, { fontSize: 32, fontWeight: '700', align: 'right' }),
      createTextElement(details.description, 55, 185, 480, 82, { fontSize: 17, fontWeight: '600' }),
      createTextElement((details.bullets || []).map((item) => `• ${item}`).join('\n'), 55, 275, 480, 360, { fontSize: 16, fontWeight: '400', lineHeight: 1.35 }),
    ];
    if (details.students) {
      autoElements.push(createTextElement(`${details.pricePerStudentLabel} por aluno\nTotal da turma: ${details.totalLabel}`, 55, 650, 480, 80, { fontSize: 18, fontWeight: '700' }));
    }
    page.elements = [
      ...(page.elements || []).filter((element) => element.metadata?.source !== 'pricing-auto'),
      ...autoElements.map((element) => ({ ...element, metadata: { source: 'pricing-auto', packageIndex } })),
    ];
  });
  return pages;
}

async function registerLeadProposal(lead, proposal, action) {
  if (!lead?.id) return;
  const now = new Date().toISOString();
  const history = [...(lead.historico || []), {
    id: `proposal-${proposal.id}-${action}-${Date.now()}`,
    tipo: 'proposta',
    acao: action,
    data: now,
    propostaId: proposal.id,
    propostaStatus: proposal.status,
    modeloId: proposal.templateId,
    valor: proposal.packages?.[0]?.proposalPackage?.priceValue || 0,
  }];
  await saveLeadRow({ id: lead.id, payload: {
    ...lead,
    historico: history,
    status: action === 'enviada' ? 'orcamento_enviado' : lead.status,
    proposta_status: proposal.status,
    proposta_id: proposal.id,
    proposta_criada_em: lead.proposta_criada_em || now,
    proposta_enviada_em: action === 'enviada' ? now : lead.proposta_enviada_em,
  }});
}

function updatePackageOption(options, index, changes) {
  return options.map((option, optionIndex) => optionIndex === index
    ? { ...option, proposalPackage: { ...option.proposalPackage, ...changes } }
    : option);
}

export default function PublishedProposalEditor({ incoming }) {
  const navigate = useNavigate();
  const [template, setTemplate] = useState(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [proposalId, setProposalId] = useState(incoming.proposalId || null);
  const [options, setOptions] = useState(() => enrichPricingOptions(incoming.pricingOptions || []));
  const autoCreatedRef = useRef(false);
  const pages = useMemo(() => hydratePages(template, options), [template, options]);

  useEffect(() => {
    let active = true;
    getTemplate(incoming.publishedTemplateId)
      .then((result) => {
        if (!active) return;
        if (!result) throw new Error('O modelo correspondente não foi encontrado.');
        setTemplate(result);
      })
      .catch((error) => { if (active) setMessage(`Não foi possível abrir o modelo: ${error.message}`); });
    return () => { active = false; };
  }, [incoming.publishedTemplateId]);

  const persist = async (status = 'draft', action = 'salva', extra = {}) => {
    if (!template) return null;
    setSaving(true);
    try {
      const proposal = await saveProposalInstance({
        id: proposalId || null,
        documentType: 'proposal',
        templateId: template.id,
        templateVersion: template.version,
        leadId: incoming.lead?.id || null,
        clientId: incoming.lead?.clientId || null,
        title: `Proposta · ${incoming.lead?.nome || incoming.lead?.name || 'Cliente'}`,
        status,
        packages: options,
        pages,
        pricingSnapshot: { category: incoming.pricingCategory, state: incoming.pricingState || {}, options },
        generatedAt: status === 'generated' ? new Date().toISOString() : extra.generatedAt,
        sentAt: status === 'sent' ? new Date().toISOString() : extra.sentAt,
        metadata: {
          source: 'pricing',
          leadName: incoming.lead?.nome || incoming.lead?.name || '',
          modelName: template.name,
          templateWasPublished: incoming.templateWasPublished !== false,
          pdfFileName: extra.pdfFileName || null,
        },
      });
      setProposalId(proposal.id);
      await registerLeadProposal(incoming.lead, proposal, action);
      if (action !== 'criada') {
        setMessage(action === 'enviada'
          ? 'Proposta marcada como enviada e CRM atualizado.'
          : action === 'gerada'
            ? 'PDF gerado e proposta registrada no CRM.'
            : 'Proposta salva e vinculada ao CRM.');
      }
      return proposal;
    } catch (error) {
      setMessage(`Não foi possível salvar: ${error.message}`);
      return null;
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!template || autoCreatedRef.current) return;
    autoCreatedRef.current = true;
    void persist('draft', 'criada');
    // persist intentionally runs once when the selected template is ready
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template]);

  const generatePdf = async () => {
    if (!template || saving) return;
    setSaving(true);
    try {
      const result = await generatePublishedProposalPdf({ template, pages, lead: incoming.lead });
      await persist('generated', 'gerada', { pdfFileName: result.fileName, generatedAt: new Date().toISOString() });
    } catch (error) {
      setMessage(`Não foi possível gerar o PDF: ${error.message}`);
      setSaving(false);
    }
  };

  if (!template) return <div className="published-proposal-loading">{message || 'Carregando o editor da proposta…'}</div>;
  const page = pages[pageIndex];

  return <section className="published-proposal-editor">
    <header>
      <div>
        <button type="button" onClick={() => navigate(-1)}><ArrowLeft /> Voltar</button>
        <span>EDITOR DA PROPOSTA</span>
        <h1>{template.name}</h1>
        <p>{incoming.lead?.nome || incoming.lead?.name || 'Cliente'} · {options.length} pacote(s){incoming.templateWasPublished === false ? ' · modelo ainda não publicado' : ''}</p>
      </div>
      <div className="published-actions">
        <button type="button" onClick={() => persist('draft', 'salva')} disabled={saving}><Save /> Salvar</button>
        <button type="button" onClick={generatePdf} disabled={saving}><Download /> Gerar PDF</button>
        <button type="button" className="primary" onClick={() => persist('sent', 'enviada')} disabled={saving}><Send /> Marcar como enviada</button>
      </div>
    </header>
    {message && <div className="published-message"><CheckCircle2 /> {message}</div>}
    <div className="published-body">
      <aside>{pages.map((item, index) => <button type="button" key={item.id} className={index === pageIndex ? 'active' : ''} onClick={() => setPageIndex(index)}><span>{index + 1}</span><strong>{item.name}</strong></button>)}</aside>
      <main><PageCanvas page={page} selectedElementId={null} onSelectElement={() => {}} onChangeElement={() => {}} zoom={0.76} preview /></main>
      <section className="published-summary">
        <FileText />
        <h2>Revisar pacotes</h2>
        <p>Revise os valores e textos antes de gerar o PDF. O modelo original permanece intacto.</p>
        {options.map((option, index) => {
          const details = option.proposalPackage || {};
          return <article key={option.id || index} className="published-package-editor">
            <strong>{details.packageName || `Pacote ${index + 1}`}</strong>
            <label>Valor exibido<input value={details.priceLabel || ''} onChange={(event) => setOptions((current) => updatePackageOption(current, index, { priceLabel: event.target.value }))} /></label>
            <label>Descrição<textarea rows="3" value={details.description || ''} onChange={(event) => setOptions((current) => updatePackageOption(current, index, { description: event.target.value }))} /></label>
            <label>Itens incluídos<textarea rows="7" value={(details.bullets || []).join('\n')} onChange={(event) => setOptions((current) => updatePackageOption(current, index, { bullets: event.target.value.split('\n').map((item) => item.trim()).filter(Boolean) }))} /></label>
            {details.students && <small>{details.pricePerStudentLabel} por aluno · Total {details.totalLabel}</small>}
          </article>;
        })}
      </section>
    </div>
  </section>;
}
