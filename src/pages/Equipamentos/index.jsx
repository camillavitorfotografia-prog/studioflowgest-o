import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Edit2,
  Plus,
  Search,
  Trash2,
  Wrench,
} from 'lucide-react';
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Modal from '../../components/Modal';
import {
  getDbStudioData,
  subscribeDbUpdates,
  syncEquipmentList,
} from '../../utils/dbData';
import {
  formatDateBR,
  maskCurrency,
} from '../../utils/masks';
import {
  buildDepreciationChart,
  calculateDepreciation,
  formatCurrency,
  parseCurrency,
} from '../../utils/financeEngine';
import { loadSettings } from '../../utils/settings';
import './Equipamentos.css';

const EQUIPMENT_STORAGE_KEY = 'cv_studio_equipamentos';

const EQUIPMENT_CATEGORIES = [
  'Câmera',
  'Lente',
  'Iluminação',
  'Áudio',
  'Estabilização',
  'Computador',
  'Armazenamento',
  'Acessório',
  'Outro',
];

const EQUIPMENT_STATUSES = [
  'Ativo',
  'Em manutenção',
  'Emprestado',
  'Inativo',
  'Vendido',
];

const EQUIPMENT_SORT_OPTIONS = [
  { value: 'purchase_desc', label: 'Comprados mais recentemente' },
  { value: 'purchase_asc', label: 'Comprados há mais tempo' },
  { value: 'name_asc', label: 'Nome A–Z' },
  { value: 'value_desc', label: 'Maior valor' },
  { value: 'value_asc', label: 'Menor valor' },
];

const getEquipmentPurchaseTimestamp = (equipment) => {
  const rawDate = equipment?.dataCompra
    || equipment?.data_compra
    || equipment?.purchaseDate
    || '';

  if (!rawDate) return null;

  const text = String(rawDate).trim();
  const brazilianDate = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const normalizedDate = brazilianDate
    ? `${brazilianDate[3]}-${brazilianDate[2]}-${brazilianDate[1]}`
    : text;
  const timestamp = new Date(`${normalizedDate}T00:00:00`).getTime();

  return Number.isFinite(timestamp) ? timestamp : null;
};

const sortEquipmentList = (list, sortOrder) => [...list].sort((a, b) => {
  if (sortOrder === 'name_asc') {
    return String(a.nome || '').localeCompare(
      String(b.nome || ''),
      'pt-BR',
      { sensitivity: 'base' },
    );
  }

  if (sortOrder === 'value_desc' || sortOrder === 'value_asc') {
    const valueA = Number(a.valorCompra ?? a.valor ?? 0);
    const valueB = Number(b.valorCompra ?? b.valor ?? 0);

    return sortOrder === 'value_desc'
      ? valueB - valueA
      : valueA - valueB;
  }

  const dateA = getEquipmentPurchaseTimestamp(a);
  const dateB = getEquipmentPurchaseTimestamp(b);

  if (dateA === null && dateB === null) {
    return String(a.nome || '').localeCompare(
      String(b.nome || ''),
      'pt-BR',
      { sensitivity: 'base' },
    );
  }

  if (dateA === null) return 1;
  if (dateB === null) return -1;

  return sortOrder === 'purchase_asc'
    ? dateA - dateB
    : dateB - dateA;
});

const emptyEquipment = {
  id: null,
  nome: '',
  categoria: '',
  numeroSerie: '',
  fornecedor: '',
  status: 'Ativo',
  valor: '',
  valorCompra: '',
  dataCompra: '',
  garantiaAte: '',
  proximaRevisao: '',
  vidaUtilAnos: 5,
  valorResidual: '',
  metodoDepreciacao: 'linear',
  observacoes: '',
  manutencoes: [],
  financeExpenseId: '',
  origemFinanceiraId: '',
  origem: 'manual',
};

const emptyMaintenance = {
  equipamentoId: null,
  data: '',
  descricao: '',
  valor: '',
  proximaRevisao: '',
};

