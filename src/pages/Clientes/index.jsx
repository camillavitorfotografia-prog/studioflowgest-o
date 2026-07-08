import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import Modal from '../../components/Modal'; 
import { maskCurrency, maskPhone, capitalizeName } from '../../utils/masks';

export default function Clientes() {
  const [clientes, setClientes] = useState(() => JSON.parse(localStorage.getItem('cv_studio_clients') || '[]'));
  const [isModalOpen, setIsModalOpen] = useState(false);

  const estadoInicial = {
    nome: '', email: '', telefone: '', instagram: '', tipo: 'Casamento',
    dataTrabalho: '', valorTotal: '0,00', pagamentos: []
  };
  const [formData, setFormData] = useState(estadoInicial);

  useEffect(() => {
    localStorage.setItem('cv_studio_clients', JSON.stringify(clientes));
  }, [clientes]);

  const parseToFloat = (valor) => {
    if (!valor) return 0;
    const cleanValue = valor.toString().replace(/\D/g, "");
    return parseFloat(cleanValue) / 100;
  };

  const valorTotal = parseToFloat(formData.valorTotal);
  
  // Proteção: usa (formData.pagamentos || []) para evitar erro se estiver vazio
  const totalPago = (formData.pagamentos || []).reduce((acc, p) => {
    return acc + parseToFloat(p.valor);
  }, 0);

  const valorRestante = Math.max(0, valorTotal - totalPago);

  // Proteção: garante que o valor seja tratado como número antes de formatar
  const formatarExibicao = (valor) => {
    const numero = Number(valor) || 0;
    return numero.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  };

  const salvarCliente = () => {
    // --- INÍCIO DO MOTOR DE DISTRIBUIÇÃO AVANÇADO ---
    // Descobre se foi adicionado um novo pagamento comparando com o que já estava salvo
    const clienteAntigo = formData.id ? clientes.find(c => c.id === formData.id) : null;
    const totalPagoAntigo = (clienteAntigo?.pagamentos || []).reduce((acc, p) => acc + parseToFloat(p.valor), 0);
    let diferencaPagamento = totalPago - totalPagoAntigo;

    if (diferencaPagamento > 0) {
      let reposicao = parseFloat(localStorage.getItem('cv_finance_reposicao') || '0');
      const saldos = JSON.parse(localStorage.getItem('cv_finance_saldos') || '{"salario": 0, "empresa": 0, "reserva": 0}');
      let valorFoiProcessado = false; // Flag para saber se precisamos salvar os dados
      
      // 1. VERIFICA DÍVIDA COM A RESERVA
      if (reposicao > 0) {
        const desejaRepor = window.confirm(`Você tem uma pendência de R$ ${formatarExibicao(reposicao)} para repor no Fundo de Reserva.\nDeseja utilizar parte deste novo recebimento (R$ ${formatarExibicao(diferencaPagamento)}) para recompor a reserva agora?`);
        
        if (desejaRepor) {
          const valorReposto = Math.min(diferencaPagamento, reposicao);
          reposicao -= valorReposto;
          saldos.reserva += valorReposto;
          diferencaPagamento -= valorReposto; // O que sobrar vai para a distribuição normal
          
          localStorage.setItem('cv_finance_reposicao', reposicao.toString());
          alert(`R$ ${formatarExibicao(valorReposto)} devolvidos ao Fundo de Reserva!`);
          valorFoiProcessado = true;
        }
      }

      // 2. DISTRIBUIÇÃO DO RESTANTE (Se sobrou dinheiro após a reposição ou se não havia dívida)
      if (diferencaPagamento > 0) {
        const confirmar = window.confirm(`Você tem R$ ${formatarExibicao(diferencaPagamento)} de recebimento disponíveis.\nDeseja distribuir esse valor automaticamente nas suas contas (Salário, Empresa, Reserva)?`);
        
        if (confirmar) {
          const config = JSON.parse(localStorage.getItem('cv_finance_config') || '{"salario": 35, "empresa": 45, "reserva": 20}');
          
          saldos.salario += diferencaPagamento * (config.salario / 100);
          saldos.empresa += diferencaPagamento * (config.empresa / 100);
          saldos.reserva += diferencaPagamento * (config.reserva / 100);
          
          alert("Valor distribuído com sucesso nas suas contas!");
          valorFoiProcessado = true;
        }
      }

      // 3. SALVA OS SALDOS E REGISTRA O HISTÓRICO GERAL (Caso o usuário tenha aceitado alguma das opções)
      if (valorFoiProcessado) {
        localStorage.setItem('cv_finance_saldos', JSON.stringify(saldos));

        // Registra o recebimento no histórico de movimentações para os relatórios
        const historico = JSON.parse(localStorage.getItem('cv_studio_financas') || '[]');
        historico.push({
          id: Date.now(),
          descricao: `Recebimento - ${formData.nome} (${formData.tipo})`,
          valor: formatarExibicao(totalPago - totalPagoAntigo),
          tipo: "Entrada",
          data: new Date().toISOString().split('T')[0]
        });
        localStorage.setItem('cv_studio_financas', JSON.stringify(historico));

        // Dispara um evento para atualizar o Financeiro caso ele esteja aberto em outra aba
        window.dispatchEvent(new Event('storage'));
      }
    }
    // --- FIM DO MOTOR DE DISTRIBUIÇÃO AVANÇADO ---

    const dadosParaSalvar = { ...formData, restante: valorRestante };

    if (formData.id) {
      setClientes(clientes.map(c => c.id === formData.id ? dadosParaSalvar : c));
    } else {
      setClientes([...clientes, { ...dadosParaSalvar, id: Date.now() }]);
    }
    
    setIsModalOpen(false);
    setFormData(estadoInicial);
  };

  const removerCliente = (id) => {
    setClientes(clientes.filter(c => c.id !== id));
  };

  const inputStyle = { width: '100%', background: '#121212', border: '1px solid #333', color: '#fff', padding: '12px', borderRadius: '4px', fontSize: '0.9rem' };
  const labelStyle = { color: '#888', fontSize: '0.75rem', marginBottom: '4px', display: 'block' };

  return (
    <div style={{ padding: '32px', color: '#fff', backgroundColor: '#0a0a0a', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', maxWidth: '1200px', margin: '0 auto 32px auto' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: '600' }}>Clientes</h1>
          <p style={{ color: '#888', margin: '4px 0 0 0' }}>Gerencie seus contatos e contratos.</p>
        </div>
        <button 
          onClick={() => { setFormData(estadoInicial); setIsModalOpen(true); }} 
          style={{ backgroundColor: '#C5A059', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Plus size={18}/> Novo Cliente
        </button>
      </div>
      <div style={{ background: '#111', borderRadius: '12px', border: '1px solid #222', maxWidth: '1200px', margin: '0 auto', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #222', color: '#888', fontSize: '0.85rem' }}>
              <th style={{ padding: '20px' }}>Nome / Contato</th>
              <th style={{ padding: '20px' }}>Trabalho</th>
              <th style={{ padding: '20px' }}>Financeiro</th>
              <th style={{ padding: '20px', textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {clientes.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid #1a1a1a', fontSize: '0.95rem' }}>
                <td style={{ padding: '20px' }}>
                  <div style={{ fontWeight: '600', marginBottom: '4px' }}>{c.nome}</div>
                  <div style={{ fontSize: '0.8rem', color: '#888' }}>{c.telefone}</div>
                  <div style={{ fontSize: '0.8rem', color: '#666' }}>{c.email}</div>
                </td>
                <td style={{ padding: '20px' }}>
                  <div style={{ fontWeight: '500' }}>{c.tipo}</div>
                  <div style={{ fontSize: '0.8rem', color: '#888' }}>{c.dataTrabalho}</div>
                </td>
                <td style={{ padding: '20px' }}>
                  <div style={{ fontSize: '0.9rem' }}>R$ {c.valorTotal || '0,00'}</div>
                  {/* Proteção adicionada no .reduce aqui também */}
                  <div style={{ fontSize: '0.8rem', color: '#4ade80' }}>Pago: R$ {formatarExibicao((c.pagamentos || []).reduce((acc, p) => acc + parseToFloat(p.valor), 0))}</div>
                  <div style={{ fontSize: '0.8rem', color: '#fb923c' }}>Falta: R$ {formatarExibicao(c.restante)}</div>
                </td>
                <td style={{ padding: '20px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: '16px', justifyContent: 'flex-end' }}>
                    <button onClick={() => { setFormData({ ...estadoInicial, ...c, pagamentos: c.pagamentos || [] }); setIsModalOpen(true); }} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}><Edit2 size={16}/></button>
                    <button onClick={() => removerCliente(c.id)} style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer' }}><Trash2 size={16}/></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={formData.id ? "Editar Cliente" : "Cadastrar Novo Cliente"}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div><label style={labelStyle}>Nome Completo</label><input style={inputStyle} value={formData.nome} onChange={(e) => setFormData({...formData, nome: capitalizeName(e.target.value)})} /></div>
            <div><label style={labelStyle}>E-mail</label><input style={inputStyle} value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div><label style={labelStyle}>WhatsApp</label><input style={inputStyle} value={formData.telefone} onChange={(e) => setFormData({...formData, telefone: maskPhone(e.target.value)})} /></div>
            <div><label style={labelStyle}>Instagram</label><input style={inputStyle} value={formData.instagram} onChange={(e) => setFormData({...formData, instagram: e.target.value.startsWith('@') ? e.target.value : '@' + e.target.value})} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div><label style={labelStyle}>Tipo de Trabalho</label>
              <select style={inputStyle} value={formData.tipo} onChange={(e) => setFormData({...formData, tipo: e.target.value})}>
                {['Casamento', 'Ensaio Casal', 'Ensaio Gestante', 'Ensaio Família', 'Formatura', 'Corporativo'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div><label style={labelStyle}>Data do Trabalho</label><input type="date" style={inputStyle} value={formData.dataTrabalho} onChange={(e) => setFormData({...formData, dataTrabalho: e.target.value})} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: '#1a1a1a', padding: '12px', borderRadius: '6px' }}>
            <div><label style={labelStyle}>Valor Total</label><input style={inputStyle} value={formData.valorTotal} onChange={(e) => setFormData({...formData, valorTotal: maskCurrency(e.target.value)})} /></div>
            <div>
                <label style={labelStyle}>Restante</label>
                <input style={{...inputStyle, color: '#C5A059'}} disabled value={formatarExibicao(valorRestante)} />
            </div>
          </div>
          <div style={{ marginTop: '8px' }}>
            <label style={{...labelStyle, color: '#C5A059', marginBottom: '8px'}}>Histórico de Pagamentos</label>
            {(formData.pagamentos || []).map((p, index) => (
              <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <input style={inputStyle} placeholder="R$ 0,00" value={p.valor} onChange={(e) => {
                  const news = [...(formData.pagamentos || [])];
                  news[index].valor = maskCurrency(e.target.value);
                  setFormData({...formData, pagamentos: news});
                }} />
                <input type="date" style={inputStyle} value={p.data} onChange={(e) => {
                  const news = [...(formData.pagamentos || [])];
                  news[index].data = e.target.value;
                  setFormData({...formData, pagamentos: news});
                }} />
                <button onClick={() => setFormData({...formData, pagamentos: (formData.pagamentos || []).filter((_, i) => i !== index)})} style={{ background: 'transparent', border: 'none', color: '#ff4444', cursor: 'pointer' }}><Trash2 size={18}/></button>
              </div>
            ))}
            <button onClick={() => setFormData({...formData, pagamentos: [...(formData.pagamentos || []), { valor: '', data: '' }]})} style={{ width: '100%', padding: '10px', background: 'transparent', border: '1px dashed #C5A059', color: '#C5A059', borderRadius: '4px', cursor: 'pointer', marginTop: '4px' }}>
              + Adicionar Pagamento
            </button>
          </div>
          <button onClick={salvarCliente} style={{ backgroundColor: '#C5A059', color: '#000', border: 'none', padding: '14px', borderRadius: '6px', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer', marginTop: '10px' }}>
            {formData.id ? "Atualizar Cliente" : "Salvar Cliente"}
          </button>
        </div>
      </Modal>
    </div>
  );
}