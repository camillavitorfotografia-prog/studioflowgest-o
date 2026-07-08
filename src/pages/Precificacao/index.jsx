import { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Calculator, Clock3, DollarSign, Gauge, Package, Percent, Receipt, Save, Wallet } from 'lucide-react';
import {
  FINANCE_STORAGE_KEYS,
  buildFinanceSnapshot,
  calculateDepreciation,
  formatCurrency,
  getTransactionDate,
  getTransactionValue,
  isExpense,
  monthKey,
  parseCurrency,
} from '../../utils/financeEngine';
import { maskCurrency } from '../../utils/masks';

const workTypes = ['Casamento', 'Pre Wedding', 'Ensaio Casal', 'Ensaio Gestante', 'Ensaio Familia', 'Ensaio Feminino', 'Corporativo', 'Formatura', 'Eventos', 'Outros'];
const serviceTypes = ['Fotografia', 'Filmagem', 'Fotografia + Filmagem'];
const marginOptions = [20, 30, 40, 50, 60, 100];
const timeFields = [
  ['atendimento', 'Atendimento'],
  ['reunioes', 'Reunioes'],
  ['deslocamento', 'Deslocamento'],
  ['captacao', 'Captacao'],
  ['backup', 'Backup'],
  ['selecao', 'Selecao'],
  ['edicao', 'Edicao'],
  ['entrega', 'Entrega'],
  ['suporte', 'Suporte pos venda'],
];

const defaultForm = {
  tipoTrabalho: 'Casamento',
  tipoServico: 'Fotografia + Filmagem',
  projetosMes: 4,
  margem: 40,
  custoHoraBase: 'R$ 80,00',
  custosExtras: '',
  time: { atendimento: 1, reunioes: 2, deslocamento: 2, captacao: 8, backup: 1, selecao: 3, edicao: 12, entrega: 1, suporte: 1 },
  selectedEquipment: [],
};

const inputStyle = {
  width: '100%',
  background: 'var(--bg-main)',
  border: '1px solid var(--border-color)',
  color: 'var(--text-main)',
  padding: '12px',
  borderRadius: '8px',
  fontSize: '0.9rem',
};

