import { CRM_STATUSES } from '../../data/crm';
import {
  formatCurrency,
  parseCurrency,
  parseDate,
} from '../../utils/formatters';

const normalizeDateOnly = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
};

const getFollowupDate = (lead) => {
  return parseDate(
    lead.dataProximoFollowup
    || lead.dataProximoRetorno
    || lead.data_proximo_followup
    || lead.data_proximo_retorno,
  );
};

const formatDate = (value) => {
  const date = parseDate(value);

  if (!date) return value || 'Nao informada';

  return date.toLocaleDateString('pt-BR');
};

const getFollowupStatus = (lead) => {
  const followupDate = normalizeDateOnly(getFollowupDate(lead));
  const today = normalizeDateOnly(new Date());

  if (!followupDate || !today) {
    return null;
  }

  if (followupDate.getTime() < today.getTime()) {
    return {
      label: 'Follow-up atrasado',
      color: '#f87171',
      background: '#231010',
      border: '#4a1f1f',
    };
  }

  if (followupDate.getTime() === today.getTime()) {
    return {
      label: 'Follow-up hoje',
      color: '#fbbf24',
      background: '#211a09',
      border: '#4a3915',
    };
  }

  return {
    label: 'Proximo follow-up',
    color: '#a78bfa',
    background: '#171126',
    border: '#33244f',
  };
};

const getLeadTasks = (lead = {}) => {
  const history = Array.isArray(lead.historico)
    ? lead.historico
    : [];

  const tasks = new Map();

  history.forEach((item) => {
    if (item?.tipo !== 'tarefa_comercial' || !item.tarefaId) {
      return;
    }

    const currentTask = tasks.get(item.tarefaId) || {
      id: item.tarefaId,
      titulo: item.titulo || 'Tarefa comercial',
      prazo: item.prazo || '',
      prioridade: item.prioridade || 'media',
      responsavel: item.responsavel || 'Camilla',
      concluida: false,
      criadaEm: item.data || '',
      concluidaEm: '',
    };

    if (item.tarefaAcao === 'criada') {
      tasks.set(item.tarefaId, {
        ...currentTask,
        titulo: item.titulo || currentTask.titulo,
        prazo: item.prazo || currentTask.prazo,
        prioridade: item.prioridade || currentTask.prioridade,
        responsavel: item.responsavel || currentTask.responsavel,
        concluida: false,
        criadaEm: item.data || currentTask.criadaEm,
      });
    }

    if (item.tarefaAcao === 'concluida') {
      tasks.set(item.tarefaId, {
        ...currentTask,
        concluida: true,
        concluidaEm: item.data || '',
      });
    }
  });

  return [...tasks.values()];
};

const getTaskDate = (task = {}) => {
  return normalizeDateOnly(parseDate(task.prazo));
};

const getTaskStatus = (task = {}) => {
  const dueDate = getTaskDate(task);
  const today = normalizeDateOnly(new Date());

  if (!dueDate || !today) {
    return {
      key: 'proxima',
      label: 'Próxima tarefa',
      color: '#60a5fa',
      background: '#0d1726',
      border: '#1f3b63',
    };
  }

  if (dueDate.getTime() < today.getTime()) {
    return {
      key: 'atrasada',
      label: 'Tarefa atrasada',
      color: '#f87171',
      background: '#231010',
      border: '#4a1f1f',
    };
  }

  if (dueDate.getTime() === today.getTime()) {
    return {
      key: 'hoje',
      label: 'Tarefa para hoje',
      color: '#fbbf24',
      background: '#211a09',
      border: '#4a3915',
    };
  }

  return {
    key: 'proxima',
    label: 'Próxima tarefa',
    color: '#60a5fa',
    background: '#0d1726',
    border: '#1f3b63',
  };
};

