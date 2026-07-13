import { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  dateFnsLocalizer,
} from 'react-big-calendar';
import {
  addMonths,
  endOfDay,
  format,
  getDay,
  isSameDay,
  isSameMonth,
  parse,
  startOfDay,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import {
  AlertTriangle,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  ExternalLink,
  Filter,
  ListFilter,
  MapPin,
  Pencil,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  getDbStudioData,
  subscribeDbUpdates,
} from '../../utils/dbData';
import {
  createId,
  readStorage,
  STORAGE_KEYS,
  writeStorage,
} from '../../utils/storage';
import { loadSettings } from '../../utils/settings';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import './Agenda.css';

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales: {
    'pt-BR': ptBR,
  },
});

const categories = [
  'Trabalho',
  'Casamento',
  'Ensaio',
  'Reunião',
  'Entrega',
  'Follow-up',
  'Tarefa',
  'Pessoal',
  'Congresso',
  'Viagem',
  'Compromisso',
  'Outro',
];

const categoryColors = {
  Trabalho: '#c9a06c',
  Casamento: '#d39b8c',
  Ensaio: '#9d8fd0',
  Reunião: '#70a5b8',
  Entrega: '#72ad83',
  'Follow-up': '#d0a25b',
  Tarefa: '#60a5fa',
  Pessoal: '#aa88b5',
  Congresso: '#5da2a6',
  Viagem: '#6590c6',
  Compromisso: '#be7f75',
  Outro: '#888888',
};

const emptyEvent = {
  title: '',
  category: 'Pessoal',
  startDate: '',
  startTime: '',
  endDate: '',
  endTime: '',
  allDay: true,
  location: '',
  description: '',
  color: '#aa88b5',
  reminder: '',
  recurrence: 'none',
  notes: '',
};

const parseDate = (value, time = '00:00') => {
  if (!value) return null;

  const normalized = String(value).trim();
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(normalized)
    ? normalized
    : normalized
      .match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
      ?.slice(1)
      .reverse()
      .join('-');

  if (!iso) {
    const fallback = new Date(normalized);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  const [year, month, day] = iso.split('-').map(Number);
  const [hour, minute] = String(time || '00:00')
    .split(':')
    .map(Number);

  const date = new Date(
    year,
    month - 1,
    day,
    hour || 0,
    minute || 0,
  );

  return Number.isNaN(date.getTime()) ? null : date;
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

    const current = tasks.get(item.tarefaId) || {
      id: item.tarefaId,
      leadId: lead.id,
      leadName: lead.nome || 'Lead sem nome',
      titulo: item.titulo || 'Tarefa comercial',
      prazo: item.prazo || '',
      prioridade: item.prioridade || 'media',
      responsavel: item.responsavel || 'Camilla',
      concluida: false,
    };

    if (item.tarefaAcao === 'criada') {
      tasks.set(item.tarefaId, {
        ...current,
        titulo: item.titulo || current.titulo,
        prazo: item.prazo || current.prazo,
        prioridade: item.prioridade || current.prioridade,
        responsavel: item.responsavel || current.responsavel,
        concluida: false,
      });
    }

    if (item.tarefaAcao === 'concluida') {
      tasks.set(item.tarefaId, {
        ...current,
        concluida: true,
      });
    }
  });

  return [...tasks.values()];
};

const normalizeManual = (item) => {
  if (item.sourceType && item.sourceType !== 'manual') return null;
  if (item.isProjectIntegration || (item.projectId && !item.isManual)) {
    return null;
  }

  const start = parseDate(
    item.startDate
      || item.date
      || String(item.start || '').slice(0, 10),
    item.startTime || item.time,
  );

  if (!start) return null;

  const end = parseDate(
    item.endDate
      || item.startDate
      || item.date
      || String(item.end || '').slice(0, 10),
    item.endTime || item.startTime || item.time,
  ) || new Date(start.getTime() + 3600000);

  return {
    ...emptyEvent,
    ...item,
    id: item.id || createId('manual-event'),
    title: item.title || 'Evento',
    startDate: format(start, 'yyyy-MM-dd'),
    endDate: format(end, 'yyyy-MM-dd'),
    sourceType: 'manual',
    origem: 'manual',
    isManual: true,
  };
};

