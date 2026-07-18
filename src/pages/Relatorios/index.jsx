import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CircleDollarSign,
  DollarSign,
  Download,
  Package,
  TrendingDown,
  TrendingUp,
  Users,
  WalletCards,
} from 'lucide-react';
import { formatMoney } from '../../utils/integratedData';
import { supabase } from '../../utils/supabase';
import {
  getDbStudioData,
  loadProfileFromDb,
  subscribeDbUpdates,
} from '../../utils/dbData';
import { loadSettings } from '../../utils/settings';
import {
  buildAnnualReport,
  getAvailableReportYears,
  formatReportDate,
} from './annualReportData';
import './Relatorios.css';

export default function Relatorios() {
  const [studio, setStudio] = useState({
    projects: [],
    clients: [],
    transactions: [],
    equipment: [],
    canonicalFinanceRows: [],
  });
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      try {
        const [data, canonicalResult] = await Promise.all([
          getDbStudioData(),
          supabase.from('finance_ledger_canonical').select('*'),
        ]);
        if (canonicalResult.error) throw canonicalResult.error;
        if (active) setStudio({ ...data, canonicalFinanceRows: canonicalResult.data || [] });
      } catch (error) {
        if (active) setMessage(error?.message || 'Não foi possível carregar os dados dos relatórios.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    window.addEventListener('focus', load);
    const unsubscribe = subscribeDbUpdates(load);

    return () => {
      active = false;
      window.removeEventListener('focus', load);
      unsubscribe();
    };
  }, []);

  const availableYears = useMemo(
    () => getAvailableReportYears(studio),
    [studio],
  );

  const effectiveYear = availableYears.includes(selectedYear)
    ? selectedYear
    : (availableYears[0] || new Date().getFullYear());

  const report = useMemo(
    () => buildAnnualReport(studio, effectiveYear),
    [studio, effectiveYear],
  );

  const downloadAnnualPdf = async () => {
    setExporting(true);
    setMessage('');

    try {
      const { generateAnnualReportPdf } = await import('./annualReportPdf.js');
      const settings = loadSettings();
      const profile = await loadProfileFromDb().catch(() => null);
      const localStudio = settings.studio || {};
      const remoteStudio = profile || {};
      const result = await generateAnnualReportPdf({
        report,
        studio: {
          name: localStudio.name || remoteStudio.empresaNome || remoteStudio.nomeEmpresa || remoteStudio.companyName || remoteStudio.nomeFantasia || '',
          legalName: localStudio.legalName || remoteStudio.razaoSocial || remoteStudio.nomeFantasia || '',
          document: localStudio.document || remoteStudio.cnpj || remoteStudio.cpf || remoteStudio.document || '',
          email: localStudio.email || remoteStudio.email || '',
          phone: localStudio.phone || remoteStudio.telefone || remoteStudio.phone || '',
          whatsapp: localStudio.whatsapp || remoteStudio.whatsapp || '',
          address: localStudio.address || remoteStudio.endereco || remoteStudio.address || remoteStudio.cidade || '',
        },
      });
      setMessage(`${result.fileName} gerado com sucesso.`);
    } catch (error) {
      console.error('Falha ao gerar relatório anual em PDF:', error);
      setMessage(error?.message || 'Não foi possível gerar o relatório anual em PDF.');
    } finally {
      setExporting(false);
    }
  };

  const warningCount = (
    report.warnings.receiptsWithoutDate
    + report.warnings.expensesWithoutDate
    + report.warnings.projectsWithoutDate
    + report.warnings.pendingExpenses
    + report.warnings.reconciliationItems
    + (report.warnings.orphanAnnualProjects || 0)
  );
  const informationCount = (
    report.warnings.duplicateProjectsRemoved
    + report.warnings.excludedProjects
    + (report.warnings.ignoredFinanceContractReceipts || 0)
  );
  const goTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="sf-finance-section sf-reports-page">
      <div className="sf-section-header sf-reports-header">
        <div>
          <span className="sf-reports-eyebrow">Inteligência anual</span>
          <h1>Relatório anual</h1>
          <p>
            Consolidação anual de contratos, recebimentos e despesas pagas, usando as parcelas cadastradas em Clientes como fonte oficial dos contratos e o Financeiro apenas para receitas avulsas e despesas.
          </p>
        </div>

        <div className="sf-reports-header-actions">
          <label className="sf-reports-year-field">
            <span><CalendarDays size={14} /> Exercício</span>
            <select
              value={effectiveYear}
              onChange={(event) => setSelectedYear(Number(event.target.value))}
              aria-label="Selecionar ano do relatório"
            >
              {availableYears.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="sf-primary-button sf-reports-download"
            onClick={downloadAnnualPdf}
            disabled={exporting}
          >
            <Download size={16} />
            {exporting ? 'Gerando PDF...' : 'Baixar PDF para IR'}
          </button>
        </div>
      </div>

      {loading && (
        <div className="sf-reports-loading" role="status">
          <div className="sf-reports-loading-spinner" />
          <div><strong>Carregando dados financeiros</strong><span>Conferindo recebimentos, despesas, contratos e consolidação fiscal.</span></div>
        </div>
      )}

      {message && (
        <div className="sf-reports-message" role="status">
          {message}
        </div>
      )}

      {!loading && <div className="sf-reports-basis-note">
        <div>
          <strong>Trabalhos de {effectiveYear}</strong>
          <span>Filtrados pela data do evento ou serviço.</span>
        </div>
        <div>
          <strong>Base financeira de {effectiveYear}</strong>
          <span>Regime de caixa: parcelas dos clientes pela data real de recebimento, receitas avulsas do Financeiro e despesas pela data efetiva de pagamento.</span>
        </div>
      </div>}

      {!loading && warningCount > 0 && (
        <div className="sf-reports-warning">
          <AlertTriangle size={18} />
          <div>
            <strong>Pendências reais que precisam de conferência.</strong>
            <span>
              {report.warnings.receiptsWithoutDate} recebimento(s) sem data · {report.warnings.expensesWithoutDate} despesa(s) paga(s) sem data · {report.warnings.projectsWithoutDate} projeto(s) sem data · {report.warnings.pendingExpenses} despesa(s) pendente(s) · {report.warnings.reconciliationItems} divergência(s) financeira(s).
            </span>
          </div>
        </div>
      )}

      {!loading && informationCount > 0 && (
        <div className="sf-reports-info">
          <CircleDollarSign size={18} />
          <div>
            <strong>Informações de consolidação — não são erros.</strong>
            <span>{report.warnings.ignoredFinanceContractReceipts || 0} espelho(s) de receita de projeto ignorado(s) para evitar duplicidade · {report.warnings.duplicateProjectsRemoved} duplicado(s) desconsiderado(s) · {report.warnings.excludedProjects} cancelado(s), arquivado(s) ou excluído(s) fora dos totais.</span>
          </div>
        </div>
      )}

      {!loading && <div className="sf-report-actions">
        <button className="sf-secondary-button" onClick={() => goTo('despesas-sem-data')}>Ver despesas sem data</button>
        <button className="sf-secondary-button" onClick={() => goTo('projetos-sem-data')}>Ver projetos sem data</button>
        <button className="sf-secondary-button" onClick={() => goTo('divergencias-financeiras')}>Ver divergências financeiras</button>
        <button className="sf-secondary-button" onClick={() => goTo('projetos-sem-cliente')}>Vincular clientes</button>
        <button className="sf-secondary-button" onClick={() => goTo('despesas-pendentes')}>Conferir despesas pendentes</button>
      </div>}

      {!loading && <>
      <div className="sf-metric-grid sf-reports-metrics">
        <Metric icon={Users} label={`Clientes com trabalho em ${effectiveYear}`} value={report.totals.clients} raw />
        <Metric icon={BriefcaseBusiness} label={`Trabalhos únicos em ${effectiveYear}`} value={report.totals.projects} raw />
        <Metric icon={DollarSign} label={`Valor contratado dos trabalhos de ${effectiveYear}`} value={report.totals.contracted} />
        <Metric icon={CircleDollarSign} label={`Saldo desses contratos de ${effectiveYear}`} value={report.totals.remaining} />
        <Metric icon={TrendingUp} label={`Receita recebida em ${effectiveYear} (regime de caixa)`} value={report.totals.taxCashBasisRevenue} />
        <Metric icon={TrendingDown} label={`Despesas pagas em ${effectiveYear}`} value={report.totals.taxCashBasisExpenses} />
        <Metric icon={WalletCards} label="Resultado pelo regime de caixa" value={report.totals.taxCashBasisResult} />
        <Metric icon={CircleDollarSign} label="Entradas não operacionais (fora do faturamento)" value={report.totals.nonOperationalEntries || 0} />
      </div>

      <div className="sf-report-grid sf-reports-summary-grid">
        <Report
          title="Recebimentos por conta"
          rows={[
            ['Empresa / CNPJ', formatMoney(report.totals.companyReceived)],
            ['Conta pessoal / CPF', formatMoney(report.totals.personalReceived)],
            ['Reserva', formatMoney(report.totals.reserveReceived || 0)],
            ['Conta não informada', formatMoney(report.totals.unclassifiedAccountReceived)],
          ]}
          icon={Building2}
        />
        <Report
          title="Entradas não operacionais"
          rows={[
            ['Aportes, patrimônio, reembolsos e empréstimos', formatMoney(report.totals.nonOperationalEntries || 0)],
            ['Entradas totais de caixa', formatMoney(report.totals.totalCashInflows || report.totals.taxCashBasisRevenue)],
            ['Faturamento fotográfico', formatMoney(report.totals.taxCashBasisRevenue)],
          ]}
          icon={CircleDollarSign}
        />
        <Report
          title="Base para conferência fiscal"
          rows={[
            ['Receita bruta recebida', formatMoney(report.totals.taxCashBasisRevenue)],
            ['Despesas pagas', formatMoney(report.totals.taxCashBasisExpenses)],
            ['Resultado financeiro', formatMoney(report.totals.taxCashBasisResult)],
          ]}
          icon={WalletCards}
        />
        <Report
          title={`Origem dos recebimentos de ${effectiveYear}`}
          rows={[
            [`Contratos do próprio ${effectiveYear}`, formatMoney(report.totals.currentYearContractReceipts)],
            ['Contratos de anos anteriores', formatMoney(report.totals.previousYearContractReceipts)],
            ['Contratos de anos futuros', formatMoney(report.totals.futureYearContractReceipts)],
            ['Sem trabalho vinculado', formatMoney(report.totals.unlinkedReceipts)],
          ]}
          icon={CalendarDays}
        />
        <Report
          title="Registros consolidados"
          rows={[
            ['Recebimentos válidos', `${report.ledgerStats.receipts} lançamento(s)`],
            ['Despesas pagas', `${report.ledgerStats.expenses} lançamento(s)`],
            ['Parcelas cadastradas em Clientes', `${report.ledgerStats.projectReceipts} recebimento(s)`],
            ['Receitas avulsas do Financeiro', `${report.ledgerStats.financeReceipts} recebimento(s)`],
            ['Espelhos financeiros ignorados', `${report.ledgerStats.ignoredFinanceContractReceipts || 0} lançamento(s)`],
            [`Trabalhos únicos de ${effectiveYear}`, `${report.ledgerStats.annualProjects} registro(s)`],
            [`Todos os trabalhos válidos de ${effectiveYear}`, `${report.ledgerStats.allAnnualProjects} registro(s)`],
            [`Clientes atendidos em ${effectiveYear}`, `${report.ledgerStats.annualClients} cliente(s)`],
            ['Trabalhos totais na base', `${report.ledgerStats.sourceProjects} registro(s)`],
            ['Trabalhos vinculados a clientes atuais', `${report.ledgerStats.clientBackedProjects} registro(s)`],
            ['Trabalhos totais após consolidação', `${report.ledgerStats.consolidatedProjects} registro(s)`],
            ['Trabalhos órfãos/ocultados fora dos totais', `${report.ledgerStats.orphanedProjects} registro(s)`],
            ['Duplicados/ocultos desconsiderados', `${report.ledgerStats.duplicateProjectsRemoved} registro(s)`],
            ['Trabalhos do ano sem cliente oficial', `${report.ledgerStats.orphanAnnualProjects || 0} registro(s)`],
          ]}
          icon={CircleDollarSign}
        />
        <Report
          title="Despesas ainda não confirmadas"
          rows={report.warnings.pendingExpenses
            ? [[`${report.warnings.pendingExpenses} registro(s)`, formatMoney(report.warnings.pendingExpensesAmount)]]
            : []}
          icon={AlertTriangle}
        />
        <Report
          title="Serviço com maior contratação"
          rows={report.mostContractedService
            ? [[report.mostContractedService[0], formatMoney(report.mostContractedService[1])]]
            : []}
        />
        <Report
          title="Tipo de ensaio mais vendido"
          rows={report.mostSoldEssay
            ? [[
              report.mostSoldEssay[0],
              `${report.mostSoldEssay[1].count} trabalho(s) · ${formatMoney(report.mostSoldEssay[1].value)}`,
            ]]
            : []}
        />
        <Report title="Casamentos no ano" rows={[[`${report.totals.weddings} trabalhos`, '']]} />
        <Report
          title="Canal de captação"
          rows={report.topOrigin ? [[report.topOrigin[0], `${report.topOrigin[1]} clientes`]] : []}
        />
        <Report
          title="Cidade com maior contratação"
          rows={report.topCity ? [[report.topCity[0], formatMoney(report.topCity[1])]] : []}
        />
        <Report
          title="Cliente com maior contratação"
          rows={report.topClient ? [[report.topClient[0], formatMoney(report.topClient[1])]] : []}
        />
        <Report
          title="Equipamento mais escalado"
          rows={report.equipmentMostUsed
            ? [[report.equipmentMostUsed[0], `${report.equipmentMostUsed[1].projects} projetos`]]
            : []}
        />
        <Report
          title="Equipamento de maior retorno"
          rows={report.equipmentBestReturn
            ? [[report.equipmentBestReturn[0], formatMoney(report.equipmentBestReturn[1].revenue)]]
            : []}
        />
      </div>

      <div className="sf-panel-grid sf-reports-table-grid">
        <TableCard
          title={`Fluxo por mês · ${effectiveYear}`}
          icon={DollarSign}
          rows={report.monthly.map((item) => [
            item.label,
            formatMoney(item.received),
            formatMoney(item.forecastReceived),
            formatMoney(item.expenses),
            formatMoney(item.forecastExpenses),
            formatMoney(item.result),
          ])}
          columns={['Mês', 'Recebido', 'Previsto a receber', 'Despesas pagas', 'Despesas previstas', 'Resultado de caixa']}
        />
        <TableCard
          title={`Contratos que formam o total · ${effectiveYear}`}
          icon={BriefcaseBusiness}
          rows={report.projectRows.map((item) => [
            formatReportDate(item.date),
            item.clientName,
            item.service,
            formatMoney(item.contracted),
            formatMoney(item.receivedTotal),
            formatMoney(item.remaining),
          ])}
          columns={['Data', 'Cliente', 'Serviço', 'Contratado', 'Recebido total', 'Saldo']}
        />
        <TableCard
          title={`Recebimentos que formam o caixa · ${effectiveYear}`}
          icon={CircleDollarSign}
          rows={report.receipts.map((item) => [
            formatReportDate(item.date),
            item.clientName || item.description,
            item.source === 'financeiro' ? 'Financeiro' : 'Trabalho',
            item.account || 'Não informada',
            formatMoney(item.amount),
          ])}
          columns={['Data', 'Cliente / descrição', 'Origem', 'Conta', 'Valor']}
        />
        <TableCard
          title="Rentabilidade por contrato no ano"
          icon={Users}
          rows={report.profitabilityRows.slice(0, 18).map((item) => [
            item.clientName,
            item.service,
            formatMoney(item.received),
            formatMoney(item.expenses),
            formatMoney(item.profit),
          ])}
          columns={['Projeto / cliente', 'Serviço', 'Recebido', 'Despesas', 'Resultado']}
        />
        <div id="despesas-pendentes">
          <TableCard
            title="Despesas pendentes para conferência"
            icon={AlertTriangle}
            rows={(report.pendingExpenses || []).map((item) => [formatReportDate(item.date), item.description, item.category, formatMoney(item.amount)])}
            columns={['Vencimento', 'Descrição', 'Categoria', 'Valor']}
          />
        </div>
        <div id="despesas-sem-data">
          <TableCard
            title="Despesas pagas sem data efetiva"
            icon={AlertTriangle}
            rows={(report.undatedExpenses || []).map((item) => [item.description, item.category, formatMoney(item.amount)])}
            columns={['Descrição', 'Categoria', 'Valor']}
          />
        </div>
        <div id="divergencias-financeiras">
          <TableCard
            title="Divergências financeiras reais"
            icon={AlertTriangle}
            rows={(report.reconciliation || []).map((item) => [item.clientName, item.reason, formatMoney(item.amount)])}
            columns={['Cliente / trabalho', 'Motivo', 'Diferença']}
          />
        </div>
        <div id="projetos-sem-data">
          <TableCard
            title="Projetos sem data definida"
            icon={CalendarDays}
            rows={(report.projectsWithoutDateRows || []).map((item) => [item.clientName, item.service])}
            columns={['Cliente', 'Serviço']}
          />
        </div>
        <div id="projetos-sem-cliente">
          <TableCard
            title="Projetos sem cliente oficial vinculado"
            icon={Users}
            rows={(report.orphanAnnualProjectRows || []).map((item) => [item.clientName, item.service, formatReportDate(item.date)])}
            columns={['Nome importado', 'Serviço', 'Data']}
          />
        </div>
        <TableCard
          title="Entradas não operacionais do ano"
          icon={CircleDollarSign}
          rows={(report.nonOperationalEntries || []).map((item) => [formatReportDate(item.date), item.description, item.category, item.account || 'Não informada', formatMoney(item.amount)])}
          columns={['Data', 'Descrição', 'Categoria', 'Conta', 'Valor']}
        />
        <TableCard
          title="Despesas pagas por categoria"
          icon={TrendingDown}
          rows={report.expenseCategoryRows.map((item) => [
            item.category,
            formatMoney(item.amount),
          ])}
          columns={['Categoria', 'Total pago']}
        />
        <TableCard
          title="Recebimentos por forma de pagamento"
          icon={WalletCards}
          rows={report.receiptMethodRows.map((item) => [
            item.method,
            formatMoney(item.amount),
          ])}
          columns={['Forma de pagamento', 'Total recebido']}
        />
        <TableCard
          title="Recebimentos por conta"
          icon={Building2}
          rows={report.receiptAccountRows.map((item) => [
            item.account,
            formatMoney(item.amount),
          ])}
          columns={['Conta de destino', 'Total recebido']}
        />
        <TableCard
          title="Equipamentos por retorno no ano"
          icon={Package}
          rows={report.equipmentRows.map((item) => [
            item.name,
            `${item.frequency}x`,
            formatMoney(item.revenue),
          ])}
          columns={['Ativo', 'Frequência', 'Receita associada']}
        />
      </div>
      </>}
    </div>
  );
}

function Metric({ icon: Icon, label, value, raw = false }) {
  return (
    <div className="sf-card metric sf-report-metric">
      <div className="metric-label"><Icon size={18} /> {label}</div>
      <strong>{raw ? value : formatMoney(value)}</strong>
    </div>
  );
}

function Report({ title, rows, icon: Icon = null }) {
  return (
    <div className="sf-card report sf-report-summary-card">
      <h3>{Icon && <Icon size={16} />} {title}</h3>
      {rows.length === 0 && <p className="sf-muted">Nenhum registro computado.</p>}
      {rows.map(([label, value]) => (
        <div className="report-row" key={`${title}-${label}`}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function TableCard({ title, icon: Icon, columns, rows }) {
  return (
    <div className="sf-table-card sf-report-table-card">
      <div className="sf-report-table-heading">
        <h3><Icon size={18} /> {title}</h3>
      </div>
      <div className="sf-report-table-scroll">
        <table className="sf-table">
          <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${title}-${index}`}>
                {row.map((cell, cellIndex) => (
                  <td data-label={columns[cellIndex]} key={`${title}-${index}-${cellIndex}`}>{cell}</td>
                ))}
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={columns.length} className="empty">
                  Sem dados consolidados para o período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