const getLeadTaskSummary = (lead = {}) => {
  const pendingTasks = getLeadTasks(lead)
    .filter((task) => !task.concluida)
    .sort((first, second) => {
      const priorityDifference = (
        (PRIORITY_ORDER[second.prioridade || 'media'] || 2)
        - (PRIORITY_ORDER[first.prioridade || 'media'] || 2)
      );

      const firstStatus = getTaskStatus(first);
      const secondStatus = getTaskStatus(second);

      const statusOrder = {
        atrasada: 3,
        hoje: 2,
        proxima: 1,
      };

      const statusDifference = (
        (statusOrder[secondStatus.key] || 0)
        - (statusOrder[firstStatus.key] || 0)
      );

      if (statusDifference !== 0) return statusDifference;
      if (priorityDifference !== 0) return priorityDifference;

      const firstDate = getTaskDate(first);
      const secondDate = getTaskDate(second);

      if (!firstDate && !secondDate) return 0;
      if (!firstDate) return 1;
      if (!secondDate) return -1;

      return firstDate.getTime() - secondDate.getTime();
    });

  const overdueCount = pendingTasks.filter(
    (task) => getTaskStatus(task).key === 'atrasada',
  ).length;

  const todayCount = pendingTasks.filter(
    (task) => getTaskStatus(task).key === 'hoje',
  ).length;

  const urgentCount = pendingTasks.filter(
    (task) => task.prioridade === 'urgente',
  ).length;

  return {
    pendingTasks,
    nextTask: pendingTasks[0] || null,
    pendingCount: pendingTasks.length,
    overdueCount,
    todayCount,
    urgentCount,
  };
};

const PRIORITY_ORDER = {
  baixa: 1,
  media: 2,
  alta: 3,
  urgente: 4,
};

const TEMPERATURE_ORDER = {
  frio: 1,
  morno: 2,
  quente: 3,
};

const PRIORITY_STYLES = {
  baixa: {
    label: 'Baixa',
    color: '#9ca3af',
    background: '#111315',
    border: '#2c3035',
  },
  media: {
    label: 'Média',
    color: '#60a5fa',
    background: '#0d1726',
    border: '#1f3b63',
  },
  alta: {
    label: 'Alta',
    color: '#fbbf24',
    background: '#1c1608',
    border: '#493817',
  },
  urgente: {
    label: 'Urgente',
    color: '#f87171',
    background: '#1b0d0d',
    border: '#472020',
  },
};

const TEMPERATURE_STYLES = {
  frio: {
    label: 'Frio',
    color: '#93c5fd',
    background: '#0d1726',
    border: '#1f3b63',
  },
  morno: {
    label: 'Morno',
    color: '#fbbf24',
    background: '#1c1608',
    border: '#493817',
  },
  quente: {
    label: 'Quente',
    color: '#fb7185',
    background: '#1f0f15',
    border: '#4a2230',
  },
};

const getLatestQuickNote = (lead = {}) => {
  const history = Array.isArray(lead.historico)
    ? lead.historico
    : [];

  return history
    .filter((item) => item?.tipo === 'nota_rapida')
    .slice()
    .sort((first, second) => (
      String(second.data || '').localeCompare(
        String(first.data || ''),
      )
    ))[0] || null;
};

