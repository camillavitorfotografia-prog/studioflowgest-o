import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Banknote,
  Building2,
  Camera,
  CheckCircle2,
  MapPin,
  Save,
  Share2,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react';
import { capitalizeName, maskCurrency, maskPhone } from '../../utils/masks';
import { getDbStudioData, loadProfileFromDb, saveProfileToDb, subscribeDbUpdates } from '../../utils/dbData';

const PROFILE_KEY = 'cv_perfil_data';
const PHOTO_KEY = 'cv_foto_perfil';

const emailDomains = ['@gmail.com', '@outlook.com', '@hotmail.com', '@yahoo.com', '@icloud.com'];
const smartTitleFields = new Set([
  'empresaNome',
  'nomeFantasia',
  'responsavelNome',
  'fotografoResponsavel',
  'videomakerResponsavel',
  'titularConta',
  'cidade',
  'estado',
  'bairro',
  'rua',
]);

const defaultProfile = {
  empresaNome: 'StudioFlow',
  nomeFantasia: 'StudioFlow',
  responsavelNome: 'Camilla & Junior',
  areaAtuacao: 'Fotografia e Filmagem',
  cnpj: '',
  cpf: '',
  telefone: '',
  whatsapp: '',
  email: 'contato@studioflow.com',
  instagram: '@studioflow',
  site: '',
  rua: '',
  numero: '',
  bairro: '',
  cidade: 'Porto Seguro',
  estado: 'BA',
  cep: '',
  pais: 'Brasil',
  fotografoResponsavel: 'Camilla',
  videomakerResponsavel: 'Junior',
  equipe: '',
  regiaoAtendimento: '',
  quilometragemGratuita: '',
  valorKmExcedente: '',
  pixTipo: 'CPF',
  pixChave: '',
  banco: '',
  agencia: '',
  conta: '',
  titularConta: '',
  facebook: '',
  youtube: '',
  tiktok: '',
  pinterest: '',
  idioma: 'Português',
  formatoData: 'DD/MM/AAAA',
  formatoMoeda: 'BRL - Real brasileiro',
  fusoHorario: 'America/Sao_Paulo',
  tema: 'StudioFlow Dark',
  assinaturas: {
    adobe: '',
    googleDrive: '',
    canva: '',
    chatgpt: '',
    dominio: '',
    hospedagem: '',
    outras: '',
  },
};

const migrateProfile = (saved = {}) => {
  const redesSociais = saved.redesSociais || {};
  const pix = saved.pix || {};
  const configuracoes = saved.configuracoes || {};

  return {
    ...defaultProfile,
    ...saved,
    empresaNome: saved.empresaNome || saved.nomeEmpresa || saved.studio || defaultProfile.empresaNome,
    nomeFantasia: saved.nomeFantasia || saved.studio || defaultProfile.nomeFantasia,
    responsavelNome: saved.responsavelNome || saved.nome || defaultProfile.responsavelNome,
    telefone: saved.telefone || defaultProfile.telefone,
    email: saved.email || defaultProfile.email,
    cnpj: saved.cnpj || defaultProfile.cnpj,
    cep: saved.cep || defaultProfile.cep,
    rua: saved.rua || saved.endereco || defaultProfile.rua,
    bairro: saved.bairro || defaultProfile.bairro,
    cidade: saved.cidade || defaultProfile.cidade,
    estado: saved.estado || defaultProfile.estado,
    pixTipo: saved.pixTipo || pix.tipo || defaultProfile.pixTipo,
    pixChave: saved.pixChave || pix.chave || defaultProfile.pixChave,
    instagram: saved.instagram || redesSociais.instagram || defaultProfile.instagram,
    facebook: saved.facebook || redesSociais.facebook || defaultProfile.facebook,
    youtube: saved.youtube || redesSociais.youtube || defaultProfile.youtube,
    tiktok: saved.tiktok || redesSociais.tiktok || defaultProfile.tiktok,
    pinterest: saved.pinterest || redesSociais.pinterest || defaultProfile.pinterest,
    idioma: saved.idioma || configuracoes.idioma || defaultProfile.idioma,
    formatoData: saved.formatoData || configuracoes.formatoData || defaultProfile.formatoData,
    formatoMoeda: saved.formatoMoeda || configuracoes.formatoMoeda || defaultProfile.formatoMoeda,
    fusoHorario: saved.fusoHorario || configuracoes.fusoHorario || defaultProfile.fusoHorario,
    tema: saved.tema || configuracoes.tema || defaultProfile.tema,
    assinaturas: { ...defaultProfile.assinaturas, ...(saved.assinaturas || {}) },
  };
};

