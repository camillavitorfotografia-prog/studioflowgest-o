import { useEffect, useMemo, useState } from 'react';
import { BarChart3, BriefcaseBusiness, DollarSign, Package, TrendingUp, Users } from 'lucide-react';
import { formatMoney } from '../../utils/integratedData';
import { getDbStudioData, subscribeDbUpdates } from '../../utils/dbData';

const monthLabels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export default function Relatorios() {
  const [studio, setStudio] = useState({ projects: [], clients: [], transactions: [] });

  useEffect(() => {
    let active = true;
    const load = async () => {
      const data = await getDbStudioData();
      if (active) setStudio(data);
    };
    setTimeout(() => { void load(); }, 0);
    window.addEventListener('focus', load);
    const unsubscribe = subscribeDbUpdates(load);
    return () => {
      active = false;
      window.removeEventListener('focus', load);
      unsubscribe();
    };
  }, []);

  const reports = useMemo(() => {
    const projects = studio?.projects || [];
    const revenueByMonth = Array.from({ length: 12 }, (_, index) => ({ mes: monthLabels[index], receita: 0, lucro: 0 }));
    
    const byService = {};
    const byCity = {};
    const byOrigin = {};
    const byClient = {};
    const byEquipment = {};
    const marginByService = {};

    projects.forEach((project) => {
      const service = project.tipoServico || 'Não informado';
      const revenue = Number(project.valorContratado || 0);
      const profit = Number(project.financeiro?.lucro || project.valorRecebido || 0) - Number(project.financeiro?.custos || 0);
      const margin = Number(project.financeiro?.margem || 0);
      
      // Tratamento seguro de datas evitando bugs de fuso horário (UTC vs Local)
      if (project.data) {
        const safeDateStr = String(project.data).replace(/-/g, '/');
        const date = new Date(safeDateStr);
        if (!Number.isNaN(date.getTime())) {
          revenueByMonth[date.getMonth()].receita += revenue;
          revenueByMonth[date.getMonth()].lucro += profit;
        }
      }

      byService[service] = (byService[service] || 0) + revenue;
      
      const city = project.cliente?.cidade || project.local || 'Não informado';
      byCity[city] = (byCity[city] || 0) + revenue;
      
      const origin = project.cliente?.origem || 'Não informado';
      byOrigin[origin] = (byOrigin[origin] || 0) + 1;
      
      const clientName = project.clienteNome || 'Cliente Casual';
      byClient[clientName] = (byClient[clientName] || 0) + revenue;
      
      marginByService[service] = marginByService[service] || { total: 0, count: 0 };
      marginByService[service].total += margin;
      marginByService[service].count += 1;

      // Unificação segura do mapeamento de uso de equipamentos ativos
      const equipmentList = project.equipamentosDetalhados || project.equipamentos || [];
      equipmentList.forEach((equipment) => {
        const eqName = typeof equipment === 'string' ? equipment : equipment?.nome;
        if (!eqName) return;
        
        byEquipment[eqName] = byEquipment[eqName] || { projetos: 0, retorno: 0 };
        byEquipment[eqName].projetos += 1;
        byEquipment[eqName].retorno += revenue;
      });
    });

    const getTopEntry = (obj) => {
      const entries = Object.entries(obj);
      if (!entries.length) return null;
      return entries.sort((a, b) => Number(b[1]) - Number(a[1]))[0];
    };

    const serviceEntries = Object.entries(byService).sort((a, b) => b[1] - a[1]);
    const equipmentEntries = Object.entries(byEquipment).sort((a, b) => b[1].retorno - a[1].retorno);

    // Mapeamento limpo e performático para a tabela de equipamentos
    const equipmentRows = equipmentEntries.map(([name, data]) => [
      name,
      `${data.projetos}x`,
      formatMoney(data.retorno)
    ]);

    return {
      totalRevenue: projects.reduce((sum, p) => sum + Number(p.valorContratado || 0), 0),
      totalReceived: projects.reduce((sum, p) => sum + Number(p.valorRecebido || 0), 0),
      totalProfit: projects.reduce((sum, p) => sum + Number(p.financeiro?.lucro || 0), 0),
      projectsCount: projects.length,
      mostProfitableService: serviceEntries[0],
      mostSoldEssay: Object.entries(byService)
        .filter(([name]) => {
          const lower = name.toLowerCase();
          return lower.includes('ensaio') || lower.includes('gestante') || lower.includes('familia') || lower.includes('família');
        })
        .sort((a, b) => b[1] - a[1])[0],
      weddings: projects.filter((p) => (p.tipoServico || '').toLowerCase().includes('casamento')).length,
      revenueByMonth: revenueByMonth.filter((item) => item.receita > 0 || item.lucro !== 0),
      profitByProject: projects.map((p) => [p.clienteNome || 'Sem Identificação', p.financeiro?.lucro || 0]).sort((a, b) => b[1] - a[1]),
      topOrigin: getTopEntry(byOrigin),
      topCity: getTopEntry(byCity),
      topClient: getTopEntry(byClient),
      equipmentMostUsed: Object.entries(byEquipment).sort((a, b) => b[1].projetos - a[1].projetos)[0],
      equipmentBestReturn: equipmentEntries[0],
      marginByService: Object.entries(marginByService).map(([service, data]) => [service, data.count ? data.total / data.count : 0]),
      equipmentRows,
    };
  }, [studio]);

  return (
    <div className="sf-finance-section">
      <div className="sf-section-header">
        <div>
          <h1>Relatórios Consolidados</h1>
          <p>Análise de inteligência e performance comercial do acervo, finanças e contratos.</p>
        </div>
      </div>

      <div className="sf-metric-grid">
        <Metric icon={BriefcaseBusiness} label="Projetos" value={reports.projectsCount} raw />
        <Metric icon={DollarSign} label="Receita contratada" value={reports.totalRevenue} />
        <Metric icon={TrendingUp} label="Receita recebida" value={reports.totalReceived} />
        <Metric icon={BarChart3} label="Lucro consolidado" value={reports.totalProfit} />
      </div>

      <div className="sf-report-grid">
        <Report title="Serviço mais lucrativo" rows={reports.mostProfitableService ? [[reports.mostProfitableService[0], formatMoney(reports.mostProfitableService[1])]] : []} />
        <Report title="Tipo de ensaio mais vendido" rows={reports.mostSoldEssay ? [[reports.mostSoldEssay[0], formatMoney(reports.mostSoldEssay[1])]] : []} />
        <Report title="Casamentos realizados" rows={[[`${reports.weddings} contratos assinados`, '']]} />
        <Report title="Canal de captação (Origem)" rows={reports.topOrigin ? [[reports.topOrigin[0], `${reports.topOrigin[1]} clientes`]] : []} />
        <Report title="Cidade polo de faturamento" rows={reports.topCity ? [[reports.topCity[0], formatMoney(reports.topCity[1])]] : []} />
        <Report title="Cliente de maior LTV" rows={reports.topClient ? [[reports.topClient[0], formatMoney(reports.topClient[1])]] : []} />
        <Report title="Equipamento mais escalado" rows={reports.equipmentMostUsed ? [[reports.equipmentMostUsed[0], `${reports.equipmentMostUsed[1].projetos} projetos`]] : []} />
        <Report title="Equipamento de melhor ROI" rows={reports.equipmentBestReturn ? [[reports.equipmentBestReturn[0], formatMoney(reports.equipmentBestReturn[1].retorno)]] : []} />
      </div>

      <div className="sf-panel-grid">
        <TableCard title="Faturamento por mês" icon={DollarSign} rows={reports.revenueByMonth.map((item) => [item.mes, formatMoney(item.receita), formatMoney(item.lucro)])} columns={['Mês', 'Receita', 'Lucro Real']} />
        <TableCard title="Rentabilidade por contrato" icon={Users} rows={reports.profitByProject.slice(0, 8).map(([name, value]) => [name, formatMoney(value)])} columns={['Projeto / Cliente', 'Lucro Líquido']} />
        <TableCard title="Margem média por serviço" icon={TrendingUp} rows={reports.marginByService.map(([name, value]) => [name, `${value.toFixed(1)}%`])} columns={['Linha de Serviço', 'Margem Operacional']} />
        <TableCard title="Equipamentos por retorno" icon={Package} rows={reports.equipmentRows} columns={['Ativo', 'Frequência', 'Faturamento Gerado']} />
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
    <div className="sf-table-card">
      <div style={{ padding: '20px 20px 4px' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.05rem', margin: 0, fontWeight: 600, color: 'var(--text-main)' }}>
          <Icon size={18} style={{ color: '#c5a059' }} /> {title}
        </h3>
      </div>
      <table className="sf-table">
        <thead>
          <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${title}-${index}`}>
              {row.map((cell, cellIndex) => <td key={`${title}-${index}-${cellIndex}`}>{cell}</td>)}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="empty" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '20px' }}>
                Sem dados consolidados para o período.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}