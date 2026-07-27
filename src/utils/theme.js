import { loadSettings, SETTINGS_KEY } from './settings';

export const THEME_EVENT = 'studioflow:theme-change';

export const normalizeTheme = (value) => (value === 'light' ? 'light' : 'dark');

export const applyTheme = (value) => {
  const theme = normalizeTheme(value);
  const root = document.documentElement;

  root.dataset.theme = theme;
  root.style.colorScheme = theme;

  return theme;
};

export const applyStoredTheme = () => {
  try {
    return applyTheme(loadSettings()?.general?.theme);
  } catch (error) {
    console.warn('Não foi possível carregar o tema salvo:', error);
    return applyTheme('dark');
  }
};

export const emitThemeChange = (value) => {
  const theme = applyTheme(value);
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { theme } }));
  return theme;
};

export const isSettingsStorageEvent = (event) => event?.key === SETTINGS_KEY;
