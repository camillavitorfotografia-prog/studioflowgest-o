import { useMemo, useState } from 'react';
import { CheckCircle, Clock, DollarSign, Target, TrendingUp, Users, XCircle } from 'lucide-react';
import { ACTIVE_LEAD_STATUSES } from '../../data/crm';
import { formatCurrency, parseCurrency, parseDate } from '../../utils/formatters';

const periodFilters = {
  hoje: (date, now) => date.toDateString() === now.toDateString(),
  este_mes: (date, now) => date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear(),
  ultimos_3: (date, now) => {
    const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    return date >= start && date <= now;
  },
  ano: (date, now) => date.getFullYear() === now.getFullYear(),
};

export default function CRMStats({ leads }) {
  const [periodo, setPeriodo] = useState('este_mes');

  const stats = useMemo(() => {
    const now = new Date();
    const filter = periodFilters[periodo] || periodFilters.este_mes;
    const filtered = leads.filter((lead) => {
      const date = parseDate(lead.createdAt || lead.dataPedido || lead.dataEvento);
      return date ? filter(date, now) : true;
    });

    const total = filtered.length;
    const aprovados = filtered.filter((lead) => ['aprovado', 'evento_realizado', 'finalizado'].includes(lead.status)).length;
    const pendentes = filtered.filter((lead) => ACTIVE_LEAD_STATUSES.includes(lead.status)).length;
    const perdidos = filtered.filter((lead) => lead.status === 'perdido').length;
    const oportunidades = filtered.filter((lead) => lead.status !== 'perdido').length;
    const conversao = oportunidades > 0 ? Math.round((aprovados / oportunidades) * 100) : 0;
    const potencial = filtered
      .filter((lead) => ACTIVE_LEAD_STATUSES.includes(lead.status))
      .reduce((totalValue, lead) => totalValue + parseCurrency(lead.valorOrcamento), 0);

    return [
      { title: 'Leads', value: total, icon: <Users size={20} />, color: '#fff' },
      { title: 'Conversao', value: `${conversao}%`, icon: <TrendingUp size={20} />, color: '#34d399' },
      { title: 'Aprovados', value: aprovados, icon: <CheckCircle size={20} />, color: '#60a5fa' },
      { title: 'Pendentes', value: pendentes, icon: <Clock size={20} />, color: '#fb923c' },
      { title: 'Perdidos', value: perdidos, icon: <XCircle size={20} />, color: '#f87171' },
      { title: 'Potencial', value: formatCurrency(potencial), icon: <DollarSign size={20} />, color: '#c5a059' },
    ];
  }, [leads, periodo]);

  return (
    <section style={{ background: '#0a0a0a', padding: '24px', borderRadius: '16px', border: '1px solid #1a1a1a', marginBottom: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '1.1rem', color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Target size={20} color="#c5a059" /> Indicadores de Vendas
        </h2>
        <select
          value={periodo}
          onChange={(event) => setPeriodo(event.target.value)}
          style={{ background: '#1a1a1a', border: '1px solid #333', color: '#bbb', padding: '8px 12px', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer' }}
        >
          <option value="hoje">Hoje</option>
          <option value="este_mes">Este mes</option>
          <option value="ultimos_3">Ultimos 3 meses</option>
          <option value="ano">Ano</option>
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: '16px' }}>
        {stats.map((stat) => (
          <div key={stat.title} style={{ background: '#111', padding: '16px', borderRadius: '12px', border: '1px solid #222', minHeight: '92px' }}>
            <div style={{ color: '#888', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              {stat.icon} {stat.title}
            </div>
            <div style={{ fontSize: stat.title === 'Potencial' ? '1.1rem' : '1.5rem', fontWeight: '700', color: stat.color }}>{stat.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
