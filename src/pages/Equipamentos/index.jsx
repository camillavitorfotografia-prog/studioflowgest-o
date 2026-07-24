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
  deleteEquipmentRow,
  getDbStudioData,
  subscribeDbUpdates,
  syncEquipmentList,
  upsertRow,
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
import { readStorage, writeStorage, STORAGE_KEYS } from '../../utils/storage';
import { isSupabaseConfigured } from '../../utils/supabase';
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
  'Vendido',
  'Baixado',
];

const ASSET_EXIT_TYPES = [
  ['venda', 'Venda'],
  ['permuta', 'Permuta por serviço'],
  ['parte_pagamento', 'Dado como parte de pagamento'],
  ['baixa', 'Baixa administrativa'],
  ['perda', 'Perda ou avaria irreparável'],
];

const EXIT_PAYMENT_METHODS = [
  'Pix',
  'Transferência',
  'Dinheiro',
  'Cartão',
  'Permuta patrimonial',
  'Pagamento misto',
  'Outro',
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
  comprador: '',
  dataVenda: '',
  valorVenda: '',
  formaRecebimento: '',
  vendidoEm: '',
  observacoesVenda: '',
  valorContabilVenda: 0,
  resultadoPatrimonialVenda: 0,
  tipoSaida: '',
  dataSaida: '',
  valorAtribuidoSaida: '',
  destinatarioSaida: '',
  referenciaNegociacao: '',
  servicoRecebido: '',
  fornecedorServico: '',
  valorTotalServico: '',
  complementoDinheiro: '',
  contaComplemento: 'empresa',
  formaSaida: '',
  observacoesSaida: '',
  financeExitId: '',
  historico: [],
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



const normalizeText = (value) => String(value || '').trim();

const saveFinancialMirror = (transaction) => {
  const current = readStorage(STORAGE_KEYS.finances, []);
  const index = current.findIndex((item) => String(item.id) === String(transaction.id));
  const next = index >= 0
    ? current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...transaction } : item))
    : [transaction, ...current];
  writeStorage(STORAGE_KEYS.finances, next);
  window.dispatchEvent(new Event('sf_storage_update'));
};

