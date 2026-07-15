import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Heart,
  ImageOff,
  Images,
  LoaderCircle,
  LockKeyhole,
  MessageSquare,
  RefreshCw,
  ShieldAlert,
  X,
} from 'lucide-react';
import { useParams } from 'react-router-dom';
import Logo from '../../assets/studioflow-logo.png';
import { capitalizeName } from '../../utils/masks';
import { formatCurrency } from '../../utils/formatters';
import {
  acceptGalleryLegalNotice,
  finalizePublicGallerySelection,
  getPublicGalleryMediaUrl,
  loadPublicGallery,
  togglePublicPhotoSelection,
} from '../../features/galleries/storage/galleryStorage';
import './GaleriaPublica.css';

const getSessionId = () => {
  const key = 'studioflow.gallery.session';
  const current = sessionStorage.getItem(key);
  if (current) return current;
  const value = crypto.randomUUID();
  sessionStorage.setItem(key, value);
  return value;
};

const acceptedKey = (token) => `studioflow.gallery.accepted.${token}`;

function GalleryImage({ token, photo, kind = 'preview', className = '', onClick }) {
  const [state, setState] = useState({ url: '', loading: true, error: '', attempt: 0 });

  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, url: '', loading: true, error: '' }));

    getPublicGalleryMediaUrl(token, photo.id, kind)
      .then((url) => {
        if (!active) return;
        if (!url) throw new Error('Fotografia indisponível.');
        setState((current) => ({ ...current, url, loading: false, error: '' }));
      })
      .catch((error) => {
        if (!active) return;
        setState((current) => ({
          ...current,
          url: '',
          loading: false,
          error: error?.message || 'Não foi possível abrir a fotografia.',
        }));
      });

    return () => { active = false; };
  }, [token, photo.id, kind, state.attempt]);

  return (
    <button type="button" className={className} onClick={onClick}>
      {state.url ? (
        <img
          src={state.url}
          alt={photo.displayName}
          draggable="false"
          onError={() => setState((current) => ({
            ...current,
            url: '',
            loading: false,
            error: 'O link da fotografia expirou.',
          }))}
        />
      ) : state.error ? (
        <span className="gallery-image-loader gallery-image-error">
          <ImageOff />
          <small>{state.error}</small>
          <span
            role="button"
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation();
              setState((current) => ({ ...current, attempt: current.attempt + 1 }));
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                setState((current) => ({ ...current, attempt: current.attempt + 1 }));
              }
            }}
          >
            <RefreshCw />
            Tentar novamente
          </span>
        </span>
      ) : (
        <span className="gallery-image-loader"><LoaderCircle className="spin" /></span>
      )}
    </button>
  );
}

