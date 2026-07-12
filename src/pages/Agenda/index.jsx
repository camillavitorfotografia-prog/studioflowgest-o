import { useEffect, useMemo, useState } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { addMonths, format, getDay, parse, startOfWeek, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import { CalendarPlus, ChevronLeft, ChevronRight, Copy, ExternalLink, Pencil, Trash2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getDbStudioData, subscribeDbUpdates } from '../../utils/dbData';
import { createId, readStorage, STORAGE_KEYS, writeStorage } from '../../utils/storage';
import { loadSettings } from '../../utils/settings';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import './Agenda.css';

const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales: { 'pt-BR': ptBR } });
const categories = ['Trabalho', 'Casamento', 'Ensaio', 'Reunião', 'Entrega', 'Follow-up', 'Pessoal', 'Congresso', 'Viagem', 'Compromisso', 'Outro'];
const categoryColors = { Trabalho:'#c9a06c',Casamento:'#d39b8c',Ensaio:'#9d8fd0',Reunião:'#70a5b8',Entrega:'#72ad83','Follow-up':'#d0a25b',Pessoal:'#aa88b5',Congresso:'#5da2a6',Viagem:'#6590c6',Compromisso:'#be7f75',Outro:'#888' };
const emptyEvent = { title:'',category:'Pessoal',startDate:'',startTime:'',endDate:'',endTime:'',allDay:true,location:'',description:'',color:'#aa88b5',reminder:'',recurrence:'none',notes:'' };

const parseDate = (value, time = '00:00') => {
  if (!value) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)?.slice(1).reverse().join('-');
  if (!iso) return null;
  const [year, month, day] = iso.split('-').map(Number);
  const [hour, minute] = String(time || '00:00').split(':').map(Number);
  const date = new Date(year, month - 1, day, hour || 0, minute || 0);
  return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeManual = (item) => {
  if (item.sourceType && item.sourceType !== 'manual') return null;
  if (item.isProjectIntegration || item.projectId && !item.isManual) return null;
  const start = parseDate(item.startDate || item.date || String(item.start || '').slice(0,10), item.startTime || item.time);
  if (!start) return null;
  const end = parseDate(item.endDate || item.startDate || item.date || String(item.end || '').slice(0,10), item.endTime || item.startTime || item.time) || new Date(start.getTime() + 3600000);
  return { ...emptyEvent, ...item, id:item.id || createId('manual-event'), title:item.title || 'Evento', startDate:format(start,'yyyy-MM-dd'), endDate:format(end,'yyyy-MM-dd'), sourceType:'manual', origem:'manual', isManual:true };
};

