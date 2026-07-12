import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Download, Eye, Save } from 'lucide-react';
import { readStorage, STORAGE_KEYS } from '../../../utils/storage';
import { loadSettings } from '../../../utils/settings';
import { getProposalTemplate, PROPOSAL_TEMPLATES } from '../templates';
import { capturePricingSnapshot, saveProposal } from '../services/proposalStorage';
import ProposalPageCanvas from '../components/ProposalPageCanvas';
import ImageSlot from '../components/ImageSlot';
import { generateProposalPdf } from '../services/proposalPdf';
import '../styles/proposals.css';

export default function ProposalEditor() {
  const { state: incoming = {} } = useLocation();
  const storedClients = readStorage(STORAGE_KEYS.clients, []);
  const clients = incoming.lead && !storedClients.some((item) => String(item.id) === String(incoming.lead.id)) ? [incoming.lead, ...storedClients] : storedClients;
  const settings = loadSettings();
  const [modelId, setModelId] = useState(incoming.modelId || PROPOSAL_TEMPLATES[0].id);
  const template = getProposalTemplate(modelId);
  const [clientId, setClientId] = useState(String(incoming.lead?.id || ''));
  const [pricing, setPricing] = useState(() => incoming.pricingOptions?.[0] ? { id: incoming.pricingOptions[0].id, state: incoming.pricingOptions[0].state, config: readStorage('cv_studio_precificacao_config', {}), capturedAt: incoming.pricingOptions[0].createdAt } : capturePricingSnapshot());
  const [pageIndex, setPageIndex] = useState(0);
  const [assets, setAssets] = useState({});
  const [logo, setLogo] = useState(settings.studio.logo || '');
  const [status, setStatus] = useState('rascunho');
  const [zoom, setZoom] = useState(.72);
  const [message, setMessage] = useState('');
  const page = template.pages[pageIndex];
  const client = clients.find((item) => String(item.id) === clientId);
  const missing = useMemo(() => template.pages.flatMap((item) => item.imageSlots.filter((slot) => slot.required && !assets[slot.id]).map(() => `${item.title}: imagem ausente`)), [assets, template.pages]);
  const build = () => ({ modelId, modelVersion: template.version, clientId, clientName: client?.nome || client?.name || '', pricingId: pricing.id, pricingSnapshot: pricing, pricingOptions: incoming.pricingOptions || [], assets, logo, status, validityDays: 15, pageCount: template.pages.length });
  const save = () => { saveProposal(build()); setMessage('Rascunho salvo.'); };
  const generate = async () => { if (!clientId) { setMessage('Selecione um cliente.'); return; } const result = await generateProposalPdf({ template, proposal: build() }); setStatus('gerada'); saveProposal({ ...build(), status: 'gerada', pdfFileName: result.fileName }); setMessage('PDF gerado com sucesso.'); };

  return <section className="proposal-editor"><header className="proposal-topbar"><div><span>Editor de propostas</span><h1>{template.name}</h1></div><select value={modelId} onChange={(event) => { setModelId(event.target.value); setPageIndex(0); setAssets({}); }}>{PROPOSAL_TEMPLATES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={clientId} onChange={(event) => setClientId(event.target.value)}><option value="">Selecionar cliente</option>{clients.map((item) => <option key={item.id} value={item.id}>{item.nome || item.name}</option>)}</select><button onClick={() => setPricing(capturePricingSnapshot())}>Atualizar precificação</button><span className="proposal-status">{status}</span><button onClick={save}><Save />Salvar</button><button onClick={generate}><Download />Gerar PDF</button></header>{message && <div className="proposal-message">{message}</div>}<div className="proposal-workspace"><aside className="proposal-thumbnails">{template.pages.map((item, index) => <button key={item.id} className={index === pageIndex ? 'active' : ''} onClick={() => setPageIndex(index)}><span>{index + 1}</span><div><strong>{item.title}</strong><small>{item.imageSlots.every((slot) => assets[slot.id]) ? 'Completa' : 'Imagem pendente'}</small></div></button>)}</aside><main className="proposal-stage"><div className="proposal-stage-tools"><button onClick={() => setPageIndex((index) => Math.max(0, index - 1))}><ChevronLeft /></button><span>Página {pageIndex + 1} de {template.pages.length}</span><input aria-label="Zoom" type="range" min=".45" max="1" step=".05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /><button onClick={() => setPageIndex((index) => Math.min(template.pages.length - 1, index + 1))}><ChevronRight /></button></div><ProposalPageCanvas page={page} assets={assets} pricing={pricing} logo={logo} zoom={zoom} onSelectImage={() => {}} /></main><aside className="proposal-inspector"><h2>{page.title}</h2>{page.imageSlots.map((slot) => <ImageSlot key={slot.id} slot={slot} asset={assets[slot.id]} onChange={(value) => setAssets((current) => ({ ...current, [slot.id]: value }))} />)}<label className="proposal-logo-upload">Logo da proposta<input type="file" accept="image/png,image/webp" onChange={(event) => { const file = event.target.files[0]; if (file) { const reader = new FileReader(); reader.onload = () => setLogo(reader.result); reader.readAsDataURL(file); } }} /></label><div className="proposal-pricing-readonly"><strong>Snapshot da Precificação</strong><span>{pricing.state.categoria || 'Categoria não definida'}</span><span>{pricing.state.service || pricing.state.ensaioTipo || ''}</span><small>{incoming.pricingOptions?.length || 1} opção(ões) · Capturado em {new Date(pricing.capturedAt).toLocaleString('pt-BR')}</small></div>{missing.length > 0 && <details><summary>{missing.length} pendências</summary>{missing.slice(0, 8).map((item) => <p key={item}>{item}</p>)}</details>}<button className="proposal-preview"><Eye />Pré-visualizar página</button></aside></div></section>;
}