const getBudgetValidity = (lead = {}) => {
  const history = Array.isArray(lead.historico)
    ? lead.historico
    : [];

  const latestConfig = history
    .filter((item) => (
      item?.orcamentoValidade
      || item?.tipo === 'renovacao_orcamento'
    ))
    .slice()
    .sort((first, second) => (
      String(second.data || '').localeCompare(
        String(first.data || ''),
      )
    ))[0];

  const sentDate = parseDate(
    latestConfig?.orcamentoValidade?.dataEnvio
    || latestConfig?.dataEnvioOrcamento
    || lead.dataOrcamento
    || lead.data_orcamento,
  );

  if (!sentDate) return null;

  const validityDays = Math.max(
    1,
    Number(
      latestConfig?.orcamentoValidade?.validadeDias
      ?? latestConfig?.validadeOrcamentoDias
      ?? lead.validadeOrcamentoDias
      ?? 30,
    ),
  );

  const expiration = normalizeDateOnly(new Date(sentDate));
  expiration.setDate(expiration.getDate() + validityDays);

  const today = normalizeDateOnly(new Date());
  const daysRemaining = Math.ceil(
    (expiration.getTime() - today.getTime())
    / (1000 * 60 * 60 * 24),
  );

  if (daysRemaining < 0) {
    return {
      key: 'vencido',
      label: `Orçamento vencido há ${Math.abs(daysRemaining)} dia(s)`,
      color: '#f87171',
      background: '#231010',
      border: '#4a1f1f',
      score: 4000,
    };
  }

  if (daysRemaining <= 5) {
    return {
      key: 'vencendo',
      label: daysRemaining === 0
        ? 'Orçamento vence hoje'
        : `Orçamento vence em ${daysRemaining} dia(s)`,
      color: '#fbbf24',
      background: '#211a09',
      border: '#4a3915',
      score: 2200,
    };
  }

  return {
    key: 'valido',
    label: `Orçamento válido até ${formatDate(expiration)}`,
    color: '#34d399',
    background: '#0d1b16',
    border: '#1f4939',
    score: 0,
  };
};

const getLeadCommercialScore = (lead = {}) => {
  const priority = PRIORITY_ORDER[lead.prioridade || 'media'] || 2;
  const temperature = TEMPERATURE_ORDER[lead.temperatura || 'morno'] || 2;
  const probability = Number(lead.probabilidadeFechamento ?? 50);
  const taskSummary = getLeadTaskSummary(lead);
  const taskScore = (
    (taskSummary.overdueCount * 5000)
    + (taskSummary.todayCount * 2500)
    + (taskSummary.urgentCount * 1800)
    + (taskSummary.pendingCount * 100)
  );
  const budgetStatus = getBudgetValidity(lead);
  const budgetScore = budgetStatus?.score || 0;

  return (
    taskScore
    + budgetScore
    + (priority * 1000)
    + (temperature * 100)
    + probability
  );
};

