import {
  BarChart3,
  CalendarDays,
  Calculator,
  FolderOpen,
  Library,
  Images,
  Home,
  Package,
  PanelsTopLeft,
  Target,
  Users,
  WalletCards,
} from 'lucide-react';

export const SIDEBAR_MODULES = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    route: '/',
    icon: Home,
  },
  {
    id: 'crm',
    label: 'CRM',
    route: '/crm',
    icon: Target,
  },
  {
    id: 'clientes',
    label: 'Clientes',
    route: '/clientes',
    icon: Users,
  },
  {
    id: 'area-cliente',
    label: 'Área do Cliente',
    route: '/area-cliente',
    icon: PanelsTopLeft,
  },
  {
    id: 'biblioteca',
    label: 'Biblioteca',
    route: '/biblioteca',
    icon: Library,
  },
  {
    id: 'galerias',
    label: 'Galerias',
    route: '/galerias',
    icon: Images,
  },
  {
    id: 'projetos',
    label: 'Trabalhos',
    route: '/projetos',
    icon: FolderOpen,
  },
  {
    id: 'agenda',
    label: 'Agenda',
    route: '/agenda',
    icon: CalendarDays,
  },
  {
    id: 'financeiro',
    label: 'Financeiro',
    route: '/financeiro',
    icon: WalletCards,
  },
  {
    id: 'precificacao',
    label: 'Precificação',
    route: '/precificacao',
    icon: Calculator,
  },
  {
    id: 'equipamentos',
    label: 'Equipamentos',
    route: '/equipamentos',
    icon: Package,
  },
  {
    id: 'relatorios',
    label: 'Relatórios',
    route: '/relatorios',
    icon: BarChart3,
  },
];

export const DEFAULT_SIDEBAR_ORDER =
  SIDEBAR_MODULES.map((item) => item.id);

export const DEFAULT_SIDEBAR_VISIBILITY =
  Object.fromEntries(
    SIDEBAR_MODULES.map((item) => [
      item.id,
      item.required !== false,
    ]),
  );

export const DEFAULT_SIDEBAR_SETTINGS = {
  sidebarOrder: DEFAULT_SIDEBAR_ORDER,
  sidebarVisibility: DEFAULT_SIDEBAR_VISIBILITY,
  sidebarCompact: false,
  sidebarShowLabels: true,
  sidebarShowAvatar: true,
  sidebarShowFavorites: false,
};