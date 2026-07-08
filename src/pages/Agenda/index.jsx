import { useState, useEffect } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, addMonths, subMonths, startOfMonth, endOfMonth, endOfWeek, addDays, isSameMonth, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import Modal from '../../components/Modal';

const locales = { 'pt-BR': ptBR };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });

const formatosCalendario = {
  weekdayFormat: (date) => {
    const dias = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
    return dias[date.getDay()];
  },
};

const CORES_EVENTOS = {
  casamento: { bg: 'rgba(217, 119, 6, 0.15)', text: '#FBBF24', dot: '#F59E0B', border: 'rgba(245, 158, 11, 0.3)' },
  ensaio_gestante: { bg: 'rgba(5, 150, 105, 0.15)', text: '#34D399', dot: '#10B981', border: 'rgba(16, 185, 129, 0.3)' },
  ensaio_casal: { bg: 'rgba(13, 148, 136, 0.15)', text: '#5EEAD4', dot: '#14B8A6', border: 'rgba(20, 184, 166, 0.3)' },
  ensaio_familia: { bg: 'rgba(146, 64, 14, 0.15)', text: '#FCD34D', dot: '#D97706', border: 'rgba(217, 119, 6, 0.3)' },
  ensaio_feminino: { bg: 'rgba(124, 58, 237, 0.15)', text: '#A78BFA', dot: '#8B5CF6', border: 'rgba(139, 92, 246, 0.3)' },
  reuniao: { bg: 'rgba(37, 99, 235, 0.15)', text: '#93C5FD', dot: '#3B82F6', border: 'rgba(59, 130, 246, 0.3)' },
  corporativo: { bg: 'rgba(5, 150, 105, 0.15)', text: '#34D399', dot: '#10B981', border: 'rgba(16, 185, 129, 0.3)' },
};

// Função auxiliar para mapear as strings de tipo vindas dos clientes para as chaves do objeto de cores
const normalizarTipoEvento = (tipoOriginal) => {
  if (!tipoOriginal) return 'reuniao';
  const t = tipoOriginal.toLowerCase();
  if (t.includes('casamento')) return 'casamento';
  if (t.includes('gestante')) return 'ensaio_gestante';
  if (t.includes('casal')) return 'ensaio_casal';
  if (t.includes('família') || t.includes('familia')) return 'ensaio_familia';
  if (t.includes('feminino')) return 'ensaio_feminino';
  if (t.includes('corporativo')) return 'corporativo';
  return 'reuniao';
};

