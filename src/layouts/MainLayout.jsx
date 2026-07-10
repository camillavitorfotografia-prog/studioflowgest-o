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
        .content-wrapper {
          width: 100%;
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
            margin-left: 64px !important;
            width: calc(100% - 64px) !important;
            padding: 12px 10px 22px !important;
          }
        }
      `}</style>
    </div>
  );
}
