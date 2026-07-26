import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Eye,
  ImageOff,
  Images,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useParams } from 'react-router-dom';
import Logo from '../../assets/studioflow-logo-compact.png';
import { capitalizeName } from '../../utils/masks';
import { formatCurrency } from '../../utils/formatters';
import { createGalleryPhotoAdminUrl, getGallery } from '../../features/galleries/storage/galleryStorage';
import '../GaleriaPublica/GaleriaPublica.css';
import './GaleriaPreview.css';

function PreviewImage({ photo }) {
  const [state, setState] = useState({ url: '', loading: true, error: '', attempt: 0 });

  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, url: '', loading: true, error: '' }));
    createGalleryPhotoAdminUrl(photo, 'preview', 1800)
      .then((url) => {
        if (!active) return;
        if (!url) throw new Error('A prova ainda não está disponível.');
        setState((current) => ({ ...current, url, loading: false, error: '' }));
      })
      .catch((error) => {
        if (!active) return;
        setState((current) => ({
          ...current,
          url: '',
          loading: false,
          error: error?.message || 'Não foi possível carregar a prova.',
        }));
      });

    return () => {
      active = false;
    };
  }, [photo.id, photo.previewPath, state.attempt]);

  if (state.url) {
    return (
      <img
        src={state.url}
        alt={photo.displayName}
        onError={() => setState((current) => ({
          ...current,
          url: '',
          loading: false,
          error: 'O link da imagem expirou.',
        }))}
      />
    );
  }

  if (state.error) {
    return (
      <div className="gallery-image-loader gallery-image-error">
        <ImageOff />
        <span>{state.error}</span>
        <button type="button" onClick={() => setState((current) => ({ ...current, attempt: current.attempt + 1 }))}>
          <RefreshCw /> Tentar novamente
        </button>
      </div>
    );
  }

  return <div className="gallery-image-loader"><LoaderCircle className="spin" /></div>;
}

