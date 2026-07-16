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
import {
  getDbStudioData,
  loadProfileFromDb,
  subscribeDbUpdates,
} from '../../utils/dbData';
import { loadSettings } from '../../utils/settings';
import {
  buildAnnualReport,
  getAvailableReportYears,
} from './annualReportData';
import './Relatorios.css';

export default function Relatorios() {
  const [studio, setStudio] = useState({
    projects: [],
    clients: [],
    transactions: [],
    equipment: [],
  });
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const data = await getDbStudioData();
        if (active) setStudio(data);
      } catch (error) {
        if (active) setMessage(error?.message || 'Não foi possível carregar os dados dos relatórios.');
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
  );

  return (
    <div className="sf-finance-section sf-reports-page">
      <div className="sf-section-header sf-reports-header">
        <div>
          <span className="sf-reports-eyebrow">Inteligência anual</span>
          <h1>Relatório anual</h1>
          <p>
            Visão operacional e financeira do exercício, com PDF completo para conferência anual e apoio ao imposto de renda.
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

      {message && (
        <div className="sf-reports-message" role="status">
          {message}
        </div>
      )}

      <div className="sf-reports-basis-note">
        <div>
          <strong>Trabalhos de {effectiveYear}</strong>
          <span>Filtrados pela data do evento ou serviço.</span>
        </div>
        <div>
          <strong>Financeiro de {effectiveYear}</strong>
          <span>Recebimentos pela data de pagamento e despesas somente quando marcadas como pagas.</span>
        </div>
      </div>

      {warningCount > 0 && (
        <div className="sf-reports-warning">
          <AlertTriangle size={18} />
          <div>
            <strong>Há dados que precisam de conferência antes do fechamento anual.</strong>
            <span>
              {report.warnings.receiptsWithoutDate} recebimento(s) sem data
              {' · '}
              {report.warnings.expensesWithoutDate} despesa(s) paga(s) sem data
              {' · '}
              {report.warnings.projectsWithoutDate} projeto(s) sem data do trabalho
              {' · '}
              {report.warnings.pendingExpenses} despesa(s) ainda não confirmada(s) como paga(s)
              {' · '}
              {report.warnings.reconciliationItems} contrato(s) com valor recebido sem pagamento individual detalhado.
            </span>
          </div>
        </div>
      )}

      <div className="sf-metric-grid sf-reports-metrics">
        <Metric icon={BriefcaseBusiness} label={`Projetos de ${effectiveYear}`} value={report.totals.projects} raw />
        <Metric icon={DollarSign} label="Receita contratada dos trabalhos" value={report.totals.contracted} />
        <Metric icon={TrendingUp} label={`Recebimentos em ${effectiveYear}`} value={report.totals.annualReceived} />
        <Metric icon={CircleDollarSign} label="Saldo dos trabalhos do ano" value={report.totals.remaining} />
        <Metric icon={TrendingDown} label="Despesas pagas no ano" value={report.totals.annualExpenses} />
        <Metric icon={WalletCards} label="Resultado financeiro do ano" value={report.totals.annualResult} />
      </div>

      <div className="sf-report-grid sf-reports-summary-grid">
        <Report
          title="Recebimentos por conta"
          rows={[
            ['Empresa / CNPJ', formatMoney(report.totals.companyReceived)],
            ['Conta pessoal / CPF', formatMoney(report.totals.personalReceived)],
            ['Conta não informada', formatMoney(report.totals.unclassifiedAccountReceived)],
          ]}
          icon={Building2}
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
            formatMoney(item.companyReceived),
            formatMoney(item.expenses),
            formatMoney(item.result),
          ])}
          columns={['Mês', 'Recebido', 'Empresa/CNPJ', 'Despesas', 'Resultado']}
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
                  <td key={`${title}-${index}-${cellIndex}`}>{cell}</td>
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
