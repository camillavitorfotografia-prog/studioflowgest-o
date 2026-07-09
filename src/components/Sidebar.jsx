import { NavLink } from 'react-router-dom';
import {
  BarChart3,
  CalendarDays,
  Calculator,
  DollarSign,
  FolderOpen,
  Home,
  LogOut,
  Package,
  Target,
  User,
  Users,
} from 'lucide-react';
import LogoIcon from '../assets/studioflow-icon.png';
import Logo from '../assets/studioflow-logo.png';
import { useAuth } from '../contexts/useAuth';
import './Sidebar.css';

export default function Sidebar() {
  const linkClass = ({ isActive }) => (isActive ? 'nav-link active' : 'nav-link');
  const { user, signOut } = useAuth();
  const userName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || 'Usuário';
  const avatar = user?.user_metadata?.avatar_url;

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Erro ao sair:', error.message);
    }
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-main">
        <div className="sidebar-logo">
          <picture className="sidebar-logo-picture">
            <source srcSet={LogoIcon} media="(max-width: 1024px)" />
            <img
              src={Logo}
              alt="StudioFlow"
              className="sidebar-logo-image"
            />
          </picture>
        </div>

        <nav>
          <NavLink to="/" className={linkClass}>
            <Home /> <span>Dashboard</span>
          </NavLink>

          <NavLink to="/crm" className={linkClass}>
            <Target /> <span>CRM</span>
          </NavLink>

          <NavLink to="/clientes" className={linkClass}>
            <Users /> <span>Clientes</span>
          </NavLink>

          <NavLink to="/projetos" className={linkClass}>
            <FolderOpen /> <span>Projetos</span>
          </NavLink>

          <NavLink to="/agenda" className={linkClass}>
            <CalendarDays /> <span>Agenda</span>
          </NavLink>

          <NavLink to="/financeiro" className={linkClass}>
            <DollarSign /> <span>Financeiro</span>
          </NavLink>

          <NavLink to="/precificacao" className={linkClass}>
            <Calculator /> <span>Precificacao</span>
          </NavLink>

          <NavLink to="/equipamentos" className={linkClass}>
            <Package /> <span>Equipamentos</span>
          </NavLink>

          <NavLink to="/relatorios" className={linkClass}>
            <BarChart3 /> <span>Relatórios</span>
          </NavLink>

          <NavLink to="/perfil" className={linkClass}>
            <User /> <span>Perfil</span>
          </NavLink>
        </nav>
      </div>

      <div className="sidebar-user">
        {avatar ? <img src={avatar} alt={userName} /> : <User />}
        <div>
          <strong>{userName}</strong>
          <span>{user?.email}</span>
        </div>
        <button type="button" onClick={handleSignOut} title="Sair">
          <LogOut />
        </button>
      </div>
    </aside>
  );
}
