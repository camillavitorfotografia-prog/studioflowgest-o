import { useState, useEffect } from 'react';
import { MoreVertical, Calendar, DollarSign, CalendarCheck, Smartphone } from 'lucide-react';
import { FINANCE_STORAGE_KEYS } from '../../utils/financeEngine';

const colunas = [
  { id: 'contrato_fechado', titulo: 'Contrato Fechado' },
  { id: 'fotografando', titulo: 'Fotografando' },
  { id: 'edicao', titulo: 'Edição' },
  { id: 'entregue', titulo: 'Entregue' },
];

export default function Trabalhos() {
  const [trabalhos, setTrabalhos] = useState([]);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [syncConfig, setSyncConfig] = useState({});

  // Efeito para carregar os clientes e sincronizar as abas
  useEffect(() => {
    const carregarTrabalhos = () => {
      const clientes = JSON.parse(localStorage.getItem('cv_studio_clients') || '[]');
      const calendarSync = JSON.parse(localStorage.getItem(FINANCE_STORAGE_KEYS.calendarSync) || '{}');
      
      // Mapeia garantindo que todo cliente tenha um status na esteira de produção
      const formatados = clientes.map(c => ({
        ...c,
        statusTrabalho: c.statusTrabalho || 'contrato_fechado',
        calendarSync: {
          google: Boolean(c.calendarSync?.google || calendarSync[c.id]?.google),
          apple: Boolean(c.calendarSync?.apple || calendarSync[c.id]?.apple),
        },
      }));
      
      setTrabalhos(formatados);
      setSyncConfig(calendarSync);
    };

    carregarTrabalhos();
    window.addEventListener('focus', carregarTrabalhos);
    return () => window.removeEventListener('focus', carregarTrabalhos);
  }, []);

  // Função para mover o card de coluna e salvar no localStorage
  const mudarStatus = (id, novoStatus) => {
    const novaLista = trabalhos.map(t => 
      t.id === id ? { ...t, statusTrabalho: novoStatus } : t
    );
    setTrabalhos(novaLista);
    localStorage.setItem('cv_studio_clients', JSON.stringify(novaLista));
    setActiveMenuId(null);
  };

  const alternarSincronizacao = (id, provider) => {
    const novaLista = trabalhos.map(t => {
      if (t.id !== id) return t;
      return {
        ...t,
        calendarSync: {
          google: Boolean(t.calendarSync?.google),
          apple: Boolean(t.calendarSync?.apple),
          [provider]: !t.calendarSync?.[provider],
        },
      };
    });
    const projetoAtualizado = novaLista.find(t => t.id === id);
    const novoSync = {
      ...syncConfig,
      [id]: {
        google: Boolean(projetoAtualizado?.calendarSync?.google),
        apple: Boolean(projetoAtualizado?.calendarSync?.apple),
        providerReady: true,
        status: 'ready_for_api',
        preparedAt: new Date().toISOString(),
      },
    };
    setTrabalhos(novaLista);
    setSyncConfig(novoSync);
    localStorage.setItem('cv_studio_clients', JSON.stringify(novaLista));
    localStorage.setItem(FINANCE_STORAGE_KEYS.calendarSync, JSON.stringify(novoSync));
    window.dispatchEvent(new Event('storage'));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', height: '100%' }}>
      {/* Título limpo, sem subtítulo */}
      <div>
        <h1 style={{ color: 'var(--text-main)', fontSize: '2rem', fontWeight: '600' }}>Trabalhos</h1>
      </div>

      <div style={{ display: 'flex', gap: '20px', overflowX: 'auto', paddingBottom: '24px', flex: 1, alignItems: 'flex-start' }}>
        {colunas.map(col => (
          <div key={col.id} style={{ minWidth: '260px', width: '260px' }}>
            <h3 style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
              {col.titulo}
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {trabalhos.filter(t => t.statusTrabalho === col.id).map(trabalho => (
                <div key={trabalho.id} className="glass" style={{ padding: '16px', borderRadius: '10px', borderLeft: '4px solid var(--color-highlight)', position: 'relative' }}>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'flex-start' }}>
                    <span style={{ color: 'var(--text-main)', fontWeight: '600', fontSize: '0.95rem' }}>{trabalho.nome}</span>
                    
                    {/* Botão de Opções */}
                    <button 
                      onClick={() => setActiveMenuId(activeMenuId === trabalho.id ? null : trabalho.id)}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', height: 'max-content' }}
                    >
                      <MoreVertical size={16} color="var(--text-secondary)" />
                    </button>

                    {/* Menu Dropdown de Ações */}
                    {activeMenuId === trabalho.id && (
                      <div style={{ position: 'absolute', top: '32px', right: '10px', background: '#1E2127', border: '1px solid #2A2D33', borderRadius: '8px', padding: '6px', zIndex: 50, width: '180px', boxShadow: '0 8px 16px rgba(0,0,0,0.8)' }}>
                        <div style={{ fontSize: '0.65rem', color: '#888', padding: '4px 8px', textTransform: 'uppercase', fontWeight: 'bold' }}>Mover para:</div>
                        {colunas.filter(c => c.id !== trabalho.statusTrabalho).map(novaCol => (
                          <button
                            key={novaCol.id}
                            onClick={() => mudarStatus(trabalho.id, novaCol.id)}
                            style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: '#D1D5DB', padding: '8px', fontSize: '0.8rem', cursor: 'pointer', borderRadius: '4px', transition: 'background 0.2s' }}
                            onMouseEnter={(e) => e.target.style.background = '#2A2D33'}
                            onMouseLeave={(e) => e.target.style.background = 'transparent'}
                          >
                            {novaCol.titulo}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>{trabalho.tipo}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                    <button
                      onClick={() => alternarSincronizacao(trabalho.id, 'google')}
                      title="Preparar sincronizacao com Google Agenda"
                      className={trabalho.calendarSync?.google ? 'sf-sync-button active' : 'sf-sync-button'}
                    >
                      <CalendarCheck size={13} /> Google
                    </button>
                    <button
                      onClick={() => alternarSincronizacao(trabalho.id, 'apple')}
                      title="Preparar sincronizacao com Agenda Apple iOS"
                      className={trabalho.calendarSync?.apple ? 'sf-sync-button active' : 'sf-sync-button'}
                    >
                      <Smartphone size={13} /> Apple
                    </button>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--color-highlight)', opacity: 0.9 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={12}/> {trabalho.dataTrabalho || 'Sem data'}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><DollarSign size={12}/> {trabalho.valorTotal || '0,00'}</span>
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
