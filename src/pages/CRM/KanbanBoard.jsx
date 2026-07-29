import { useMemo, useState } from 'react';
import {
  CalendarDays,
  Loader2,
  MoreHorizontal,
} from 'lucide-react';
import { CRM_STATUSES } from '../../data/crm';
import {
  formatCurrency,
  parseCurrency,
  parseDate,
} from '../../utils/formatters';

const PRIORITY_LABELS = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  urgente: 'Urgente',
};

const TEMPERATURE_LABELS = {
  frio: 'Frio',
  morno: 'Morno',
  quente: 'Quente',
};

const formatDate = (value) => {
  const date = parseDate(value);
  return date ? date.toLocaleDateString('pt-BR') : '';
};

const getNextAction = (lead = {}) => {
  const followup = lead.dataProximoFollowup
    || lead.dataProximoRetorno
    || lead.data_proximo_followup
    || lead.data_proximo_retorno;

  if (followup) {
    return `Follow-up ${formatDate(followup)}`;
  }

  const budgetDate = lead.dataOrcamento || lead.data_orcamento;
  if (budgetDate) {
    const date = parseDate(budgetDate);
    if (date) {
      const validity = Math.max(
        1,
        Number(lead.validadeOrcamentoDias || lead.validade_orcamento_dias || 30),
      );
      const expiresAt = new Date(date);
      expiresAt.setDate(expiresAt.getDate() + validity);
      return `Validade ${expiresAt.toLocaleDateString('pt-BR')}`;
    }
  }

  return lead.observacoes?.trim()
    ? lead.observacoes.trim()
    : 'Abrir detalhes do lead';
};

const getLeadScore = (lead = {}) => {
  const priority = {
    baixa: 1,
    media: 2,
    alta: 3,
    urgente: 4,
  }[lead.prioridade || 'media'] || 2;

  const temperature = {
    frio: 1,
    morno: 2,
    quente: 3,
  }[lead.temperatura || 'morno'] || 2;

  const probability = Number(lead.probabilidadeFechamento ?? 50) || 0;
  return (priority * 1000) + (temperature * 100) + probability;
};

const getStatusIndex = (status) => {
  const index = CRM_STATUSES.findIndex((item) => item.id === status);
  return index >= 0 ? index : 0;
};

function LeadCard({
  lead,
  onMove,
  onClick,
  onQuickNote,
  updatingLeadId,
  variant = 'board',
}) {
  const isSaving = String(updatingLeadId) === String(lead.id);
  const priority = lead.prioridade || 'media';
  const temperature = lead.temperatura || 'morno';
  const eventDate = formatDate(lead.dataEvento || lead.data_evento);
  const value = parseCurrency(lead.valorOrcamento || lead.valor_orcamento);

  return (
    <article
      className={`crm-pipeline-lead-card is-${variant}`}
      draggable={variant === 'board' && !isSaving}
      onDragStart={(event) => {
        if (variant !== 'board') return;
        event.dataTransfer.setData('leadId', String(lead.id));
      }}
      onClick={() => onClick(lead)}
    >
      <div className="crm-pipeline-lead-card__top">
        <div className="crm-pipeline-lead-card__identity">
          <strong title={lead.nome}>{lead.nome || 'Lead sem nome'}</strong>
          <span>
            {lead.tipoServico || lead.tipo_servico || 'Serviço não informado'}
            {eventDate ? ` · ${eventDate}` : ''}
          </span>
        </div>

        <button
          type="button"
          className="crm-pipeline-lead-card__menu"
          aria-label={`Adicionar nota rápida para ${lead.nome || 'lead'}`}
          title="Adicionar nota rápida"
          onClick={(event) => {
            event.stopPropagation();
            onQuickNote(lead);
          }}
        >
          <MoreHorizontal size={16} />
        </button>
      </div>

      <div className="crm-pipeline-lead-card__badges">
        <span data-temperature={temperature}>
          {TEMPERATURE_LABELS[temperature] || 'Morno'}
        </span>
        <span data-priority={priority}>
          {PRIORITY_LABELS[priority] || 'Média'}
        </span>
      </div>

      <div className="crm-pipeline-lead-card__action">
        <span title={getNextAction(lead)}>{getNextAction(lead)}</span>
        <strong>{formatCurrency(value)}</strong>
      </div>

      {isSaving ? (
        <div className="crm-pipeline-lead-card__saving" role="status">
          <Loader2 size={14} />
          Salvando status...
        </div>
      ) : (
        <div className="crm-pipeline-lead-card__status">
          <CalendarDays size={14} />
          <select
            value={lead.status}
            aria-label={`Status de ${lead.nome || 'lead'}`}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => {
              event.stopPropagation();
              onMove(lead.id, event.target.value);
            }}
          >
            {CRM_STATUSES.map((status) => (
              <option key={status.id} value={status.id}>
                {status.title}
              </option>
            ))}
          </select>
        </div>
      )}
    </article>
  );
}