export default function Agenda() {
  const navigate = useNavigate();
  const notificationSettings = loadSettings().notifications;
  const [studio,setStudio]=useState({projects:[]});
  const [manualEvents,setManualEvents]=useState(()=>readStorage(STORAGE_KEYS.agendaEvents,[]).map(normalizeManual).filter(Boolean));
  const [date,setDate]=useState(new Date());
  const [view,setView]=useState('month');
  const [selected,setSelected]=useState(null);
  const [editing,setEditing]=useState(null);
  const [message,setMessage]=useState('');

  useEffect(()=>{ let active=true; const load=async()=>{const data=await getDbStudioData();if(active)setStudio(data)}; void load(); window.addEventListener('focus',load); const unsubscribe=subscribeDbUpdates(load); return()=>{active=false;window.removeEventListener('focus',load);unsubscribe()};},[]);
  useEffect(()=>{const sync=(event)=>{if(event?.detail?.key&&event.detail.key!==STORAGE_KEYS.agendaEvents)return;setManualEvents(readStorage(STORAGE_KEYS.agendaEvents,[]).map(normalizeManual).filter(Boolean))};window.addEventListener('sf_storage_update',sync);window.addEventListener('storage',sync);return()=>{window.removeEventListener('sf_storage_update',sync);window.removeEventListener('storage',sync)}},[]);

  const automaticEvents=useMemo(()=>{
    const unique=new Map();
    (studio.projects||[]).forEach((project)=>{const start=parseDate(project.data||project.data_trabalho||project.dataTrabalho,project.horario);if(!start)return;const sourceId=String(project.id||project.projectId||project.clienteId);if(!sourceId)return;const end=new Date(start.getTime()+(project.duracaoHoras||2)*3600000);const service=project.tipoServico||project.tipo_servico||project.tipoTrabalho||'Trabalho';const client=project.clienteNome||project.cliente?.nome||'Cliente';unique.set(`project-${sourceId}`,{id:`project-${sourceId}`,title:`${service} — ${client}`,client,category:service,start,end,allDay:!project.horario,location:project.local||project.cliente?.cidade||'',description:project.observacoes||'',status:project.status,sourceType:'trabalho',origem:'trabalho',sourceId,projectId:project.id,clientId:project.clienteId||project.clientId,project,isManual:false,color:categoryColors[service]||categoryColors.Trabalho});});
    return [...unique.values()];
  },[studio.projects]);
  const manualCalendarEvents=useMemo(()=>manualEvents.map((event)=>{const start=parseDate(event.startDate,event.allDay?'00:00':event.startTime);let end=parseDate(event.endDate||event.startDate,event.allDay?'23:59':event.endTime||event.startTime);if(end<=start)end=new Date(start.getTime()+3600000);return{...event,start,end,allDay:event.allDay,color:event.color||categoryColors[event.category]||categoryColors.Outro}}),[manualEvents]);
  const events=useMemo(()=>[...automaticEvents,...manualCalendarEvents],[automaticEvents,manualCalendarEvents]);
  const upcoming=useMemo(()=>events.filter((event)=>event.end>=new Date()).sort((a,b)=>a.start-b.start).slice(0,12),[events]);
  const internalAlerts=useMemo(()=>notificationSettings.events?upcoming.filter((event)=>event.start-new Date()<=notificationSettings.eventLeadHours*3600000&&event.start>=new Date()):[],[notificationSettings.eventLeadHours,notificationSettings.events,upcoming]);
  const persistManual=(next)=>{setManualEvents(next);writeStorage(STORAGE_KEYS.agendaEvents,next)};
  const saveManual=(draft)=>{const record={...draft,id:draft.id||createId('manual-event'),sourceType:'manual',origem:'manual',isManual:true,updatedAt:new Date().toISOString(),createdAt:draft.createdAt||new Date().toISOString()};persistManual(draft.id?manualEvents.map((item)=>item.id===draft.id?record:item):[record,...manualEvents]);setEditing(null);setSelected(null);setMessage(draft.id?'Evento atualizado.':'Evento criado com sucesso.');};
  const removeManual=(event)=>{if(!window.confirm(`Excluir o evento “${event.title}”?`))return;persistManual(manualEvents.filter((item)=>item.id!==event.id));setSelected(null);setMessage('Evento excluído.');};
  const duplicateManual=(event)=>{const copy={...event,id:createId('manual-event'),title:`${event.title} (cópia)`,createdAt:new Date().toISOString()};delete copy.start;delete copy.end;persistManual([copy,...manualEvents]);setSelected(null);setMessage('Evento duplicado.');};
  const openNew=(slot)=>setEditing({...emptyEvent,startDate:slot?.start?format(slot.start,'yyyy-MM-dd'):format(date,'yyyy-MM-dd'),endDate:slot?.start?format(slot.start,'yyyy-MM-dd'):format(date,'yyyy-MM-dd'),reminder:String(notificationSettings.eventLeadHours||24)});
  const calendarView=view==='list'?'month':view;

  return <section className="agenda-page">
    <header className="agenda-header"><div><span>Agenda integrada</span><h1>{format(date,"MMMM 'de' yyyy",{locale:ptBR})}</h1><p>Trabalhos e compromissos em uma única linha do tempo.</p></div><button className="agenda-primary" onClick={()=>openNew()}><CalendarPlus/>Novo evento</button></header>
    {message&&<div className="agenda-message" role="status">{message}</div>}{internalAlerts.length>0&&<div className="agenda-alert">{internalAlerts.length} evento(s) dentro da antecedência configurada.</div>}
    <div className="agenda-controls"><div>{['month','week','day','list'].map((item)=><button key={item} className={view===item?'active':''} onClick={()=>setView(item)}>{item==='month'?'Mês':item==='week'?'Semana':item==='day'?'Dia':'Lista'}</button>)}</div><div><button onClick={()=>setDate(subMonths(date,1))} aria-label="Mês anterior"><ChevronLeft/></button><button onClick={()=>setDate(new Date())}>Hoje</button><button onClick={()=>setDate(addMonths(date,1))} aria-label="Próximo mês"><ChevronRight/></button></div></div>
    {view==='list'?<EventList events={upcoming} onSelect={setSelected}/>:<div className="agenda-calendar"><Calendar localizer={localizer} culture="pt-BR" events={events} date={date} view={calendarView} onNavigate={setDate} onView={setView} startAccessor="start" endAccessor="end" selectable onSelectSlot={openNew} onSelectEvent={setSelected} components={{event:EventCard}} formats={{weekdayFormat:(value)=>format(value,'EEE',{locale:ptBR}).toUpperCase()}} eventPropGetter={(event)=>({style:{backgroundColor:`${event.color}22`,borderColor:event.color,color:event.color}})} /></div>}
    {selected&&<EventDetails event={selected} onClose={()=>setSelected(null)} onEdit={()=>setEditing({...selected,startDate:selected.startDate||format(selected.start,'yyyy-MM-dd'),endDate:selected.endDate||format(selected.end,'yyyy-MM-dd')})} onDelete={()=>removeManual(selected)} onDuplicate={()=>duplicateManual(selected)} onNavigate={navigate}/>} 
    {editing&&<EventForm initial={editing} onClose={()=>setEditing(null)} onSave={saveManual}/>} 
  </section>;
}