const profilePayload = (profile) => ({
  ...profile,
  nomeEmpresa: profile.empresaNome,
  titular: profile.titularConta,
  pix: {
    tipo: profile.pixTipo,
    chave: profile.pixChave,
  },
  redesSociais: {
    instagram: profile.instagram,
    facebook: profile.facebook,
    youtube: profile.youtube,
    tiktok: profile.tiktok,
    pinterest: profile.pinterest,
  },
  configuracoes: {
    idioma: profile.idioma,
    formatoData: profile.formatoData,
    formatoMoeda: profile.formatoMoeda,
    fusoHorario: profile.fusoHorario,
    tema: profile.tema,
  },
});

const loadProfile = () => {
  try {
    return migrateProfile(JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}'));
  } catch {
    return defaultProfile;
  }
};

const onlyDigits = (value) => String(value || '').replace(/\D/g, '');

const maskCep = (value) => {
  const digits = onlyDigits(value).slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
};

const maskCpf = (value) => {
  const digits = onlyDigits(value).slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
};

const maskCnpj = (value) => {
  const digits = onlyDigits(value).slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
};

const normalizeInstagram = (value) => {
  const clean = String(value || '').replace(/[^a-zA-Z0-9._]/g, '').replace(/^@+/, '');
  return clean ? `@${clean}` : '';
};

