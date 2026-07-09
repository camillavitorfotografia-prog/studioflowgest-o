import { useEffect, useMemo, useState } from 'react';
import { BarChart3, BriefcaseBusiness, DollarSign, Package, TrendingUp, Users } from 'lucide-react';
import { formatMoney, getStudioData } from '../../utils/integratedData';

const monthLabels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export default function Relatorios() {
  const [studio, setStudio] = useState(() => getStudioData());

  useEffect(() => {
    const load = () => setStudio(getStudioData());
    load();
    window.addEventListener('focus', load);
    window.addEventListener('storage', load);
    return () => {
      window.removeEventListener('focus', load);
      window.removeEventListener('storage', load);
    };
  }, []);

  const reports = useMemo(() => {
    const projects = studio.projects;
    const revenueByMonth = Array.from({ length: 12 }, (_, index) => ({ mes: monthLabels[index], receita: 0, lucro: 0 }));
    const byService = {};
    const byCity = {};
    const byOrigin = {};
    const byClient = {};
    const byEquipment = {};
    const marginByService = {};

    projects.forEach((project) => {
      const service = project.tipoServico || 'Nao informado';
      const revenue = Number(project.valorContratado || 0);
      const profit = Number(project.financeiro?.lucro || project.valorRecebido || 0) - Number(project.financeiro?.custos || 0);
      const margin = project.financeiro?.margem || 0;
      const date = project.data ? new Date(project.data) : null;
      if (date && !Number.isNaN(date.getTime())) {
        revenueByMonth[date.getMonth()].receita += revenue;
        revenueByMonth[date.getMonth()].lucro += profit;
      }

      byService[service] = (byService[service] || 0) + revenue;
      byCity[project.cliente?.cidade || project.local || 'Nao informado'] = (byCity[project.cliente?.cidade || project.local || 'Nao informado'] || 0) + revenue;
      byOrigin[project.cliente?.origem || 'Nao informado'] = (byOrigin[project.cliente?.origem || 'Nao informado'] || 0) + 1;
      byClient[project.clienteNome || 'Cliente'] = (byClient[project.clienteNome || 'Cliente'] || 0) + revenue;
      marginByService[service] = marginByService[service] || { total: 0, count: 0 };
      marginByService[service].total += margin;
      marginByService[service].count += 1;

      (project.equipamentosDetalhados || []).forEach((equipment) => {
        byEquipment[equipment.nome] = byEquipment[equipment.nome] || { projetos: 0, retorno: 0 };
        byEquipment[equipment.nome].projetos += 1;
        byEquipment[equipment.nome].retorno += revenue;
      });
    });

    const top = (obj) => Object.entries(obj).sort((a, b) => Number(b[1]) - Number(a[1]))[0];
    const equipmentEntries = Object.entries(byEquipment).sort((a, b) => b[1].retorno - a[1].retorno);
    const serviceEntries = Object.entries(byService).sort((a, b) => b[1] - a[1]);

    return {
      totalRevenue: projects.reduce((sum, project) => sum + Number(project.valorContratado || 0), 0),
      totalReceived: projects.reduce((sum, project) => sum + Number(project.valorRecebido || 0), 0),
      totalProfit: projects.reduce((sum, project) => sum + Number(project.financeiro?.lucro || 0), 0),
      projectsCount: projects.length,
      mostProfitableService: serviceEntries[0],
      mostSoldEssay: Object.entries(byService).filter(([name]) => name.toLowerCase().includes('ensaio') || name.toLowerCase().includes('gestante') || name.toLowerCase().includes('familia')).sort((a, b) => b[1] - a[1])[0],
      weddings: projects.filter((project) => (project.tipoServico || '').toLowerCase().includes('casamento')).length,
      revenueByMonth: revenueByMonth.filter((item) => item.receita > 0 || item.lucro !== 0),
      profitByProject: projects.map((project) => [project.clienteNome, project.financeiro?.lucro || 0]).sort((a, b) => b[1] - a[1]),
      topOrigin: top(byOrigin),
      topCity: top(byCity),
      topClient: top(byClient),
      equipmentMostUsed: Object.entries(byEquipment).sort((a, b) => b[1].projetos - a[1].projetos)[0],
      equipmentBestReturn: equipmentEntries[0],
      marginByService: Object.entries(marginByService).map(([service, data]) => [service, data.count ? data.total / data.count : 0]),
    };
  }, [studio]);

  return (
    <div className="sf-finance-section">
      <div className="sf-section-header">
        <div>
          <h1>Relatorios</h1>
          <p>Leitura consolidada dos projetos, clientes, financeiro e equipamentos.</p>
        </div>
      </div>

      <div className="sf-metric-grid">
        <Metric icon={BriefcaseBusiness} label="Projetos" value={reports.projectsCount} raw />
        <Metric icon={DollarSign} label="Receita contratada" value={reports.totalRevenue} />
        <Metric icon={TrendingUp} label="Receita recebida" value={reports.totalReceived} />
        <Metric icon={BarChart3} label="Lucro consolidado" value={reports.totalProfit} />
      </div>

      <div className="sf-report-grid">
        <Report title="Servico mais lucrativo" rows={reports.mostProfitableService ? [[reports.mostProfitableService[0], formatMoney(reports.mostProfitableService[1])]] : []} />
        <Report title="Tipo de ensaio mais vendido" rows={reports.mostSoldEssay ? [[reports.mostSoldEssay[0], formatMoney(reports.mostSoldEssay[1])]] : []} />
        <Report title="Casamentos realizados" rows={[[`${reports.weddings} projetos`, '']]} />
        <Report title="Origem dos clientes" rows={reports.topOrigin ? [[reports.topOrigin[0], `${reports.topOrigin[1]} clientes`]] : []} />
        <Report title="Cidade com maior faturamento" rows={reports.topCity ? [[reports.topCity[0], formatMoney(reports.topCity[1])]] : []} />
        <Report title="Cliente que mais investiu" rows={reports.topClient ? [[reports.topClient[0], formatMoney(reports.topClient[1])]] : []} />
        <Report title="Equipamento mais utilizado" rows={reports.equipmentMostUsed ? [[reports.equipmentMostUsed[0], `${reports.equipmentMostUsed[1].projetos} projetos`]] : []} />
        <Report title="Equipamento com maior retorno" rows={reports.equipmentBestReturn ? [[reports.equipmentBestReturn[0], formatMoney(reports.equipmentBestReturn[1].retorno)]] : []} />
      </div>

      <div className="sf-panel-grid">
        <TableCard title="Receita por mes" icon={DollarSign} rows={reports.revenueByMonth.map((item) => [item.mes, formatMoney(item.receita), formatMoney(item.lucro)])} columns={['Mes', 'Receita', 'Lucro']} />
        <TableCard title="Lucro por projeto" icon={Users} rows={reports.profitByProject.slice(0, 8).map(([name, value]) => [name, formatMoney(value)])} columns={['Projeto', 'Lucro']} />
        <TableCard title="Margem media por servico" icon={TrendingUp} rows={reports.marginByService.map(([name, value]) => [name, `${value.toFixed(1)}%`])} columns={['Servico', 'Margem']} />
        <TableCard title="Equipamentos por retorno" icon={Package} rows={(reports.equipmentBestReturn ? Object.entries(studio.equipment.reduce((acc, item) => ({ ...acc, [item.nome]: item.nome }), {})) : []).map(([name]) => [name])} columns={['Equipamento']} />
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value, raw = false }) {
  return (
    <div className="sf-card metric">
      <div className="metric-label"><Icon size={18} /> {label}</div>
      <strong>{raw ? value : formatMoney(value)}</strong>
    </div>
  );
}

function Report({ title, rows }) {
  return (
    <div className="sf-card report">
      <h3>{title}</h3>
      {rows.length === 0 && <p className="sf-muted">Sem dados para exibir.</p>}
      {rows.map(([label, value]) => <div className="report-row" key={`${title}-${label}`}><span>{label}</span><strong>{value}</strong></div>)}
    </div>
  );
}

function TableCard({ title, icon: Icon, columns, rows }) {
  return (
    <div className="sf-table-card">
      <div style={{ padding: '18px 18px 0' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Icon size={18} /> {title}</h3>
      </div>
      <table className="sf-table">
        <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, index) => <tr key={`${title}-${index}`}>{row.map((cell, cellIndex) => <td key={`${title}-${index}-${cellIndex}`}>{cell}</td>)}</tr>)}
          {rows.length === 0 && <tr><td colSpan={columns.length} className="empty">Sem dados para exibir.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