function EventCard({event}){return <div className="agenda-event"><strong>{event.title}</strong>{!event.allDay&&<span>{format(event.start,'HH:mm')}</span>}</div>}
function EventList({events,onSelect}){return <div className="agenda-list">{events.map((event)=><button key={event.id} onClick={()=>onSelect(event)}><span className="agenda-dot" style={{background:event.color}}/><div><strong>{event.title}</strong><span>{format(event.start,"dd/MM/yyyy 'às' HH:mm")} · {event.location||'Sem local'}</span></div></button>)}{!events.length&&<p>Nenhum próximo evento.</p>}</div>}
function EventDetails({event,onClose,onEdit,onDelete,onDuplicate,onNavigate}){return <div className="agenda-overlay" onMouseDown={(e)=>e.target===e.currentTarget&&onClose()}><article className="agenda-modal"><header><div><span>{event.sourceType==='manual'?'Evento manual':'Evento automático'}</span><h2>{event.title}</h2></div><button onClick={onClose} aria-label="Fechar"><X/></button></header><dl><div><dt>Data</dt><dd>{format(event.start,'dd/MM/yyyy',{locale:ptBR})}{!event.allDay&&` · ${format(event.start,'HH:mm')}–${format(event.end,'HH:mm')}`}</dd></div><div><dt>Categoria</dt><dd>{event.category}</dd></div><div><dt>Local</dt><dd>{event.location||'Não informado'}</dd></div><div><dt>Origem</dt><dd>{event.sourceType}</dd></div>{event.status&&<div><dt>Status</dt><dd>{event.status}</dd></div>}</dl>{event.description&&<p>{event.description}</p>}{!event.isManual&&<div className="agenda-source-note">Este evento foi criado automaticamente a partir de um trabalho.</div>}<footer>{event.isManual?<><button onClick={onEdit}><Pencil/>Editar</button><button onClick={onDuplicate}><Copy/>Duplicar</button><button className="danger" onClick={onDelete}><Trash2/>Excluir</button></>:<><button onClick={()=>onNavigate('/projetos')}><ExternalLink/>Abrir trabalho</button>{event.clientId&&<button onClick={()=>onNavigate('/clientes')}><ExternalLink/>Abrir cliente</button>}</>}</footer></article></div>}
function EventForm({initial,onClose,onSave}){const[draft,setDraft]=useState(initial);const update=(key,value)=>setDraft((current)=>({...current,[key]:value}));const submit=(e)=>{e.preventDefault();onSave({...draft,endDate:draft.endDate||draft.startDate,color:draft.color||categoryColors[draft.category]})};return <div className="agenda-overlay"><form className="agenda-modal agenda-form" onSubmit={submit}><header><h2>{draft.id?'Editar evento':'Novo evento'}</h2><button type="button" onClick={onClose} aria-label="Fechar"><X/></button></header><label>Título<input required value={draft.title} onChange={(e)=>update('title',e.target.value)}/></label><div className="agenda-form-grid"><label>Categoria<select value={draft.category} onChange={(e)=>{update('category',e.target.value);update('color',categoryColors[e.target.value])}}>{categories.map((item)=><option key={item}>{item}</option>)}</select></label><label>Cor<input type="color" value={draft.color} onChange={(e)=>update('color',e.target.value)}/></label><label>Data inicial<input required type="date" value={draft.startDate} onChange={(e)=>update('startDate',e.target.value)}/></label><label>Hora inicial<input type="time" disabled={draft.allDay} value={draft.startTime} onChange={(e)=>update('startTime',e.target.value)}/></label><label>Data final<input type="date" min={draft.startDate} value={draft.endDate} onChange={(e)=>update('endDate',e.target.value)}/></label><label>Hora final<input type="time" disabled={draft.allDay} value={draft.endTime} onChange={(e)=>update('endTime',e.target.value)}/></label><label>Lembrete (horas)<input type="number" min="0" value={draft.reminder} onChange={(e)=>update('reminder',e.target.value)}/></label><label>Recorrência<select value={draft.recurrence} onChange={(e)=>update('recurrence',e.target.value)}><option value="none">Não repetir</option><option value="weekly">Semanal</option><option value="monthly">Mensal</option></select></label></div><label className="agenda-check"><input type="checkbox" checked={draft.allDay} onChange={(e)=>update('allDay',e.target.checked)}/>Evento de dia inteiro</label><label>Local<input value={draft.location} onChange={(e)=>update('location',e.target.value)}/></label><label>Descrição<textarea rows="3" value={draft.description} onChange={(e)=>update('description',e.target.value)}/></label><label>Observações<textarea rows="2" value={draft.notes} onChange={(e)=>update('notes',e.target.value)}/></label><footer><button type="button" onClick={onClose}>Cancelar</button><button className="agenda-primary" type="submit">Salvar evento</button></footer></form></div>}
