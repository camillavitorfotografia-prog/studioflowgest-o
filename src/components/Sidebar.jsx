import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  FileSignature,
  FileText,
  KeyRound,
  LogIn,
  LogOut,
  Menu,
  Settings,
  UserRound,
  X,
} from 'lucide-react';
import LogoFull from '../assets/studioflow-logo-official-cropped.png';
import LogoIcon from '../assets/studioflow-icon-official-cropped.png';
import { useAuth } from '../contexts/useAuth';
import { loadSettings } from '../utils/settings';
import { DEFAULT_SIDEBAR_SETTINGS, SIDEBAR_MODULES } from '../utils/sidebarModules';
import './Sidebar.css';

const PROFILE_PHOTO_KEY = 'cv_foto_perfil';
const PROFILE_DATA_KEY = 'cv_perfil_data';

const normalizeSidebarSettings = (loaded = {}) => {
  const savedOrder = Array.isArray(loaded.sidebarOrder)
    ? loaded.sidebarOrder
    : [];

  const validSavedOrder = savedOrder.filter((moduleId) => (
    SIDEBAR_MODULES.some((module) => module.id === moduleId)
  ));

  const missingModuleIds = DEFAULT_SIDEBAR_SETTINGS.sidebarOrder.filter((moduleId) => (
    !validSavedOrder.includes(moduleId)
  ));

  return {
    order: [...validSavedOrder, ...missingModuleIds],
    visibility: {
      ...DEFAULT_SIDEBAR_SETTINGS.sidebarVisibility,
      ...(loaded.sidebarVisibility || {}),
    },
    compact: loaded.sidebarCompact ?? DEFAULT_SIDEBAR_SETTINGS.sidebarCompact,
    showLabels: loaded.sidebarShowLabels ?? DEFAULT_SIDEBAR_SETTINGS.sidebarShowLabels,
    showAvatar: loaded.sidebarShowAvatar ?? DEFAULT_SIDEBAR_SETTINGS.sidebarShowAvatar,
    showFavorites: loaded.sidebarShowFavorites ?? DEFAULT_SIDEBAR_SETTINGS.sidebarShowFavorites,
  };
};

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
  const navigate = useNavigate();
  const accountMenuRef = useRef(null);
  const linkClass = ({ isActive }) => (isActive ? 'nav-link active' : 'nav-link');
  const { user, signOut } = useAuth();
  const [profilePhoto, setProfilePhoto] = useState(() => localStorage.getItem(PROFILE_PHOTO_KEY) || '');
  const [profileCompanyName, setProfileCompanyName] = useState(readProfileCompanyName);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [sidebarSettings, setSidebarSettings] = useState(() => (
    normalizeSidebarSettings(
      loadSettings()?.sidebar || DEFAULT_SIDEBAR_SETTINGS,
    )
  ));
  const metadata = user?.user_metadata || {};
  const accountName = metadata.full_name || metadata.name || profileCompanyName || user?.email?.split('@')[0] || 'Usuário StudioFlow';
  const remoteAccountPhoto = metadata.avatar_url || metadata.picture || '';
  const [accountPhoto, setAccountPhoto] = useState(() => remoteAccountPhoto || profilePhoto || '');

  useEffect(() => {
    setAccountPhoto(remoteAccountPhoto || profilePhoto || '');
  }, [remoteAccountPhoto, profilePhoto]);

  const handleAccountPhotoError = () => {
    if (accountPhoto !== profilePhoto && profilePhoto) {
      setAccountPhoto(profilePhoto);
      return;
    }
    setAccountPhoto('');
  };

  useEffect(() => {
    const syncProfileIdentity = (event) => {
      setProfilePhoto(event?.detail?.photo || localStorage.getItem(PROFILE_PHOTO_KEY) || '');
      setProfileCompanyName(readProfileCompanyName());
    };

    const syncSidebarSettings = () => {
      setSidebarSettings(
        normalizeSidebarSettings(
          loadSettings()?.sidebar || DEFAULT_SIDEBAR_SETTINGS,
        ),
      );
    };

    window.addEventListener('sf_profile_photo_update', syncProfileIdentity);
    window.addEventListener('storage', syncProfileIdentity);
    window.addEventListener('sf_storage_update', syncProfileIdentity);
    window.addEventListener('storage', syncSidebarSettings);
    window.addEventListener('sf_storage_update', syncSidebarSettings);
    return () => {
      window.removeEventListener('sf_profile_photo_update', syncProfileIdentity);
      window.removeEventListener('storage', syncProfileIdentity);
      window.removeEventListener('sf_storage_update', syncProfileIdentity);
      window.removeEventListener('storage', syncSidebarSettings);
      window.removeEventListener('sf_storage_update', syncSidebarSettings);
    };
  }, []);

  useEffect(() => {
    const closeAccountMenu = (event) => {
      if (event.key === 'Escape') setIsAccountMenuOpen(false);
      if (event.type === 'pointerdown' && !accountMenuRef.current?.contains(event.target)) {
        setIsAccountMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeAccountMenu);
    document.addEventListener('keydown', closeAccountMenu);
    return () => {
      document.removeEventListener('pointerdown', closeAccountMenu);
      document.removeEventListener('keydown', closeAccountMenu);
    };
  }, []);

  const goTo = (path) => {
    setIsAccountMenuOpen(false);
    setIsMobileOpen(false);
    navigate(path);
  };

  const visibleModules = sidebarSettings.order
    .map((id) => SIDEBAR_MODULES.find((item) => item.id === id))
    .filter(Boolean)
    .filter((item) => sidebarSettings.visibility[item.id] !== false);

  const endSession = async () => {
    setIsAccountMenuOpen(false);
    await signOut();
    navigate('/login', { replace: true });
  };

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setIsMobileOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, []);

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
      <aside className={`sidebar${isMobileOpen ? ' mobile-open' : ''}${sidebarSettings.compact ? ' compact' : ''}${sidebarSettings.showLabels ? '' : ' hide-labels'}${sidebarSettings.showAvatar ? '' : ' no-avatar'}`}>
      <div className="sidebar-main">
        <div className="sidebar-logo" aria-label="StudioFlow">
          <picture className="sidebar-logo-picture">
            <source srcSet={LogoIcon} media="(max-width: 1024px)" />
            <img src={LogoFull} alt="StudioFlow" className="sidebar-logo-image" />
          </picture>
        </div>

        <nav onClick={() => setIsMobileOpen(false)}>
          {visibleModules.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.id} to={item.route} className={linkClass} title={item.label}>
                <Icon /> <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className="sidebar-account" ref={accountMenuRef}>
        <button
          type="button"
          className="sidebar-user"
          onClick={() => setIsAccountMenuOpen((open) => !open)}
          aria-label="Abrir menu da conta"
          aria-haspopup="menu"
          aria-expanded={isAccountMenuOpen}
        >
          <span className="sidebar-user-avatar" aria-hidden="true">
            {accountPhoto
              ? <img src={accountPhoto} alt="" onError={handleAccountPhotoError} />
              : <span className="sidebar-user-initials">{initialsFromName(accountName)}</span>}
          </span>
          <span className="sidebar-user-copy">
            <strong>{accountName}</strong>
            <small>{user?.email || 'E-mail não informado'}</small>
          </span>
        </button>

        {isAccountMenuOpen && (
          <div className="account-menu" role="menu" aria-label="Menu da conta">
            <div className="account-menu-header">
              <span className="sidebar-user-avatar" aria-hidden="true">
                {accountPhoto ? <img src={accountPhoto} alt="" onError={handleAccountPhotoError} /> : <span className="sidebar-user-initials">{initialsFromName(accountName)}</span>}
              </span>
              <span><strong>{accountName}</strong><small>{user?.email || 'E-mail não informado'}</small></span>
            </div>
            <div className="account-menu-group">
              <button type="button" role="menuitem" onClick={() => goTo('/perfil')}><UserRound /><span>Meu Perfil</span></button>
              <button type="button" role="menuitem" onClick={() => goTo('/configuracoes')}><Settings /><span>Configurações</span></button>
              <button type="button" role="menuitem" onClick={() => goTo('/configuracoes/modelos-propostas')}><FileText /><span>Modelos de Propostas</span></button>
              <button type="button" role="menuitem" onClick={() => goTo('/configuracoes/modelos-contratos')}><FileSignature /><span>Modelos de Contratos</span></button>
              <button type="button" role="menuitem" onClick={() => goTo('/perfil?secao=seguranca')}><KeyRound /><span>Segurança / Alterar senha</span></button>
            </div>
            <div className="account-menu-group">
              <button type="button" role="menuitem" onClick={endSession}><LogIn /><span>Trocar de conta</span></button>
            </div>
            <div className="account-menu-group account-menu-danger">
              <button type="button" role="menuitem" onClick={endSession}><LogOut /><span>Sair</span></button>
            </div>
          </div>
        )}
      </div>
      </aside>
    </>
  );
}