const formatDate = (value) => {
  if (!value) return '';
  const parsed = new Date(String(value).includes('T') ? value : `${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
};

const getPhotoOrientation = (photo = {}) => {
  const width = Number(photo.width || photo.metadata?.width || 0);
  const height = Number(photo.height || photo.metadata?.height || 0);
  if (!width || !height) return 'landscape';
  if (height > width * 1.18) return 'portrait';
  if (width > height * 1.18) return 'landscape';
  return 'square';
};

export default function GaleriaPreview() {
  const { galleryId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    getGallery(galleryId)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((loadError) => {
        if (active) setError(loadError?.message || 'Não foi possível abrir a pré-visualização.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [galleryId]);

  const gallery = data?.gallery || {};
  const photos = useMemo(() => (Array.isArray(data?.photos) ? data.photos : []), [data?.photos]);
  const settings = gallery.settings || {};
  const selectedPhotos = photos.filter((photo) => photo.selected);
  const selectedCount = selectedPhotos.length;
  const includedCount = Number(gallery.includedPhotos || 0);
  const additionalCount = Math.max(0, selectedCount - includedCount);
  const additionalTotal = additionalCount * Number(gallery.additionalPrice || 0);
  const coverTitle = capitalizeName(settings.coverTitle || data?.client?.nome || 'Cliente');
  const coverTextPosition = settings.coverTextPosition || 'left-center';
  const cover = useMemo(
    () => photos.find((photo) => photo.id === settings.coverPhotoId) || photos[0] || null,
    [photos, settings.coverPhotoId],
  );

  if (loading) {
    return <div className="public-gallery-state"><LoaderCircle className="spin" />Preparando pré-visualização…</div>;
  }

  if (error || !data) {
    return (
      <div className="public-gallery-state">
        <ImageOff />
        <strong>Pré-visualização indisponível</strong>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className={`public-gallery-page gallery-preview-page theme-${settings.theme === 'light' ? 'light' : 'dark'} type-${settings.typography || 'editorial'}`}>
      <div className="preview-admin-banner">
        <span aria-hidden="true">●</span>
        <span>Pré-visualização privada — esta tela replica a experiência do cliente</span>
      </div>

      <header className="public-gallery-topbar preview-topbar">
        <img src={Logo} alt="StudioFlow" />
        <div className="public-gallery-topbar-actions">
          <span><ShieldCheck /> Prévia interna</span>
        </div>
      </header>

      <main className="public-gallery-shell">
        <section className="public-gallery-hero entered">
          {cover && <div className="public-gallery-hero-image"><PreviewImage photo={cover} /></div>}
          <div className="public-gallery-hero-overlay" />
          <div className={`public-gallery-hero-copy text-${coverTextPosition}`}>
            <small>Pré-visualização</small>
            <h1>{coverTitle}</h1>
            <p className="public-gallery-hero-client">{capitalizeName(gallery.name || 'Galeria')}</p>
            {settings.eventDate && <p className="public-gallery-hero-date">{formatDate(settings.eventDate)}</p>}
            <p className="public-gallery-hero-description">{settings.description || 'Uma experiência criada especialmente para o cliente.'}</p>
            <button type="button" className="primary"><Eye /> Visualização ativa</button>
          </div>
        </section>

        <section className="public-gallery-info-bar no-brand">
          <div className="public-gallery-info-metrics">
            <article><strong>{includedCount}</strong><span>fotos incluídas</span></article>
            <article><strong>{selectedCount}</strong><span>fotos selecionadas</span></article>
            <article><strong>{additionalCount}</strong><span>fotos extras</span></article>
            <article><strong>{formatCurrency(additionalTotal)}</strong><span>valor estimado das extras</span></article>
          </div>
        </section>

        <section className="public-gallery-stage">
          <section className="public-gallery-notice-banner">
            <ShieldCheck />
            <p><strong>Prévia administrativa.</strong> O layout abaixo mostra como a galeria será vista pelo cliente, com capa, resumo, grade e painel de revisão.</p>
          </section>

          <section className="public-gallery-summary-card compact">
            <div className="public-gallery-summary-heading compact">
              <span className="summary-icon"><Images /></span>
              <div>
                <small>Sua seleção</small>
                <h2>Acompanhe sua escolha</h2>
              </div>
            </div>
            <div className="public-gallery-summary-metrics compact">
              <article><strong>{includedCount}</strong><span>incluídas no pacote</span></article>
              <article><strong>{selectedCount}</strong><span>selecionadas</span></article>
              <article><strong>{additionalCount}</strong><span>extras</span></article>
              <article><strong>{formatCurrency(additionalTotal)}</strong><span>estimativa das extras</span></article>
            </div>
          </section>

          <section className="public-gallery-toolbar">
            <div className="public-gallery-toolbar-copy">
              <small>Galeria</small>
              <h2>Escolha suas imagens favoritas</h2>
              <p>Esta prévia mistura a clareza da proposta criada com a leitura elegante inspirada no Pixieset, sem mostrar os blocos de estatísticas sobre a capa.</p>
            </div>
            <div className="public-gallery-toolbar-actions">
              <button type="button" className="secondary"><Images /> Ver selecionadas</button>
              <button type="button" className="primary"><Check /> Revisar seleção</button>
            </div>
          </section>

          <div className="public-gallery-content-layout preview-layout">
            <section className="public-gallery-grid-section">
              <section className="public-gallery-grid">
                {photos.map((photo) => (
                  <article key={photo.id} className={`public-gallery-photo-card orientation-${getPhotoOrientation(photo)} ${photo.selected ? 'selected' : ''}`}>
                    <div className="public-gallery-photo-button"><PreviewImage photo={photo} /></div>
                    {photo.selected && <div className="public-gallery-photo-badge"><Check /> Selecionada</div>}
                    <div className="public-gallery-photo-meta">
                      {settings.showFileNames && <small className="public-gallery-file-name">{photo.displayName}</small>}
                      <button type="button" className={`public-gallery-photo-action ${photo.selected ? 'selected' : ''}`}>{photo.selected ? 'Selecionada' : 'Selecionar'}</button>
                    </div>
                  </article>
                ))}
              </section>
            </section>

            <aside className="public-gallery-desktop-review">
              <div className="public-gallery-review-sheet-header desktop">
                <div>
                  <small>Revise sua seleção</small>
                  <h3>Confira antes de enviar</h3>
                </div>
              </div>
              <div className="public-gallery-review-strip desktop">
                {selectedPhotos.slice(0, 12).map((photo) => (
                  <div key={photo.id} className="public-gallery-review-thumb">
                    <div className="public-gallery-review-thumb-image"><PreviewImage photo={photo} /></div>
                    <span><Check /></span>
                  </div>
                ))}
              </div>
              <div className="public-gallery-desktop-review-copy">
                <p>{selectedCount} fotos selecionadas</p>
                <p>{additionalCount} fotos extras</p>
                <p>Total das fotos extras: <strong>{formatCurrency(additionalTotal)}</strong></p>
              </div>
              <div className="public-gallery-review-actions"><button type="button" className="primary">Confirmar seleção</button></div>
            </aside>
          </div>
        </section>
      </main>
    </div>
  );
}