export default function Agenda() {
  const [dataAtual, setDataAtual] = useState(new Date(2026, 6, 17));
  const [viewAtual, setViewAtual] = useState('month');
  const [eventos, setEventos] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const estadoInicialForm = { id: null, title: '', client: '', time: '', start: new Date(), end: new Date(), tipo: 'ensaio_casal', status: 'Pendente' };
  const [formData, setFormData] = useState(estadoInicialForm);

  // EFEITO DE INTEGRAÇÃO: Carrega compromissos manuais + clientes ativos de forma dinâmica
  useEffect(() => {
    const sincronizarAgenda = () => {
      // 1. Carrega os compromissos criados na própria agenda
      const eventosManuais = JSON.parse(localStorage.getItem('meusEventosAgenda') || '[]');
      
      // 2. Carrega os clientes ativos convertidos do CRM / salvos na aba Clientes
      const clientesAtivos = JSON.parse(localStorage.getItem('cv_studio_clients') || '[]');
      
      // 3. Converte os clientes ativos no formato estrutural aceito pelo React Big Calendar
      const clientesMapeados = clientesAtivos.map(c => {
        let dataFiltro = new Date();
        if (c.dataTrabalho || c.dataEvento) {
          const dataStr = c.dataTrabalho || c.dataEvento;
          const partes = dataStr.split('-');
          if (partes.length === 3) {
            dataFiltro = new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]), 14, 0);
          } else {
            const partesBr = dataStr.split('/');
            if (partesBr.length === 3) {
              dataFiltro = new Date(parseInt(partesBr[2]), parseInt(partesBr[1]) - 1, parseInt(partesBr[0]), 14, 0);
            }
          }
        }

        const tipoChave = normalizarTipoEvento(c.tipo);

        return {
          id: `client-${c.id}`,
          title: c.tipo || 'Trabalho / Evento',
          client: c.nome,
          time: 'Horário a definir',
          start: dataFiltro,
          end: dataFiltro,
          tipo: tipoChave,
          status: 'Confirmado',
          isClientIntegration: true // Flag interna para controle
        };
      });

      // Se não houver eventos manuais salvos ainda, inicia com os iniciais fornecidos
      const baseManuais = localStorage.getItem('meusEventosAgenda') ? eventosManuais : [
        { id: 1, title: 'Ensaio Gestante', client: 'Juliana Silva', time: '09:00 - 11:00', start: new Date(2026, 6, 2, 9, 0), end: new Date(2026, 6, 2, 11, 0), tipo: 'ensaio_gestante' },
        { id: 2, title: 'Ensaio Casal', client: 'Ana e João', time: '16:00 - 18:00', start: new Date(2026, 6, 5, 16, 0), end: new Date(2026, 6, 5, 18, 0), tipo: 'ensaio_casal' },
        { id: 3, title: 'Casamento', client: 'Maria e Lucas', time: '14:00 - 23:00', start: new Date(2026, 6, 6, 14, 0), end: new Date(2026, 6, 6, 23, 0), tipo: 'casamento' },
        { id: 9, title: 'Ensaio Gestante', client: 'Beatriz Lima', time: '14:00 - 16:00', start: new Date(2026, 6, 17, 14, 0), end: new Date(2026, 6, 17, 16, 0), tipo: 'ensaio_gestante', status: 'Confirmado' },
      ];

      // Une os arrays preservando a ordenação dos dados na interface gráfica
      const unificados = [...baseManuais.map(e => ({
        ...e,
        start: new Date(e.start),
        end: new Date(e.end)
      })), ...clientesMapeados];

      setEventos(unificados);
      
      if (!localStorage.getItem('meusEventosAgenda')) {
        localStorage.setItem('meusEventosAgenda', JSON.stringify(baseManuais));
      }
    };

    sincronizarAgenda();
    window.addEventListener('focus', sincronizarAgenda);
    return () => window.removeEventListener('focus', sincronizarAgenda);
  }, []);

  const handleSelecionarData = ({ start, end }) => {
    setFormData({ ...estadoInicialForm, start, end });
    setIsModalOpen(true);
  };

  const handleSelecionarEvento = (evento) => {
    // Caso seja um evento vindo automaticamente dos clientes ativos, impede alteração direta pela agenda
    if (evento.isClientIntegration) {
      alert(`Este evento está integrado ao cadastro do cliente ativo "${evento.client}". Para editá-lo ou movê-lo de data, utilize a aba de Clientes ou o fluxo de Trabalhos.`);
      return;
    }
    setFormData(evento);
    setIsModalOpen(true);
  };

  const salvarEvento = () => {
    const eventosManuais = JSON.parse(localStorage.getItem('meusEventosAgenda') || '[]');
    let novosManuais;

    if (formData.id) {
      novosManuais = eventosManuais.map(e => e.id === formData.id ? formData : e);
    } else {
      const novoEvento = { ...formData, id: Date.now() };
      novosManuais = [...eventosManuais, novoEvento];
    }

    localStorage.setItem('meusEventosAgenda', JSON.stringify(novosManuais));
    
    // Atualiza o estado unificado imediatamente
    setEventos(prev => {
      const semEsseManual = prev.filter(e => e.id !== formData.id && !e.isClientIntegration);
      const integrados = prev.filter(e => e.isClientIntegration);
      const atualizadosManuais = formData.id 
        ? semEsseManual.map(e => e.id === formData.id ? formData : e)
        : [...semEsseManual, { ...formData, id: Date.now() }];
      return [...atualizadosManuais, ...integrados];
    });

    setIsModalOpen(false);
  };

  const excluirEvento = () => {
    const eventosManuais = JSON.parse(localStorage.getItem('meusEventosAgenda') || '[]');
    const filtrados = eventosManuais.filter(e => e.id !== formData.id);
    localStorage.setItem('meusEventosAgenda', JSON.stringify(filtrados));
    
    setEventos(eventos.filter(e => e.id !== formData.id));
    setIsModalOpen(false);
  };

  const abrirModalNovoEvento = () => {
    setFormData(estadoInicialForm);
    setIsModalOpen(true);
  };

  const irParaMesAnterior = () => setDataAtual(subMonths(dataAtual, 1));
  const irParaProximoMes = () => setDataAtual(addMonths(dataAtual, 1));
  const irParaHoje = () => setDataAtual(new Date());

  const CartaoEventoCustomizado = ({ event }) => {
    const estilo = CORES_EVENTOS[event.tipo] || CORES_EVENTOS.reuniao;
    return (
      <div style={{ 
        backgroundColor: estilo.bg, 
        border: `1px solid ${estilo.border}`,
        borderRadius: '6px', 
        padding: '4px 8px', 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justify: 'center', 
        textAlign: 'center',
        height: '100%', 
        width: '100%',
        boxSizing: 'border-box',
        cursor: 'pointer',
        overflow: 'hidden'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: estilo.text, fontSize: '0.8rem', fontWeight: '600', width: '100%' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: estilo.dot, flexShrink: 0 }}></div>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{event.client || event.title}</span>
        </div>
        <div style={{ color: estilo.text, opacity: 0.8, fontSize: '0.75rem', marginTop: '2px' }}>{event.client ? event.title : event.time}</div>
      </div>
    );
  };

  const renderizarDiasMiniCalendario = () => {
    const inicioDoMes = startOfMonth(dataAtual);
    const fimDoMes = endOfMonth(inicioDoMes);
    const dataInicial = startOfWeek(inicioDoMes);
    const dataFinal = endOfWeek(fimDoMes);
    const dias = [];
    let dia = dataInicial;

    while (dia <= dataFinal) {
      const cloneDia = dia;
      const ehMesmoMes = isSameMonth(dia, inicioDoMes);
      const ehHoje = isSameDay(dia, new Date(2026, 6, 17));

      dias.push(
        <div 
          key={dia.toString()} 
          style={{ 
            padding: '8px 0', textAlign: 'center', fontSize: '0.85rem', cursor: 'pointer',
            backgroundColor: ehHoje ? 'var(--color-highlight)' : 'transparent',
            borderRadius: ehHoje ? '50%' : '0',
            color: ehHoje ? '#111' : (ehMesmoMes ? 'var(--text-main)' : 'rgba(255,255,255,0.2)'),
            fontWeight: ehHoje ? '600' : '400'
          }}
        >
          {format(cloneDia, 'd')}
        </div>
      );
      dia = addDays(dia, 1);
    }
    return dias;
  };

  const eventosDoDia = eventos.filter(e => isSameDay(e.start, new Date(2026, 6, 17)));

  const inputStyle = { width: '100%', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '12px 16px', borderRadius: 'var(--radius-sm)', outline: 'none', fontSize: '0.95rem', marginTop: '8px' };
  const labelStyle = { color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: '500' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      
      {/* INJEÇÃO DE CSS GLOBAL E RESPONSIVO COMPLETO */}
      <style>{`
        /* --- ESTILOS NATIVOS E BORDAS DO CALENDÁRIO --- */
        .rbc-calendar, 
        .rbc-calendar *, 
        .rbc-calendar *:before, 
        .rbc-calendar *:after {
          border-color: rgba(255, 255, 255, 0.05) !important;
        }
        .rbc-today { background-color: rgba(255, 255, 255, 0.02) !important; }
        .rbc-off-range-bg { background: transparent !important; }
        .rbc-label { color: var(--text-secondary) !important; font-size: 0.8rem; }
        .rbc-header { 
          padding: 8px 0 !important; 
          font-weight: 500 !important; 
          color: var(--text-secondary) !important;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important;
        }
        .rbc-event { background: transparent !important; padding: 0 !important; border: none !important; }
        .rbc-event.rbc-selected { background: transparent !important; outline: none !important; }
        .rbc-event-label { display: none !important; }
        .rbc-event-content { height: 100%; width: 100%; }
        .rbc-allday-cell { display: none !important; }
        .rbc-time-view .rbc-allday-cell { display: none !important; }

        /* --- LAYOUT RESPONSIVO DINÂMICO --- */
        .agenda-layout {
          display: flex;
          gap: 24px;
          flex: 1;
          flex-direction: row;
          min-height: 0;
          width: 100%;
        }

        .agenda-col-principal {
          flex: 3;
          display: flex;
          flex-direction: column;
          min-width: 0;
          width: 100%;
        }

        /* FIX CRUCIAL: Garante altura constante para evitar que o grid colapse em 0px */
        .calendar-wrapper {
          height: 650px; 
          padding: 16px; 
          border-radius: var(--radius-md); 
          width: 100%;
        }

        .agenda-col-lateral {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 24px;
          min-width: 290px;
          max-width: 340px;
          width: 100%;
        }

        /* Quebra para Tablet / Telas Médias (Abaixo de 1150px) */
        @media (max-width: 1150px) {
          .agenda-layout {
            flex-direction: column;
          }
          .agenda-col-lateral {
            max-width: 100% !important;
            flex-direction: row;
            flex-wrap: wrap;
          }
          .agenda-col-lateral > div {
            flex: 1;
            min-width: 280px;
          }
        }

        /* Ajustes para Celular (Abaixo de 768px) */
        @media (max-width: 768px) {
          .calendar-wrapper {
            height: 520px; /* Reduz ligeiramente a altura no mobile para melhor usabilidade */
          }
          .agenda-topo {
            flex-direction: column;
            align-items: flex-start !important;
            gap: 16px;
          }
          .agenda-controles-topo {
            width: 100%;
            justify-content: space-between;
          }
          .agenda-col-lateral {
            flex-direction: column;
          }
        }
      `}</style>

      {/* TOPO DA AGENDA */}
      <div className="agenda-topo" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ color: 'var(--text-main)', fontSize: '1.8rem', fontWeight: '600' }}>Agenda</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Visualize seus compromissos e eventos</p>
        </div>

        <div className="agenda-controles-topo" style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            {['month', 'week', 'day'].map((view) => (
              <button key={view} onClick={() => setViewAtual(view)} style={{ padding: '8px 16px', border: 'none', background: viewAtual === view ? 'rgba(255,255,255,0.05)' : 'transparent', color: viewAtual === view ? 'var(--color-highlight)' : 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '500' }}>
                {view === 'month' ? 'Mês' : view === 'week' ? 'Semana' : 'Dia'}
              </button>
            ))}
          </div>

          <button onClick={irParaHoje} style={{ padding: '8px 16px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '500' }}>Hoje</button>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={irParaMesAnterior} style={{ padding: '8px 12px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}><ChevronLeft size={16} /></button>
            <button onClick={irParaProximoMes} style={{ padding: '8px 12px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}><ChevronRight size={16} /></button>
          </div>

          <button onClick={abrirModalNovoEvento} style={{ backgroundColor: 'var(--color-highlight)', color: '#111', border: 'none', padding: '10px 24px', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', cursor: 'pointer' }}>
            <Plus size={18} /> Novo Evento
          </button>
        </div>
      </div>

      {/* ÁREA DE CONTEÚDO RESPONSIVA */}
      <div className="agenda-layout">
        
        {/* COLUNA PRINCIPAL: CALENDÁRIO */}
        <div className="agenda-col-principal">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px', color: 'var(--text-main)', fontSize: '1.2rem', fontWeight: '500' }}>
            <ChevronLeft size={20} style={{ cursor: 'pointer', color: 'var(--text-secondary)' }} onClick={irParaMesAnterior}/>
            {format(dataAtual, 'MMMM yyyy', { locale: ptBR })}
            <ChevronRight size={20} style={{ cursor: 'pointer', color: 'var(--text-secondary)' }} onClick={irParaProximoMes}/>
          </div>

          <div className="glass calendar-wrapper">
            <Calendar
              localizer={localizer}
              events={eventos}
              date={dataAtual}
              view={viewAtual}
              onNavigate={setDataAtual}
              onView={setViewAtual}
              startAccessor="start"
              endAccessor="end"
              formats={formatosCalendario}
              style={{ height: '100%', width: '100%' }}
              components={{ event: CartaoEventoCustomizado }}
              selectable={true} 
              onSelectSlot={handleSelecionarData}
              onSelectEvent={handleSelecionarEvento}
            />
          </div>
        </div>

        {/* COLUNA LATERAL: MINI CALENDÁRIO E EVENTOS */}
        <div className="agenda-col-lateral">
          
          {/* Box do Mini Calendário */}
          <div className="glass" style={{ padding: '24px', borderRadius: 'var(--radius-md)' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', color: 'var(--text-main)' }}>
               <ChevronLeft size={16} style={{ cursor: 'pointer' }} onClick={irParaMesAnterior}/>
               <span style={{ fontSize: '1rem', fontWeight: '500', textTransform: 'capitalize' }}>{format(dataAtual, 'MMMM yyyy', { locale: ptBR })}</span>
               <ChevronRight size={16} style={{ cursor: 'pointer' }} onClick={irParaProximoMes}/>
             </div>
             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '8px' }}>
                <div>D</div><div>S</div><div>T</div><div>Q</div><div>Q</div><div>S</div><div>S</div>
             </div>
             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
                {renderizarDiasMiniCalendario()}
             </div>
          </div>

          {/* Box Próximos Eventos */}
          <div className="glass" style={{ padding: '24px', borderRadius: 'var(--radius-md)' }}>
            <h3 style={{ color: 'var(--text-main)', fontSize: '1rem', fontWeight: '500', marginBottom: '4px' }}>Eventos do dia</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '24px' }}>17 de Julho, 2026</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {eventosDoDia.map((evento) => {
                const estilo = CORES_EVENTOS[evento.tipo] || CORES_EVENTOS.reuniao;
                return (
                  <div key={evento.id} style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ marginTop: '4px', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: estilo.dot }}></div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '4px' }}>{evento.client ? 'Contrato Ativo' : evento.time}</div>
                      <div style={{ color: 'var(--text-main)', fontSize: '0.95rem', fontWeight: '500' }}>{evento.client || evento.title}</div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '8px' }}>{evento.client ? evento.title : evento.client}</div>
                      {evento.status && <span style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.05)', color: evento.status === 'Confirmado' ? 'var(--color-success)' : 'var(--color-warning)', border: `1px solid rgba(255,255,255,0.1)` }}>{evento.status}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

        </div>
      </div>

      {/* MODAL DE CRIAÇÃO/EDIÇÃO */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title={formData.id ? "Editar Evento" : "Agendar Novo Evento"}
      >
        <form style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={labelStyle}>Título do Evento</label>
            <input type="text" placeholder="Ex: Casamento ou Reunião" style={inputStyle} value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={labelStyle}>Cliente Associado</label>
              <input type="text" placeholder="Nome do cliente" style={inputStyle} value={formData.client} onChange={(e) => setFormData({ ...formData, client: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Horário</label>
              <input type="text" placeholder="Ex: 14:00 - 18:00" style={inputStyle} value={formData.time} onChange={(e) => setFormData({ ...formData, time: e.target.value })} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={labelStyle}>Tipo de Evento</label>
              <select style={inputStyle} value={formData.tipo} onChange={(e) => setFormData({ ...formData, tipo: e.target.value })}>
                <option value="casamento">Casamento</option>
                <option value="ensaio_gestante">Ensaio Gestante</option>
                <option value="ensaio_casal">Ensaio Casal</option>
                <option value="ensaio_familia">Ensaio Família</option>
                <option value="ensaio_feminino">Ensaio Feminino</option>
                <option value="corporativo">Evento Corporativo</option>
                <option value="reuniao">Reunião / Entrega</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Status</label>
              <select style={inputStyle} value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
                <option value="Pendente">Pendente</option>
                <option value="Confirmado">Confirmado</option>
                <option value="Finalizado">Finalizado</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
            <div>
              {formData.id && (
                <button type="button" onClick={excluirEvento} style={{ background: 'none', border: '1px solid var(--color-danger)', color: 'var(--color-danger)', padding: '10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Excluir Evento">
                  <Trash2 size={20} />
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button type="button" onClick={() => setIsModalOpen(false)} style={{ padding: '12px 24px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', backgroundColor: 'transparent', color: 'var(--text-main)', cursor: 'pointer', fontWeight: '500' }}>
                Cancelar
              </button>
              {/* CORREÇÃO SOLICITADA: color mudado para '#fffdfd' */}
              <button type="button" onClick={salvarEvento} style={{ padding: '12px 24px', borderRadius: 'var(--radius-sm)', border: 'none', backgroundColor: 'var(--color-highlight)', color: '#fffdfd', cursor: 'pointer', fontWeight: '600' }}>
                {formData.id ? "Salvar Alterações" : "Agendar Evento"}
              </button>
            </div>
          </div>
        </form>
      </Modal>

    </div>
  );
}