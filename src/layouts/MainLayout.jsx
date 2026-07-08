import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';

export default function MainLayout() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <Sidebar />
      
      {/* Classe aplicada para o layout responder */}
      <main className="content-wrapper">
        <Outlet />
      </main>
      
      <style>{`
        .content-wrapper {
          width: 100%;
          padding: 20px;
          margin-top: 0;
        }

        /* No computador, dá espaço pra Sidebar à esquerda */
        @media (min-width: 769px) {
          .content-wrapper {
            margin-left: 250px;
            width: calc(100% - 250px);
          }
        }

        /* No celular, dá espaço para a Sidebar no topo */
        @media (max-width: 768px) {
          .content-wrapper {
            margin-top: 70px; /* Altura aproximada da barra de cima */
          }
        }
      `}</style>
    </div>
  );
}