const buildFinancePayload = (transaction) => ({
  id: String(transaction.id),
  descricao: transaction.descricao,
  categoria: transaction.categoria,
  valor: Number(transaction.valor || 0),
  data: transaction.data || transaction.dataPagamento || transaction.vencimento || null,
  data_pagamento: transaction.dataPagamento || null,
  data_recebimento: transaction.dataRecebimento || null,
  vencimento: transaction.vencimento || null,
  status: transaction.status,
  tipo: transaction.tipo,
  tipo_geral: transaction.tipoGeral,
  conta_origem: transaction.contaOrigem || null,
  forma_pagamento: transaction.formaPagamento || null,
  natureza_financeira: transaction.naturezaFinanceira || null,
  patrimonio_id: transaction.patrimonioId || null,
  origem_recursos: transaction.origemRecursos || null,
  observacoes: transaction.observacoes || null,
  detalhes: transaction.detalhes || {},
  updated_at: new Date().toISOString(),
});

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
  const [deletingEquipmentId, setDeletingEquipmentId] = useState('');

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

  const salvarEquipamento = async () => {
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

    const isExit = ['Vendido', 'Baixado'].includes(formData.status);
    const exitType = formData.tipoSaida || (formData.status === 'Vendido' ? 'venda' : 'baixa');
    if (isExit && !formData.dataSaida && !formData.dataVenda) {
      alert('Informe a data da saída do patrimônio.');
      return;
    }
    if (isExit && ['venda', 'permuta', 'parte_pagamento'].includes(exitType) && parseCurrency(formData.valorAtribuidoSaida || formData.valorVenda) <= 0) {
      alert('Informe o valor atribuído ao equipamento na negociação.');
      return;
    }
    if (isExit && ['permuta', 'parte_pagamento'].includes(exitType)) {
      if (!normalizeText(formData.referenciaNegociacao)) {
        alert('Informe uma referência para a negociação. Use a mesma referência ao incluir outro equipamento na mesma permuta.');
        return;
      }
      if (!normalizeText(formData.servicoRecebido)) {
        alert('Informe qual serviço foi recebido na permuta ou como parte do pagamento.');
        return;
      }
      if (parseCurrency(formData.valorTotalServico) <= 0) {
        alert('Informe o valor total do serviço recebido.');
        return;
      }
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
      comprador: formData.destinatarioSaida || formData.comprador || existingEquipment?.comprador || '',
      dataVenda: formData.dataSaida || formData.dataVenda || existingEquipment?.dataVenda || '',
      valorVenda: parseCurrency(formData.valorAtribuidoSaida || formData.valorVenda) || Number(existingEquipment?.valorVenda || 0),
      formaRecebimento: formData.formaSaida || formData.formaRecebimento || existingEquipment?.formaRecebimento || '',
      vendidoEm: formData.status === 'Vendido'
        ? (formData.vendidoEm || existingEquipment?.vendidoEm || now)
        : '',
      depreciacaoEncerradaEm: ['Vendido', 'Baixado'].includes(formData.status)
        ? (formData.dataSaida || formData.dataVenda || existingEquipment?.depreciacaoEncerradaEm || now.slice(0, 10))
        : '',
      observacoesVenda: formData.observacoesSaida || formData.observacoesVenda || existingEquipment?.observacoesVenda || '',
      valorContabilVenda: ['Vendido', 'Baixado'].includes(formData.status)
        ? Number(existingEquipment?.valorContabilVenda || calculateDepreciation({ ...existingEquipment, ...formData, valorCompra }).currentBookValue || 0)
        : Number(existingEquipment?.valorContabilVenda || 0),
      resultadoPatrimonialVenda: ['Vendido', 'Baixado'].includes(formData.status)
        ? (parseCurrency(formData.valorAtribuidoSaida || formData.valorVenda) || Number(existingEquipment?.valorVenda || 0))
          - Number(existingEquipment?.valorContabilVenda || calculateDepreciation({ ...existingEquipment, ...formData, valorCompra }).currentBookValue || 0)
        : Number(existingEquipment?.resultadoPatrimonialVenda || 0),
      tipoSaida: ['Vendido', 'Baixado'].includes(formData.status)
        ? (formData.tipoSaida || (formData.status === 'Vendido' ? 'venda' : 'baixa'))
        : '',
      dataSaida: formData.dataSaida || formData.dataVenda || existingEquipment?.dataSaida || '',
      valorAtribuidoSaida: parseCurrency(formData.valorAtribuidoSaida || formData.valorVenda) || Number(existingEquipment?.valorAtribuidoSaida || 0),
      destinatarioSaida: formData.destinatarioSaida || formData.comprador || existingEquipment?.destinatarioSaida || '',
      referenciaNegociacao: formData.referenciaNegociacao || existingEquipment?.referenciaNegociacao || '',
      servicoRecebido: formData.servicoRecebido || existingEquipment?.servicoRecebido || '',
      fornecedorServico: formData.fornecedorServico || existingEquipment?.fornecedorServico || '',
      valorTotalServico: parseCurrency(formData.valorTotalServico) || Number(existingEquipment?.valorTotalServico || 0),
      complementoDinheiro: parseCurrency(formData.complementoDinheiro) || Number(existingEquipment?.complementoDinheiro || 0),
      contaComplemento: formData.contaComplemento || existingEquipment?.contaComplemento || 'empresa',
      formaSaida: formData.formaSaida || formData.formaRecebimento || existingEquipment?.formaSaida || '',
      observacoesSaida: formData.observacoesSaida || formData.observacoesVenda || existingEquipment?.observacoesSaida || '',
      financeExitId: existingEquipment?.financeExitId || formData.financeExitId || '',
      historico: [
        ...(existingEquipment?.historico || []),
        {
          id: `hist-${Date.now()}`,
          data: now,
          acao: existingEquipment ? 'Equipamento editado' : 'Equipamento cadastrado',
          statusAnterior: existingEquipment?.status || '',
          statusNovo: formData.status || 'Ativo',
          observacao: ['Vendido', 'Baixado'].includes(formData.status)
            ? `Saída registrada: ${ASSET_EXIT_TYPES.find(([value]) => value === (formData.tipoSaida || (formData.status === 'Vendido' ? 'venda' : 'baixa')))?.[1] || 'Baixa'}.`
            : '',
        },
      ],
    };

    const nextEquipment = formData.id
      ? equipamentos.map((item) => (
        String(item.id) === String(formData.id)
          ? equipamento
          : item
      ))
      : [equipamento, ...equipamentos];

    saveList(nextEquipment);

    if (['Vendido', 'Baixado'].includes(equipamento.status)) {
      const exitType = equipamento.tipoSaida || (equipamento.status === 'Vendido' ? 'venda' : 'baixa');
      const exitDate = equipamento.dataSaida || equipamento.dataVenda || now.slice(0, 10);
      const attributedValue = Number(equipamento.valorAtribuidoSaida || equipamento.valorVenda || 0);
      let transaction = null;

      if (exitType === 'venda') {
        const transactionId = equipamento.financeExitId || `asset-sale-${equipamento.id}`;
        transaction = {
          id: transactionId,
          descricao: `Venda de patrimônio · ${equipamento.nome}`,
          categoria: 'Venda de patrimônio',
          valor: attributedValue,
          data: exitDate,
          dataRecebimento: exitDate,
          status: 'Recebida',
          tipo: 'entrada_nao_operacional',
          tipoGeral: 'Entrada',
          naturezaFinanceira: 'nao_operacional',
          contaOrigem: formData.contaDestinoVenda || 'empresa',
          formaPagamento: equipamento.formaSaida || equipamento.formaRecebimento || 'Outro',
          patrimonioId: equipamento.id,
          origemRecursos: 'Venda de patrimônio',
          observacoes: equipamento.observacoesSaida || '',
          detalhes: {
            tipoSaida: exitType,
            comprador: equipamento.destinatarioSaida || equipamento.comprador || '',
            valorContabil: equipamento.valorContabilVenda,
            resultadoPatrimonial: equipamento.resultadoPatrimonialVenda,
          },
          criadoEm: existingEquipment?.financeExitId ? undefined : now,
          atualizadoEm: now,
        };
        equipamento.financeExitId = transactionId;
      }

      if (['permuta', 'parte_pagamento'].includes(exitType)) {
        const reference = normalizeText(equipamento.referenciaNegociacao);
        const finances = readStorage(STORAGE_KEYS.finances, []);
        const existingTrade = finances.find((item) => (
          String(item?.detalhes?.referenciaNegociacao || '') === reference
          && ['permuta', 'parte_pagamento'].includes(String(item?.detalhes?.tipoSaida || ''))
        ));
        const transactionId = existingTrade?.id || `asset-trade-${reference.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${exitDate}`;
        const equipmentValues = {
          ...(existingTrade?.detalhes?.equipamentosValores || {}),
          [equipamento.id]: attributedValue,
        };
        const equipmentIds = Array.from(new Set([
          ...(existingTrade?.detalhes?.equipamentoIds || []),
          equipamento.id,
        ]));
        const totalAssets = Object.values(equipmentValues).reduce((sum, value) => sum + Number(value || 0), 0);
        const cashComplement = Math.max(
          Number(equipamento.complementoDinheiro || 0),
          Number(existingTrade?.detalhes?.complementoDinheiro || 0),
        );
        transaction = {
          ...existingTrade,
          id: transactionId,
          descricao: equipamento.servicoRecebido || existingTrade?.descricao || 'Serviço recebido em permuta',
          categoria: 'Serviço recebido em permuta',
          valor: Number(equipamento.valorTotalServico || existingTrade?.valor || totalAssets + cashComplement),
          data: exitDate,
          dataPagamento: exitDate,
          status: 'Pago',
          tipo: 'variavel',
          tipoGeral: 'Saida',
          contaOrigem: cashComplement > 0 ? (equipamento.contaComplemento || 'empresa') : 'permuta_patrimonial',
          formaPagamento: cashComplement > 0 ? 'Pagamento misto' : 'Permuta patrimonial',
          observacoes: equipamento.observacoesSaida || existingTrade?.observacoes || '',
          detalhes: {
            ...(existingTrade?.detalhes || {}),
            tipoSaida: exitType,
            referenciaNegociacao: reference,
            fornecedorServico: equipamento.fornecedorServico || '',
            equipamentoIds: equipmentIds,
            equipamentosValores: equipmentValues,
            valorPatrimonioEntregue: totalAssets,
            complementoDinheiro: cashComplement,
            quitacaoSemMovimentoCaixa: cashComplement <= 0,
          },
          criadoEm: existingTrade?.criadoEm || now,
          atualizadoEm: now,
        };
        equipamento.financeExitId = transactionId;
      }

      if (transaction) {
        saveFinancialMirror(transaction);
        if (isSupabaseConfigured) {
          try {
            await upsertRow({ table: 'financas', payload: buildFinancePayload(transaction) });
          } catch (error) {
            console.error('Erro ao sincronizar a saída patrimonial com o Financeiro:', error);
            alert('A saída foi salva em Equipamentos e no espelho financeiro deste navegador, mas não foi possível sincronizá-la com o Supabase.');
          }
        }
        const equipmentWithFinance = nextEquipment.map((item) => (
          String(item.id) === String(equipamento.id)
            ? { ...item, financeExitId: equipamento.financeExitId }
            : item
        ));
        saveList(equipmentWithFinance);
      }
    }

    setSelectedEquipmentId(equipamento.id);
    setIsModalOpen(false);
  };

  const removerEquipamento = async (equipment) => {
    if (!equipment?.id || deletingEquipmentId) return;

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
        : `Deseja excluir definitivamente “${equipment.nome}” do patrimônio?`,
    );

    if (!confirmed) return;

    const previousEquipment = equipamentos;
    const nextEquipment = equipamentos.filter(
      (item) => String(item.id) !== String(equipment.id),
    );

    setDeletingEquipmentId(String(equipment.id));
    setEquipamentos(nextEquipment);
    localStorage.setItem(
      EQUIPMENT_STORAGE_KEY,
      JSON.stringify(nextEquipment),
    );

    if (String(selectedEquipmentId) === String(equipment.id)) {
      setSelectedEquipmentId(nextEquipment[0]?.id || '');
    }

    try {
      const result = await deleteEquipmentRow(equipment, { preserveEquipment: nextEquipment });
      emitEquipmentUpdate();
      if (result?.warning) {
        console.warn(result.warning);
      }
    } catch (error) {
      console.error('Erro ao excluir equipamento:', error);
      setEquipamentos(previousEquipment);
      localStorage.setItem(
        EQUIPMENT_STORAGE_KEY,
        JSON.stringify(previousEquipment),
      );
      alert(
        error?.message
          ? `Não foi possível excluir o equipamento: ${error.message}`
          : 'Não foi possível concluir a exclusão no banco de dados. '
            + 'O equipamento foi restaurado para evitar inconsistências.',
      );
    } finally {
      setDeletingEquipmentId('');
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
                <th className="sf-equipment-col-item">Item</th>
                <th className="sf-equipment-col-status">Status</th>
                <th className="sf-equipment-col-purchase">Compra</th>
                <th className="sf-equipment-col-depreciation">Depreciação mensal</th>
                <th className="sf-equipment-col-current">Valor atual</th>
                <th className="sf-equipment-col-review">Garantia / revisão</th>
                <th className="sf-equipment-col-projects">Projetos</th>
                <th className="sf-equipment-col-return">Retorno</th>
                <th className="sf-equipment-col-actions">Ações</th>
              </tr>
            </thead>

            <tbody>
              {filteredEquipment.map((equipment) => {
                const depreciation = calculateDepreciation(equipment);
                const alert = getEquipmentAlert(equipment);

                return (
                  <tr key={equipment.id}>
                    <td className="sf-equipment-col-item" data-label="Item">
                      <strong>{equipment.nome}</strong>
                      <small className="sf-muted">
                        {equipment.categoria || 'Sem categoria'}
                        {equipment.numeroSerie
                          ? ` · Série ${equipment.numeroSerie}`
                          : ''}
                        {' · '}
                        Compra: {equipment.dataCompra ? formatDateBR(equipment.dataCompra) : 'não informada'} · Vida útil: {depreciation.usefulLifeYears} anos
                      </small>
                    </td>

                    <td className="sf-equipment-col-status" data-label="Status">
                      <span className="sf-equipment-status">
                        {equipment.status || 'Ativo'}
                      </span>
                    </td>

                    <td className="sf-equipment-col-purchase" data-label="Compra">
                      {formatCurrency(depreciation.purchaseValue)}
                    </td>

                    <td className="negative sf-equipment-col-depreciation" data-label="Depreciação mensal">
                      -{formatCurrency(depreciation.monthlyDepreciation)}
                    </td>

                    <td className="positive sf-equipment-col-current" data-label="Valor atual">
                      <strong>
                        {formatCurrency(['Vendido', 'Baixado'].includes(equipment.status) && equipment.valorContabilVenda != null ? equipment.valorContabilVenda : depreciation.currentBookValue)}
                      </strong>
                      {equipment.status === 'Vendido' && (
                        <small className="sf-muted">Resultado: {formatCurrency(equipment.resultadoPatrimonialVenda || 0)}</small>
                      )}
                    </td>

                    <td className="sf-equipment-col-review" data-label="Garantia / revisão">
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

                    <td className="sf-equipment-col-projects" data-label="Projetos">
                      {equipmentUsage[equipment.id]?.quantidadeProjetos || 0}x
                    </td>

                    <td className="positive sf-equipment-col-return" data-label="Retorno">
                      <strong>
                        {formatCurrency(
                          equipmentUsage[equipment.id]?.valorRecuperado || 0,
                        )}
                      </strong>
                    </td>

                    <td className="sf-equipment-col-actions" data-label="Ações">
                      <div className="sf-actions sf-equipment-row-actions">
                        <button
                          type="button"
                          title="Registrar manutenção"
                          className="sf-icon-button sf-equipment-action-button"
                          aria-label={`Registrar manutenção de ${equipment.nome}`}
                          onClick={() => openMaintenance(equipment)}
                        >
                          <Wrench size={17} />
                        </button>

                        <button
                          type="button"
                          title="Editar"
                          className="sf-icon-button sf-equipment-action-button"
                          aria-label={`Editar ${equipment.nome}`}
                          onClick={() => openEditEquipment(equipment)}
                        >
                          <Edit2 size={17} />
                        </button>

                        <button
                          type="button"
                          title="Remover"
                          className="sf-icon-button sf-equipment-action-button sf-equipment-delete-button"
                          aria-label={`Excluir ${equipment.nome}`}
                          disabled={String(deletingEquipmentId) === String(equipment.id)}
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

            {['Vendido', 'Baixado'].includes(formData.status) && (
              <div className="sf-equipment-exit-panel">
                <div className="sf-equipment-exit-heading">
                  <strong>Registrar saída do patrimônio</strong>
                  <small>A saída encerra a depreciação e mantém todo o histórico do item.</small>
                </div>
                <div className="sf-form-grid">
                  <Field label="Tipo de saída">
                    <select
                      style={inputStyle}
                      value={formData.tipoSaida || (formData.status === 'Vendido' ? 'venda' : 'baixa')}
                      onChange={(event) => {
                        const tipoSaida = event.target.value;
                        setFormData({
                          ...formData,
                          tipoSaida,
                          status: tipoSaida === 'venda' ? 'Vendido' : 'Baixado',
                          formaSaida: tipoSaida === 'permuta'
                            ? 'Permuta patrimonial'
                            : tipoSaida === 'parte_pagamento'
                              ? 'Pagamento misto'
                              : formData.formaSaida,
                        });
                      }}
                    >
                      {ASSET_EXIT_TYPES.map(([value, text]) => (
                        <option key={value} value={value}>{text}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Data da saída">
                    <input type="date" style={inputStyle} value={formData.dataSaida || formData.dataVenda || ''} onChange={(event) => setFormData({ ...formData, dataSaida: event.target.value, dataVenda: event.target.value })} />
                  </Field>
                  {['venda', 'permuta', 'parte_pagamento'].includes(formData.tipoSaida || (formData.status === 'Vendido' ? 'venda' : 'baixa')) && (
                    <>
                      <Field label={(formData.tipoSaida || 'venda') === 'venda' ? 'Comprador' : 'Destinatário/fornecedor'}>
                        <input style={inputStyle} value={formData.destinatarioSaida || formData.comprador || ''} onChange={(event) => setFormData({ ...formData, destinatarioSaida: event.target.value, comprador: event.target.value })} />
                      </Field>
                      <Field label="Valor atribuído ao equipamento">
                        <input style={inputStyle} value={formData.valorAtribuidoSaida || formData.valorVenda || ''} onChange={(event) => { const value = maskCurrency(event.target.value); setFormData({ ...formData, valorAtribuidoSaida: value, valorVenda: value }); }} placeholder="R$ 0,00" />
                      </Field>
                    </>
                  )}
                  {(formData.tipoSaida || (formData.status === 'Vendido' ? 'venda' : 'baixa')) === 'venda' && (
                    <>
                      <Field label="Forma de recebimento">
                        <select style={inputStyle} value={formData.formaSaida || formData.formaRecebimento || ''} onChange={(event) => setFormData({ ...formData, formaSaida: event.target.value, formaRecebimento: event.target.value })}>
                          <option value="">Selecione...</option>
                          {EXIT_PAYMENT_METHODS.filter((item) => !['Permuta patrimonial', 'Pagamento misto'].includes(item)).map((item) => <option key={item}>{item}</option>)}
                        </select>
                      </Field>
                      <Field label="Conta que recebeu o dinheiro">
                        <select style={inputStyle} value={formData.contaDestinoVenda || 'empresa'} onChange={(event) => setFormData({ ...formData, contaDestinoVenda: event.target.value })}>
                          <option value="empresa">Empresa</option>
                          <option value="salario">Salário/Pessoal</option>
                          <option value="reserva">Reserva</option>
                        </select>
                      </Field>
                    </>
                  )}
                  {['permuta', 'parte_pagamento'].includes(formData.tipoSaida || '') && (
                    <>
                      <Field label="Referência da negociação">
                        <input style={inputStyle} value={formData.referenciaNegociacao || ''} onChange={(event) => setFormData({ ...formData, referenciaNegociacao: event.target.value })} placeholder="Ex.: troca Nikon por serviço de manutenção" />
                      </Field>
                      <Field label="Serviço recebido">
                        <input style={inputStyle} value={formData.servicoRecebido || ''} onChange={(event) => setFormData({ ...formData, servicoRecebido: event.target.value })} />
                      </Field>
                      <Field label="Fornecedor do serviço">
                        <input style={inputStyle} value={formData.fornecedorServico || ''} onChange={(event) => setFormData({ ...formData, fornecedorServico: event.target.value })} />
                      </Field>
                      <Field label="Valor total do serviço">
                        <input style={inputStyle} value={formData.valorTotalServico || ''} onChange={(event) => setFormData({ ...formData, valorTotalServico: maskCurrency(event.target.value) })} placeholder="R$ 0,00" />
                      </Field>
                      {(formData.tipoSaida || '') === 'parte_pagamento' && (
                        <>
                          <Field label="Complemento em dinheiro">
                            <input style={inputStyle} value={formData.complementoDinheiro || ''} onChange={(event) => setFormData({ ...formData, complementoDinheiro: maskCurrency(event.target.value) })} placeholder="R$ 0,00" />
                          </Field>
                          <Field label="Conta do complemento">
                            <select style={inputStyle} value={formData.contaComplemento || 'empresa'} onChange={(event) => setFormData({ ...formData, contaComplemento: event.target.value })}>
                              <option value="empresa">Empresa</option>
                              <option value="salario">Salário/Pessoal</option>
                              <option value="reserva">Reserva</option>
                            </select>
                          </Field>
                        </>
                      )}
                    </>
                  )}
                </div>
                <Field label="Observações da saída">
                  <textarea style={{ ...inputStyle, minHeight: 82, resize: 'vertical' }} value={formData.observacoesSaida || formData.observacoesVenda || ''} onChange={(event) => setFormData({ ...formData, observacoesSaida: event.target.value, observacoesVenda: event.target.value })} />
                </Field>
                {['venda', 'permuta', 'parte_pagamento'].includes(formData.tipoSaida || (formData.status === 'Vendido' ? 'venda' : 'baixa')) && (
                  <div className="sf-equipment-sale-summary">
                    <span>Resultado patrimonial estimado</span>
                    <strong>{formatCurrency((parseCurrency(formData.valorAtribuidoSaida || formData.valorVenda) || 0) - (calculateDepreciation({ ...formData, valorCompra: parseCurrency(formData.valorCompra || formData.valor) }).currentBookValue || 0))}</strong>
                    <small>Valor atribuído ao item menos o valor contábil atual. Isso não representa necessariamente entrada de caixa.</small>
                  </div>
                )}
              </div>
            )}

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