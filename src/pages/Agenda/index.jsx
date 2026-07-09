import { useEffect, useMemo, useState } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, getDay, parse, startOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { CalendarDays, CheckSquare, ChevronLeft, ChevronRight, DollarSign, MapPin, Package, Phone, Users } from 'lucide-react';
import { formatMoney, getStudioData } from '../../utils/integratedData';

const locales = { 'pt-BR': ptBR };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });

const formats = {
  weekdayFormat: (date) => ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'][date.getDay()],
};

const eventColor = { bg: 'rgba(201, 160, 108, 0.14)', text: '#D9B47C', dot: '#C9A06C', border: 'rgba(201, 160, 108, 0.35)' };

const toCalendarDate = (project, fallbackHour = 14) => {
  if (!project.data) return new Date();
  const [year, month, day] = project.data.split('-').map(Number);
  const hour = Number(project.horario?.slice(0, 2) || fallbackHour);
  return new Date(year, month - 1, day, hour, 0);
};

export default function Agenda() {
  const [studio, setStudio] = useState(() => getStudioData());
  const [dataAtual, setDataAtual] = useState(new Date());
  const [viewAtual, setViewAtual] = useState('month');
  const [selectedProject, setSelectedProject] = useState(null);

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

  const events = useMemo(() => studio.projects.map((project) => {
    const start = toCalendarDate(project);
    const end = new Date(start);
    end.setHours(start.getHours() + 2);
    return {
      id: project.id,
      title: project.tipoServico,
      client: project.clienteNome,
      start,
      end,
      project,
    };
  }), [studio.projects]);

  const weekLimit = new Date();
  weekLimit.setDate(weekLimit.getDate() + 7);
  const weekEvents = events.filter((event) => event.start >= new Date() && event.start <= weekLimit).sort((a, b) => a.start - b.start);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', gap: '24px' }}>
      <div className="agenda-topo" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ color: 'var(--text-main)', fontSize: '1.8rem', fontWeight: '600' }}>Agenda</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Projetos, eventos e entregas conectados automaticamente.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            {['month', 'week', 'day'].map((view) => (
              <button key={view} onClick={() => setViewAtual(view)} style={{ padding: '8px 16px', border: 'none', background: viewAtual === view ? 'rgba(255,255,255,0.05)' : 'transparent', color: viewAtual === view ? 'var(--color-highlight)' : 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '500' }}>
                {view === 'month' ? 'Mes' : view === 'week' ? 'Semana' : 'Dia'}
              </button>
            ))}
          </div>
          <button onClick={() => setDataAtual(new Date())} className="sf-secondary-button">Hoje</button>
          <button onClick={() => setDataAtual(new Date(dataAtual.getFullYear(), dataAtual.getMonth() - 1, 1))} className="sf-secondary-button"><ChevronLeft size={16} /></button>
          <button onClick={() => setDataAtual(new Date(dataAtual.getFullYear(), dataAtual.getMonth() + 1, 1))} className="sf-secondary-button"><ChevronRight size={16} /></button>
        </div>
      </div>

      <div className="agenda-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(300px, 360px)', gap: '24px', alignItems: 'start' }}>
        <div className="glass calendar-wrapper" style={{ height: '680px', padding: '16px', borderRadius: 'var(--radius-md)', minWidth: 0 }}>
          <Calendar
            localizer={localizer}
            events={events}
            date={dataAtual}
            view={viewAtual}
            onNavigate={setDataAtual}
            onView={setViewAtual}
            startAccessor="start"
            endAccessor="end"
            formats={formats}
            style={{ height: '100%', width: '100%' }}
            components={{ event: EventCard }}
            onSelectEvent={(event) => setSelectedProject(event.project)}
          />
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
          {selectedProject ? <ProjectPanel project={selectedProject} /> : (
            <div className="sf-card">
              <h3>Eventos da semana</h3>
              {weekEvents.length === 0 && <p className="sf-muted">Nenhum projeto nos proximos 7 dias.</p>}
              {weekEvents.map((event) => (
                <button key={event.id} onClick={() => setSelectedProject(event.project)} className="sf-account" style={{ width: '100%', marginBottom: '8px' }}>
                  <strong>{event.client}</strong>
                  <span>{format(event.start, 'dd/MM/yyyy')} - {event.title}</span>
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>

      <style>{`
        @media (max-width: 1150px) { .agenda-layout { grid-template-columns: 1fr !important; } }
        @media (max-width: 768px) { .calendar-wrapper { height: 540px !important; } }
      `}</style>
    </div>
  );
}

function EventCard({ event }) {
  return (
    <div style={{ backgroundColor: eventColor.bg, border: `1px solid ${eventColor.border}`, borderRadius: '6px', padding: '4px 8px', height: '100%', width: '100%', boxSizing: 'border-box', cursor: 'pointer', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: eventColor.text, fontSize: '0.8rem', fontWeight: '600', width: '100%' }}>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: eventColor.dot, flexShrink: 0 }} />
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{event.client}</span>
      </div>
      <div style={{ color: eventColor.text, opacity: 0.82, fontSize: '0.72rem', marginTop: '2px', textAlign: 'center' }}>{event.title}</div>
    </div>
  );
}

function ProjectPanel({ project }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="sf-card">
        <div className="metric-label"><CalendarDays size={18} /> Projeto</div>
        <strong>{project.clienteNome}</strong>
        <p className="sf-muted">{project.tipoServico} - {project.data || 'Sem data'}</p>
      </div>
      <Info icon={Phone} label="Cliente" value={`${project.cliente?.telefone || project.cliente?.whatsapp || '-'} | ${project.cliente?.instagram || project.cliente?.cidade || '-'}`} />
      <Info icon={MapPin} label="Local" value={project.local || 'Local nao informado'} />
      <Info icon={DollarSign} label="Financeiro" value={`${formatMoney(project.valorRecebido)} recebidos de ${formatMoney(project.valorContratado)} | Saldo ${formatMoney(project.saldoRestante)}`} />
      <Info icon={CheckSquare} label="Checklist" value={`${(project.checklist || []).filter((item) => item.done).length}/${(project.checklist || []).length} tarefas concluidas`} />
      <Info icon={Users} label="Equipe" value={(project.equipe || []).join(', ') || 'Equipe nao definida'} />
      <Info icon={Package} label="Equipamentos" value={project.equipamentosDetalhados?.map((item) => item.nome).join(', ') || 'Nenhum equipamento vinculado'} />
      <div className="sf-card">
        <h3>Observacoes</h3>
        <p className="sf-muted">{project.observacoes || 'Sem observacoes.'}</p>
      </div>
    </div>
  );
}

function Info({ icon: Icon, label, value }) {
  return (
    <div className="sf-card">
      <div className="metric-label"><Icon size={17} /> {label}</div>
      <p style={{ color: 'var(--text-main)', marginTop: '8px', lineHeight: 1.5 }}>{value}</p>
    </div>
  );
}