export default function KanbanBoard({
  leads,
  onMove,
  onClick,
  onQuickNote,
  updatingLeadId = '',
}) {
  const [activeStage, setActiveStage] = useState('all');

  const sortedLeads = useMemo(() => (
    [...leads].sort((first, second) => {
      const stageDifference = getStatusIndex(first.status) - getStatusIndex(second.status);
      if (stageDifference !== 0) return stageDifference;
      return getLeadScore(second) - getLeadScore(first);
    })
  ), [leads]);

  const visibleMobileLeads = useMemo(() => (
    activeStage === 'all'
      ? sortedLeads
      : sortedLeads.filter((lead) => lead.status === activeStage)
  ), [activeStage, sortedLeads]);

  const getColumnLeads = (status) => (
    sortedLeads.filter((lead) => lead.status === status)
  );

  return (
    <section className="crm-pipeline-shell" aria-label="Pipeline comercial">
      <header className="crm-pipeline-heading">
        <div>
          <strong>Pipeline comercial</strong>
          <span>{leads.length} lead(s) em acompanhamento</span>
        </div>
        <span className="crm-pipeline-heading__hint">
          Toque em um lead para ver e editar todas as informações.
        </span>
      </header>

      <div className="crm-pipeline-stage-summary" aria-label="Resumo das etapas">
        <button
          type="button"
          className={activeStage === 'all' ? 'is-active' : ''}
          onClick={() => setActiveStage('all')}
        >
          <span>Todos</span>
          <strong>{leads.length}</strong>
        </button>

        {CRM_STATUSES.map((status) => {
          const count = getColumnLeads(status.id).length;
          return (
            <button
              type="button"
              key={status.id}
              className={activeStage === status.id ? 'is-active' : ''}
              style={{ '--crm-stage-color': status.color }}
              onClick={() => setActiveStage(status.id)}
            >
              <span>{status.title}</span>
              <strong>{count}</strong>
            </button>
          );
        })}
      </div>

      <div className="crm-pipeline-desktop-board">
        {CRM_STATUSES.map((column) => {
          const columnLeads = getColumnLeads(column.id);

          return (
            <section
              className="crm-pipeline-stage"
              key={column.id}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                const leadId = event.dataTransfer.getData('leadId');
                if (leadId) onMove(leadId, column.id);
              }}
            >
              <header
                className="crm-pipeline-stage__header"
                style={{ '--crm-stage-color': column.color }}
              >
                <strong>{column.title}</strong>
                <span>{columnLeads.length}</span>
              </header>

              <div className="crm-pipeline-stage__cards">
                {columnLeads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    onMove={onMove}
                    onClick={onClick}
                    onQuickNote={onQuickNote}
                    updatingLeadId={updatingLeadId}
                    variant="board"
                  />
                ))}

                {columnLeads.length === 0 && (
                  <div className="crm-pipeline-stage__empty">
                    Nenhum lead
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <div className="crm-pipeline-mobile-workspace">
        <div className="crm-pipeline-mobile-workspace__header">
          <strong>
            {activeStage === 'all'
              ? 'Todos os leads'
              : CRM_STATUSES.find((status) => status.id === activeStage)?.title}
          </strong>
          <span>{visibleMobileLeads.length}</span>
        </div>

        <div className="crm-pipeline-mobile-list">
          {visibleMobileLeads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onMove={onMove}
              onClick={onClick}
              onQuickNote={onQuickNote}
              updatingLeadId={updatingLeadId}
              variant="list"
            />
          ))}

          {visibleMobileLeads.length === 0 && (
            <div className="crm-pipeline-mobile-list__empty">
              Nenhum lead nesta etapa.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
