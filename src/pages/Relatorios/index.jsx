import { useNavigate } from 'react-router-dom';
import { Download, ArrowLeft, DollarSign, TrendingUp, TrendingDown } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function Relatorios() {
  const navigate = useNavigate();
  const [dadosMensais, setDadosMensais] = useState([]);

  useEffect(() => {
    const carregarRelatorio = () => {
      const clientes = JSON.parse(localStorage.getItem('cv_studio_clients') || '[]');
      const transacoes = JSON.parse(localStorage.getItem('cv_studio_financas') || '[]');

      // Objeto para agrupar dados por mês (Jan a Dez)
      const mesesLabels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      const estrutura = mesesLabels.map(mes => ({ mes, receita: 0, despesa: 0 }));

      // Processar Receitas (de Clientes)
      clientes.forEach(c => {
        (c.pagamentos || []).forEach(p => {
          if (p.data) {
            const mesIdx = new Date(p.data).getMonth();
            const valor = parseFloat(p.valor.replace(/\D/g, '')) / 100;
            if (estrutura[mesIdx]) estrutura[mesIdx].receita += valor;
          }
        });
      });

      // Processar Despesas (do Financeiro)
      transacoes.forEach(t => {
        if (t.data) {
          const mesIdx = new Date(t.data).getMonth();
          const valor = parseFloat(t.valor.replace(/\D/g, '')) / 100;
          if (estrutura[mesIdx]) estrutura[mesIdx].despesa += valor;
        }
      });

      setDadosMensais(estrutura.filter(d => d.receita > 0 || d.despesa > 0));
    };

    carregarRelatorio();
  }, []);

  const totalReceita = dadosMensais.reduce((acc, curr) => acc + curr.receita, 0);
  const totalDespesa = dadosMensais.reduce((acc, curr) => acc + curr.despesa, 0);
  const lucroLiquido = totalReceita - totalDespesa;

  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto', color: '#fff', fontFamily: 'sans-serif' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <button onClick={() => navigate(-1)} style={{ backgroundColor: 'transparent', color: '#888', border: '1px solid #333', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ArrowLeft size={16} /> Voltar
        </button>
        <button style={{ backgroundColor: '#d4af37', color: '#000', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Download size={18} /> Exportar PDF
        </button>
      </div>

      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ color: '#fff', fontSize: '1.8rem', margin: 0 }}>Relatório Fiscal</h1>
        <p style={{ color: '#888', margin: '8px 0 0 0' }}>Dados consolidados das suas movimentações financeiras.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '32px' }}>
        <div className="glass" style={{ padding: '20px', borderRadius: '12px', border: '1px solid #333', backgroundColor: '#1a1a1a' }}>
          <div style={{ color: '#888', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}><DollarSign size={16}/> Receita Bruta</div>
          <h2 style={{ color: '#fff', margin: 0 }}>R$ {totalReceita.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</h2>
        </div>
        <div className="glass" style={{ padding: '20px', borderRadius: '12px', border: '1px solid #333', backgroundColor: '#1a1a1a' }}>
          <div style={{ color: '#888', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}><TrendingDown size={16}/> Total Despesas</div>
          <h2 style={{ color: '#ff4d4d', margin: 0 }}>R$ {totalDespesa.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</h2>
        </div>
        <div className="glass" style={{ padding: '20px', borderRadius: '12px', border: '1px solid #333', backgroundColor: '#1a1a1a' }}>
          <div style={{ color: '#888', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}><TrendingUp size={16}/> Lucro Líquido</div>
          <h2 style={{ color: '#34d399', margin: 0 }}>R$ {lucroLiquido.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</h2>
        </div>
      </div>

      {/* GRÁFICO (FLUXO DE CAIXA) */}
      <div className="glass" style={{ padding: '24px', borderRadius: '12px', marginBottom: '32px', backgroundColor: '#1a1a1a', border: '1px solid #333' }}>
        <h3 style={{ color: '#fff', marginBottom: '24px' }}>Fluxo de Caixa Mensal</h3>
        <div style={{ display: 'flex', alignItems: 'flex-end', height: '200px', gap: '15px' }}>
          {dadosMensais.map((item, index) => (
            <div key={index} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '100%', height: `${(item.receita / (totalReceita || 1)) * 100}%`, backgroundColor: '#d4af37', borderRadius: '4px 4px 0 0' }}></div>
              <span style={{ color: '#888', fontSize: '0.8rem' }}>{item.mes}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="glass" style={{ padding: '24px', borderRadius: '12px', backgroundColor: '#1a1a1a', border: '1px solid #333' }}>
        <h3 style={{ color: '#fff', marginBottom: '16px' }}>Detalhamento Mensal</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff' }}>
          <thead>
            <tr style={{ color: '#888', textAlign: 'left', borderBottom: '1px solid #333' }}>
              <th style={{ padding: '12px' }}>Mês</th>
              <th style={{ padding: '12px' }}>Receita</th>
              <th style={{ padding: '12px' }}>Despesa</th>
              <th style={{ padding: '12px' }}>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {dadosMensais.map((item, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #222' }}>
                <td style={{ padding: '12px' }}>{item.mes}</td>
                <td style={{ padding: '12px' }}>R$ {item.receita.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                <td style={{ padding: '12px', color: '#ff4d4d' }}>R$ {item.despesa.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                <td style={{ padding: '12px', color: '#34d399' }}>R$ {(item.receita - item.despesa).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}