export default function Precificacao() {
  const [form, setForm] = useState(() => JSON.parse(localStorage.getItem(FINANCE_STORAGE_KEYS.pricing) || 'null') || defaultForm);
  const [data, setData] = useState({ clients: [], transactions: [], equipment: [], balances: {}, config: {} });

  useEffect(() => {
    const loadData = () => {
      const equipment = JSON.parse(localStorage.getItem(FINANCE_STORAGE_KEYS.equipment) || '[]');
      setData({
        clients: JSON.parse(localStorage.getItem('cv_studio_clients') || '[]'),
        transactions: JSON.parse(localStorage.getItem(FINANCE_STORAGE_KEYS.transactions) || '[]'),
        equipment,
        balances: JSON.parse(localStorage.getItem(FINANCE_STORAGE_KEYS.balances) || '{"salario":0,"empresa":0,"reserva":0}'),
        config: JSON.parse(localStorage.getItem(FINANCE_STORAGE_KEYS.config) || '{"salario":35,"empresa":45,"reserva":20}'),
      });
      setForm((current) => ({
        ...current,
        selectedEquipment: current.selectedEquipment.length ? current.selectedEquipment : equipment.map((item) => item.id),
      }));
    };

    loadData();
    window.addEventListener('focus', loadData);
    window.addEventListener('storage', loadData);
    return () => {
      window.removeEventListener('focus', loadData);
      window.removeEventListener('storage', loadData);
    };
  }, []);

  const result = useMemo(() => {
    const snapshot = buildFinanceSnapshot(data);
    const projectsPerMonth = Math.max(1, Number(form.projetosMes || 1));
    const fixedPerProject = snapshot.fixedMonthly / projectsPerMonth;
    const currentMonth = monthKey(new Date());
    const variableMonth = data.transactions
      .filter((item) => isExpense(item) && item.tipo === 'variavel' && monthKey(getTransactionDate(item)) === currentMonth)
      .reduce((sum, item) => sum + getTransactionValue(item), 0);
    const variablePerProject = variableMonth / projectsPerMonth;
    const extraCosts = parseCurrency(form.custosExtras);
    const selectedEquipment = data.equipment.filter((item) => form.selectedEquipment.includes(item.id));
    const equipmentCost = selectedEquipment.reduce((sum, item) => sum + calculateDepreciation(item).monthlyDepreciation, 0) / projectsPerMonth;
    const totalHours = Object.values(form.time).reduce((sum, value) => sum + Number(value || 0), 0);
    const laborCost = totalHours * parseCurrency(form.custoHoraBase);
    const realCost = fixedPerProject + variablePerProject + equipmentCost + laborCost + extraCosts;
    const marginMultiplier = Number(form.margem || 0) / 100;
    const minimumPrice = realCost * 1.12;
    const recommendedPrice = marginMultiplier >= 1 ? realCost * 2 : realCost / Math.max(0.01, 1 - marginMultiplier);
    const premiumPrice = recommendedPrice * 1.25;
    const profit = recommendedPrice - realCost;

    return {
      projectsPerMonth,
      fixedPerProject,
      variablePerProject,
      equipmentCost,
      extraCosts,
      totalHours,
      laborCost,
      realCost,
      profit,
      profitPercent: recommendedPrice > 0 ? (profit / recommendedPrice) * 100 : 0,
      minimumPrice,
      recommendedPrice,
      premiumPrice,
      hourValue: totalHours > 0 ? recommendedPrice / totalHours : 0,
      finalMargin: recommendedPrice > 0 ? (profit / recommendedPrice) * 100 : 0,
    };
  }, [data, form]);

  const savePricing = () => {
    localStorage.setItem(FINANCE_STORAGE_KEYS.pricing, JSON.stringify(form));
    window.dispatchEvent(new Event('storage'));
  };

  const toggleEquipment = (id) => {
    setForm((current) => ({
      ...current,
      selectedEquipment: current.selectedEquipment.includes(id)
        ? current.selectedEquipment.filter((item) => item !== id)
        : [...current.selectedEquipment, id],
    }));
  };

  const costChart = [
    { name: 'Fixos', value: result.fixedPerProject, color: '#c5a059' },
    { name: 'Variaveis', value: result.variablePerProject + result.extraCosts, color: '#ef4444' },
    { name: 'Equip.', value: result.equipmentCost, color: '#2563eb' },
    { name: 'Tempo', value: result.laborCost, color: '#10b981' },
  ].filter((item) => item.value > 0);
  const priceChart = [
    { name: 'Minimo', valor: Math.round(result.minimumPrice) },
    { name: 'Recomendado', valor: Math.round(result.recommendedPrice) },
    { name: 'Premium', valor: Math.round(result.premiumPrice) },
  ];

  return (
    <div className="sf-finance-section">
      <div className="sf-section-header">
        <div>
          <h1>Precificacao</h1>
          <p>Preco ideal por projeto usando Financeiro, Equipamentos, tempo operacional e margem.</p>
        </div>
        <button className="sf-primary-button" onClick={savePricing}>
          <Save size={18} /> Salvar modelo
        </button>
      </div>

      <div className="sf-metric-grid">
        <Metric icon={Receipt} label="Custo real" value={result.realCost} />
        <Metric icon={Wallet} label="Lucro em reais" value={result.profit} tone="positive" />
        <Metric icon={Percent} label="Lucro em porcentagem" value={`${result.profitPercent.toFixed(1)}%`} />
        <Metric icon={DollarSign} label="Preco recomendado" value={result.recommendedPrice} tone="positive" />
        <Metric icon={Clock3} label="Valor da hora" value={result.hourValue} />
        <Metric icon={Gauge} label="Margem final" value={`${result.finalMargin.toFixed(1)}%`} />
      </div>

      <div className="sf-pricing-layout">
        <div className="sf-card">
          <h3>Servico</h3>
          <div className="sf-form-grid">
            <Field label="Tipo de trabalho">
              <select style={inputStyle} value={form.tipoTrabalho} onChange={(event) => setForm({ ...form, tipoTrabalho: event.target.value })}>
                {workTypes.map((type) => <option key={type}>{type}</option>)}
              </select>
            </Field>
            <Field label="Tipo de servico">
              <select style={inputStyle} value={form.tipoServico} onChange={(event) => setForm({ ...form, tipoServico: event.target.value })}>
                {serviceTypes.map((type) => <option key={type}>{type}</option>)}
              </select>
            </Field>
            <Field label="Projetos por mes">
              <input type="number" min="1" style={inputStyle} value={form.projetosMes} onChange={(event) => setForm({ ...form, projetosMes: event.target.value })} />
            </Field>
            <Field label="Custo da hora base">
              <input style={inputStyle} value={form.custoHoraBase} onChange={(event) => setForm({ ...form, custoHoraBase: maskCurrency(event.target.value) })} />
            </Field>
          </div>

          <h3 style={{ marginTop: 24 }}>Margem desejada</h3>
          <div className="sf-segmented">
            {marginOptions.map((margin) => (
              <button key={margin} className={Number(form.margem) === margin ? 'active' : ''} onClick={() => setForm({ ...form, margem: margin })}>
                {margin}%
              </button>
            ))}
          </div>

          <h3 style={{ marginTop: 24 }}>Custos variaveis extras</h3>
          <input style={inputStyle} placeholder="Combustivel, pedagio, freelancer, hospedagem..." value={form.custosExtras} onChange={(event) => setForm({ ...form, custosExtras: maskCurrency(event.target.value) })} />
        </div>

        <div className="sf-card">
          <h3>Tempo de trabalho</h3>
          <div className="sf-time-grid">
            {timeFields.map(([key, label]) => (
              <Field key={key} label={label}>
                <input type="number" min="0" step="0.5" style={inputStyle} value={form.time[key]} onChange={(event) => setForm({ ...form, time: { ...form.time, [key]: event.target.value } })} />
              </Field>
            ))}
          </div>
          <div className="formula-total">
            <span>Total de horas</span>
            <strong>{result.totalHours.toFixed(1)}h</strong>
          </div>
        </div>
      </div>

      <div className="sf-panel-grid">
        <div className="sf-card">
          <h3>Equipamentos usados</h3>
          {data.equipment.length === 0 && <p className="sf-muted">Cadastre equipamentos para calcular depreciacao por projeto.</p>}
          <div className="sf-equipment-picker">
            {data.equipment.map((item) => {
              const depreciation = calculateDepreciation(item);
              const active = form.selectedEquipment.includes(item.id);
              return (
                <button key={item.id} className={active ? 'active' : ''} onClick={() => toggleEquipment(item.id)}>
                  <Package size={16} />
                  <span>{item.nome}</span>
                  <strong>{formatCurrency(depreciation.monthlyDepreciation / result.projectsPerMonth)}</strong>
                </button>
              );
            })}
          </div>
        </div>

        <div className="sf-card">
          <h3>Composicao do custo</h3>
          <ResponsiveContainer width="100%" height={230}>
            <PieChart>
              <Pie data={costChart} innerRadius={58} outerRadius={86} dataKey="value" paddingAngle={4} stroke="none">
                {costChart.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
              </Pie>
              <Tooltip formatter={(value) => formatCurrency(value)} contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: 8 }} />
            </PieChart>
          </ResponsiveContainer>
          {costChart.map((item) => (
            <div className="report-row" key={item.name}>
              <span>{item.name}</span>
              <strong>{formatCurrency(item.value)}</strong>
            </div>
          ))}
        </div>

        <div className="sf-card">
          <h3>Escada de preco</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={priceChart} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
              <XAxis dataKey="name" stroke="#A1A1AA" tickLine={false} axisLine={false} />
              <YAxis stroke="#A1A1AA" tickFormatter={(value) => `R$ ${Math.round(value / 1000)}k`} />
              <Tooltip formatter={(value) => formatCurrency(value)} contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: 8 }} />
              <Bar dataKey="valor" fill="#c5a059" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="sf-card">
          <h3>Curva de lucro</h3>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={priceChart.map((item) => ({ ...item, lucro: Math.max(0, item.valor - result.realCost) }))} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
              <XAxis dataKey="name" stroke="#A1A1AA" tickLine={false} axisLine={false} />
              <YAxis stroke="#A1A1AA" tickFormatter={(value) => `R$ ${Math.round(value / 1000)}k`} />
              <Tooltip formatter={(value) => formatCurrency(value)} contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: 8 }} />
              <Area type="monotone" dataKey="lucro" stroke="#10b981" fill="rgba(16,185,129,.18)" strokeWidth={3} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="sf-table-card">
        <table className="sf-table">
          <thead>
            <tr><th>Base integrada</th><th>Valor usado</th><th>Origem</th></tr>
          </thead>
          <tbody>
            <tr><td>Custos fixos distribuidos</td><td>{formatCurrency(result.fixedPerProject)}</td><td>Financeiro / Despesas Fixas</td></tr>
            <tr><td>Custos variaveis distribuidos</td><td>{formatCurrency(result.variablePerProject)}</td><td>Financeiro / Despesas Variaveis</td></tr>
            <tr><td>Depreciacao de equipamentos</td><td>{formatCurrency(result.equipmentCost)}</td><td>Equipamentos</td></tr>
            <tr><td>Tempo de trabalho</td><td>{formatCurrency(result.laborCost)}</td><td>Precificacao / Horas</td></tr>
            <tr><td>Preco minimo</td><td>{formatCurrency(result.minimumPrice)}</td><td>Custo real + margem operacional</td></tr>
            <tr><td>Preco premium</td><td>{formatCurrency(result.premiumPrice)}</td><td>Recomendado + posicionamento premium</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="sf-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Metric({ icon: Icon = Calculator, label, value, tone = 'neutral' }) {
  const content = typeof value === 'number' ? formatCurrency(value) : value;
  return (
    <div className={`sf-card metric ${tone}`}>
      <div className="metric-label"><Icon size={18} /> {label}</div>
      <strong>{content}</strong>
    </div>
  );
}