export default function KanbanBoard({
  leads,
  onMove,
  onClick,
  onQuickNote,
}) {
  const getColumnLeads = (status) => (
    leads
      .filter((lead) => lead.status === status)
      .sort((first, second) => (
        getLeadCommercialScore(second)
        - getLeadCommercialScore(first)
      ))
  );

  const getColumnValue = (status) => {
    return getColumnLeads(status).reduce((total, lead) => {
      return total + parseCurrency(lead.valorOrcamento);
    }, 0);
  };

  return (
    <div
      className="crm-kanban"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(245px, 1fr))',
        gap: '16px',
        width: '100%',
        alignItems: 'start',
      }}
    >
      {CRM_STATUSES.map((column) => {
        const columnLeads = getColumnLeads(column.id);
        const columnTotal = getColumnValue(column.id);

        return (
          <section
            className="crm-kanban-column"
            key={column.id}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              const leadId = event.dataTransfer.getData('leadId');

              if (leadId) {
                onMove(leadId, column.id);
              }
            }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              minHeight: '140px',
            }}
          >
            <div
              className="crm-kanban-column-header"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '8px 0',
                borderBottom: `2px solid ${column.color}`,
              }}
            >
              <div>
                <div
                  style={{
                    fontWeight: '700',
                    fontSize: '0.9rem',
                  }}
                >
                  {column.title}
                </div>

                <div
                  style={{
                    fontSize: '0.75rem',
                    color: '#777',
                    marginTop: '3px',
                  }}
                >
                  {formatCurrency(columnTotal)} em potencial
                </div>
              </div>

              <span
                style={{
                  fontSize: '0.8rem',
                  color: '#888',
                  background: '#111',
                  border: '1px solid #222',
                  borderRadius: '999px',
                  minWidth: '28px',
                  height: '28px',
                  padding: '0 8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                }}
              >
                {columnLeads.length}
              </span>
            </div>

            <div
              className="crm-kanban-card-list"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              {columnLeads.map((lead) => {
                const followupStatus = getFollowupStatus(lead);
                const priorityKey = lead.prioridade || 'media';
                const temperatureKey = lead.temperatura || 'morno';
                const priorityStyle = PRIORITY_STYLES[priorityKey]
                  || PRIORITY_STYLES.media;
                const temperatureStyle = TEMPERATURE_STYLES[temperatureKey]
                  || TEMPERATURE_STYLES.morno;
                const closingProbability = Math.max(
                  0,
                  Math.min(
                    100,
                    Number(lead.probabilidadeFechamento ?? 50),
                  ),
                );
                const taskSummary = getLeadTaskSummary(lead);
                const nextTask = taskSummary.nextTask;
                const nextTaskStatus = nextTask
                  ? getTaskStatus(nextTask)
                  : null;
                const hasCriticalTask = Boolean(
                  taskSummary.overdueCount > 0
                  || taskSummary.urgentCount > 0,
                );
                const latestQuickNote = getLatestQuickNote(lead);
                const budgetStatus = getBudgetValidity(lead);

                return (
                  <article
                    className="crm-kanban-card"
                    key={lead.id}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData('leadId', lead.id);
                    }}
                    onClick={() => onClick(lead)}
                    style={{
                      background: '#111',
                      padding: '16px',
                      borderRadius: '12px',
                      border: `1px solid ${
                        hasCriticalTask
                          ? '#5b2525'
                          : priorityStyle.border
                      }`,
                      borderLeft: `4px solid ${
                        taskSummary.overdueCount > 0
                          ? '#f87171'
                          : taskSummary.urgentCount > 0
                            ? '#fb923c'
                            : priorityStyle.color
                      }`,
                      cursor: 'grab',
                      boxShadow: hasCriticalTask
                        ? '0 0 0 1px rgba(248,113,113,0.12), 0 6px 14px rgba(0,0,0,0.35)'
                        : '0 4px 6px rgba(0,0,0,0.3)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '10px',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <h4
                          style={{
                            margin: '0 0 6px 0',
                            fontSize: '1rem',
                            color: '#fff',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {lead.nome}
                        </h4>

                        <div
                          style={{
                            fontSize: '0.8rem',
                            color: '#888',
                          }}
                        >
                          {lead.tipoServico || 'Servico nao informado'}
                        </div>
                      </div>

                      <span
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: column.color,
                          flexShrink: 0,
                          marginTop: '6px',
                        }}
                      />
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        gap: '7px',
                        marginTop: '10px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span
                        style={{
                          padding: '5px 8px',
                          borderRadius: '999px',
                          color: priorityStyle.color,
                          background: priorityStyle.background,
                          border: `1px solid ${priorityStyle.border}`,
                          fontSize: '0.7rem',
                          fontWeight: 700,
                        }}
                      >
                        Prioridade {priorityStyle.label}
                      </span>

                      <span
                        style={{
                          padding: '5px 8px',
                          borderRadius: '999px',
                          color: temperatureStyle.color,
                          background: temperatureStyle.background,
                          border: `1px solid ${temperatureStyle.border}`,
                          fontSize: '0.7rem',
                          fontWeight: 700,
                        }}
                      >
                        {temperatureStyle.label}
                      </span>

                      <span
                        style={{
                          padding: '5px 8px',
                          borderRadius: '999px',
                          color: '#c5a059',
                          background: '#18130a',
                          border: '1px solid #3a2d16',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                        }}
                      >
                        {closingProbability}% de chance
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        marginTop: '12px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: '10px',
                          fontSize: '0.78rem',
                        }}
                      >
                        <span style={{ color: '#666' }}>
                          Evento
                        </span>

                        <span
                          style={{
                            color: '#aaa',
                            textAlign: 'right',
                          }}
                        >
                          {formatDate(lead.dataEvento)}
                        </span>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: '10px',
                          fontSize: '0.78rem',
                        }}
                      >
                        <span style={{ color: '#666' }}>
                          Origem
                        </span>

                        <span
                          style={{
                            color: '#aaa',
                            textAlign: 'right',
                          }}
                        >
                          {lead.origem || 'Nao informada'}
                        </span>
                      </div>

                      {lead.indicacao && (
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: '10px',
                            fontSize: '0.78rem',
                          }}
                        >
                          <span style={{ color: '#666' }}>
                            Indicacao
                          </span>

                          <span
                            style={{
                              color: '#aaa',
                              textAlign: 'right',
                            }}
                          >
                            {lead.indicacao}
                          </span>
                        </div>
                      )}

                      {lead.campanha && (
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: '10px',
                            fontSize: '0.78rem',
                          }}
                        >
                          <span style={{ color: '#666' }}>
                            Campanha
                          </span>

                          <span
                            style={{
                              color: '#aaa',
                              textAlign: 'right',
                              maxWidth: '60%',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {lead.campanha}
                          </span>
                        </div>
                      )}
                    </div>

                    {followupStatus && (
                      <div
                        style={{
                          marginTop: '12px',
                          padding: '9px 10px',
                          borderRadius: '8px',
                          background: followupStatus.background,
                          border: `1px solid ${followupStatus.border}`,
                        }}
                      >
                        <div
                          style={{
                            color: followupStatus.color,
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            marginBottom: '3px',
                          }}
                        >
                          {followupStatus.label}
                        </div>

                        <div
                          style={{
                            color: '#bbb',
                            fontSize: '0.78rem',
                          }}
                        >
                          {formatDate(
                            lead.dataProximoFollowup
                            || lead.dataProximoRetorno
                            || lead.data_proximo_followup
                            || lead.data_proximo_retorno,
                          )}
                        </div>
                      </div>
                    )}

                    {budgetStatus && (
                      <div
                        style={{
                          marginTop: '10px',
                          background: budgetStatus.background,
                          border: `1px solid ${budgetStatus.border}`,
                          borderRadius: '8px',
                          padding: '8px 9px',
                          color: budgetStatus.color,
                          fontSize: '0.7rem',
                          fontWeight: 800,
                          lineHeight: 1.4,
                        }}
                      >
                        {budgetStatus.label}
                      </div>
                    )}

                    {taskSummary.pendingCount > 0 && nextTask && (
                      <div
                        style={{
                          marginTop: '12px',
                          padding: '10px',
                          borderRadius: '8px',
                          background: nextTaskStatus.background,
                          border: `1px solid ${nextTaskStatus.border}`,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '8px',
                            marginBottom: '6px',
                            flexWrap: 'wrap',
                          }}
                        >
                          <span
                            style={{
                              color: nextTaskStatus.color,
                              fontSize: '0.73rem',
                              fontWeight: 800,
                            }}
                          >
                            {nextTaskStatus.label}
                          </span>

                          <span
                            style={{
                              color: '#aaa',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                            }}
                          >
                            {taskSummary.pendingCount} pendente(s)
                          </span>
                        </div>

                        <div
                          style={{
                            color: '#ddd',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            lineHeight: 1.4,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={nextTask.titulo}
                        >
                          {nextTask.titulo}
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: '10px',
                            marginTop: '6px',
                            color: '#999',
                            fontSize: '0.71rem',
                          }}
                        >
                          <span>
                            {nextTask.prazo
                              ? formatDate(nextTask.prazo)
                              : 'Sem prazo'}
                          </span>

                          <span
                            style={{
                              textAlign: 'right',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: '55%',
                            }}
                            title={nextTask.responsavel || 'Camilla'}
                          >
                            {nextTask.responsavel || 'Camilla'}
                          </span>
                        </div>

                        {(taskSummary.overdueCount > 0
                          || taskSummary.urgentCount > 0) && (
                          <div
                            style={{
                              marginTop: '7px',
                              color: '#f6a6a6',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                            }}
                          >
                            {taskSummary.overdueCount > 0
                              ? `${taskSummary.overdueCount} atrasada(s)`
                              : `${taskSummary.urgentCount} urgente(s)`}
                          </div>
                        )}
                      </div>
                    )}

                    {latestQuickNote && (
                      <div
                        style={{
                          marginTop: '12px',
                          padding: '10px',
                          borderRadius: '8px',
                          background: '#18130a',
                          border: '1px solid #3a2d16',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: '8px',
                            alignItems: 'center',
                            marginBottom: '5px',
                          }}
                        >
                          <span
                            style={{
                              color: '#d8b56e',
                              fontSize: '0.72rem',
                              fontWeight: 800,
                            }}
                          >
                            Última nota
                          </span>

                          <span
                            style={{
                              color: '#777',
                              fontSize: '0.67rem',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {formatDate(latestQuickNote.data)}
                          </span>
                        </div>

                        <div
                          style={{
                            color: '#bbb',
                            fontSize: '0.76rem',
                            lineHeight: 1.45,
                            display: '-webkit-box',
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                          title={latestQuickNote.descricao}
                        >
                          {latestQuickNote.descricao}
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onQuickNote?.(lead);
                      }}
                      style={{
                        width: '100%',
                        marginTop: '12px',
                        background: '#18130a',
                        color: '#d8b56e',
                        border: '1px solid #3a2d16',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '0.74rem',
                        fontWeight: 800,
                      }}
                    >
                      + Nota rápida
                    </button>

                    {lead.status === 'perdido' && lead.motivoPerda && (
                      <div
                        style={{
                          marginTop: '12px',
                          padding: '9px 10px',
                          borderRadius: '8px',
                          background: '#1d0e0e',
                          border: '1px solid #3c1d1d',
                          color: '#e7aaaa',
                          fontSize: '0.78rem',
                          lineHeight: 1.4,
                        }}
                      >
                        <strong>Motivo:</strong> {lead.motivoPerda}
                      </div>
                    )}

                    {lead.status === 'cancelado' && lead.motivoCancelamento && (
                      <div
                        style={{
                          marginTop: '12px',
                          padding: '9px 10px',
                          borderRadius: '8px',
                          background: '#1d0e0e',
                          border: '1px solid #3c1d1d',
                          color: '#e7aaaa',
                          fontSize: '0.78rem',
                          lineHeight: 1.4,
                        }}
                      >
                        <strong>Motivo:</strong> {lead.motivoCancelamento}
                      </div>
                    )}

                    <div
                      style={{
                        fontSize: '0.95rem',
                        fontWeight: '700',
                        color: '#fff',
                        marginTop: '14px',
                      }}
                    >
                      {formatCurrency(
                        parseCurrency(lead.valorOrcamento),
                      )}
                    </div>

                    <select
                      value={lead.status}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => {
                        onMove(lead.id, event.target.value);
                      }}
                      style={{
                        width: '100%',
                        marginTop: '12px',
                        background: '#1a1a1a',
                        border: '1px solid #333',
                        color: '#ddd',
                        padding: '8px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                      }}
                    >
                      {CRM_STATUSES.map((status) => (
                        <option
                          key={status.id}
                          value={status.id}
                        >
                          {status.title}
                        </option>
                      ))}
                    </select>
                  </article>
                );
              })}

              {columnLeads.length === 0 && (
                <div
                  style={{
                    border: '1px dashed #252525',
                    borderRadius: '12px',
                    padding: '18px',
                    color: '#555',
                    fontSize: '0.85rem',
                    textAlign: 'center',
                  }}
                >
                  Arraste leads para esta etapa.
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}