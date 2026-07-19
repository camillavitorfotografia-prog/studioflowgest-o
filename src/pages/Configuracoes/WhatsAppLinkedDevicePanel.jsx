import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  MessageCircleMore,
  QrCode,
  Smartphone,
  Unplug,
  UserRoundPlus,
} from 'lucide-react';
import {
  disconnectLinkedDevice,
  getLinkedDeviceStatus,
  startLinkedDeviceSession,
} from '../../services/whatsappLinkedDeviceService';

const labels = {
  connected: 'Conectado',
  qr: 'Aguardando leitura do QR Code',
  connecting: 'Conectando',
  disconnected: 'Não conectado',
  error: 'Erro',
};

export default function WhatsAppLinkedDevicePanel() {
  const [state, setState] = useState({ status: 'disconnected' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    try {
      const result = await getLinkedDeviceStatus();
      setState(result);
      setError(result?.error || '');
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => window.clearInterval(timer);
  }, []);

  const connect = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await startLinkedDeviceSession();
      setState(result);
      setError(result?.error || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm('Desconectar o StudioFlow dos aparelhos conectados do WhatsApp?')) return;
    setBusy(true);
    try {
      await disconnectLinkedDevice();
      setState({ status: 'disconnected' });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const connected = state.status === 'connected';

  return (
    <article className={`wa-linked-panel ${state.status || 'disconnected'}`}>
      <div className="wa-linked-top">
        <div className="wa-linked-identity">
          <div className="wa-linked-icon"><Smartphone size={21} /></div>
          <div>
            <div className="wa-linked-title-row">
              <h3>WhatsApp pelo celular</h3>
              <span className={`wa-linked-status ${connected ? 'connected' : state.status === 'error' ? 'error' : 'disconnected'}`}>
                <span className="wa-linked-status-dot" />
                {labels[state.status] || state.status}
              </span>
            </div>
            <p>Mantenha o WhatsApp Business no telefone e conecte o StudioFlow como um aparelho vinculado.</p>
          </div>
        </div>

        <div className="wa-linked-actions">
          {!connected && (
            <button className="primary" type="button" onClick={connect} disabled={busy}>
              {busy ? <LoaderCircle className="spin" size={16} /> : <QrCode size={16} />}
              {busy ? 'Gerando...' : 'Gerar QR Code'}
            </button>
          )}
          {connected && (
            <button className="danger" type="button" onClick={disconnect} disabled={busy}>
              <Unplug size={16} />Desconectar
            </button>
          )}
        </div>
      </div>

      <div className="wa-linked-benefits" aria-label="Recursos da integração">
        <span><QrCode size={14} />Pareamento por QR Code</span>
        <span><UserRoundPlus size={14} />Leads automáticos no CRM</span>
        <span><MessageCircleMore size={14} />Conversas sincronizadas</span>
        <span><CheckCircle2 size={14} />WhatsApp continua no celular</span>
      </div>

      {state.phone && (
        <div className="wa-linked-phone">Número conectado: <strong>{state.phone}</strong></div>
      )}

      {state.qr && !connected && (
        <div className="wa-linked-qr">
          <img src={state.qr} alt="QR Code para conectar o WhatsApp" />
          <div>
            <strong>Escaneie o código pelo WhatsApp Business</strong>
            <p>Acesse Aparelhos conectados → Conectar aparelho e aponte a câmera para o QR Code.</p>
          </div>
        </div>
      )}

      {error && (
        <div className="wa-linked-error">
          <CircleAlert size={16} />
          <div>
            <strong>Não foi possível acessar o conector</strong>
            <span>{error}</span>
          </div>
        </div>
      )}
    </article>
  );
}
