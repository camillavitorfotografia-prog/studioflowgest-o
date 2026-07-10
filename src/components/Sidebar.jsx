import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  BarChart3,
  CalendarDays,
  Calculator,
  DollarSign,
  FolderOpen,
  Home,
  LogOut,
  Menu,
  Package,
  Target,
  User,
  Users,
  X,
} from 'lucide-react';
import LogoIcon from '../assets/studioflow-icon.png';
import Logo from '../assets/studioflow-logo.png';
import { useAuth } from '../contexts/useAuth';
import './Sidebar.css';

const PROFILE_PHOTO_KEY = 'cv_foto_perfil';
const PROFILE_DATA_KEY = 'cv_perfil_data';

const readProfileCompanyName = () => {
  try {
    const profile = JSON.parse(localStorage.getItem(PROFILE_DATA_KEY) || '{}');
    return profile.empresaNome || profile.nomeEmpresa || profile.studio || '';
  } catch {
    return '';
  }
};

const initialsFromName = (name = '') => {
  const initials = String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  return initials || 'SF';
};

export default function Sidebar() {
  const linkClass = ({ isActive }) => (isActive ? 'nav-link active' : 'nav-link');
  const { user, signOut } = useAuth();
  const userName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || 'Usuário';
  const [profilePhoto, setProfilePhoto] = useState(() => localStorage.getItem(PROFILE_PHOTO_KEY) || '');
  const [profileCompanyName, setProfileCompanyName] = useState(readProfileCompanyName);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    const syncProfileIdentity = (event) => {
      setProfilePhoto(event?.detail?.photo || localStorage.getItem(PROFILE_PHOTO_KEY) || '');
      setProfileCompanyName(readProfileCompanyName());
    };

    window.addEventListener('sf_profile_photo_update', syncProfileIdentity);
    window.addEventListener('storage', syncProfileIdentity);
    window.addEventListener('sf_storage_update', syncProfileIdentity);
    return () => {
      window.removeEventListener('sf_profile_photo_update', syncProfileIdentity);
      window.removeEventListener('storage', syncProfileIdentity);
      window.removeEventListener('sf_storage_update', syncProfileIdentity);
    };
  }, []);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setIsMobileOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Erro ao sair:', error.message);
    }
  };

  return (
    <>
      <button
        type="button"
        className="sidebar-mobile-toggle"
        onClick={() => setIsMobileOpen((open) => !open)}
        aria-label={isMobileOpen ? 'Fechar menu' : 'Abrir menu'}
        aria-expanded={isMobileOpen}
      >
        {isMobileOpen ? <X /> : <Menu />}
      </button>
      <button
        type="button"
        className={`sidebar-backdrop${isMobileOpen ? ' visible' : ''}`}
        onClick={() => setIsMobileOpen(false)}
        aria-label="Fechar menu"
      />
      <aside className={`sidebar${isMobileOpen ? ' mobile-open' : ''}`}>
      <div className="sidebar-main">
        <div className="sidebar-logo">
          <picture className="sidebar-logo-picture">
            <source srcSet={LogoIcon} media="(max-width: 1180px)" />
            <img
              src={Logo}
              alt="StudioFlow"
              className="sidebar-logo-image"
            />
          </picture>
        </div>

        <nav onClick={() => setIsMobileOpen(false)}>
          <NavLink to="/" className={linkClass} title="Dashboard">
            <Home /> <span>Dashboard</span>
          </NavLink>

          <NavLink to="/crm" className={linkClass} title="CRM">
            <Target /> <span>CRM</span>
          </NavLink>

          <NavLink to="/clientes" className={linkClass} title="Clientes">
            <Users /> <span>Clientes</span>
          </NavLink>

          <NavLink to="/projetos" className={linkClass} title="Projetos">
            <FolderOpen /> <span>Projetos</span>
          </NavLink>

          <NavLink to="/agenda" className={linkClass} title="Agenda">
            <CalendarDays /> <span>Agenda</span>
          </NavLink>

          <NavLink to="/financeiro" className={linkClass} title="Financeiro">
            <DollarSign /> <span>Financeiro</span>
          </NavLink>

          <NavLink to="/precificacao" className={linkClass} title="Precificação">
            <Calculator /> <span>Precificacao</span>
          </NavLink>

          <NavLink to="/equipamentos" className={linkClass} title="Equipamentos">
            <Package /> <span>Equipamentos</span>
          </NavLink>

          <NavLink to="/relatorios" className={linkClass} title="Relatórios">
            <BarChart3 /> <span>Relatórios</span>
          </NavLink>

          <NavLink to="/perfil" className={linkClass} title="Perfil">
            <User /> <span>Perfil</span>
          </NavLink>
        </nav>
      </div>

      <div className="sidebar-user">
        <span className="sidebar-user-avatar" aria-label={profilePhoto ? `Foto de ${profileCompanyName || userName}` : `Iniciais de ${profileCompanyName || userName}`}>
          {profilePhoto
            ? <img src={profilePhoto} alt={profileCompanyName || userName} />
            : <span className="sidebar-user-initials">{initialsFromName(profileCompanyName || userName)}</span>}
        </span>
        <div>
          <strong>{userName}</strong>
          <span>{user?.email}</span>
        </div>
        <button type="button" onClick={handleSignOut} title="Sair">
          <LogOut />
        </button>
      </div>
      </aside>
    </>
  );
}