const inputStyle = {
  width: '100%',
  padding: '12px',
  background: 'var(--bg-main)',
  border: '1px solid var(--border-color)',
  borderRadius: '8px',
  color: '#fff',
};

const labelStyle = {
  color: 'var(--text-secondary)',
  fontSize: '0.72rem',
  fontWeight: 700,
  display: 'block',
  marginBottom: '6px',
};

const readEquipmentStorage = () => {
  try {
    const saved = JSON.parse(
      localStorage.getItem(EQUIPMENT_STORAGE_KEY) || '[]',
    );

    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
};

const emitEquipmentUpdate = () => {
  window.dispatchEvent(new Event('storage'));
  window.dispatchEvent(new Event('sf_storage_update'));
};

const getDateDifference = (dateValue) => {
  if (!dateValue) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = new Date(`${dateValue}T12:00:00`);

  if (Number.isNaN(target.getTime())) return null;

  return Math.ceil(
    (target.getTime() - today.getTime())
    / (1000 * 60 * 60 * 24),
  );
};

const getEquipmentAlert = (equipment) => {
  const reviewDays = getDateDifference(
    equipment.proximaRevisao,
  );

  const warrantyDays = getDateDifference(
    equipment.garantiaAte,
  );

  if (reviewDays !== null && reviewDays < 0) {
    return {
      tone: 'danger',
      label: 'Revisão atrasada',
      detail: formatDateBR(equipment.proximaRevisao),
    };
  }

  if (reviewDays !== null && reviewDays <= 30) {
    return {
      tone: 'warning',
      label: 'Revisão próxima',
      detail: formatDateBR(equipment.proximaRevisao),
    };
  }

  if (warrantyDays !== null && warrantyDays >= 0 && warrantyDays <= 30) {
    return {
      tone: 'warning',
      label: 'Garantia próxima do fim',
      detail: formatDateBR(equipment.garantiaAte),
    };
  }

  if (warrantyDays !== null && warrantyDays < 0) {
    return {
      tone: 'muted',
      label: 'Garantia vencida',
      detail: formatDateBR(equipment.garantiaAte),
    };
  }

  return null;
};

export default function Equipamentos() {
  const navigate = useNavigate();

  const [equipamentos, setEquipamentos] = useState([]);
  const [studio, setStudio] = useState({ projects: [] });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [maintenanceModalOpen, setMaintenanceModalOpen] = useState(false);
  const [formData, setFormData] = useState(emptyEquipment);
  const [maintenance, setMaintenance] = useState(emptyMaintenance);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sortOrder, setSortOrder] = useState('purchase_desc');

  const syncEquipamentos = async () => {
    const data = await getDbStudioData();
    const localEquipment = data.equipment || readEquipmentStorage();

    setEquipamentos(localEquipment);
    setStudio(data);

    setSelectedEquipmentId((currentId) => {
      if (
        currentId
        && localEquipment.some(
          (item) => String(item.id) === String(currentId),
        )
      ) {
        return currentId;
      }

      return localEquipment[0]?.id || '';
    });
  };

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!active) return;
      await syncEquipamentos();
    };

    void load();

    window.addEventListener('focus', load);
    window.addEventListener('sf_storage_update', load);

    const unsubscribe = subscribeDbUpdates(load);

    return () => {
      active = false;
      window.removeEventListener('focus', load);
      window.removeEventListener('sf_storage_update', load);
      unsubscribe();
    };
  }, []);

  const saveList = (list) => {
    setEquipamentos(list);
    localStorage.setItem(
      EQUIPMENT_STORAGE_KEY,
      JSON.stringify(list),
    );
    void syncEquipmentList(list).catch((error) => {
      console.error('Erro ao sincronizar equipamentos:', error);
      alert('O equipamento foi salvo neste navegador, mas não foi possível sincronizá-lo com o Supabase.');
    });
    emitEquipmentUpdate();
  };

  const totals = useMemo(
    () => equipamentos.reduce(
      (acc, item) => {
        const depreciation = calculateDepreciation(item);

        acc.invested += depreciation.purchaseValue;
        acc.current += depreciation.currentBookValue;
        acc.monthly += depreciation.monthlyDepreciation;
        acc.maintenance += (item.manutencoes || []).reduce(
          (sum, entry) => sum + Number(entry.valor || 0),
          0,
        );

        if (item.status === 'Em manutenção') {
          acc.inMaintenance += 1;
        }

        return acc;
      },
      {
        invested: 0,
        current: 0,
        monthly: 0,
        maintenance: 0,
        inMaintenance: 0,
      },
    ),
    [equipamentos],
  );

  const equipmentUsage = useMemo(() => {
    return equipamentos.reduce((acc, equipment) => {
      const projects = (studio?.projects || []).filter(
        (project) => {
          const ids = [
            ...(Array.isArray(project.equipamentos)
              ? project.equipamentos
              : []),
            ...(Array.isArray(project.equipmentIds)
              ? project.equipmentIds
              : []),
          ];

          return ids.some(
            (id) => String(id) === String(equipment.id),
          );
        },
      );

      acc[equipment.id] = {
        quantidadeProjetos: projects.length,
        valorRecuperado: projects.reduce(
          (sum, project) => (
            sum + Number(project.valorContratado || 0)
          ),
          0,
        ),
      };

      return acc;
    }, {});
  }, [equipamentos, studio?.projects]);

  const alerts = useMemo(
    () => equipamentos
      .map((equipment) => ({
        equipment,
        alert: getEquipmentAlert(equipment),
      }))
      .filter((item) => item.alert),
    [equipamentos],
  );

  const filteredEquipment = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    const filtered = equipamentos.filter((equipment) => {
      if (
        statusFilter
        && equipment.status !== statusFilter
      ) {
        return false;
      }

      if (
        categoryFilter
        && equipment.categoria !== categoryFilter
      ) {
        return false;
      }

      if (
        normalizedSearch
        && ![
          equipment.nome,
          equipment.categoria,
          equipment.numeroSerie,
          equipment.fornecedor,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch)
      ) {
        return false;
      }

      return true;
    });

    return sortEquipmentList(filtered, sortOrder);
  }, [
    categoryFilter,
    equipamentos,
    search,
    sortOrder,
    statusFilter,
  ]);

  const selectedChartItem = equipamentos.find(
    (item) => String(item.id) === String(selectedEquipmentId),
  ) || equipamentos[0];

  const chartData = selectedChartItem
    ? buildDepreciationChart(selectedChartItem)
    : [];

  const openNewEquipment = () => {
    const defaults = loadSettings().financial;

    setFormData({
      ...emptyEquipment,
      vidaUtilAnos: defaults.usefulLifeYears,
      metodoDepreciacao: defaults.depreciationMethod,
    });

    setIsModalOpen(true);
  };

  const openEditEquipment = (equipment) => {
    const purchaseValue = Number(
      equipment.valorCompra
      ?? equipment.valor
      ?? 0,
    );

    setFormData({
      ...emptyEquipment,
      ...equipment,
      valor: maskCurrency(
        String(Math.round(purchaseValue * 100)),
      ),
      valorCompra: maskCurrency(
        String(Math.round(purchaseValue * 100)),
      ),
      valorResidual: equipment.valorResidual
        ? maskCurrency(
          String(Math.round(
            Number(equipment.valorResidual) * 100,
          )),
        )
        : '',
    });

    setIsModalOpen(true);
  };

  const salvarEquipamento = () => {
    const nome = String(formData.nome || '').trim();
    const valorCompra = parseCurrency(
      formData.valorCompra || formData.valor,
    );

    if (!nome) {
      alert('Informe o nome do equipamento.');
      return;
    }

    if (valorCompra <= 0) {
      alert('Informe um valor de compra maior que zero.');
      return;
    }

    if (!formData.dataCompra) {
      alert('Informe a data da compra.');
      return;
    }

    const settings = loadSettings().financial;
    const now = new Date().toISOString();

    const existingEquipment = equipamentos.find(
      (item) => String(item.id) === String(formData.id),
    );

    const equipamento = {
      ...existingEquipment,
      ...formData,
      id:
        formData.id
        || `equipamento-${Date.now()}`,
      nome,
      categoria:
        formData.categoria
        || 'Outro',
      status:
        formData.status
        || 'Ativo',
      valor: valorCompra,
      valorCompra,
      valorResidual:
        parseCurrency(formData.valorResidual)
        || (
          valorCompra
          * settings.residualPercent
          / 100
        ),
      vidaUtilAnos: Number(
        formData.vidaUtilAnos
        || settings.usefulLifeYears,
      ),
      metodoDepreciacao:
        formData.metodoDepreciacao
        || settings.depreciationMethod,
      manutencoes:
        formData.manutencoes
        || existingEquipment?.manutencoes
        || [],
      origem:
        formData.origem
        || existingEquipment?.origem
        || 'manual',
      criadoEm:
        existingEquipment?.criadoEm
        || formData.criadoEm
        || now,
      atualizadoEm: now,
    };

    const nextEquipment = formData.id
      ? equipamentos.map((item) => (
        String(item.id) === String(formData.id)
          ? equipamento
          : item
      ))
      : [equipamento, ...equipamentos];

    saveList(nextEquipment);
    setSelectedEquipmentId(equipamento.id);
    setIsModalOpen(false);
  };

  const removerEquipamento = (equipment) => {
    const usage = equipmentUsage[equipment.id]?.quantidadeProjetos || 0;

    if (usage > 0) {
      alert(
        `Este equipamento está vinculado a ${usage} trabalho(s). `
        + 'Remova os vínculos antes de excluí-lo.',
      );
      return;
    }

    const linkedToFinance = Boolean(
      equipment.financeExpenseId
      || equipment.origemFinanceiraId,
    );

    const confirmed = window.confirm(
      linkedToFinance
        ? 'Este equipamento foi criado pelo Financeiro. '
          + 'A exclusão removerá apenas o item do patrimônio; '
          + 'a despesa financeira será preservada. Continuar?'
        : 'Deseja remover este equipamento?',
    );

    if (!confirmed) return;

    const nextEquipment = equipamentos.filter(
      (item) => String(item.id) !== String(equipment.id),
    );

    saveList(nextEquipment);

    if (
      String(selectedEquipmentId) === String(equipment.id)
    ) {
      setSelectedEquipmentId(nextEquipment[0]?.id || '');
    }
  };

  const openMaintenance = (equipment) => {
    setMaintenance({
      ...emptyMaintenance,
      equipamentoId: equipment.id,
      data: new Date().toISOString().slice(0, 10),
      proximaRevisao: equipment.proximaRevisao || '',
    });

    setMaintenanceModalOpen(true);
  };

  const saveMaintenance = () => {
    const value = parseCurrency(maintenance.valor);
    const description = String(
      maintenance.descricao || '',
    ).trim();

    if (!maintenance.data) {
      alert('Informe a data da manutenção.');
      return;
    }

    if (!description) {
      alert('Informe a descrição da manutenção.');
      return;
    }

    if (value < 0) {
      alert('Informe um valor válido.');
      return;
    }

    const now = new Date().toISOString();

    const updated = equipamentos.map((item) => {
      if (
        String(item.id)
        !== String(maintenance.equipamentoId)
      ) {
        return item;
      }

      return {
        ...item,
        status: 'Ativo',
        proximaRevisao:
          maintenance.proximaRevisao
          || item.proximaRevisao
          || '',
        manutencoes: [
          ...(item.manutencoes || []),
          {
            id: `manutencao-${Date.now()}`,
            data: maintenance.data,
            descricao: description,
            valor: value,
            criadoEm: now,
          },
        ],
        atualizadoEm: now,
      };
    });

    saveList(updated);
    setMaintenanceModalOpen(false);
  };

  return (
    <div className="sf-finance-section sf-equipment-page">
      <div className="sf-section-header sf-equipment-header">
        <div className="sf-equipment-title-group">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="sf-secondary-button sf-equipment-back-button"
          >
            <ArrowLeft size={18} />
            Voltar
          </button>

          <div className="sf-equipment-heading-copy">
            <h1>Equipamentos & Patrimônio</h1>
            <p>
              Gerencie câmeras, lentes, iluminação, manutenção,
              garantia e depreciação dos ativos.
            </p>
          </div>
        </div>

        <button
          type="button"
          className="sf-primary-button sf-equipment-new-button"
          onClick={openNewEquipment}
        >
          <Plus size={18} />
          Novo equipamento
        </button>
      </div>

      {alerts.length > 0 && (
        <div className="sf-equipment-alerts">
          {alerts.slice(0, 4).map(({ equipment, alert }) => (
            <button
              type="button"
              key={`${equipment.id}-${alert.label}`}
              className={`sf-equipment-alert ${alert.tone}`}
              onClick={() => openEditEquipment(equipment)}
            >
              <AlertTriangle size={16} />
              <span>
                <strong>{equipment.nome}</strong>
                {alert.label}: {alert.detail}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="sf-metric-grid sf-equipment-metrics">
        <Metric label="Valor de compra" value={totals.invested} />
        <Metric label="Valor atual estimado" value={totals.current} />
        <Metric label="Depreciação mensal" value={totals.monthly} />
        <Metric label="Manutenções" value={totals.maintenance} />
        <Metric
          label="Em manutenção"
          value={totals.inMaintenance}
          isNumber
        />
      </div>

      <div className="sf-equipment-toolbar">
        <label className="sf-equipment-search">
          <Search size={16} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar equipamento, série ou fornecedor..."
          />
        </label>

        <select
          style={inputStyle}
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="">Todos os status</option>
          {EQUIPMENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>

        <select
          style={inputStyle}
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
        >
          <option value="">Todas as categorias</option>
          {EQUIPMENT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>


        <select
          style={inputStyle}
          value={sortOrder}
          onChange={(event) => setSortOrder(event.target.value)}
          aria-label="Ordenar equipamentos"
        >
          {EQUIPMENT_SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="sf-panel-grid sf-equipment-content-grid">
        <div className="sf-card tall sf-equipment-chart-card">
          <h3>Gráfico de Depreciação</h3>

          {equipamentos.length > 0 && (
            <select
              style={{
                ...inputStyle,
                marginBottom: '10px',
              }}
              value={selectedChartItem?.id || ''}
              onChange={(event) => (
                setSelectedEquipmentId(event.target.value)
              )}
            >
              {equipamentos.map((equipment) => (
                <option
                  key={equipment.id}
                  value={equipment.id}
                >
                  {equipment.nome}
                </option>
              ))}
            </select>
          )}

          {selectedChartItem ? (
            <>
              <p className="sf-muted">
                {selectedChartItem.nome}
              </p>

              <div
                className="sf-equipment-chart"
                style={{ width: '100%', height: 240 }}
              >
                <ResponsiveContainer>
                  <LineChart data={chartData}>
                    <XAxis
                      dataKey="name"
                      stroke="#A1A1AA"
                    />
                    <YAxis
                      stroke="#A1A1AA"
                      tickFormatter={(value) => `R$ ${value}`}
                      width={70}
                    />
                    <Tooltip
                      formatter={(value) => formatCurrency(value)}
                      contentStyle={{
                        background: '#1D1D21',
                        border: '1px solid rgba(255,255,255,.08)',
                        borderRadius: 8,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="valor"
                      stroke="#C5A059"
                      strokeWidth={3}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <p className="sf-muted">
              Cadastre um equipamento para visualizar a curva
              de depreciação.
            </p>
          )}
        </div>

        <div className="sf-table-card sf-equipment-table-card">
          <table className="sf-table sf-equipment-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Status</th>
                <th>Compra</th>
                <th>Depreciação mensal</th>
                <th>Valor atual</th>
                <th>Garantia / revisão</th>
                <th>Projetos</th>
                <th>Retorno</th>
                <th>Ações</th>
              </tr>
            </thead>

            <tbody>
              {filteredEquipment.map((equipment) => {
                const depreciation = calculateDepreciation(equipment);
                const alert = getEquipmentAlert(equipment);

                return (
                  <tr key={equipment.id}>
                    <td>
                      <strong>{equipment.nome}</strong>
                      <small className="sf-muted">
                        {equipment.categoria || 'Sem categoria'}
                        {equipment.numeroSerie
                          ? ` · Série ${equipment.numeroSerie}`
                          : ''}
                        {' · '}
                        Vida útil: {depreciation.usefulLifeYears} anos
                      </small>
                    </td>

                    <td>
                      <span className="sf-equipment-status">
                        {equipment.status || 'Ativo'}
                      </span>
                    </td>

                    <td>
                      {formatCurrency(depreciation.purchaseValue)}
                    </td>

                    <td className="negative">
                      -{formatCurrency(depreciation.monthlyDepreciation)}
                    </td>

                    <td className="positive">
                      <strong>
                        {formatCurrency(depreciation.currentBookValue)}
                      </strong>
                    </td>

                    <td>
                      <span>
                        {equipment.proximaRevisao
                          ? `Revisão: ${formatDateBR(equipment.proximaRevisao)}`
                          : equipment.garantiaAte
                            ? `Garantia: ${formatDateBR(equipment.garantiaAte)}`
                            : '-'}
                      </span>

                      {alert && (
                        <small
                          className={`sf-equipment-inline-alert ${alert.tone}`}
                        >
                          {alert.label}
                        </small>
                      )}
                    </td>

                    <td>
                      {equipmentUsage[equipment.id]?.quantidadeProjetos || 0}x
                    </td>

                    <td className="positive">
                      <strong>
                        {formatCurrency(
                          equipmentUsage[equipment.id]?.valorRecuperado || 0,
                        )}
                      </strong>
                    </td>

                    <td>
                      <div className="sf-actions">
                        <button
                          type="button"
                          title="Registrar manutenção"
                          className="sf-icon-button"
                          onClick={() => openMaintenance(equipment)}
                        >
                          <Wrench size={17} />
                        </button>

                        <button
                          type="button"
                          title="Editar"
                          className="sf-icon-button"
                          onClick={() => openEditEquipment(equipment)}
                        >
                          <Edit2 size={17} />
                        </button>

                        <button
                          type="button"
                          title="Remover"
                          className="sf-icon-button"
                          onClick={() => removerEquipamento(equipment)}
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredEquipment.length === 0 && (
                <tr>
                  <td colSpan="9" className="empty">
                    Nenhum equipamento encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={formData.id ? 'Editar equipamento' : 'Novo equipamento'}
      >
        <div className="sf-equipment-form">
          <div className="sf-equipment-form-grid">
            <Field label="Nome">
              <input
                style={inputStyle}
                value={formData.nome}
                onChange={(event) => setFormData({
                  ...formData,
                  nome: event.target.value,
                })}
              />
            </Field>

            <Field label="Categoria">
              <select
                style={inputStyle}
                value={formData.categoria}
                onChange={(event) => setFormData({
                  ...formData,
                  categoria: event.target.value,
                })}
              >
                <option value="">Selecione...</option>
                {EQUIPMENT_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Status">
              <select
                style={inputStyle}
                value={formData.status}
                onChange={(event) => setFormData({
                  ...formData,
                  status: event.target.value,
                })}
              >
                {EQUIPMENT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Número de série">
              <input
                style={inputStyle}
                value={formData.numeroSerie}
                onChange={(event) => setFormData({
                  ...formData,
                  numeroSerie: event.target.value,
                })}
              />
            </Field>

            <Field label="Fornecedor">
              <input
                style={inputStyle}
                value={formData.fornecedor}
                onChange={(event) => setFormData({
                  ...formData,
                  fornecedor: event.target.value,
                })}
              />
            </Field>

            <Field label="Valor de compra">
              <input
                style={inputStyle}
                value={formData.valorCompra || formData.valor}
                onChange={(event) => {
                  const value = maskCurrency(event.target.value);

                  setFormData({
                    ...formData,
                    valorCompra: value,
                    valor: value,
                  });
                }}
                placeholder="R$ 0,00"
              />
            </Field>

            <Field label="Data da compra">
              <input
                type="date"
                style={inputStyle}
                value={formData.dataCompra}
                onChange={(event) => setFormData({
                  ...formData,
                  dataCompra: event.target.value,
                })}
              />
            </Field>

            <Field label="Garantia até">
              <input
                type="date"
                style={inputStyle}
                value={formData.garantiaAte}
                onChange={(event) => setFormData({
                  ...formData,
                  garantiaAte: event.target.value,
                })}
              />
            </Field>

            <Field label="Próxima revisão">
              <input
                type="date"
                style={inputStyle}
                value={formData.proximaRevisao}
                onChange={(event) => setFormData({
                  ...formData,
                  proximaRevisao: event.target.value,
                })}
              />
            </Field>

            <Field label="Vida útil em anos">
              <input
                type="number"
                min="1"
                style={inputStyle}
                value={formData.vidaUtilAnos}
                onChange={(event) => setFormData({
                  ...formData,
                  vidaUtilAnos: event.target.value,
                })}
              />
            </Field>

            <Field label="Valor residual">
              <input
                style={inputStyle}
                value={formData.valorResidual}
                onChange={(event) => setFormData({
                  ...formData,
                  valorResidual: maskCurrency(event.target.value),
                })}
                placeholder="Opcional"
              />
            </Field>
          </div>

          <Field label="Observações">
            <textarea
              style={{
                ...inputStyle,
                minHeight: 90,
                resize: 'vertical',
              }}
              value={formData.observacoes}
              onChange={(event) => setFormData({
                ...formData,
                observacoes: event.target.value,
              })}
            />
          </Field>

          {formData.manutencoes?.length > 0 && (
            <div className="sf-equipment-maintenance-history">
              <strong>Histórico de manutenção</strong>

              {formData.manutencoes
                .slice()
                .reverse()
                .map((entry) => (
                  <div key={entry.id}>
                    <CheckCircle2 size={14} />
                    <span>
                      {formatDateBR(entry.data)} · {entry.descricao}
                    </span>
                    <strong>
                      {formatCurrency(entry.valor || 0)}
                    </strong>
                  </div>
                ))}
            </div>
          )}

          <button
            type="button"
            className="sf-primary-button wide"
            onClick={salvarEquipamento}
          >
            Salvar equipamento
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={maintenanceModalOpen}
        onClose={() => setMaintenanceModalOpen(false)}
        title="Registrar manutenção"
      >
        <div className="sf-equipment-form">
          <Field label="Data da manutenção">
            <input
              type="date"
              style={inputStyle}
              value={maintenance.data}
              onChange={(event) => setMaintenance({
                ...maintenance,
                data: event.target.value,
              })}
            />
          </Field>

          <Field label="Descrição">
            <input
              style={inputStyle}
              value={maintenance.descricao}
              onChange={(event) => setMaintenance({
                ...maintenance,
                descricao: event.target.value,
              })}
              placeholder="Reparo, limpeza ou revisão"
            />
          </Field>

          <Field label="Valor">
            <input
              style={inputStyle}
              value={maintenance.valor}
              onChange={(event) => setMaintenance({
                ...maintenance,
                valor: maskCurrency(event.target.value),
              })}
              placeholder="R$ 0,00"
            />
          </Field>

          <Field label="Próxima revisão">
            <input
              type="date"
              style={inputStyle}
              value={maintenance.proximaRevisao}
              onChange={(event) => setMaintenance({
                ...maintenance,
                proximaRevisao: event.target.value,
              })}
            />
          </Field>

          <button
            type="button"
            className="sf-primary-button wide"
            onClick={saveMaintenance}
          >
            Salvar manutenção
          </button>
        </div>
      </Modal>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function Metric({ label, value, isNumber = false }) {
  return (
    <div className="sf-card metric sf-equipment-metric">
      <div className="metric-label">
        {label}
      </div>

      <strong>
        {isNumber ? value : formatCurrency(value)}
      </strong>
    </div>
  );
}