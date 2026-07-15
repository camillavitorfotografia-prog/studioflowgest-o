import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ImageOff,
  Images,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import Logo from '../../assets/studioflow-logo.png';
import { capitalizeName } from '../../utils/masks';
import {
  createGalleryPhotoAdminUrl,
  getGallery,
} from '../../features/galleries/storage/galleryStorage';
import './GaleriaPreview.css';

function PreviewImage({ photo }) {
  const [state, setState] = useState({
    url: '',
    loading: true,
    error: '',
    attempt: 0,
  });

  useEffect(() => {
    let active = true;

    setState((current) => ({
      ...current,
      url: '',
      loading: true,
      error: '',
    }));

    createGalleryPhotoAdminUrl(photo, 'preview', 1800)
      .then((url) => {
        if (!active) return;
        if (!url) throw new Error('A prova ainda não está disponível.');
        setState((current) => ({
          ...current,
          url,
          loading: false,
          error: '',
        }));
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
      <div className="gallery-preview-loader gallery-preview-error">
        <ImageOff />
        <span>{state.error}</span>
        <button
          type="button"
          onClick={() => setState((current) => ({
            ...current,
            attempt: current.attempt + 1,
          }))}
        >
          <RefreshCw />
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="gallery-preview-loader">
      <LoaderCircle className="spin" />
    </div>
  );
}

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
        if (active) {
          setError(
            loadError?.message
            || 'Não foi possível abrir a pré-visualização.',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [galleryId]);

  const gallery = data?.gallery || {};
  const photos = useMemo(
    () => (Array.isArray(data?.photos) ? data.photos : []),
    [data?.photos],
  );
  const settings = gallery.settings || {};
  const cover = useMemo(
    () => photos.find(
      (photo) => photo.id === settings.coverPhotoId,
    ) || photos[0] || null,
    [photos, settings.coverPhotoId],
  );

  if (loading) {
    return (
      <div className="gallery-preview-state">
        <LoaderCircle className="spin" />
        Preparando pré-visualização…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="gallery-preview-state">
        <ImageOff />
        <strong>Pré-visualização indisponível</strong>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div
      className={`gallery-preview-page theme-${settings.theme || 'dark'} grid-${settings.gridStyle || 'masonry'} spacing-${settings.gridSpacing || 'regular'}`}
    >
      <div className="preview-admin-banner">
        <span aria-hidden="true">●</span>
        <span>
          Pré-visualização privada — somente você pode ver esta página
        </span>
      </div>

      <header>
        <img src={Logo} alt="StudioFlow" />
        <span>
          <ShieldCheck />
          Rascunho seguro
        </span>
      </header>

      {settings.coverLayout !== 'none' && (
        <section
          className={`gallery-preview-cover layout-${settings.coverLayout || 'editorial'}`}
        >
          {cover && <PreviewImage photo={cover} />}
          <div
            className="shade"
            style={{ opacity: Number(settings.coverOverlay || 42) / 100 }}
          />
          <div className="copy">
            <small>PRÉ-VISUALIZAÇÃO</small>
            <h1>{capitalizeName(gallery.name)}</h1>
            <p>
              {settings.description
              || 'Uma experiência criada especialmente para o cliente.'}
            </p>
          </div>
        </section>
      )}

      <main>
        <div className="intro">
          <Images />
          <h2>{capitalizeName(gallery.name)}</h2>
          <p>{photos.length} fotografias</p>
        </div>

        <section className="preview-photo-grid">
          {photos.map((photo) => (
            <article key={photo.id}>
              <PreviewImage photo={photo} />
              {settings.showFileNames && (
                <small>{photo.displayName}</small>
              )}
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