const normalizeSite = (value) => {
  const clean = String(value || '').trim();
  if (!clean) return '';
  if (/^https?:\/\//i.test(clean)) return clean;
  return `https://${clean}`;
};

const isValidEmail = (value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const formatInitials = (name) =>
  (name || 'SF')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');

export default function Perfil() {
  const fileInputRef = useRef(null);
  const [savedProfile, setSavedProfile] = useState(loadProfile);
  const [formData, setFormData] = useState(savedProfile);
  const [fotoPerfil, setFotoPerfil] = useState(() => localStorage.getItem(PHOTO_KEY) || null);
  const [errors, setErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [externalData, setExternalData] = useState({
    clients: [],
    equipment: [],
    transactions: [],
  });

  useEffect(() => {
    let active = true;
    const syncData = async () => {
      const localProfile = loadProfile();
      setSavedProfile(localProfile);
      try {
        const [dbProfile, db] = await Promise.all([
          loadProfileFromDb().catch((error) => {
            console.error('Falha ao carregar perfil do banco:', error.message);
            return null;
          }),
          getDbStudioData(),
        ]);
        if (!active) return;
        if (dbProfile) {
          const migratedProfile = migrateProfile(dbProfile);
          localStorage.setItem(PROFILE_KEY, JSON.stringify(migratedProfile));
          setSavedProfile(migratedProfile);
          setFormData(migratedProfile);
        }
        setExternalData({
          clients: db.clients || [],
          equipment: db.equipment || [],
          transactions: db.transactions || [],
        });
      } catch (e) {
        console.error('Falha ao ler sincronização de dados do perfil:', e);
      }
    };

    setTimeout(() => { void syncData(); }, 0);
    window.addEventListener('focus', syncData);
    const unsubscribe = subscribeDbUpdates(syncData);
    return () => {
      active = false;
      window.removeEventListener('focus', syncData);
      unsubscribe();
    };
  }, []);


  const location = [formData.cidade, formData.estado].filter(Boolean).join(' - ');
  const hasChanges = useMemo(() => JSON.stringify(formData) !== JSON.stringify(savedProfile), [formData, savedProfile]);
  const [saveState, setSaveState] = useState('saved');

  useEffect(() => {
    if (isSaving) setSaveState('saving');
    else if (hasChanges) setSaveState('changed');
    else setSaveState('saved');
  }, [hasChanges, isSaving]);

  const updateField = (name, rawValue) => {
    let value = rawValue;
    if (smartTitleFields.has(name)) value = capitalizeName(value);
    if (name === 'telefone' || name === 'whatsapp') value = maskPhone(value);
    if (name === 'cep') value = maskCep(value);
    if (name === 'cnpj') value = maskCnpj(value);
    if (name === 'cpf') value = maskCpf(value);
    if (name === 'instagram' || name === 'facebook' || name === 'tiktok') value = normalizeInstagram(value);
    if (name === 'valorKmExcedente') value = maskCurrency(value);
    if (name === 'pixChave') value = formatPixValue(formData.pixTipo, value);

    setFormData((current) => ({ ...current, [name]: value }));
    if (errors[name]) setErrors((current) => ({ ...current, [name]: false }));
  };

  const updatePixType = (pixTipo) => {
    setFormData((current) => ({ ...current, pixTipo, pixChave: '' }));
  };

  const handlePhotoChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setFotoPerfil(reader.result);
      localStorage.setItem(PHOTO_KEY, reader.result);
      window.dispatchEvent(new CustomEvent('sf_profile_photo_update', { detail: { photo: reader.result } }));
    };
    reader.readAsDataURL(file);
  };

  const validate = () => {
    const nextErrors = {};
    if (!formData.empresaNome.trim()) nextErrors.empresaNome = true;
    if (!formData.responsavelNome.trim()) nextErrors.responsavelNome = true;
    if (!isValidEmail(formData.email)) nextErrors.email = true;
    if (formData.pixTipo === 'E-mail' && !isValidEmail(formData.pixChave)) nextErrors.pixChave = true;
    return nextErrors;
  };

  const saveProfile = async () => {
    const nextErrors = validate();
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    setIsSaving(true);
    try {
      const normalized = profilePayload({
        ...formData,
        site: normalizeSite(formData.site),
        instagram: normalizeInstagram(formData.instagram),
        facebook: normalizeInstagram(formData.facebook),
        tiktok: normalizeInstagram(formData.tiktok),
      });
      const saved = migrateProfile(await saveProfileToDb(normalized));
      localStorage.setItem(PROFILE_KEY, JSON.stringify(saved));
      setFormData(saved);
      setSavedProfile(saved);
      setErrors({});
      window.dispatchEvent(new Event('storage'));
    } catch (error) {
      setSaveState('error');
      console.error('Erro ao salvar perfil no Supabase:', error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const cancelChanges = () => {
    setFormData(savedProfile);
    setErrors({});
  };

  return (
    <div className="sf-profile-page">
      <div className="sf-section-header">
        <div>
          <h1>Perfil do Estúdio</h1>
          <p>Configurações da empresa, dados operacionais e diretrizes comerciais usadas pelo StudioFlow.</p>
        </div>
      </div>

      <div className="sf-profile-grid">
        <section className="sf-card sf-company-card">
          <div className="sf-company-photo">
            {fotoPerfil ? <img src={fotoPerfil} alt="Logomarca da empresa" /> : <span>{formatInitials(formData.empresaNome)}</span>}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoChange} hidden />
          <button className="sf-secondary-button" onClick={() => fileInputRef.current?.click()}>
            <Camera size={17} /> Alterar Foto
          </button>
          <div className="sf-company-info">
            <strong>{formData.empresaNome || 'Nome da empresa'}</strong>
            <span>{formData.responsavelNome || 'Responsável'}</span>
            <span>{formData.areaAtuacao || 'Área de atuação'}</span>
            <span>{location || 'Cidade - Estado'}</span>
          </div>
        </section>

        <ProfileCard icon={Building2} title="Dados da Empresa">
          <Field label="Nome da Empresa" error={errors.empresaNome}><input value={formData.empresaNome} onChange={(event) => updateField('empresaNome', event.target.value)} /></Field>
          <Field label="Nome Fantasia"><input value={formData.nomeFantasia} onChange={(event) => updateField('nomeFantasia', event.target.value)} /></Field>
          <Field label="CNPJ ou MEI"><input value={formData.cnpj} onChange={(event) => updateField('cnpj', event.target.value)} inputMode="numeric" /></Field>
          <Field label="CPF"><input value={formData.cpf} onChange={(event) => updateField('cpf', event.target.value)} inputMode="numeric" /></Field>
          <Field label="Telefone"><input value={formData.telefone} onChange={(event) => updateField('telefone', event.target.value)} inputMode="tel" /></Field>
          <Field label="WhatsApp"><input value={formData.whatsapp} onChange={(event) => updateField('whatsapp', event.target.value)} inputMode="tel" /></Field>
          <Field label="E-mail" error={errors.email} helper={errors.email ? 'Formato de e-mail inválido.' : ''}><input type="email" list="email-domains" value={formData.email} onChange={(event) => updateField('email', event.target.value)} /></Field>
          <Field label="Instagram"><input value={formData.instagram} onChange={(event) => updateField('instagram', event.target.value)} /></Field>
          <Field label="Site"><input value={formData.site} onChange={(event) => updateField('site', event.target.value)} onBlur={(event) => updateField('site', normalizeSite(event.target.value))} /></Field>
        </ProfileCard>

        <ProfileCard icon={MapPin} title="Endereço">
          <Field label="Rua"><input value={formData.rua} onChange={(event) => updateField('rua', event.target.value)} /></Field>
          <Field label="Número"><input value={formData.numero} onChange={(event) => updateField('numero', event.target.value)} /></Field>
          <Field label="Bairro"><input value={formData.bairro} onChange={(event) => updateField('bairro', event.target.value)} /></Field>
          <Field label="Cidade"><input value={formData.cidade} onChange={(event) => updateField('cidade', event.target.value)} /></Field>
          <Field label="Estado"><input value={formData.estado} onChange={(event) => updateField('estado', event.target.value)} /></Field>
          <Field label="CEP"><input value={formData.cep} onChange={(event) => updateField('cep', event.target.value)} inputMode="numeric" /></Field>
          <Field label="País"><input value={formData.pais} onChange={(event) => updateField('pais', capitalizeName(event.target.value))} /></Field>
        </ProfileCard>

        <ProfileCard icon={UserRound} title="Dados Profissionais">
          <Field label="Fotógrafo responsável"><input value={formData.fotografoResponsavel} onChange={(event) => updateField('fotografoResponsavel', event.target.value)} /></Field>
          <Field label="Videomaker responsável"><input value={formData.videomakerResponsavel} onChange={(event) => updateField('videomakerResponsavel', event.target.value)} /></Field>
          <Field label="Equipe"><input value={formData.equipe} onChange={(event) => updateField('equipe', event.target.value)} /></Field>
          <Field label="Região de atendimento"><input value={formData.regiaoAtendimento} onChange={(event) => updateField('regiaoAtendimento', event.target.value)} /></Field>
          <Field label="Quilometragem gratuita"><input value={formData.quilometragemGratuita} onChange={(event) => updateField('quilometragemGratuita', onlyDigits(event.target.value))} inputMode="numeric" /></Field>
          <Field label="Valor por KM excedente"><input value={formData.valorKmExcedente} onChange={(event) => updateField('valorKmExcedente', event.target.value)} inputMode="numeric" /></Field>
        </ProfileCard>

        <ProfileCard icon={Banknote} title="Dados Bancários">
          <Field label="Tipo de PIX">
            <select value={formData.pixTipo} onChange={(event) => updatePixType(event.target.value)}>
              {['CPF', 'CNPJ', 'Celular', 'E-mail', 'Chave Aleatória'].map((item) => <option key={item}>{item}</option>)}
            </select>
          </Field>
          <Field label={`Chave PIX (${formData.pixTipo})`} error={errors.pixChave} helper={errors.pixChave ? 'Chave PIX inválida para o tipo selecionado.' : ''}>
            <input value={formData.pixChave} onChange={(event) => updateField('pixChave', event.target.value)} inputMode={formData.pixTipo === 'E-mail' ? 'email' : 'text'} />
          </Field>
          <Field label="Banco"><input value={formData.banco} onChange={(event) => updateField('banco', event.target.value)} /></Field>
          <Field label="Agência"><input value={formData.agencia} onChange={(event) => updateField('agencia', event.target.value)} /></Field>
          <Field label="Conta"><input value={formData.conta} onChange={(event) => updateField('conta', event.target.value)} /></Field>
          <Field label="Titular"><input value={formData.titularConta} onChange={(event) => updateField('titularConta', event.target.value)} /></Field>
        </ProfileCard>

        <ProfileCard icon={Share2} title="Redes Sociais">
          <Field label="Instagram"><input value={formData.instagram} onChange={(event) => updateField('instagram', event.target.value)} /></Field>
          <Field label="Facebook"><input value={formData.facebook} onChange={(event) => updateField('facebook', event.target.value)} /></Field>
          <Field label="YouTube"><input value={formData.youtube} onChange={(event) => updateField('youtube', event.target.value)} /></Field>
          <Field label="TikTok"><input value={formData.tiktok} onChange={(event) => updateField('tiktok', event.target.value)} /></Field>
          <Field label="Pinterest"><input value={formData.pinterest} onChange={(event) => updateField('pinterest', event.target.value)} /></Field>
        </ProfileCard>




      </div>

      <div className="sf-profile-savebar" role="status" aria-live="polite">
        <div className={`sf-profile-save-state ${saveState}`}>
          {saveState === 'saving' && <><span className="sf-save-spinner" /> Salvando...</>}
          {saveState === 'saved' && <><CheckCircle2 size={16} /> Salvo</>}
          {saveState === 'changed' && <><Sparkles size={16} /> Alterações não salvas</>}
          {saveState === 'error' && <>Erro ao salvar. Tente novamente.</>}
        </div>
        <div className="sf-profile-save-actions">
          <button className="sf-secondary-button" onClick={cancelChanges} disabled={!hasChanges || isSaving}><X size={17} /> Descartar</button>
          <button className="sf-primary-button" onClick={saveProfile} disabled={!hasChanges || isSaving}><Save size={17} /> Salvar alterações</button>
        </div>
      </div>

      <datalist id="email-domains">
        {emailDomains.map((domain) => <option value={domain} key={domain} />)}
      </datalist>
    </div>
  );
}

function formatPixValue(type, value) {
  if (type === 'CPF') return maskCpf(value);
  if (type === 'CNPJ') return maskCnpj(value);
  if (type === 'Celular') return maskPhone(value);
  if (type === 'E-mail') return String(value || '').trim().toLowerCase();
  return String(value || '').trim();
}

function ProfileCard({ icon: Icon, title, children }) {
  return (
    <section className="sf-card sf-profile-card">
      <div className="metric-label" style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
        <Icon size={18} style={{ color: '#c5a059' }} /> {title}
      </div>
      <div className="sf-profile-fields">{children}</div>
    </section>
  );
}

function Field({ label, children, error, helper }) {
  return (
    <label className={error ? 'sf-field error' : 'sf-field'}>
      <span>{label}</span>
      {children}
      {helper && <small>{helper}</small>}
    </label>
  );
}
