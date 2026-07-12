import { BarChart3, CalendarDays, Calculator, FolderOpen, Home, Package, Target, Users, WalletCards } from 'lucide-react';

export const SIDEBAR_MODULES = [
  { id: 'dashboard', label: 'Dashboard', route: '/', icon: Home },
  { id: 'crm', label: 'CRM', route: '/crm', icon: Target },
  { id: 'clientes', label: 'Clientes', route: '/clientes', icon: Users },
  { id: 'projetos', label: 'Trabalhos', route: '/projetos', icon: FolderOpen },
  { id: 'agenda', label: 'Agenda', route: '/agenda', icon: CalendarDays },
  { id: 'financeiro', label: 'Financeiro', route: '/financeiro', icon: WalletCards },
  { id: 'precificacao', label: 'Precificação', route: '/precificacao', icon: Calculator },
  { id: 'equipamentos', label: 'Equipamentos', route: '/equipamentos', icon: Package },
  { id: 'relatorios', label: 'Relatórios', route: '/relatorios', icon: BarChart3 },
];

export const DEFAULT_SIDEBAR_ORDER = SIDEBAR_MODULES.map((item) => item.id);

export const DEFAULT_SIDEBAR_VISIBILITY = Object.fromEntries(
  SIDEBAR_MODULES.map((item) => [item.id, item.required !== false]),
);

export const DEFAULT_SIDEBAR_SETTINGS = {
  sidebarOrder: DEFAULT_SIDEBAR_ORDER,
  sidebarVisibility: DEFAULT_SIDEBAR_VISIBILITY,
  sidebarCompact: false,
  sidebarShowLabels: true,
  sidebarShowAvatar: true,
  sidebarShowFavorites: false,
};