const getEventTiming = (event) => {
  const now = new Date();

  if (event.end < startOfDay(now)) return 'atrasado';
  if (isSameDay(event.start, now)) return 'hoje';
  if (event.start > endOfDay(now)) return 'futuro';

  return 'em_andamento';
};

const sourceLabels = {
  manual: 'Manual',
  trabalho: 'Projeto',
  crm: 'CRM',
};

export default function Agenda() {
  const navigate = useNavigate();
  const notificationSettings = loadSettings().notifications;

  const [studio, setStudio] = useState({
    projects: [],
    leads: [],
  });

  const [manualEvents, setManualEvents] = useState(() => (
    readStorage(STORAGE_KEYS.agendaEvents, [])
      .map(normalizeManual)
      .filter(Boolean)
  ));

  const [date, setDate] = useState(new Date());
  const [view, setView] = useState('month');
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [showOnlyToday, setShowOnlyToday] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const data = await getDbStudioData();

      if (active) {
        setStudio({
          ...data,
          projects: data.projects || [],
          leads: data.leads || [],
        });
      }
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

  useEffect(() => {
    const sync = (event) => {
      if (
        event?.detail?.key
        && event.detail.key !== STORAGE_KEYS.agendaEvents
      ) {
        return;
      }

      setManualEvents(
        readStorage(STORAGE_KEYS.agendaEvents, [])
          .map(normalizeManual)
          .filter(Boolean),
      );
    };

    window.addEventListener('sf_storage_update', sync);
    window.addEventListener('storage', sync);

    return () => {
      window.removeEventListener('sf_storage_update', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const projectEvents = useMemo(() => {
    const unique = new Map();

    (studio.projects || []).forEach((project) => {
      const start = parseDate(
        project.data
          || project.data_trabalho
          || project.dataTrabalho,
        project.horario,
      );

      if (!start) return;

      const sourceId = String(
        project.id
        || project.projectId
        || project.clienteId,
      );

      if (!sourceId) return;

      const end = new Date(
        start.getTime()
        + Number(project.duracaoHoras || 2) * 3600000,
      );

      const service = (
        project.tipoServico
        || project.tipo_servico
        || project.tipoTrabalho
        || 'Trabalho'
      );

      const client = (
        project.clienteNome
        || project.cliente?.nome
        || 'Cliente'
      );

      unique.set(`project-${sourceId}`, {
        id: `project-${sourceId}`,
        title: `${service} — ${client}`,
        client,
        category: categories.includes(service)
          ? service
          : service === 'Pre-wedding'
            ? 'Ensaio'
            : 'Trabalho',
        start,
        end,
        allDay: !project.horario,
        location: project.local || project.cliente?.cidade || '',
        description: project.observacoes || '',
        status: project.status,
        sourceType: 'trabalho',
        origem: 'trabalho',
        sourceId,
        projectId: project.id,
        clientId: project.clienteId || project.clientId,
        project,
        isManual: false,
        color: categoryColors[service]
          || categoryColors.Trabalho,
      });
    });

    return [...unique.values()];
  }, [studio.projects]);

  const crmEvents = useMemo(() => {
    const items = [];

    (studio.leads || []).forEach((lead) => {
      const followupDate = (
        lead.dataProximoFollowup
        || lead.data_proximo_followup
        || ''
      );

      const followupStart = parseDate(followupDate, '09:00');

      if (followupStart) {
        items.push({
          id: `crm-followup-${lead.id}-${followupDate}`,
          title: `Follow-up — ${lead.nome || 'Lead sem nome'}`,
          category: 'Follow-up',
          start: followupStart,
          end: new Date(followupStart.getTime() + 30 * 60000),
          allDay: false,
          location: lead.cidade || '',
          description: (
            `Próximo contato comercial · ${lead.tipoServico || 'Serviço'}`
          ),
          sourceType: 'crm',
          origem: 'crm',
          leadId: lead.id,
          lead,
          isManual: false,
          color: categoryColors['Follow-up'],
        });
      }

      getLeadTasks(lead)
        .filter((task) => !task.concluida && task.prazo)
        .forEach((task) => {
          const taskStart = parseDate(task.prazo, '08:00');

          if (!taskStart) return;

          items.push({
            id: `crm-task-${lead.id}-${task.id}`,
            title: task.titulo,
            category: 'Tarefa',
            start: taskStart,
            end: new Date(taskStart.getTime() + 30 * 60000),
            allDay: false,
            location: lead.cidade || '',
            description: (
              `${lead.nome || 'Lead sem nome'} · `
              + `${task.responsavel || 'Sem responsável'}`
            ),
            sourceType: 'crm',
            origem: 'crm',
            leadId: lead.id,
            lead,
            task,
            isManual: false,
            color: categoryColors.Tarefa,
          });
        });

      const history = Array.isArray(lead.historico)
        ? lead.historico
        : [];

      history
        .filter((item) => (
          item?.tipo === 'contato'
          && String(item.resultado || '')
            .toLowerCase()
            .includes('reuniao')
        ))
        .forEach((item) => {
          const meetingDate = item.proximoFollowup || item.data;
          const meetingStart = parseDate(meetingDate, '10:00');

          if (!meetingStart) return;

          items.push({
            id: `crm-meeting-${lead.id}-${item.id || item.data}`,
            title: `Reunião — ${lead.nome || 'Lead sem nome'}`,
            category: 'Reunião',
            start: meetingStart,
            end: new Date(meetingStart.getTime() + 60 * 60000),
            allDay: false,
            location: lead.cidade || '',
            description: item.descricao || 'Reunião comercial',
            sourceType: 'crm',
            origem: 'crm',
            leadId: lead.id,
            lead,
            isManual: false,
            color: categoryColors.Reunião,
          });
        });
    });

    return items;
  }, [studio.leads]);

  const manualCalendarEvents = useMemo(() => (
    manualEvents
      .map((event) => {
        const start = parseDate(
          event.startDate,
          event.allDay ? '00:00' : event.startTime,
        );

        if (!start) return null;

        let end = parseDate(
          event.endDate || event.startDate,
          event.allDay ? '23:59' : event.endTime || event.startTime,
        );

        if (!end || end <= start) {
          end = new Date(start.getTime() + 3600000);
        }

        return {
          ...event,
          start,
          end,
          allDay: event.allDay,
          color: (
            event.color
            || categoryColors[event.category]
            || categoryColors.Outro
          ),
        };
      })
      .filter(Boolean)
  ), [manualEvents]);

  const allEvents = useMemo(() => (
    [
      ...projectEvents,
      ...crmEvents,
      ...manualCalendarEvents,
    ]
  ), [crmEvents, manualCalendarEvents, projectEvents]);

  const filteredEvents = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return allEvents.filter((event) => {
      if (
        categoryFilter
        && event.category !== categoryFilter
      ) {
        return false;
      }

      if (
        sourceFilter
        && event.sourceType !== sourceFilter
      ) {
        return false;
      }

      if (
        showOnlyToday
        && !isSameDay(event.start, new Date())
      ) {
        return false;
      }

      if (
        normalizedSearch
        && ![
          event.title,
          event.client,
          event.location,
          event.description,
          event.category,
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
  }, [
    allEvents,
    categoryFilter,
    search,
    showOnlyToday,
    sourceFilter,
  ]);

  const eventsWithTiming = useMemo(() => (
    filteredEvents.map((event) => ({
      ...event,
      timing: getEventTiming(event),
    }))
  ), [filteredEvents]);

  const upcoming = useMemo(() => (
    eventsWithTiming
      .filter((event) => event.end >= startOfDay(new Date()))
      .sort((first, second) => first.start - second.start)
      .slice(0, 30)
  ), [eventsWithTiming]);

  const summary = useMemo(() => {
    const now = new Date();

    return {
      today: eventsWithTiming.filter(
        (event) => isSameDay(event.start, now),
      ).length,
      overdue: eventsWithTiming.filter(
        (event) => event.timing === 'atrasado',
      ).length,
      upcoming: eventsWithTiming.filter(
        (event) => event.start > endOfDay(now),
      ).length,
      month: eventsWithTiming.filter(
        (event) => isSameMonth(event.start, date),
      ).length,
    };
  }, [date, eventsWithTiming]);

  const internalAlerts = useMemo(() => (
    notificationSettings.events
      ? upcoming.filter((event) => (
        event.start - new Date()
          <= notificationSettings.eventLeadHours * 3600000
        && event.start >= new Date()
      ))
      : []
  ), [
    notificationSettings.eventLeadHours,
    notificationSettings.events,
    upcoming,
  ]);

  const groupedList = useMemo(() => {
    const groups = new Map();

    upcoming.forEach((event) => {
      const key = format(event.start, 'yyyy-MM-dd');

      if (!groups.has(key)) {
        groups.set(key, []);
      }

      groups.get(key).push(event);
    });

    return [...groups.entries()];
  }, [upcoming]);

  const persistManual = (next) => {
    setManualEvents(next);
    writeStorage(STORAGE_KEYS.agendaEvents, next);
  };

  const saveManual = (draft) => {
    const record = {
      ...draft,
      id: draft.id || createId('manual-event'),
      sourceType: 'manual',
      origem: 'manual',
      isManual: true,
      updatedAt: new Date().toISOString(),
      createdAt: draft.createdAt || new Date().toISOString(),
    };

    persistManual(
      draft.id
        ? manualEvents.map((item) => (
          item.id === draft.id ? record : item
        ))
        : [record, ...manualEvents],
    );

    setEditing(null);
    setSelected(null);
    setMessage(
      draft.id
        ? 'Evento atualizado.'
        : 'Evento criado com sucesso.',
    );
  };

  const removeManual = (event) => {
    if (!window.confirm(`Excluir o evento “${event.title}”?`)) {
      return;
    }

    persistManual(
      manualEvents.filter((item) => item.id !== event.id),
    );

    setSelected(null);
    setMessage('Evento excluído.');
  };

  const duplicateManual = (event) => {
    const copy = {
      ...event,
      id: createId('manual-event'),
      title: `${event.title} (cópia)`,
      createdAt: new Date().toISOString(),
    };

    delete copy.start;
    delete copy.end;

    persistManual([copy, ...manualEvents]);
    setSelected(null);
    setMessage('Evento duplicado.');
  };

  const openNew = (slot) => {
    const selectedDate = slot?.start || date;

    setEditing({
      ...emptyEvent,
      startDate: format(selectedDate, 'yyyy-MM-dd'),
      endDate: format(selectedDate, 'yyyy-MM-dd'),
      reminder: String(
        notificationSettings.eventLeadHours || 24,
      ),
    });
  };

  const clearFilters = () => {
    setSearch('');
    setCategoryFilter('');
    setSourceFilter('');
    setShowOnlyToday(false);
  };

  const calendarView = view === 'list'
    ? 'month'
    : view;

  return (
    <section className="agenda-page">
      <header className="agenda-header">
        <div>
          <span>Agenda integrada</span>
          <h1>
            {format(date, "MMMM 'de' yyyy", {
              locale: ptBR,
            })}
          </h1>
          <p>
            Projetos, follow-ups, tarefas e compromissos em uma única agenda.
          </p>
        </div>

        <button
          className="agenda-primary"
          onClick={() => openNew()}
        >
          <CalendarPlus />
          Novo evento
        </button>
      </header>

      {message && (
        <div className="agenda-message" role="status">
          {message}
        </div>
      )}

      {internalAlerts.length > 0 && (
        <div className="agenda-alert">
          <AlertTriangle />
          {internalAlerts.length} compromisso(s) próximo(s) dentro da antecedência configurada.
        </div>
      )}

      <div className="agenda-summary-grid">
        <SummaryCard
          label="Hoje"
          value={summary.today}
          icon={<CalendarDays />}
          tone="gold"
          onClick={() => setShowOnlyToday(true)}
        />

        <SummaryCard
          label="Atrasados"
          value={summary.overdue}
          icon={<AlertTriangle />}
          tone="red"
        />

        <SummaryCard
          label="Próximos"
          value={summary.upcoming}
          icon={<Clock3 />}
          tone="blue"
        />

        <SummaryCard
          label="Neste mês"
          value={summary.month}
          icon={<CheckCircle2 />}
          tone="green"
        />
      </div>

      <div className="agenda-filters">
        <label className="agenda-search">
          <Search />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar evento, cliente, local..."
          />
        </label>

        <label>
          <Filter />
          <select
            value={categoryFilter}
            onChange={(event) => {
              setCategoryFilter(event.target.value);
            }}
          >
            <option value="">Todas as categorias</option>

            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>

        <label>
          <ListFilter />
          <select
            value={sourceFilter}
            onChange={(event) => {
              setSourceFilter(event.target.value);
            }}
          >
            <option value="">Todas as origens</option>
            <option value="manual">Manual</option>
            <option value="trabalho">Projetos</option>
            <option value="crm">CRM</option>
          </select>
        </label>

        <button
          type="button"
          className={showOnlyToday ? 'active' : ''}
          onClick={() => setShowOnlyToday((current) => !current)}
        >
          Somente hoje
        </button>

        {(search
          || categoryFilter
          || sourceFilter
          || showOnlyToday) && (
          <button
            type="button"
            className="agenda-clear"
            onClick={clearFilters}
          >
            Limpar filtros
          </button>
        )}
      </div>

      <div className="agenda-controls">
        <div>
          {[
            ['month', 'Mês'],
            ['week', 'Semana'],
            ['day', 'Dia'],
            ['list', 'Lista'],
          ].map(([item, label]) => (
            <button
              key={item}
              className={view === item ? 'active' : ''}
              onClick={() => setView(item)}
            >
              {label}
            </button>
          ))}
        </div>

        <div>
          <button
            onClick={() => setDate(subMonths(date, 1))}
            aria-label="Mês anterior"
          >
            <ChevronLeft />
          </button>

          <button onClick={() => setDate(new Date())}>
            Hoje
          </button>

          <button
            onClick={() => setDate(addMonths(date, 1))}
            aria-label="Próximo mês"
          >
            <ChevronRight />
          </button>
        </div>
      </div>

      <div className="agenda-legend">
        {[
          ['trabalho', 'Projetos', '#c9a06c'],
          ['crm', 'CRM', '#60a5fa'],
          ['manual', 'Manual', '#aa88b5'],
        ].map(([key, label, color]) => (
          <span key={key}>
            <i style={{ background: color }} />
            {label}
          </span>
        ))}
      </div>

      {view === 'list' ? (
        <EventList
          groups={groupedList}
          onSelect={setSelected}
        />
      ) : (
        <div className="agenda-calendar">
          <Calendar
            localizer={localizer}
            culture="pt-BR"
            events={filteredEvents}
            date={date}
            view={calendarView}
            onNavigate={setDate}
            onView={setView}
            startAccessor="start"
            endAccessor="end"
            selectable
            onSelectSlot={openNew}
            onSelectEvent={setSelected}
            components={{
              event: EventCard,
            }}
            formats={{
              weekdayFormat: (value) => (
                format(value, 'EEE', {
                  locale: ptBR,
                }).toUpperCase()
              ),
            }}
            eventPropGetter={(event) => ({
              style: {
                backgroundColor: `${event.color}22`,
                borderColor: event.color,
                color: event.color,
              },
            })}
          />
        </div>
      )}

      {selected && (
        <EventDetails
          event={selected}
          onClose={() => setSelected(null)}
          onEdit={() => {
            setEditing({
              ...selected,
              startDate: (
                selected.startDate
                || format(selected.start, 'yyyy-MM-dd')
              ),
              endDate: (
                selected.endDate
                || format(selected.end, 'yyyy-MM-dd')
              ),
            });
          }}
          onDelete={() => removeManual(selected)}
          onDuplicate={() => duplicateManual(selected)}
          onNavigate={navigate}
        />
      )}

      {editing && (
        <EventForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={saveManual}
        />
      )}
    </section>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  tone,
  onClick,
}) {
  return (
    <button
      type="button"
      className={`agenda-summary-card ${tone}`}
      onClick={onClick}
    >
      <span>{icon}</span>

      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </button>
  );
}

function EventCard({ event }) {
  return (
    <div className="agenda-event">
      <strong>{event.title}</strong>

      {!event.allDay && (
        <span>{format(event.start, 'HH:mm')}</span>
      )}
    </div>
  );
}

function EventList({
  groups,
  onSelect,
}) {
  return (
    <div className="agenda-list">
      {groups.map(([dateKey, events]) => {
        const groupDate = parseDate(dateKey);

        return (
          <section key={dateKey}>
            <header>
              <strong>
                {groupDate
                  ? format(groupDate, "EEEE, dd 'de' MMMM", {
                    locale: ptBR,
                  })
                  : dateKey}
              </strong>

              <span>{events.length} compromisso(s)</span>
            </header>

            {events.map((event) => (
              <button
                key={event.id}
                onClick={() => onSelect(event)}
              >
                <span
                  className="agenda-dot"
                  style={{ background: event.color }}
                />

                <div>
                  <strong>{event.title}</strong>

                  <span>
                    {event.allDay
                      ? 'Dia inteiro'
                      : format(event.start, 'HH:mm')}
                    {' · '}
                    {event.location || 'Sem local'}
                    {' · '}
                    {sourceLabels[event.sourceType] || event.sourceType}
                  </span>
                </div>

                <span className={`agenda-timing ${event.timing}`}>
                  {event.timing === 'hoje'
                    ? 'Hoje'
                    : event.timing === 'atrasado'
                      ? 'Atrasado'
                      : 'Próximo'}
                </span>
              </button>
            ))}
          </section>
        );
      })}

      {!groups.length && (
        <p>Nenhum próximo evento.</p>
      )}
    </div>
  );
}

function EventDetails({
  event,
  onClose,
  onEdit,
  onDelete,
  onDuplicate,
  onNavigate,
}) {
  return (
    <div
      className="agenda-overlay"
      onMouseDown={(currentEvent) => {
        if (currentEvent.target === currentEvent.currentTarget) {
          onClose();
        }
      }}
    >
      <article className="agenda-modal agenda-details">
        <header>
          <div>
            <span>
              {sourceLabels[event.sourceType] || event.sourceType}
            </span>

            <h2>{event.title}</h2>
          </div>

          <button onClick={onClose} aria-label="Fechar">
            <X />
          </button>
        </header>

        <div className="agenda-details-grid">
          <InfoBlock
            label="Data"
            value={
              `${format(event.start, 'dd/MM/yyyy', {
                locale: ptBR,
              })}${
                event.allDay
                  ? ''
                  : ` · ${format(event.start, 'HH:mm')}–${format(event.end, 'HH:mm')}`
              }`
            }
          />

          <InfoBlock
            label="Categoria"
            value={event.category}
          />

          <InfoBlock
            label="Local"
            value={event.location || 'Não informado'}
            icon={<MapPin />}
          />

          <InfoBlock
            label="Origem"
            value={sourceLabels[event.sourceType] || event.sourceType}
          />

          {event.status && (
            <InfoBlock
              label="Status"
              value={event.status}
            />
          )}
        </div>

        {event.description && (
          <div className="agenda-description">
            {event.description}
          </div>
        )}

        {!event.isManual && (
          <div className="agenda-source-note">
            Este compromisso foi criado automaticamente a partir de{' '}
            {event.sourceType === 'crm'
              ? 'um lead do CRM.'
              : 'um projeto.'}
          </div>
        )}

        <footer>
          {event.isManual ? (
            <>
              <button onClick={onEdit}>
                <Pencil />
                Editar
              </button>

              <button onClick={onDuplicate}>
                <Copy />
                Duplicar
              </button>

              <button className="danger" onClick={onDelete}>
                <Trash2 />
                Excluir
              </button>
            </>
          ) : (
            <>
              {event.sourceType === 'trabalho' && (
                <button onClick={() => onNavigate('/projetos')}>
                  <ExternalLink />
                  Abrir projeto
                </button>
              )}

              {event.clientId && (
                <button onClick={() => onNavigate('/clientes')}>
                  <ExternalLink />
                  Abrir cliente
                </button>
              )}

              {event.sourceType === 'crm' && (
                <button onClick={() => onNavigate('/crm')}>
                  <ExternalLink />
                  Abrir CRM
                </button>
              )}
            </>
          )}
        </footer>
      </article>
    </div>
  );
}

function InfoBlock({
  label,
  value,
  icon,
}) {
  return (
    <div className="agenda-info-block">
      <small>{label}</small>
      <strong>
        {icon}
        {value}
      </strong>
    </div>
  );
}

function EventForm({
  initial,
  onClose,
  onSave,
}) {
  const [draft, setDraft] = useState(initial);

  const update = (key, value) => {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const submit = (event) => {
    event.preventDefault();

    onSave({
      ...draft,
      endDate: draft.endDate || draft.startDate,
      color: (
        draft.color
        || categoryColors[draft.category]
      ),
    });
  };

  return (
    <div className="agenda-overlay">
      <form
        className="agenda-modal agenda-form"
        onSubmit={submit}
      >
        <header>
          <h2>{draft.id ? 'Editar evento' : 'Novo evento'}</h2>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X />
          </button>
        </header>

        <label>
          Título
          <input
            required
            value={draft.title}
            onChange={(event) => {
              update('title', event.target.value);
            }}
          />
        </label>

        <div className="agenda-form-grid">
          <label>
            Categoria
            <select
              value={draft.category}
              onChange={(event) => {
                update('category', event.target.value);
                update(
                  'color',
                  categoryColors[event.target.value],
                );
              }}
            >
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>

          <label>
            Cor
            <input
              type="color"
              value={draft.color}
              onChange={(event) => {
                update('color', event.target.value);
              }}
            />
          </label>

          <label>
            Data inicial
            <input
              required
              type="date"
              value={draft.startDate}
              onChange={(event) => {
                update('startDate', event.target.value);
              }}
            />
          </label>

          <label>
            Hora inicial
            <input
              type="time"
              disabled={draft.allDay}
              value={draft.startTime}
              onChange={(event) => {
                update('startTime', event.target.value);
              }}
            />
          </label>

          <label>
            Data final
            <input
              type="date"
              min={draft.startDate}
              value={draft.endDate}
              onChange={(event) => {
                update('endDate', event.target.value);
              }}
            />
          </label>

          <label>
            Hora final
            <input
              type="time"
              disabled={draft.allDay}
              value={draft.endTime}
              onChange={(event) => {
                update('endTime', event.target.value);
              }}
            />
          </label>

          <label>
            Lembrete (horas)
            <input
              type="number"
              min="0"
              value={draft.reminder}
              onChange={(event) => {
                update('reminder', event.target.value);
              }}
            />
          </label>

          <label>
            Recorrência
            <select
              value={draft.recurrence}
              onChange={(event) => {
                update('recurrence', event.target.value);
              }}
            >
              <option value="none">Não repetir</option>
              <option value="weekly">Semanal</option>
              <option value="monthly">Mensal</option>
            </select>
          </label>
        </div>

        <label className="agenda-check">
          <input
            type="checkbox"
            checked={draft.allDay}
            onChange={(event) => {
              update('allDay', event.target.checked);
            }}
          />
          Evento de dia inteiro
        </label>

        <label>
          Local
          <input
            value={draft.location}
            onChange={(event) => {
              update('location', event.target.value);
            }}
          />
        </label>

        <label>
          Descrição
          <textarea
            rows="3"
            value={draft.description}
            onChange={(event) => {
              update('description', event.target.value);
            }}
          />
        </label>

        <label>
          Observações
          <textarea
            rows="2"
            value={draft.notes}
            onChange={(event) => {
              update('notes', event.target.value);
            }}
          />
        </label>

        <footer>
          <button type="button" onClick={onClose}>
            Cancelar
          </button>

          <button
            className="agenda-primary"
            type="submit"
          >
            Salvar evento
          </button>
        </footer>
      </form>
    </div>
  );
}