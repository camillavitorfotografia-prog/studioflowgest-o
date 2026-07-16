import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  BriefcaseBusiness,
  CircleDollarSign,
  DollarSign,
  Package,
  TrendingDown,
  TrendingUp,
  Users,
  WalletCards,
} from 'lucide-react';
import { formatMoney } from '../../utils/integratedData';
import {
  calculateProjectAmounts,
  getDbStudioData,
  subscribeDbUpdates,
} from '../../utils/dbData';
import './Relatorios.css';

const monthLabels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const normalizeText = (value = '') => String(value).trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const numberValue = (value) => Number(value || 0) || 0;

const parseDate = (value) => {
  if (!value) return null;
  const text = String(value).trim();
  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const normalized = br ? `${br[3]}-${br[2]}-${br[1]}` : text.slice(0, 10);
  const date = new Date(`${normalized}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const projectIdentity = (project) => {
  const external = project.externalId || project.external_id || project.importFingerprint || project.import_fingerprint;
  if (external) return `external:${external}`;
  const amounts = calculateProjectAmounts(project);
  return [
    normalizeText(project.clienteNome || project.cliente?.nome || project.clienteNomeImportado),
    String(project.data || '').slice(0, 10),
    normalizeText(project.tipoServico || project.categoria),
    amounts.total.toFixed(2),
  ].join('|');
};

const dedupeProjects = (projects = []) => {
  const map = new Map();
  projects.forEach((project) => {
    const key = projectIdentity(project);
    const previous = map.get(key);
    if (!previous) {
      map.set(key, project);
      return;
    }
    const previousAmounts = calculateProjectAmounts(previous);
    const currentAmounts = calculateProjectAmounts(project);
    const previousScore = Number(Boolean(previous.clienteId || previous.clienteId)) * 10 + previousAmounts.paid;
    const currentScore = Number(Boolean(project.clienteId || project.clienteId)) * 10 + currentAmounts.paid;
    if (currentScore > previousScore) map.set(key, project);
  });
  return [...map.values()];
};

const isExpense = (transaction = {}) => {
  const type = normalizeText(transaction.tipo);
  const general = normalizeText(transaction.tipoGeral || transaction.tipo_geral);
  if (type === 'configuracao_recorrencia' || general === 'configuracao') return false;
  return general === 'saida' || ['fixa', 'variavel', 'despesa'].includes(type);
};

export default function Relatorios() {
  const [studio, setStudio] = useState({ projects: [], clients: [], transactions: [], equipment: [] });

  useEffect(() => {
    let active = true;
    const load = async () => {
      const data = await getDbStudioData();
      if (active) setStudio(data);
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

  const reports = useMemo(() => {
    const projects = dedupeProjects(studio?.projects || []);
    const transactions = studio?.transactions || [];
    const clientsById = new Map((studio?.clients || []).map((client) => [String(client.id), client]));
    const revenueByMonth = Array.from({ length: 12 }, (_, index) => ({ mes: monthLabels[index], receita: 0, despesas: 0, lucro: 0 }));
    const byService = {};
    const byCity = {};
    const byOrigin = {};
    const byClient = {};
    const byEquipment = {};
    const profitByProject = [];

    let totalRevenue = 0;
    let totalReceived = 0;
    let totalRemaining = 0;

    projects.forEach((project) => {
      const amounts = calculateProjectAmounts(project);
      const service = project.tipoServico || project.categoria || 'Não informado';
      const client = project.cliente || clientsById.get(String(project.clientId || project.clienteId || '')) || {};
      const clientName = project.clienteNome || project.clienteNomeImportado || client.nome || 'Cliente sem cadastro';
      const projectExpenses = transactions
        .filter((transaction) => isExpense(transaction) && String(transaction.projectId || '') === String(project.id))
        .reduce((sum, transaction) => sum + numberValue(transaction.valor), 0);
      const profit = amounts.paid - projectExpenses;

      totalRevenue += amounts.total;
      totalReceived += amounts.paid;
      totalRemaining += amounts.remaining;

      const date = parseDate(project.data);
      if (date) {
        revenueByMonth[date.getMonth()].receita += amounts.paid;
        revenueByMonth[date.getMonth()].despesas += projectExpenses;
        revenueByMonth[date.getMonth()].lucro += profit;
      }

      byService[service] = (byService[service] || 0) + amounts.paid;
      const city = client.cidade || project.local || 'Não informado';
      byCity[city] = (byCity[city] || 0) + amounts.paid;
      const origin = client.origem || 'Não informado';
      byOrigin[origin] = (byOrigin[origin] || 0) + 1;
      byClient[clientName] = (byClient[clientName] || 0) + amounts.paid;
      profitByProject.push([clientName, profit]);

      const equipmentList = project.equipamentosDetalhados || project.equipamentos || project.equipmentIds || [];
      equipmentList.forEach((equipment) => {
        const eqName = typeof equipment === 'string'
          ? (studio.equipment || []).find((item) => String(item.id) === String(equipment))?.nome || equipment
          : equipment?.nome;
        if (!eqName) return;
        byEquipment[eqName] = byEquipment[eqName] || { projetos: 0, retorno: 0 };
        byEquipment[eqName].projetos += 1;
        byEquipment[eqName].retorno += amounts.paid;
      });
    });

    const generalExpenses = transactions
      .filter((transaction) => isExpense(transaction) && !transaction.projectId)
      .reduce((sum, transaction) => sum + numberValue(transaction.valor), 0);
    const projectExpenses = transactions
      .filter((transaction) => isExpense(transaction) && transaction.projectId)
      .reduce((sum, transaction) => sum + numberValue(transaction.valor), 0);
    const totalExpenses = generalExpenses + projectExpenses;
    const totalProfit = totalReceived - totalExpenses;

    transactions.filter((transaction) => isExpense(transaction)).forEach((transaction) => {
      const date = parseDate(transaction.data || transaction.dataVencimento);
      if (!date) return;
      const month = revenueByMonth[date.getMonth()];
      if (!transaction.projectId) {
        month.despesas += numberValue(transaction.valor);
        month.lucro -= numberValue(transaction.valor);
      }
    });

    const getTopEntry = (obj) => Object.entries(obj).sort((a, b) => Number(b[1]) - Number(a[1]))[0] || null;
    const serviceEntries = Object.entries(byService).sort((a, b) => b[1] - a[1]);
    const equipmentEntries = Object.entries(byEquipment).sort((a, b) => b[1].retorno - a[1].retorno);

    return {
      totalRevenue,
      totalReceived,
      totalRemaining,
      totalExpenses,
      totalProfit,
      projectsCount: projects.length,
      mostProfitableService: serviceEntries[0],
      mostSoldEssay: serviceEntries.find(([name]) => /ensaio|gestante|familia|família/i.test(name)),
      weddings: projects.filter((p) => normalizeText(p.tipoServico).includes('casamento')).length,
      revenueByMonth: revenueByMonth.filter((item) => item.receita || item.despesas || item.lucro),
      profitByProject: profitByProject.sort((a, b) => b[1] - a[1]),
      topOrigin: getTopEntry(byOrigin),
      topCity: getTopEntry(byCity),
      topClient: getTopEntry(byClient),
      equipmentMostUsed: Object.entries(byEquipment).sort((a, b) => b[1].projetos - a[1].projetos)[0],
      equipmentBestReturn: equipmentEntries[0],
      equipmentRows: equipmentEntries.map(([name, data]) => [name, `${data.projetos}x`, formatMoney(data.retorno)]),
    };
  }, [studio]);

  return (
    <div className="sf-finance-section sf-reports-page">
      <div className="sf-section-header">
        <div>
          <h1>Relatórios Consolidados</h1>
          <p>Indicadores calculados com projetos únicos, recebimentos confirmados e despesas reais.</p>
        </div>
      </div>

      <div className="sf-metric-grid sf-reports-metrics">
        <Metric icon={BriefcaseBusiness} label="Projetos únicos" value={reports.projectsCount} raw />
        <Metric icon={DollarSign} label="Receita contratada" value={reports.totalRevenue} />
        <Metric icon={TrendingUp} label="Receita recebida" value={reports.totalReceived} />
        <Metric icon={CircleDollarSign} label="Saldo a receber" value={reports.totalRemaining} />
        <Metric icon={TrendingDown} label="Despesas reais" value={reports.totalExpenses} />
        <Metric icon={WalletCards} label="Lucro líquido" value={reports.totalProfit} />
      </div>

      <div className="sf-report-grid sf-reports-summary-grid">
        <Report title="Serviço com maior receita" rows={reports.mostProfitableService ? [[reports.mostProfitableService[0], formatMoney(reports.mostProfitableService[1])]] : []} />
        <Report title="Tipo de ensaio mais vendido" rows={reports.mostSoldEssay ? [[reports.mostSoldEssay[0], formatMoney(reports.mostSoldEssay[1])]] : []} />
        <Report title="Casamentos registrados" rows={[[`${reports.weddings} trabalhos`, '']]} />
        <Report title="Canal de captação" rows={reports.topOrigin ? [[reports.topOrigin[0], `${reports.topOrigin[1]} clientes`]] : []} />
        <Report title="Cidade de maior faturamento" rows={reports.topCity ? [[reports.topCity[0], formatMoney(reports.topCity[1])]] : []} />
        <Report title="Cliente de maior LTV" rows={reports.topClient ? [[reports.topClient[0], formatMoney(reports.topClient[1])]] : []} />
        <Report title="Equipamento mais escalado" rows={reports.equipmentMostUsed ? [[reports.equipmentMostUsed[0], `${reports.equipmentMostUsed[1].projetos} projetos`]] : []} />
        <Report title="Equipamento de maior retorno" rows={reports.equipmentBestReturn ? [[reports.equipmentBestReturn[0], formatMoney(reports.equipmentBestReturn[1].retorno)]] : []} />
      </div>

      <div className="sf-panel-grid sf-reports-table-grid">
        <TableCard title="Fluxo por mês" icon={DollarSign} rows={reports.revenueByMonth.map((item) => [item.mes, formatMoney(item.receita), formatMoney(item.despesas), formatMoney(item.lucro)])} columns={['Mês', 'Recebido', 'Despesas', 'Lucro']} />
        <TableCard title="Rentabilidade por contrato" icon={Users} rows={reports.profitByProject.slice(0, 12).map(([name, value]) => [name, formatMoney(value)])} columns={['Projeto / Cliente', 'Lucro líquido']} />
        <TableCard title="Equipamentos por retorno" icon={Package} rows={reports.equipmentRows} columns={['Ativo', 'Frequência', 'Receita associada']} />
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

function Report({ title, rows }) {
  return (
    <div className="sf-card report sf-report-summary-card">
      <h3>{title}</h3>
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
      <table className="sf-table">
        <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${title}-${index}`}>{row.map((cell, cellIndex) => <td key={`${title}-${index}-${cellIndex}`}>{cell}</td>)}</tr>
          ))}
          {!rows.length && <tr><td colSpan={columns.length} className="empty">Sem dados consolidados para o período.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
