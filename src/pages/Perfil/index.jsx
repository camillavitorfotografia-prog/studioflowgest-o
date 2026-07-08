import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Mail, Phone, Camera, Lock, Save, Briefcase, MapPin, Edit3, BarChart2, ChevronRight, Wallet, ArrowLeft } from 'lucide-react';

export default function Perfil() {
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false); 
  
  // CORREÇÃO: Lê a foto salva no localStorage se existir
  const [fotoPerfil, setFotoPerfil] = useState(() => localStorage.getItem('cv_foto_perfil') || null);
  
  // CORREÇÃO: Lê os dados do localStorage ao iniciar
  const [formData, setFormData] = useState(() => {
    const saved = localStorage.getItem('cv_perfil_data');
    return saved ? JSON.parse(saved) : {
      nome: 'Camilla Vitor',
      email: 'contato@camillavitor.com',
      telefone: '',
      studio: '',
      cnpj: '',
      cep: '',
      endereco: '',
      numero: '',
      complemento: '',
      bairro: '',
      estado: 'BA',
      cidade: 'Porto Seguro',
      senha: '',
      confirmarSenha: ''
    };
  });

  const [errors, setErrors] = useState({});
  const [estados, setEstados] = useState([]);
  const [cidades, setCidades] = useState([]);

  useEffect(() => {
    fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome')
      .then((response) => response.json())
      .then((data) => setEstados(data))
      .catch((error) => console.error("Erro ao buscar estados:", error));
  }, []);

  useEffect(() => {
    if (formData.estado) {
      fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${formData.estado}/municipios?orderBy=nome`)
        .then((response) => response.json())
        .then((data) => setCidades(data))
        .catch((error) => console.error("Erro ao buscar cidades:", error));
    }
  }, [formData.estado]);

  // CORREÇÃO: Converte a foto para Base64 e salva no localStorage
  const handleFotoChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result;
        setFotoPerfil(base64String);
        localStorage.setItem('cv_foto_perfil', base64String);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    const novosErros = {};
    if (!formData.nome.trim()) novosErros.nome = true;
    if (!formData.email.trim()) novosErros.email = true;
    if (!formData.telefone.trim()) novosErros.telefone = true;
    if (!formData.cnpj.trim()) novosErros.cnpj = true;
    if (!formData.senha.trim()) novosErros.senha = true;

    if (Object.keys(novosErros).length > 0) {
      setErrors(novosErros);
      return;
    }

    if (formData.senha !== formData.confirmarSenha) {
      setErrors({ confirmarSenha: true, senha: true });
      return;
    }

    // CORREÇÃO: Persiste os dados no localStorage ao salvar
    localStorage.setItem('cv_perfil_data', JSON.stringify(formData));

    setErrors({});
    setIsEditing(false); 
  };

  const maskPhone = (value) => value.replace(/\D/g, '').replace(/^(\d{2})(\d)/g, '($1) $2').replace(/(\d)(\d{4})$/, '$1-$2').slice(0, 16);
  const maskCNPJ = (value) => value.replace(/\D/g, '').replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2').slice(0, 18);

  const handleChange = (e) => {
    let { name, value } = e.target;
    if (name === 'telefone') value = maskPhone(value);
    if (name === 'cnpj') value = maskCNPJ(value);
    if (errors[name]) setErrors({ ...errors, [name]: false });
    setFormData({ ...formData, [name]: value });
  };

  const handleEstadoChange = (e) => {
    setFormData({ ...formData, estado: e.target.value, cidade: '' });
  };

  const baseInputStyle = { width: '100%', backgroundColor: 'rgba(255, 255, 255, 0.03)', color: '#fff', padding: '12px 16px 12px 40px', borderRadius: '8px', outline: 'none', transition: 'border-color 0.3s, box-shadow 0.3s' };
  const getInputStyle = (fieldName) => ({ ...baseInputStyle, border: `1px solid ${errors[fieldName] ? '#ff4d4d' : 'var(--border-color, #333)'}`, boxShadow: errors[fieldName] ? '0 0 0 1px #ff4d4d' : 'none' });
  const selectStyle = { ...baseInputStyle, border: '1px solid var(--border-color, #333)', paddingLeft: '16px', cursor: 'pointer', appearance: 'auto' };
  const iconStyle = (fieldName) => ({ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: errors[fieldName] ? '#ff4d4d' : 'var(--text-secondary, #888)', transition: 'color 0.3s' });
  const backButtonStyle = { backgroundColor: 'transparent', color: '#888', border: '1px solid #333', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' };

  return (
    <>
      <style>{`
        input:-webkit-autofill,
        input:-webkit-autofill:hover, 
        input:-webkit-autofill:focus, 
        input:-webkit-autofill:active {
            -webkit-box-shadow: 0 0 0 30px #121212 inset !important;
            -webkit-text-fill-color: #ffffff !important;
            transition: background-color 5000s ease-in-out 0s;
        }
      `}</style>

      {!isEditing ? (
        <div style={{ maxWidth: '700px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
            <button onClick={() => navigate('/')} style={backButtonStyle}><ArrowLeft size={16}/> Voltar</button>
            <h1 style={{ color: '#fff', fontSize: '2rem', fontWeight: '600', margin: 0 }}>Painel da Empresa</h1>
          </div>
          <p style={{ color: '#888', marginBottom: '24px' }}>Acesse as configurações do seu perfil, relatórios, finanças e equipamentos.</p>

          <div onClick={() => setIsEditing(true)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', backgroundColor: '#1a1a1a', borderRadius: '12px', cursor: 'pointer', transition: 'background-color 0.2s', border: '1px solid #2a2a2a' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#222'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#1a1a1a'}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '50px', height: '50px', borderRadius: '50%', overflow: 'hidden', border: '2px solid #d4af37', backgroundColor: '#2a2a2a', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                {fotoPerfil ? <img src={fotoPerfil} alt="Perfil" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Camera size={24} color="#888" />}
              </div>
              <span style={{ color: '#fff', fontSize: '1.2rem', fontWeight: '500' }}>{formData.studio}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#888' }}><span style={{ fontSize: '0.9rem' }}>Editar Perfil</span><Edit3 size={18} /></div>
          </div>

          <div onClick={() => navigate('/equipamentos')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', backgroundColor: '#1a1a1a', borderRadius: '12px', cursor: 'pointer', transition: 'background-color 0.2s', border: '1px solid #2a2a2a' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#222'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#1a1a1a'}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}><div style={{ width: '50px', height: '50px', borderRadius: '50%', backgroundColor: 'rgba(212, 175, 55, 0.1)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}><Camera size={24} color="#d4af37" /></div><span style={{ color: '#fff', fontSize: '1.2rem', fontWeight: '500' }}>Equipamentos</span></div>
            <ChevronRight size={20} color="#888" />
          </div>

          <div onClick={() => navigate('/financas')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', backgroundColor: '#1a1a1a', borderRadius: '12px', cursor: 'pointer', transition: 'background-color 0.2s', border: '1px solid #2a2a2a' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#222'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#1a1a1a'}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}><div style={{ width: '50px', height: '50px', borderRadius: '50%', backgroundColor: 'rgba(212, 175, 55, 0.1)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}><Wallet size={24} color="#d4af37" /></div><span style={{ color: '#fff', fontSize: '1.2rem', fontWeight: '500' }}>Finanças</span></div>
            <ChevronRight size={20} color="#888" />
          </div>

          <div onClick={() => navigate('/relatorios')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', backgroundColor: '#1a1a1a', borderRadius: '12px', cursor: 'pointer', transition: 'background-color 0.2s', border: '1px solid #2a2a2a' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#222'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#1a1a1a'}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}><div style={{ width: '50px', height: '50px', borderRadius: '50%', backgroundColor: 'rgba(212, 175, 55, 0.1)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}><BarChart2 size={24} color="#d4af37" /></div><span style={{ color: '#fff', fontSize: '1.2rem', fontWeight: '500' }}>Relatórios</span></div>
            <ChevronRight size={20} color="#888" />
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', maxWidth: '800px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <button onClick={() => setIsEditing(false)} style={backButtonStyle}><ArrowLeft size={16}/> Voltar</button>
              <div>
                <h1 style={{ color: '#fff', fontSize: '2rem', fontWeight: '600', margin:0 }}>Editar Perfil</h1>
                <p style={{ color: '#888', marginTop: '8px' }}>Gerencie suas informações pessoais e os dados cadastrais da empresa.</p>
              </div>
            </div>
          </div>
          <div className="glass" style={{ padding: '32px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '24px', backgroundColor: '#1a1a1a' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '8px' }}>
              <label style={{ cursor: 'pointer', position: 'relative' }}>
                <input type="file" accept="image/*" onChange={handleFotoChange} style={{ display: 'none' }} />
                <div style={{ width: '100px', height: '100px', borderRadius: '50%', backgroundColor: '#2a2a2a', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', border: '2px dashed #d4af37', transition: 'border 0.3s' }}>
                  {fotoPerfil ? <img src={fotoPerfil} alt="Perfil" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Camera size={32} color="#888" />}
                </div>
                <div style={{ position: 'absolute', bottom: '0', right: '0', backgroundColor: '#d4af37', padding: '6px', borderRadius: '50%' }}><Camera size={14} color="#000" /></div>
              </label>
            </div>
            <div>
              <h3 style={{ color: '#fff', marginBottom: '16px', fontSize: '1.2rem', borderBottom: '1px solid #333', paddingBottom: '8px' }}>Dados Pessoais</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ position: 'relative' }}><User size={18} style={iconStyle('nome')} /><input type="text" name="nome" value={formData.nome} onChange={handleChange} style={getInputStyle('nome')} placeholder="Nome Completo *" /></div>
                <div style={{ position: 'relative' }}><Phone size={18} style={iconStyle('telefone')} /><input type="text" name="telefone" value={formData.telefone} onChange={handleChange} style={getInputStyle('telefone')} placeholder="Telefone *" /></div>
                <div style={{ position: 'relative', gridColumn: 'span 2' }}><Mail size={18} style={iconStyle('email')} /><input type="email" name="email" value={formData.email} onChange={handleChange} style={getInputStyle('email')} placeholder="E-mail *" /></div>
              </div>
            </div>
            <div>
              <h3 style={{ color: '#fff', marginBottom: '16px', fontSize: '1.2rem', borderBottom: '1px solid #333', paddingBottom: '8px' }}>Dados da Empresa</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ position: 'relative' }}><Camera size={18} style={iconStyle('studio')} /><input type="text" name="studio" value={formData.studio} onChange={handleChange} style={getInputStyle('studio')} placeholder="Nome da Empresa" /></div>
                <div style={{ position: 'relative' }}><Briefcase size={18} style={iconStyle('cnpj')} /><input type="text" name="cnpj" value={formData.cnpj} onChange={handleChange} style={getInputStyle('cnpj')} placeholder="CNPJ *" /></div>
                <div style={{ position: 'relative' }}><MapPin size={18} style={iconStyle('cep')} /><input type="text" name="cep" value={formData.cep} onChange={handleChange} style={getInputStyle('cep')} placeholder="CEP" /></div>
                <div style={{ position: 'relative' }}><MapPin size={18} style={iconStyle('endereco')} /><input type="text" name="endereco" value={formData.endereco} onChange={handleChange} style={getInputStyle('endereco')} placeholder="Endereço" /></div>
                <div style={{ position: 'relative' }}><MapPin size={18} style={iconStyle('numero')} /><input type="text" name="numero" value={formData.numero} onChange={handleChange} style={getInputStyle('numero')} placeholder="Número" /></div>
                <div style={{ position: 'relative' }}><MapPin size={18} style={iconStyle('complemento')} /><input type="text" name="complemento" value={formData.complemento} onChange={handleChange} style={getInputStyle('complemento')} placeholder="Complemento" /></div>
                <div style={{ position: 'relative', gridColumn: 'span 2' }}><MapPin size={18} style={iconStyle('bairro')} /><input type="text" name="bairro" value={formData.bairro} onChange={handleChange} style={getInputStyle('bairro')} placeholder="Bairro" /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px', gridColumn: 'span 2' }}>
                  <select name="estado" value={formData.estado} onChange={handleEstadoChange} style={selectStyle}><option value="">Selecione o Estado</option>{estados.map((uf) => (<option key={uf.id} value={uf.sigla}>{uf.nome} ({uf.sigla})</option>))}</select>
                  <select name="cidade" value={formData.cidade} onChange={handleChange} style={selectStyle} disabled={!formData.estado}><option value="">Selecione a Cidade</option>{cidades.map((cidade) => (<option key={cidade.id} value={cidade.nome}>{cidade.nome}</option>))}</select>
                </div>
              </div>
            </div>
            <div>
              <h3 style={{ color: '#fff', marginBottom: '16px', fontSize: '1.2rem', borderBottom: '1px solid #333', paddingBottom: '8px' }}>Segurança</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ position: 'relative' }}><Lock size={18} style={iconStyle('senha')} /><input type="password" name="senha" value={formData.senha} onChange={handleChange} style={getInputStyle('senha')} placeholder="Nova Senha *" /></div>
                <div style={{ position: 'relative' }}><Lock size={18} style={iconStyle('confirmarSenha')} /><input type="password" name="confirmarSenha" value={formData.confirmarSenha} onChange={handleChange} style={getInputStyle('confirmarSenha')} placeholder="Confirmar Senha *" /></div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button onClick={handleSave} style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#d4af37', color: '#000', padding: '12px 24px', borderRadius: '8px', border: 'none', fontWeight: '600', cursor: 'pointer' }}><Save size={18} /> Salvar Alterações</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}