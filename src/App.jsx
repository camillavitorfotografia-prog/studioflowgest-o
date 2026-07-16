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
import Configuracoes from './pages/Configuracoes';
import ModelosPropostas from './pages/Configuracoes/ModelosPropostas';
import Documentos from './pages/Documentos';
import ProposalEditor from './features/proposals/editor/ProposalEditor';
import ProposalTemplateEditor from './features/documents/editor/ProposalTemplateEditor';
import ModelosContratos from './pages/Configuracoes/ModelosContratos';
import ContractTemplateEditor from './features/documents/editor/ContractTemplateEditor';
import ProtectedRoute from './components/ProtectedRoute';
import AreaCliente from './pages/AreaCliente';
import PortalCliente from './pages/PortalCliente';
import BibliotecaArquivos from './pages/BibliotecaArquivos';
import Galerias from './pages/Galerias';
import GaleriaPublica from './pages/GaleriaPublica';
import GaleriaPreview from './pages/GaleriaPreview';
import MigracaoDados from './pages/MigracaoDados';
import GoogleOAuthCallback from './pages/GoogleOAuthCallback';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/recuperar-senha" element={<Login />} />
          <Route path="/portal/:accessToken" element={<PortalCliente />} />
          <Route path="/galeria/:accessToken" element={<GaleriaPublica />} />
          <Route path="/oauth/google/callback" element={<GoogleOAuthCallback />} />

          <Route path="/" element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
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
            <Route path="configuracoes" element={<Configuracoes />} />
            <Route path="configuracoes/migracao-dados" element={<MigracaoDados />} />
            <Route path="configuracoes/modelos-propostas" element={<ModelosPropostas />} />
            <Route path="configuracoes/modelos-propostas/:templateId" element={<ProposalTemplateEditor />} />
            <Route path="configuracoes/modelos-contratos" element={<ModelosContratos />} />
            <Route path="configuracoes/modelos-contratos/:templateId" element={<ContractTemplateEditor />} />
            <Route path="documentos" element={<Documentos />} />
            <Route path="propostas/editor" element={<ProposalEditor />} />
            <Route path="equipamentos" element={<Equipamentos />} />
            <Route path="relatorios" element={<Relatorios />} />
            <Route path="area-cliente" element={<AreaCliente />} />
            <Route path="biblioteca" element={<BibliotecaArquivos />} />
            <Route path="galerias" element={<Galerias />} />
            <Route path="galerias/:galleryId" element={<Galerias />} />
            <Route path="galerias/:galleryId/preview" element={<GaleriaPreview />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
