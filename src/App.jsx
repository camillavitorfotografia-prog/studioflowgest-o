import { BrowserRouter, Routes, Route } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';

import Dashboard from './pages/Dashboard';
import Clientes from './pages/Clientes';
import CRM from './pages/CRM';
import Trabalhos from './pages/Trabalhos';
import Agenda from './pages/Agenda';
import Financeiro from './pages/Financeiro';
import Perfil from './pages/Perfil';
import Equipamentos from './pages/Equipamentos';
import Relatorios from './pages/Relatorios';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="clientes" element={<Clientes />} />
          <Route path="crm" element={<CRM />} />
          <Route path="trabalhos" element={<Trabalhos />} />
          <Route path="projetos" element={<Trabalhos />} />
          <Route path="agenda" element={<Agenda />} />
          <Route path="financas" element={<Financeiro />} />
          <Route path="financeiro" element={<Financeiro />} />
          <Route path="perfil" element={<Perfil />} />
          <Route path="equipamentos" element={<Equipamentos />} />
          <Route path="relatorios" element={<Relatorios />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
