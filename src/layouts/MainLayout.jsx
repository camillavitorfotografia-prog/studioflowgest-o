import { useLocation, useOutlet } from 'react-router-dom';
import { useRef } from 'react';
import Sidebar from '../components/Sidebar';

/**
 * Mantém os módulos já visitados montados em memória.
 *
 * O Outlet padrão desmonta uma página quando a rota muda. Como cada módulo do
 * StudioFlow carrega dados próprios, isso fazia a tela buscar tudo novamente ao
 * voltar. Aqui cada rota visitada ganha um painel persistente: navegar apenas
 * alterna qual painel está visível, sem destruir estado, formulários ou scroll.
 */
export default function MainLayout() {
  const location = useLocation();
  const outlet = useOutlet();
  const routeCacheRef = useRef(new Map());
  const scrollPositionsRef = useRef(new Map());

  const routeKey = `${location.pathname}${location.search}`;
  const cache = routeCacheRef.current;

  // Atualiza somente o elemento da rota ativa. Os demais continuam com a mesma
  // instância React e, portanto, não são desmontados.
  cache.set(routeKey, outlet);

  const activatePanel = (key, node) => {
    const active = key === routeKey;
    return (
      <section
        key={key}
        className="sf-route-panel"
        hidden={!active}
        aria-hidden={!active}
        data-route-key={key}
        ref={(element) => {
          if (!element) return;
          if (!active) {
            scrollPositionsRef.current.set(key, element.scrollTop);
          } else {
            const saved = scrollPositionsRef.current.get(key);
            if (typeof saved === 'number' && element.scrollTop !== saved) {
              element.scrollTop = saved;
            }
          }
        }}
      >
        {node}
      </section>
    );
  };

  return (
    <div className="studioflow-shell">
      <Sidebar />

      <main className="content-wrapper">
        {[...cache.entries()].map(([key, node]) => activatePanel(key, node))}
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

        .sf-route-panel {
          width: 100%;
          min-width: 0;
        }

        .sf-route-panel[hidden] {
          display: none !important;
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

        @media (min-width: 769px) and (max-width: 1366px) {
          body:has(.gallery-workspace) .content-wrapper {
            margin-left: 84px !important;
            width: calc(100% - 84px) !important;
            padding: 14px !important;
          }
        }

        @media (max-width: 768px) {
          .content-wrapper {
            margin-top: 0 !important;
            margin-left: 0 !important;
            width: 100% !important;
            padding: calc(54px + env(safe-area-inset-top, 0px)) 8px calc(16px + env(safe-area-inset-bottom, 0px)) !important;
          }
        }

        @media (max-width: 430px) {
          .content-wrapper {
            padding-left: 7px !important;
            padding-right: 7px !important;
          }
        }
      `}</style>
    </div>
  );
}
