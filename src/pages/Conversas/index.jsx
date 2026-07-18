import { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageCircle, RefreshCw, Send, UserRound, WifiOff } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '../../utils/supabase';
import { requestIntegrationAction } from '../../services/integrationsService';
import { getLinkedDeviceStatus, sendLinkedDeviceMessage } from '../../services/whatsappLinkedDeviceService';
import './Conversas.css';

const normalizePhone = (value = '') => String(value).replace(/\D/g, '');
const formatTime = (value) => value ? new Date(value).toLocaleString('pt-BR') : '';

export default function Conversas() {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [linkedDeviceConnected, setLinkedDeviceConnected] = useState(false);

  const selected = useMemo(
    () => conversations.find((item) => item.id === selectedId) || conversations[0] || null,
    [conversations, selectedId],
  );

  const loadConversations = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setError('O Supabase precisa estar configurado para carregar as conversas.');
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: queryError } = await supabase
      .from('whatsapp_conversations')
      .select('*, contact:whatsapp_contacts(*), lead:leads(id,nome,status), client:clientes(id,nome), project:projetos(id,tipo_servico,data)')
      .order('last_message_at', { ascending: false });
    if (queryError) setError(queryError.message);
    else {
      setConversations(data || []);
      if (!selectedId && data?.[0]?.id) setSelectedId(data[0].id);
    }
    setLoading(false);
  }, [selectedId]);

  const loadMessages = useCallback(async (conversationId) => {
    if (!conversationId) return setMessages([]);
    const { data, error: queryError } = await supabase
      .from('whatsapp_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (queryError) setError(queryError.message);
    else setMessages(data || []);
    await supabase.from('whatsapp_contacts').update({ unread_count: 0 }).eq('id', selected?.contact_id || '');
  }, [selected?.contact_id]);

  useEffect(() => { loadConversations(); }, [loadConversations]);
  useEffect(() => { getLinkedDeviceStatus().then((value) => setLinkedDeviceConnected(value.status === 'connected')).catch(() => setLinkedDeviceConnected(false)); }, []);
  useEffect(() => { loadMessages(selected?.id); }, [selected?.id, loadMessages]);

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;
    const channel = supabase.channel('studioflow-whatsapp-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_conversations' }, loadConversations)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_messages' }, () => loadMessages(selected?.id))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadConversations, loadMessages, selected?.id]);

  const sendMessage = async () => {
    const text = draft.trim();
    if (!selected || !text) return;
    setSending(true);
    setError('');
    try {
      const payload = {
        to: normalizePhone(selected.contact?.wa_id || selected.contact?.phone_normalized),
        text,
        conversationId: selected.id,
        contactId: selected.contact_id,
      };
      if (linkedDeviceConnected) await sendLinkedDeviceMessage(payload);
      else await requestIntegrationAction('whatsapp-send', payload);
      setDraft('');
      await loadMessages(selected.id);
      await loadConversations();
    } catch (sendError) {
      setError(sendError?.message || 'Não foi possível enviar a mensagem.');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="wa-page">
      <header className="wa-header">
        <div><span>WhatsApp Business</span><h1>Conversas</h1><p>Mensagens recebidas criam ou atualizam leads automaticamente no CRM.</p></div>
        <button type="button" onClick={loadConversations} disabled={loading}><RefreshCw className={loading ? 'spin' : ''} />Atualizar</button>
      </header>

      {error && <div className="wa-error"><WifiOff />{error}</div>}

      <div className="wa-layout">
        <aside className="wa-list">
          {loading && <div className="wa-empty">Carregando conversas...</div>}
          {!loading && !conversations.length && <div className="wa-empty"><MessageCircle /><strong>Nenhuma conversa ainda</strong><span>Depois que o webhook estiver ativo, novas mensagens aparecerão aqui e no CRM.</span></div>}
          {conversations.map((item) => {
            const name = item.client?.nome || item.lead?.nome || item.contact?.profile_name || item.contact?.phone_normalized || 'Contato';
            return <button key={item.id} type="button" className={item.id === selected?.id ? 'active' : ''} onClick={() => setSelectedId(item.id)}>
              <span className="wa-avatar"><UserRound /></span>
              <span className="wa-list-copy"><strong>{name}</strong><small>{item.last_message_preview || 'Sem prévia'}</small></span>
              <span className="wa-list-meta"><time>{item.last_message_at ? new Date(item.last_message_at).toLocaleDateString('pt-BR') : ''}</time>{item.contact?.unread_count > 0 && <b>{item.contact.unread_count}</b>}</span>
            </button>;
          })}
        </aside>

        <main className="wa-chat">
          {!selected && <div className="wa-empty"><MessageCircle /><strong>Selecione uma conversa</strong></div>}
          {selected && <>
            <div className="wa-chat-head">
              <div><strong>{selected.client?.nome || selected.lead?.nome || selected.contact?.profile_name || 'Contato'}</strong><small>{selected.contact?.phone_normalized}</small></div>
              <div className="wa-links">{selected.lead_id && <span>Lead no CRM</span>}{selected.client_id && <span>Cliente vinculado</span>}{selected.project_id && <span>Trabalho vinculado</span>}</div>
            </div>
            <div className="wa-messages">
              {messages.map((message) => <article key={message.id} className={message.direction === 'outbound' ? 'outbound' : 'inbound'}><p>{message.body || `[${message.message_type}]`}</p><small>{formatTime(message.sent_at || message.created_at)} · {message.status}</small></article>)}
            </div>
            <div className="wa-compose">
              <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Digite a mensagem..." onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } }} />
              <button type="button" onClick={sendMessage} disabled={sending || !draft.trim()}><Send />{sending ? 'Enviando...' : 'Enviar'}</button>
            </div>
          </>}
        </main>
      </div>
    </section>
  );
}
