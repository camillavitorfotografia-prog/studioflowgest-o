import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css'; 
import App from './App.jsx';
import { applyStoredTheme } from './utils/theme';

applyStoredTheme();

// Garantimos que o root exista antes de renderizar
const rootElement = document.getElementById('root');

if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}