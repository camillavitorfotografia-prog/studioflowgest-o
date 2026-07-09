import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit2, Plus, Trash2, Wrench } from 'lucide-react';
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Modal from '../../components/Modal';
import { getStudioData } from '../../utils/integratedData';
import { maskCurrency } from '../../utils/masks';
import {
  FINANCE_STORAGE_KEYS,
  buildDepreciationChart,
  calculateDepreciation,
  formatCurrency,
  parseCurrency,
} from '../../utils/financeEngine';

const emptyEquipment = {
  id: null,
  nome: '',
  valor: '',
  valorCompra: '',
  dataCompra: '',
  garantiaAte: '',
  vidaUtilAnos: 5,
  valorResidual: '',
  metodoDepreciacao: 'linear',
  observacoes: '',
  manutencoes: [],
};

const inputStyle = {
  width: '100%',
  padding: '12px',
  background: 'var(--bg-main)',
  border: '1px solid var(--border-color)',
  borderRadius: '8px',
  color: '#fff',
};

export default function Equipamentos() {
  const navigate = useNavigate();
  const [equipamentos, setEquipamentos] = useState(() =>
    JSON.parse(localStorage.getItem(FINANCE_STORAGE_KEYS.equipment) || '[]'),
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [maintenanceModalOpen, setMaintenanceModalOpen] = useState(false);
  const [formData, setFormData] = useState(emptyEquipment);
  const [maintenance, setMaintenance] = useState({ equipamentoId: null, data: '', descricao: '', valor: '' });
  const [studio, setStudio] = useState(() => getStudioData());

  useEffect(() => {
    const syncEquipamentos = () => {
      const dados = JSON.parse(localStorage.getItem(FINANCE_STORAGE_KEYS.equipment) || '[]');
      setEquipamentos(dados);
      setStudio(getStudioData());
    };

    window.addEventListener('storage', syncEquipamentos);
    syncEquipamentos();
    return () => window.removeEventListener('storage', syncEquipamentos);
  }, []);

  const totals = useMemo(
    () =>
      equipamentos.reduce(
        (acc, item) => {
          const depreciation = calculateDepreciation(item);
          acc.invested += depreciation.purchaseValue;
          acc.current += depreciation.currentBookValue;
          acc.monthly += depreciation.monthlyDepreciation;
          acc.maintenance += (item.manutencoes || []).reduce((sum, entry) => sum + Number(entry.valor || 0), 0);
          return acc;
        },
        { invested: 0, current: 0, monthly: 0, maintenance: 0 },
      ),
    [equipamentos],
  );

  const equipmentUsage = useMemo(() => {
    return equipamentos.reduce((acc, equipment) => {
      const projects = (studio?.projects || []).filter((project) => 
        (project.equipamentos || project.equipmentIds || []).some((id) => String(id) === String(equipment.id))
      );
      acc[equipment.id] = {
        quantidadeProjetos: projects.length,
        valorRecuperado: projects.reduce((sum, project) => sum + Number(project.valorContratado || 0), 0),
      };
      return acc;
    }, {});
  }, [equipamentos, studio?.projects]);

  const saveList = (list) => {
    setEquipamentos(list);
    localStorage.setItem(FINANCE_STORAGE_KEYS.equipment, JSON.stringify(list));
  };

  const openNewEquipment = () => {
    setFormData(emptyEquipment);
    setIsModalOpen(true);
  };

  const openEditEquipment = (equipment) => {
    setFormData({
      ...emptyEquipment,
      ...equipment,
      valor: maskCurrency(String(Math.round(Number(equipment.valorCompra ?? equipment.valor ?? 0) * 100))),
      valorCompra: maskCurrency(String(Math.round(Number(equipment.valorCompra ?? equipment.valor ?? 0) * 100))),
      valorResidual: equipment.valorResidual ? maskCurrency(String(Math.round(Number(equipment.valorResidual) * 100))) : '',
    });
    setIsModalOpen(true);
  };

  const salvarEquipamento = () => {
    const valorCompra = parseCurrency(formData.valorCompra || formData.valor);
    if (!formData.nome || valorCompra <= 0) {
      alert('Preencha o nome e o valor de compra.');
      return;
    }

    const equipamento = {
      ...formData,
      id: formData.id || Date.now(),
      valor: valorCompra,
      valorCompra,
      valorResidual: parseCurrency(formData.valorResidual),
      vidaUtilAnos: Number(formData.vidaUtilAnos || 5),
      metodoDepreciacao: 'linear',
      manutencoes: formData.manutencoes || [],
    };

    const updated = formData.id
      ? equipamentos.map((item) => (item.id === formData.id ? equipamento : item))
      : [...equipamentos, equipamento];
    saveList(updated);
    setIsModalOpen(false);
  };

  const removerEquipamento = (id) => {
    if (!window.confirm('Deseja remover este equipamento?')) return;
    saveList(equipamentos.filter((item) => item.id !== id));
  };

  const openMaintenance = (equipment) => {
    setMaintenance({ equipamentoId: equipment.id, data: new Date().toISOString().slice(0, 10), descricao: '', valor: '' });
    setMaintenanceModalOpen(true);
  };

  const saveMaintenance = () => {
    const updated = equipamentos.map((item) => {
      if (item.id !== maintenance.equipamentoId) return item;
      return {
        ...item,
        manutencoes: [
          ...(item.manutencoes || []),
          {
            id: Date.now(),
            data: maintenance.data,
            descricao: maintenance.descricao,
            valor: parseCurrency(maintenance.valor),
          },
        ],
      };
    });
    saveList(updated);
    setMaintenanceModalOpen(false);
  };

  const selectedChartItem = equipamentos[0];
  const chartData = selectedChartItem ? buildDepreciationChart(selectedChartItem) : [];

  return (
    <div className="sf-finance-section">
      <div className="sf-section-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <button onClick={() => navigate(-1)} className="sf-secondary-button">
            <ArrowLeft size={18} /> Voltar
          </button>
          <div>
            <h1>Equipamentos & Patrimônio</h1>
            <p>Gerencie suas lentes, câmeras, gimbals, manutenções e taxas de depreciação de ativos.</p>
          </div>
        </div>
        <button className="sf-primary-button" onClick={openNewEquipment}>
          <Plus size={18} /> Novo equipamento
        </button>
      </div>

      <div className="sf-metric-grid">
        <Metric label="Valor de compra" value={totals.invested} />
        <Metric label="Valor atual estimado" value={totals.current} />
        <Metric label="Depreciação mensal" value={totals.monthly} />
        <Metric label="Manutenções" value={totals.maintenance} />
        <Metric label="Projetos vinculados" value={Object.values(equipmentUsage).reduce((sum, item) => sum + item.quantidadeProjetos, 0)} isNumber />
      </div>

      <div className="sf-panel-grid">
        <div className="sf-card tall">
          <h3>Gráfico de Depreciação</h3>
          {selectedChartItem ? (
            <>
              <p className="sf-muted" style={{ marginBottom: '12px' }}>{selectedChartItem.nome}</p>
              <div style={{ width: '100%', height: 240 }}>
                <ResponsiveContainer>
                  <LineChart data={chartData}>
                    <XAxis dataKey="name" stroke="#A1A1AA" />
                    <YAxis stroke="#A1A1AA" tickFormatter={(value) => `R$ ${value}`} width={70} />
                    <Tooltip formatter={(value) => formatCurrency(value)} contentStyle={{ background: '#1D1D21', border: '1px solid rgba(255,255,255,.08)', borderRadius: 8 }} />
                    <Line type="monotone" dataKey="valor" stroke="#C5A059" strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <p className="sf-muted">Cadastre um equipamento para visualizar a curva de depreciação.</p>
          )}
        </div>

        <div className="sf-table-card">
          <table className="sf-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Compra</th>
                <th>Depreciação Mensal</th>
                <th>Valor Atual</th>
                <th>Garantia / Revisão</th>
                <th>Projetos</th>
                <th>Retorno</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {equipamentos.map((equipment) => {
                const depreciation = calculateDepreciation(equipment);
                return (
                  <tr key={equipment.id}>
                    <td>
                      <strong>{equipment.nome}</strong>
                      <br />
                      <small className="sf-muted">Vida útil: {depreciation.usefulLifeYears} anos | Linear</small>
                    </td>
                    <td>{formatCurrency(depreciation.purchaseValue)}</td>
                    <td style={{ color: 'var(--color-danger)' }}>-{formatCurrency(depreciation.monthlyDepreciation)}</td>
                    <td className="positive"><strong>{formatCurrency(depreciation.currentBookValue)}</strong></td>
                    <td>{equipment.garantiaAte || equipment.proximaRevisao || '-'}</td>
                    <td>{equipmentUsage[equipment.id]?.quantidadeProjetos || 0}x</td>
                    <td className="positive"><strong>{formatCurrency(equipmentUsage[equipment.id]?.valorRecuperado || 0)}</strong></td>
                    <td>
                      <div className="sf-actions" style={{ display: 'flex', gap: '8px' }}>
                        <button title="Registrar manutenção" className="sf-icon-button" onClick={() => openMaintenance(equipment)}><Wrench size={17} /></button>
                        <button title="Editar" className="sf-icon-button" onClick={() => openEditEquipment(equipment)}><Edit2 size={17} /></button>
                        <button title="Remover" className="sf-icon-button" onClick={() => removerEquipamento(equipment.id)}><Trash2 size={17} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {equipamentos.length === 0 && (
                <tr>
                  <td colSpan="8" className="empty" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>
                    Nenhum equipamento cadastrado no acervo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Gerenciar Equipamento */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Gerenciar Equipamento">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <input style={inputStyle} placeholder="Nome do equipamento" value={formData.nome} onChange={(event) => setFormData({ ...formData, nome: event.target.value })} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <input style={inputStyle} placeholder="Valor de compra" value={formData.valorCompra || formData.valor} onChange={(event) => setFormData({ ...formData, valorCompra: maskCurrency(event.target.value), valor: maskCurrency(event.target.value) })} />
            <input type="date" style={inputStyle} value={formData.dataCompra} onChange={(event) => setFormData({ ...formData, dataCompra: event.target.value })} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <input type="number" min="1" style={inputStyle} placeholder="Vida útil em anos" value={formData.vidaUtilAnos} onChange={(event) => setFormData({ ...formData, vidaUtilAnos: event.target.value })} />
            <input style={inputStyle} placeholder="Valor residual (opcional)" value={formData.valorResidual} onChange={(event) => setFormData({ ...formData, valorResidual: maskCurrency(event.target.value) })} />
          </div>
          <input type="date" style={inputStyle} placeholder="Garantia / Próxima Revisão" value={formData.garantiaAte || formData.proximaRevisao} onChange={(event) => setFormData({ ...formData, garantiaAte: event.target.value, proximaRevisao: event.target.value })} />
          <textarea style={{ ...inputStyle, minHeight: 90 }} placeholder="Observações" value={formData.observacoes} onChange={(event) => setFormData({ ...formData, observacoes: event.target.value })} />
          <button className="sf-primary-button wide" onClick={salvarEquipamento}>Salvar equipamento</button>
        </div>
      </Modal>

      {/* Modal Registrar Manutenção */}
      <Modal isOpen={maintenanceModalOpen} onClose={() => setMaintenanceModalOpen(false)} title="Registrar Manutenção">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <input type="date" style={inputStyle} value={maintenance.data} onChange={(event) => setMaintenance({ ...maintenance, data: event.target.value })} />
          <input style={inputStyle} placeholder="Descrição do reparo ou revisão" value={maintenance.descricao} onChange={(event) => setMaintenance({ ...maintenance, descricao: event.target.value })} />
          <input style={inputStyle} placeholder="Valor do serviço" value={maintenance.valor} onChange={(event) => setMaintenance({ ...maintenance, valor: maskCurrency(event.target.value) })} />
          <button className="sf-primary-button wide" onClick={saveMaintenance}>Salvar manutenção</button>
        </div>
      </Modal>
    </div>
  );
}

function Metric({ label, value, isNumber = false }) {
  return (
    <div className="sf-card metric">
      <div className="metric-label" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '4px' }}>{label}</div>
      <strong style={{ fontSize: '1.4rem', color: '#fff' }}>{isNumber ? value : formatCurrency(value)}</strong>
    </div>
  );
}