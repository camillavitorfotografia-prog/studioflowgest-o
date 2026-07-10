import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';

export default function MainLayout() {
  return (
    <div className="studioflow-shell">
      <Sidebar />

      <main className="content-wrapper">
        <Outlet />
      </main>

      <style>{`
        .studioflow-shell {
          width: 100%;
          min-width: 0;
          overflow-x: clip;
        }

        .content-wrapper {
          width: 100%;
          min-width: 0;
          min-height: 100vh;
          padding: 22px 24px 28px;
          margin-top: 0;
        }

        @media (min-width: 1181px) {
          .content-wrapper {
            margin-left: 228px !important;
            width: calc(100% - 228px) !important;
          }
        }

        @media (max-width: 1180px) {
          .content-wrapper {
            margin-top: 0 !important;
            margin-left: 72px !important;
            width: calc(100% - 72px) !important;
            padding: 18px !important;
          }
        }

        @media (max-width: 768px) {
          .content-wrapper {
            margin-top: 0 !important;
            margin-left: 0 !important;
            width: 100% !important;
            padding: 64px 10px 22px !important;
          }
        }
      `}</style>
    </div>
  );
}
