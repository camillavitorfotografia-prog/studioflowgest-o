import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, CheckCircle2, ChevronRight, CircleHelp, Database,
  FileSpreadsheet, Loader2, RefreshCw, Search, Upload, XCircle, Download,
  Camera, ReceiptText, BriefcaseBusiness, Layers3, Link2, Check,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { analyzeCandidates, executeMigration, exportMigrationPreview, loadImportHistory, parseMigrationFile } from '../../features/dataMigration/migrationService';
import './MigracaoDados.css';

const typeLabel = { equipment: 'Equipamento', expense: 'Despesa', project: 'Trabalho' };
const statusLabel = { new: 'Novo', existing: 'Já cadastrado', duplicate: 'Duplicado' };
const formatMoney = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function MigracaoDados() {
  const navigate = useNavigate();
  const [candidates, setCandidates] = useState([]);
  const [files, setFiles] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('info');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => { loadImportHistory().then(setHistory).catch(() => setHistory([])); }, []);

  const summary = useMemo(() => candidates.reduce((acc, item) => {
    acc.total += 1;
    acc[item.type] += 1;
    acc[item.status] = (acc[item.status] || 0) + 1;
    if (item.type === 'project' && item.needsClientLink) acc.unlinked += 1;
    if (item.selected) acc.selected += 1;
    return acc;
  }, { total: 0, equipment: 0, expense: 0, project: 0, new: 0, existing: 0, duplicate: 0, selected: 0, unlinked: 0 }), [candidates]);

  const visible = useMemo(() => candidates.filter((item) => {
    const matchesFilter = filter === 'all'
      || item.type === filter
      || item.status === filter
      || (filter === 'unlinked' && item.type === 'project' && item.needsClientLink);
    const needle = search.trim().toLowerCase();
    const label = `${item.nome || item.descricao || item.clientName || ''} ${item.categoria || item.tipoServico || ''}`.toLowerCase();
    return matchesFilter && (!needle || label.includes(needle));
  }), [candidates, filter, search]);

  const analyzeFiles = async (selectedFiles) => {
    if (!selectedFiles.length) return;
    setLoading(true); setMessageType('info'); setMessage('Analisando os arquivos sem enviá-los ao Storage...');
    try {
      const parsedByFile = await Promise.all(selectedFiles.map(async (file) => ({ file: file.name, items: await parseMigrationFile(file) })));
      const parsed = parsedByFile.flatMap((entry) => entry.items);
      if (!parsed.length) throw new Error('Nenhum registro reconhecido. Nada foi gravado.');
      const analyzed = await analyzeCandidates(parsed);
      setFiles(selectedFiles.map((file) => file.name));
      setCandidates(analyzed);
      setFilter('all');
      setMessageType('success');
      setMessage(`Foram encontrados ${analyzed.length} registros. Os trabalhos sem cliente também podem ser importados e vinculados depois.`);
    } catch (error) {
      console.error('Falha ao analisar arquivos de migração:', error);
      setCandidates([]); setFiles([]); setMessageType('error');
      setMessage(error?.message || 'Não foi possível analisar os arquivos. Nenhum dado foi gravado.');
    } finally { setLoading(false); }
  };

  const handleFiles = async (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    await analyzeFiles(selectedFiles);
    event.target.value = '';
  };

  const toggle = (id) => setCandidates((items) => items.map((item) => item.id === id ? { ...item, selected: !item.selected } : item));
  const selectAllNew = () => setCandidates((items) => items.map((item) => ({ ...item, selected: item.status === 'new' })));
  const bindClient = (id, clientId) => setCandidates((items) => items.map((item) => item.id === id ? { ...item, clientId: clientId || null, needsClientLink: !clientId } : item));
  const clearAnalysis = () => { setCandidates([]); setFiles([]); setMessage(''); setSearch(''); setFilter('all'); };


  const exportPreview = () => {
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      exportMigrationPreview(candidates, `studioflow-previa-importacao-${stamp}.xlsx`);
      setMessageType('success');
      setMessage('A prévia foi exportada em Excel com abas separadas para equipamentos, despesas, trabalhos e duplicidades.');
    } catch (error) {
      setMessageType('error');
      setMessage(error?.message || 'Não foi possível exportar a prévia.');
    }
  };

  const importNow = async () => {
    if (!summary.selected) { setMessageType('warning'); setMessage('Nenhum registro novo está selecionado para importação.'); return; }
    if (!window.confirm(`Importar ${summary.selected} registros para o Supabase?`)) return;
    setLoading(true); setMessageType('info'); setMessage('Gravando os registros no Supabase...');
    try {
      const result = await executeMigration(candidates, files);
      setMessageType('success');
      setMessage(`Importação concluída: ${result.equipment} equipamentos, ${result.expenses} despesas, ${result.projects} trabalhos e ${result.payments} pagamentos.`);
      setCandidates((items) => items.map((item) => item.selected ? { ...item, selected: false, status: 'existing' } : item));
      setHistory(await loadImportHistory());
    } catch (error) {
      console.error('Falha ao executar importação:', error);
      setMessageType('error'); setMessage(error?.message || 'A importação falhou. Nenhum dado foi colocado no código.');
    } finally { setLoading(false); }
  };

  const filters = [
    ['all', `Todos`, summary.total], ['equipment', `Equipamentos`, summary.equipment],
    ['expense', `Despesas`, summary.expense], ['project', `Trabalhos`, summary.project],
    ['new', `Novos`, summary.new], ['unlinked', `Vincular depois`, summary.unlinked],
    ['existing', `Já cadastrados`, summary.existing], ['duplicate', `Duplicados`, summary.duplicate],
  ];

  return <div className="migration-page">
    <header className="migration-header">
      <button className="migration-back" onClick={() => navigate('/configuracoes')}><ArrowLeft size={17}/>Configurações</button>
      <div className="migration-heading"><span className="migration-kicker">Centro de dados</span><h1>Migração e importação</h1><p>Leia planilhas e backups no navegador, elimine duplicidades e grave somente os registros confirmados no Supabase.</p></div>
      <button className="migration-help" type="button"><CircleHelp size={17}/>Ajuda</button>
    </header>

    <section className="migration-upload-card">
      <div className="migration-upload-icon"><Upload size={31}/></div>
      <div><div className="migration-step-title"><strong>1. Selecione os arquivos</strong><span><Database size={13}/> Não ocupa o Storage</span></div><p>Excel (.xlsx e .xlsm) e backup JSON do FotoGestion.</p></div>
      <label className="migration-primary migration-file-button"><FileSpreadsheet size={19}/><span>{loading ? 'Analisando...' : 'Escolher arquivos'}</span><input type="file" multiple accept=".xlsx,.xlsm,.json" onChange={handleFiles} disabled={loading}/></label>
    </section>

    {message && <div className={`migration-message ${messageType}`}>
      {loading ? <Loader2 className="spin" size={22}/> : messageType === 'success' ? <CheckCircle2 size={22}/> : messageType === 'error' ? <XCircle size={22}/> : <AlertTriangle size={22}/>} 
      <div><strong>{messageType === 'success' ? 'Análise concluída com sucesso' : messageType === 'error' ? 'Não foi possível concluir' : 'Atenção'}</strong><span>{message}</span></div>
      {files.length > 0 && !loading && <button onClick={clearAnalysis}><RefreshCw size={16}/>Reanalisar</button>}
    </div>}

    {candidates.length > 0 && <>
      <section className="migration-stats">
        <article><i className="violet"><Layers3 size={15}/></i><strong>{summary.total}</strong><span>Encontrados</span><small>Total de registros</small></article>
        <article><i className="blue"><Camera size={15}/></i><strong>{summary.equipment}</strong><span>Equipamentos</span><small>Encontrados</small></article>
        <article><i className="gold"><ReceiptText size={15}/></i><strong>{summary.expense}</strong><span>Despesas</span><small>Encontradas</small></article>
        <article><i className="green"><BriefcaseBusiness size={15}/></i><strong>{summary.project}</strong><span>Trabalhos</span><small>Encontrados</small></article>
        <article><i className="emerald"><Check size={15}/></i><strong>{summary.new}</strong><span>Novos</span><small>Prontos para importar</small></article>
        <article><i className="red"><Link2 size={15}/></i><strong>{summary.unlinked}</strong><span>Vincular depois</span><small>Serão importados normalmente</small></article>
      </section>

      <section className="migration-review">
        <div className="migration-filters">{filters.map(([value, label, count]) => <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}><span>{label}</span><b>{count}</b></button>)}</div>
        <div className="migration-controls">
          <label className="migration-search"><Search size={17}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar registro..."/></label>
          <div className="migration-control-actions">
            <button className="migration-action-button" onClick={selectAllNew}><CheckCircle2 size={17}/><span>Selecionar novos</span></button>
            <button className="migration-action-button export" onClick={exportPreview}><Download size={17}/><span>Exportar prévia</span></button>
          </div>
        </div>
        <div className="migration-table-wrap"><table><thead><tr><th></th><th>Tipo</th><th>Registro</th><th>Valor</th><th>Origem</th><th>Situação</th></tr></thead><tbody>{visible.map((item) => <tr key={item.id} className={item.status !== 'new' ? 'muted' : ''}>
          <td><input type="checkbox" checked={item.selected} disabled={item.status !== 'new'} onChange={() => toggle(item.id)}/></td>
          <td><span className={`migration-type ${item.type}`}>{typeLabel[item.type]}</span></td>
          <td><strong>{item.nome || item.descricao || item.clientName}</strong><small>{item.categoria || item.tipoServico || item.dataEvento || ''}</small>
            {item.type === 'project' && <div className="client-link-row"><select value={item.clientId || ''} onChange={(e) => bindClient(item.id, e.target.value)}><option value="">Importar e vincular depois</option>{(item.clientOptions || []).map((client) => <option key={client.id} value={client.id}>{client.nome}</option>)}</select>{item.needsClientLink && !item.clientId && <span>Nome original preservado</span>}</div>}
          </td>
          <td>{formatMoney(item.valorCompra || item.valor || item.valorContratado)}</td>
          <td><span title={item.source}>{item.source}</span></td>
          <td><span className={`migration-status ${item.status}`}>{item.status === 'new' && item.type === 'project' && item.needsClientLink && !item.clientId ? 'Novo · vincular depois' : statusLabel[item.status]}</span></td>
        </tr>)}</tbody></table></div>
        <footer><div><strong>{summary.selected} registros selecionados</strong><span>{summary.unlinked > 0 ? `${summary.unlinked} trabalhos serão importados com o nome original e poderão ser vinculados depois.` : 'Tudo pronto para importar.'}</span></div><button className="migration-primary import" onClick={importNow} disabled={loading || !summary.selected}><Upload size={19}/><span>Confirmar importação<small>Importar {summary.selected} registros</small></span><ChevronRight size={20}/></button></footer>
      </section>
    </>}

    <section className="migration-history"><div className="history-title"><div><h2>Histórico de importações</h2><p>Acompanhe as importações já realizadas.</p></div></div>{history.length === 0 ? <p>Nenhuma importação registrada.</p> : history.map((entry) => <article key={entry.id}><div className="history-file"><FileSpreadsheet size={19}/><div><strong>{entry.source_name}</strong><span>{new Date(entry.created_at).toLocaleString('pt-BR')}</span></div></div><small>{(entry.summary?.equipment || 0) + (entry.summary?.expenses || 0) + (entry.summary?.projects || 0) === 0 ? 'Tentativa sem registros importados' : `${entry.summary?.equipment || 0} equipamentos · ${entry.summary?.expenses || 0} despesas · ${entry.summary?.projects || 0} trabalhos`}</small></article>)}</section>
  </div>;
}
