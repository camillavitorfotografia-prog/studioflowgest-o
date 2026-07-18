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
          padding: 18px 20px 24px;
          margin-top: 0;
          transition: margin-left 180ms ease, width 180ms ease, padding 180ms ease;
        }

        @media (min-width: 1440px) {
          .content-wrapper {
            margin-left: 212px !important;
            width: calc(100% - 212px) !important;
          }
        }

        @media (min-width: 1025px) and (max-width: 1439px) {
          .content-wrapper {
            margin-left: 196px !important;
            width: calc(100% - 196px) !important;
            padding: 18px !important;
          }
        }

        @media (min-width: 769px) and (max-width: 1024px) {
          .content-wrapper {
            margin-left: 78px !important;
            width: calc(100% - 78px) !important;
            padding: 16px !important;
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
