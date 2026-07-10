import { BrowserRouter, Routes, Route } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import { AuthProvider } from './contexts/AuthContext.jsx';

import Dashboard from './pages/Dashboard';
import Clientes from './pages/Clientes';
import CRM from './pages/CRM';
import Trabalhos from './pages/Trabalhos';
import Agenda from './pages/Agenda';
import Financeiro from './pages/Financeiro';
import Perfil from './pages/Perfil';
import Equipamentos from './pages/Equipamentos';
import Relatorios from './pages/Relatorios';
import Precificacao from './pages/Precificacao';
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          <Route path="/" element={<MainLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="clientes" element={<Clientes />} />
            <Route path="crm" element={<CRM />} />
            <Route path="trabalhos" element={<Trabalhos />} />
            <Route path="projetos" element={<Trabalhos />} />
            <Route path="agenda" element={<Agenda />} />
            <Route path="financas" element={<Financeiro />} />
            <Route path="financeiro" element={<Financeiro />} />
            <Route path="precificacao" element={<Precificacao />} />
            <Route path="perfil" element={<Perfil />} />
            <Route path="equipamentos" element={<Equipamentos />} />
            <Route path="relatorios" element={<Relatorios />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;