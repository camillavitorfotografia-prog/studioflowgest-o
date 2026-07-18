import { useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, Link2, LoaderCircle, QrCode, Smartphone, Unplug } from 'lucide-react';
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
      <div className="wa-linked-icon"><Smartphone size={22} /></div>
      <div className="wa-linked-main">
        <div className="wa-linked-heading">
          <div>
            <h3>WhatsApp pelo celular</h3>
            <p>Mantenha o WhatsApp Business no telefone e conecte o StudioFlow como aparelho vinculado.</p>
          </div>
          <span className={`status ${connected ? 'connected' : state.status === 'error' ? 'error' : 'not_connected'}`}>
            {connected ? <CheckCircle2 size={13} /> : state.status === 'error' ? <CircleAlert size={13} /> : <Link2 size={13} />}
            {labels[state.status] || state.status}
          </span>
        </div>
        <div className="integration-capabilities">
          <span>QR Code</span><span>Leads automáticos</span><span>Conversas</span><span>WhatsApp continua no celular</span>
        </div>
        {state.phone && <div className="integration-meta"><span>Número conectado: <strong>{state.phone}</strong></span></div>}
        {state.qr && !connected && (
          <div className="wa-linked-qr">
            <img src={state.qr} alt="QR Code para conectar o WhatsApp" />
            <div><strong>Escaneie no celular</strong><p>WhatsApp Business → Aparelhos conectados → Conectar aparelho.</p></div>
          </div>
        )}
        {error && <div className="wa-linked-error"><CircleAlert size={15} />{error}</div>}
      </div>
      <div className="integration-card-actions">
        {!connected && <button className="primary" type="button" onClick={connect} disabled={busy}>{busy ? <LoaderCircle className="spin" size={15} /> : <QrCode size={15} />}Gerar QR Code</button>}
        {connected && <button className="danger" type="button" onClick={disconnect} disabled={busy}><Unplug size={15} />Desconectar</button>}
      </div>
    </article>
  );
}