export default function GaleriaPublica() {
  const { accessToken } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accepted, setAccepted] = useState(
    () => sessionStorage.getItem(acceptedKey(accessToken)) === 'true',
  );
  const [entered, setEntered] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [activeIndex, setActiveIndex] = useState(null);
  const [activeUrl, setActiveUrl] = useState('');
  const [activeError, setActiveError] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const protectionReadyRef = useRef(false);
  const protectionTimerRef = useRef(null);
  const blurTimerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await loadPublicGallery(accessToken);
      setData(result || null);
      if (!result) setError('Este acesso não existe, expirou ou foi desativado.');
    } catch (loadError) {
      setData(null);
      setError(loadError?.message || 'Não foi possível abrir a galeria.');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  const gallery = data?.gallery || {};
  const client = data?.client || {};
  const photos = useMemo(() => (Array.isArray(data?.photos) ? data.photos : []), [data?.photos]);
  const settings = gallery.settings || {};
  const isDelivery = gallery.status === 'delivery';
  const isSelection = gallery.status === 'selection';
  const selectionOpen = isSelection && !gallery.selectionFinalizedAt;
  const purpose = settings.purpose || (isDelivery ? 'delivery' : 'selection');
  const downloadMode = settings.downloadMode || (purpose === 'delivery' ? 'all' : 'selected');
  const selectedCount = photos.filter((photo) => photo.selected).length;
  const additionalCount = Math.max(0, selectedCount - Number(gallery.includedPhotos || 0));
  const additionalTotal = additionalCount * Number(gallery.additionalPrice || 0);

  const deliveryBasePhotos = useMemo(() => {
    if (!isDelivery) return photos;
    if (downloadMode === 'selected') return photos.filter((photo) => photo.selected);
    return photos;
  }, [downloadMode, isDelivery, photos]);

  const visiblePhotos = selectedOnly && isSelection
    ? deliveryBasePhotos.filter((photo) => photo.selected)
    : deliveryBasePhotos;
  const activePhoto = activeIndex === null ? null : visiblePhotos[activeIndex] || null;
  const mediaKind = isDelivery ? 'final' : 'preview';
  const coverPhoto = photos.find((photo) => photo.id === settings.coverPhotoId) || photos[0] || null;

  useEffect(() => {
    protectionReadyRef.current = false;
    window.clearTimeout(protectionTimerRef.current);

    if (!accepted || !entered || isDelivery) return undefined;

    protectionTimerRef.current = window.setTimeout(() => {
      protectionReadyRef.current = true;
    }, 2200);

    return () => window.clearTimeout(protectionTimerRef.current);
  }, [accepted, entered, isDelivery]);

  useEffect(() => {
    const protect = () => {
      if (!protectionReadyRef.current || isDelivery) return;
      setActiveIndex(null);
      setPrivacy(true);
    };

    const visibility = () => {
      if (document.hidden) protect();
    };

    const delayedBlur = () => {
      window.clearTimeout(blurTimerRef.current);
      blurTimerRef.current = window.setTimeout(() => {
        if (!document.hasFocus()) protect();
      }, 180);
    };

    const keyboardProtection = async (event) => {
      const key = String(event.key || '').toLowerCase();
      const protectedShortcut = (event.ctrlKey || event.metaKey) && ['s', 'p', 'u'].includes(key);
      const screenshotShortcut = event.key === 'PrintScreen'
        || (event.metaKey && event.shiftKey && ['3', '4', '5'].includes(key));

      if (!protectedShortcut && !screenshotShortcut) return;
      event.preventDefault();
      event.stopPropagation();
      protect();

      if (screenshotShortcut && navigator.clipboard?.writeText) {
        try { await navigator.clipboard.writeText('Conteúdo protegido pela Lei nº 9.610/1998.'); } catch { /* navegador pode bloquear */ }
      }
    };

    const beforePrint = () => protect();

    window.addEventListener('blur', delayedBlur, true);
    window.addEventListener('pagehide', protect);
    window.addEventListener('beforeprint', beforePrint);
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('keydown', keyboardProtection, true);
    document.addEventListener('keyup', keyboardProtection, true);

    return () => {
      window.clearTimeout(blurTimerRef.current);
      window.removeEventListener('blur', delayedBlur, true);
      window.removeEventListener('pagehide', protect);
      window.removeEventListener('beforeprint', beforePrint);
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('keydown', keyboardProtection, true);
      document.removeEventListener('keyup', keyboardProtection, true);
    };
  }, [isDelivery]);

  useEffect(() => {
    let active = true;
    if (!activePhoto) {
      setActiveUrl('');
      setActiveError('');
      setComment('');
      return () => { active = false; };
    }

    setActiveUrl('');
    setActiveError('');
    setComment(activePhoto.clientComment || '');

    getPublicGalleryMediaUrl(accessToken, activePhoto.id, mediaKind)
      .then((url) => { if (active) setActiveUrl(url); })
      .catch((mediaError) => {
        if (active) setActiveError(mediaError?.message || 'Não foi possível abrir esta fotografia.');
      });

    return () => { active = false; };
  }, [activePhoto, accessToken, mediaKind]);

  const summary = useMemo(() => ({
    included: Number(gallery.includedPhotos || 0),
    selected: selectedCount,
    additionalCount,
    additionalTotal,
  }), [gallery.includedPhotos, selectedCount, additionalCount, additionalTotal]);

  const accept = async () => {
    setSaving(true);
    setError('');
    try {
      const registered = await acceptGalleryLegalNotice(accessToken, getSessionId());
      if (!registered) throw new Error('Este acesso não está mais disponível.');
      sessionStorage.setItem(acceptedKey(accessToken), 'true');
      setAccepted(true);
      setPrivacy(false);
    } catch (acceptError) {
      setError(acceptError?.message || 'Não foi possível registrar o aceite.');
    } finally {
      setSaving(false);
    }
  };

  const unlockPrivacy = () => {
    setPrivacy(false);
    protectionReadyRef.current = false;
    window.clearTimeout(protectionTimerRef.current);
    protectionTimerRef.current = window.setTimeout(() => {
      protectionReadyRef.current = true;
    }, 1800);
  };

  const toggle = async (photo, selected, nextComment = photo.clientComment || '') => {
    setSaving(true);
    setError('');
    try {
      await togglePublicPhotoSelection(accessToken, photo.id, selected, nextComment);
      setData((current) => ({
        ...current,
        photos: current.photos.map((item) => (
          item.id === photo.id ? { ...item, selected, clientComment: nextComment } : item
        )),
      }));
    } catch (toggleError) {
      setError(toggleError?.message || 'Não foi possível atualizar a seleção.');
    } finally {
      setSaving(false);
    }
  };

  const finalize = async () => {
    if (!window.confirm(`Confirmar a seleção de ${selectedCount} fotografia(s)? Depois de enviada, ela não poderá ser alterada.`)) return;
    setSaving(true);
    setError('');
    try {
      await finalizePublicGallerySelection(accessToken);
      await load();
    } catch (finalizeError) {
      setError(finalizeError?.message || 'Não foi possível finalizar a seleção.');
    } finally {
      setSaving(false);
    }
  };

  const downloadPhoto = async (photo) => {
    try {
      const url = await getPublicGalleryMediaUrl(accessToken, photo.id, 'final');
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = photo.originalName || photo.displayName || 'fotografia.jpg';
      anchor.rel = 'noopener noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (downloadError) {
      setError(downloadError?.message || 'Não foi possível baixar a fotografia.');
    }
  };

  const downloadAll = async () => {
    if (!isDelivery || !deliveryBasePhotos.length) return;
    setBulkDownloading(true);
    setError('');
    try {
      for (let index = 0; index < deliveryBasePhotos.length; index += 1) {
        await downloadPhoto(deliveryBasePhotos[index]);
        await new Promise((resolve) => window.setTimeout(resolve, 350));
      }
    } finally {
      setBulkDownloading(false);
    }
  };

  if (loading) {
    return <div className="public-gallery-state"><LoaderCircle className="spin" /><p>Preparando sua galeria…</p></div>;
  }

  if (!data) {
    return <div className="public-gallery-state"><LockKeyhole /><h1>Galeria indisponível</h1><p>{error}</p></div>;
  }

  const introText = isDelivery
    ? 'Suas fotografias finais estão disponíveis para visualização e download.'
    : 'Escolha suas fotografias favoritas. As provas estão protegidas e disponíveis exclusivamente para seleção.';
  const legalText = isDelivery
    ? 'Esta galeria contém arquivos finais autorizados para uso pessoal do cliente. Os direitos autorais do fotógrafo permanecem protegidos pela Lei nº 9.610/1998.'
    : gallery.legalNotice;
  const rootClass = `public-gallery-page theme-${settings.theme || 'dark'} type-${settings.typography || 'editorial'} spacing-${settings.gridSpacing || 'regular'} grid-${settings.gridStyle || 'masonry'} ${privacy ? 'privacy-on' : ''} ${isDelivery ? 'delivery-mode' : 'selection-mode'}`;

  return (
    <div
      className={rootClass}
      onContextMenu={(event) => { if (!isDelivery) event.preventDefault(); }}
      onDragStart={(event) => { if (!isDelivery) event.preventDefault(); }}
      onCopy={(event) => { if (!isDelivery) event.preventDefault(); }}
    >
      <header className="public-gallery-header">
        <img src={Logo} alt="StudioFlow" />
        <span><LockKeyhole /> Área privada</span>
      </header>

      {!entered && settings.coverLayout !== 'none' ? (
        <section className={`public-gallery-cover layout-${settings.coverLayout || 'editorial'} height-${settings.coverHeight || 'large'}`}>
          {coverPhoto && (
            <GalleryImage
              token={accessToken}
              photo={coverPhoto}
              kind={isDelivery ? 'final' : 'preview'}
              className={`public-gallery-cover-image position-${settings.coverPosition || 'center'}`}
            />
          )}
          <div className="public-gallery-cover-shade" />
          <div className="public-gallery-cover-copy">
            <span>{capitalizeName(client.nome || 'Cliente')}</span>
            <h1>{capitalizeName(gallery.name)}</h1>
            {settings.eventDate && <p>{new Date(`${settings.eventDate}T12:00:00`).toLocaleDateString('pt-BR')}</p>}
            {settings.description && <p className="description">{settings.description}</p>}
            <button type="button" onClick={() => setEntered(true)}><Images /> Abrir galeria</button>
          </div>
        </section>
      ) : (
        <main className="public-gallery-main">
          <section className="public-gallery-intro">
            <span>Olá, {capitalizeName(client.nome || 'cliente')}</span>
            <h1>{capitalizeName(gallery.name)}</h1>
            <p>{settings.description || introText}</p>
          </section>

          {error && <section className="public-gallery-law error"><ShieldAlert /><p>{error}</p></section>}

          <section className="public-gallery-law">
            <ShieldAlert />
            <p><strong>{isDelivery ? 'Galeria final.' : 'Conteúdo protegido.'}</strong> {isDelivery ? legalText : 'Provas fotográficas protegidas pela Lei nº 9.610/1998. A reprodução, captura, edição ou publicação sem autorização é proibida.'}</p>
          </section>

          <section className="public-gallery-sticky-toolbar">
            {isSelection ? (
              <div className="public-gallery-counts">
                <span><strong>{summary.selected}</strong> selecionadas</span>
                <span><strong>{summary.included}</strong> incluídas</span>
                {settings.allowAdditional !== false && <span><strong>{summary.additionalCount}</strong> adicionais</span>}
                {settings.allowAdditional !== false && <span><strong>{formatCurrency(summary.additionalTotal)}</strong> adicionais</span>}
              </div>
            ) : (
              <div className="public-gallery-counts">
                <span><strong>{deliveryBasePhotos.length}</strong> fotografias disponíveis</span>
                <span><strong>{downloadMode === 'selected' ? 'Selecionadas' : 'Galeria completa'}</strong></span>
              </div>
            )}

            <div className="public-gallery-actions">
              {isSelection && (
                <button className={selectedOnly ? 'active' : ''} type="button" onClick={() => setSelectedOnly((value) => !value)}>
                  <Heart /> {selectedOnly ? 'Ver todas' : 'Ver selecionadas'}
                </button>
              )}
              {selectionOpen && <button className="primary" disabled={saving || !selectedCount} type="button" onClick={finalize}>Enviar seleção</button>}
              {isDelivery && downloadMode !== 'individual' && (
                <button className="primary" disabled={bulkDownloading || !deliveryBasePhotos.length} type="button" onClick={downloadAll}>
                  {bulkDownloading ? <LoaderCircle className="spin" /> : <Download />}
                  Baixar {downloadMode === 'selected' ? 'selecionadas' : 'todas'}
                </button>
              )}
            </div>
          </section>

          <section className="public-gallery-grid">
            {visiblePhotos.map((photo, index) => (
              <article className={`public-gallery-card ${photo.selected ? 'selected' : ''}`} key={photo.id}>
                <GalleryImage token={accessToken} photo={photo} kind={mediaKind} className="public-gallery-card-image" onClick={() => setActiveIndex(index)} />
                {selectionOpen && (
                  <button className="public-gallery-favorite" type="button" disabled={saving} onClick={() => toggle(photo, !photo.selected)}>
                    {photo.selected ? <Check /> : <Heart />}
                  </button>
                )}
                {settings.showFileNames && <small>{photo.displayName}</small>}
                {isDelivery && (
                  <button className="public-gallery-download" type="button" onClick={() => downloadPhoto(photo)}>
                    <Download />
                  </button>
                )}
              </article>
            ))}
          </section>
        </main>
      )}

      {!accepted && (
        <div className="public-gallery-overlay">
          <div className="public-gallery-notice">
            <ShieldAlert />
            <h2>{isDelivery ? 'Termos de acesso' : 'Conteúdo protegido'}</h2>
            <p>{legalText}</p>
            {error && <small className="notice-error">{error}</small>}
            <button type="button" disabled={saving} onClick={accept}>
              {saving ? <LoaderCircle className="spin" /> : null}
              Li e compreendi
            </button>
          </div>
        </div>
      )}

      {privacy && !isDelivery && (
        <div className="public-gallery-privacy">
          <div>
            <ShieldAlert />
            <h2>Conteúdo protegido</h2>
            <p>As fotografias foram ocultadas porque a galeria perdeu o foco. A reprodução ou captura não autorizada é proibida.</p>
            <button type="button" onClick={unlockPrivacy}>Entendi</button>
          </div>
        </div>
      )}

      {activePhoto && (
        <div className="public-gallery-lightbox">
          <button className="close" type="button" onClick={() => setActiveIndex(null)}><X /></button>
          <button className="nav prev" type="button" disabled={activeIndex === 0} onClick={() => setActiveIndex((value) => Math.max(0, value - 1))}><ChevronLeft /></button>

          <div className="public-gallery-lightbox-content">
            {activeUrl ? (
              <img src={activeUrl} alt={activePhoto.displayName} draggable="false" />
            ) : activeError ? (
              <div className="gallery-image-loader gallery-image-error"><ImageOff /><small>{activeError}</small></div>
            ) : (
              <LoaderCircle className="spin" />
            )}

            <aside>
              <small>FOTOGRAFIA {activeIndex + 1} DE {visiblePhotos.length}</small>
              <h2>{activePhoto.displayName}</h2>
              {selectionOpen && (
                <>
                  <button className={activePhoto.selected ? 'selected' : ''} disabled={saving} onClick={() => toggle(activePhoto, !activePhoto.selected, comment)}>
                    <Heart /> {activePhoto.selected ? 'Selecionada' : 'Selecionar fotografia'}
                  </button>
                  {settings.allowComments !== false && (
                    <label>
                      <MessageSquare /> Observação
                      <textarea
                        value={comment}
                        onChange={(event) => setComment(event.target.value)}
                        onBlur={() => { if (activePhoto.selected) void toggle(activePhoto, true, comment); }}
                      />
                    </label>
                  )}
                </>
              )}
              {isDelivery && <button className="selected" type="button" onClick={() => downloadPhoto(activePhoto)}><Download /> Baixar fotografia</button>}
            </aside>
          </div>

          <button className="nav next" type="button" disabled={activeIndex === visiblePhotos.length - 1} onClick={() => setActiveIndex((value) => Math.min(visiblePhotos.length - 1, value + 1))}><ChevronRight /></button>
        </div>
      )}
    </div>
  );
}
