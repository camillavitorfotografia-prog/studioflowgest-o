import { useEffect, useState, useMemo, useCallback } from 'react';
import { Calendar, CalendarCheck, DollarSign, MoreVertical, Package, Smartphone } from 'lucide-react';
import { formatMoney } from '../../utils/integratedData';
import { FINANCE_STORAGE_KEYS } from '../../utils/financeEngine';
import { getDbStudioData, subscribeDbUpdates, upsertAgendaEvent } from '../../utils/dbData';
import { supabase } from '../../utils/supabase';

const colunas = [
  { id: 'contrato_fechado', titulo: 'Contrato Fechado' },
  { id: 'fotografando', titulo: 'Fotografando' },
  { id: 'edicao', titulo: 'Edicao' },
  { id: 'entregue', titulo: 'Entregue' },
];

export default function Trabalhos() {
  const [projects, setProjects] = useState([]);
  const [rawProjects, setRawProjects] = useState([]);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [syncConfig, setSyncConfig] = useState({});

  const load = useCallback(async () => {
    try {
      const studio = await getDbStudioData();
      const calendarSync = JSON.parse(localStorage.getItem(FINANCE_STORAGE_KEYS.calendarSync) || '{}');
      setProjects(studio.projects || []);
      setRawProjects(studio.projects || []);
      setSyncConfig(calendarSync);
    } catch (error) {
      console.error('Erro ao carregar projetos:', error);
    }
  }, []);

  useEffect(() => {
    setTimeout(() => { void load(); }, 0);
    window.addEventListener('focus', load);
    const unsubscribe = subscribeDbUpdates(load);
    return () => {
      window.removeEventListener('focus', load);
      unsubscribe();
    };
  }, [load]);

  const persistProject = useCallback(async (project) => {
    const payload = {
      status: project.status,
      calendario_sync: project.calendarSync || null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('projetos').update(payload).eq('id', project.id);
    if (error) throw error;
    await upsertAgendaEvent(project, project.cliente || {});
    await setTimeout(() => { void load(); }, 0);
  }, [load]);

  const mudarStatus = useCallback(async (id, novoStatus) => {
    const project = rawProjects.find((item) => item.id === id);
    if (!project) return;
    await persistProject({ ...project, status: novoStatus });
    setActiveMenuId(null);
  }, [rawProjects, persistProject]);

  const alternarSincronizacao = useCallback((id, provider) => {
    const updated = rawProjects.map((project) => {
      if (project.id !== id) return project;
      return {
        ...project,
        calendarSync: {
          google: Boolean(project.calendarSync?.google),
          apple: Boolean(project.calendarSync?.apple),
          [provider]: !project.calendarSync?.[provider],
        },
      };
    });

    const project = updated.find((item) => item.id === id);
    const nextSync = {
      ...syncConfig,
      [id]: {
        google: Boolean(project?.calendarSync?.google),
        apple: Boolean(project?.calendarSync?.apple),
        providerReady: true,
        status: 'ready_for_api',
        preparedAt: new Date().toISOString(),
      },
    };

    localStorage.setItem(FINANCE_STORAGE_KEYS.calendarSync, JSON.stringify(nextSync));
    setSyncConfig(nextSync);
    if (project) persistProject(project);
  }, [rawProjects, syncConfig, persistProject]);

  const projectsByColumn = useMemo(() => {
    const grouped = {
      contrato_fechado: [],
      fotografando: [],
      edicao: [],
      entregue: [],
    };

    projects.forEach((project) => {
      const status = project.status || 'contrato_fechado';
      if (grouped[status]) grouped[status].push(project);
      else grouped[status] = [project];
    });

    return grouped;
  }, [projects]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', height: '100%' }}>
      <div>
        <h1 style={{ color: 'var(--text-main)', fontSize: '2rem', fontWeight: '600' }}>Trabalhos</h1>
      </div>

      <div style={{ display: 'flex', gap: '20px', overflowX: 'auto', paddingBottom: '24px', flex: 1, alignItems: 'flex-start' }}>
        {colunas.map((col) => (
          <div key={col.id} style={{ minWidth: '260px', width: '260px' }}>
            <h3 style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
              {col.titulo}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {(projectsByColumn[col.id] || []).map((project) => (
                <div key={project.id} className="glass" style={{ padding: '16px', borderRadius: '10px', borderLeft: '4px solid var(--color-highlight)', position: 'relative' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'flex-start' }}>
                    <span style={{ color: 'var(--text-main)', fontWeight: '600', fontSize: '0.95rem' }}>{project.clienteNome}</span>
                    <button onClick={() => setActiveMenuId(activeMenuId === project.id ? null : project.id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', height: 'max-content' }}>
                      <MoreVertical size={16} color="var(--text-secondary)" />
                    </button>
                    {activeMenuId === project.id && (
                      <div style={{ position: 'absolute', top: '32px', right: '10px', background: '#1E2127', border: '1px solid #2A2D33', borderRadius: '8px', padding: '6px', zIndex: 50, width: '180px', boxShadow: '0 8px 16px rgba(0,0,0,0.8)' }}>
                        <div style={{ fontSize: '0.65rem', color: '#888', padding: '4px 8px', textTransform: 'uppercase', fontWeight: 'bold' }}>Mover para:</div>
                        {colunas.filter((item) => item.id !== project.status).map((novaCol) => (
                          <button key={novaCol.id} onClick={() => mudarStatus(project.id, novaCol.id)} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: '#D1D5DB', padding: '8px', fontSize: '0.8rem', cursor: 'pointer', borderRadius: '4px' }}>
                            {novaCol.titulo}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>{project.tipoServico}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                    <button onClick={() => alternarSincronizacao(project.id, 'google')} title="Preparar sincronizacao com Google Agenda" className={project.calendarSync?.google || syncConfig[project.id]?.google ? 'sf-sync-button active' : 'sf-sync-button'}>
                      <CalendarCheck size={13} /> Google
                    </button>
                    <button onClick={() => alternarSincronizacao(project.id, 'apple')} title="Preparar sincronizacao com Agenda Apple iOS" className={project.calendarSync?.apple || syncConfig[project.id]?.apple ? 'sf-sync-button active' : 'sf-sync-button'}>
                      <Smartphone size={13} /> Apple
                    </button>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--color-highlight)', opacity: 0.9 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={12}/> {project.data || 'Sem data'}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><DollarSign size={12}/> {formatMoney(project.valorContratado)}</span>
                  </div>
                  <div style={{ marginTop: '10px', color: 'var(--text-secondary)', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Package size={12} /> {project.equipamentosDetalhados?.length || 0} equipamentos vinculados
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
