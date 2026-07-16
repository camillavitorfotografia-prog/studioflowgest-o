import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileImage,
  Heart,
  HardDrive,
  Image as ImageIcon,
  Images,
  Link2,
  LoaderCircle,
  MoreHorizontal,
  PackageCheck,
  Palette,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Settings2,
  ShieldCheck,
  Trash2,
  Upload,
  WalletCards,
  X,
} from 'lucide-react';
import { getDbStudioData } from '../../utils/dbData';
import { capitalizeName, maskCurrency } from '../../utils/masks';
import { parseCurrency } from '../../utils/formatters';
import {
  createGallery,
  createGalleryPhotoAdminUrl,
  deleteGalleryPermanently,
  deleteGalleryPhoto,
  getGallery,
  getGalleryOperationalSummary,
  getGalleryStorageSummary,
  cleanupGalleryStorage,
  optimizeGalleryPreviews,
  getStoredGalleryToken,
  listGalleries,
  moveGalleryToTrash,
  publishGallery,
  releaseGalleryDelivery,
  renameGalleryPhotos,
  renewGalleryAccess,
  reprocessGalleryPreviews,
  reorderGalleryPhotos,
  restoreGallery,
  updateGallery,
  uploadGalleryPhotos,
} from '../../features/galleries/storage/galleryStorage';
import './Galerias.css';

const DEFAULT_LEGAL = 'Estas imagens são disponibilizadas exclusivamente para seleção. É proibida a captura, reprodução, download, edição, publicação ou qualquer uso sem autorização expressa do fotógrafo, nos termos da Lei nº 9.610/1998.';

const DEFAULT_SETTINGS = {
  purpose: 'selection', eventDate: '', description: '', coverPhotoId: '', coverLayout: 'editorial',
  coverHeight: 'large', coverPosition: 'center', coverOverlay: 42, theme: 'dark', typography: 'editorial',
  gridStyle: 'masonry', gridSize: 'regular', gridSpacing: 'regular', showFileNames: false,
  naming: { mode: 'original', prefix: 'Foto', pad: 3 }, allowComments: true, allowAdditional: true,
  downloadMode: 'selected', downloadExpiresDays: 30, downloadLimit: 0,
};

const initialForm = {
  clientId: '', projectId: '', name: '', includedPhotos: 13, additionalPrice: '',
  selectionDeadline: '', expiresAt: '', watermarkText: 'PROTEGIDO', watermarkOpacity: 0.3,
  showClient: false, legalNotice: DEFAULT_LEGAL, settings: DEFAULT_SETTINGS,
};

const STATUS_LABELS = {
  draft: 'Rascunho', selection: 'Seleção publicada', selection_closed: 'Seleção recebida',
  delivery: 'Entrega liberada', trash: 'Lixeira',
};

const TABS = [
  ['overview', 'Visão geral', Activity], ['photos', 'Fotos', Images], ['cover', 'Capa', ImageIcon],
  ['appearance', 'Aparência', Palette], ['selection', 'Seleção', Heart], ['protection', 'Proteção', ShieldCheck],
  ['delivery', 'Entrega', PackageCheck], ['sharing', 'Compartilhar', Link2], ['settings', 'Configurações', Settings2],
];

const normalizeEditorGallery = (gallery) => ({
  ...gallery,
  includedPhotos: Number(gallery.includedPhotos || 0),
  additionalPrice: Number(gallery.additionalPrice || 0),
  settings: { ...DEFAULT_SETTINGS, ...(gallery.settings || {}), naming: { ...DEFAULT_SETTINGS.naming, ...(gallery.settings?.naming || {}) } },
  watermarkSettings: { text: 'PROTEGIDO', opacity: 0.3, spacing: 170, angle: -28, grid: true, showClient: false, previewMaxWidth: 1280, previewQuality: 0.68, ...(gallery.watermarkSettings || {}) },
});

function useAdminPhotoUrl(photo, kind = 'preview') {
  const [state, setState] = useState({ url: '', error: '' });
  useEffect(() => {
    let active = true;
    setState({ url: '', error: '' });
    createGalleryPhotoAdminUrl(photo, kind, 1800)
      .then((url) => active && setState({ url, error: '' }))
      .catch((error) => active && setState({ url: '', error: error?.message || 'Falha ao abrir imagem' }));
    return () => { active = false; };
  }, [photo.id, photo.previewPath, photo.finalPath, kind]);
  return state;
}

function CoverPreview({ gallery }) {
  const [photo, setPhoto] = useState(null);
  useEffect(() => {
    let active = true;
    getGallery(gallery.id).then((detail) => {
      const cover = detail.photos.find((item) => item.id === gallery.settings?.coverPhotoId) || detail.photos[0] || null;
      if (active) setPhoto(cover);
    }).catch(() => {});
    return () => { active = false; };
  }, [gallery.id, gallery.settings?.coverPhotoId]);
  const { url } = useAdminPhotoUrl(photo || { id: 'none', previewPath: '' });
  return <div className="gallery-cover-preview">{url ? <img src={url} alt="" /> : <div className="gallery-cover-placeholder"><ImageIcon /></div>}<div className="gallery-cover-overlay"><small>{STATUS_LABELS[gallery.status] || gallery.status}</small><strong>{capitalizeName(gallery.name)}</strong></div></div>;
}

export default function Galerias() {
  const navigate = useNavigate();
  const { galleryId } = useParams();
  const [galleries, setGalleries] = useState([]);
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [modalOpen, setModalOpen] = useState(false);
  const [uploadGallery, setUploadGallery] = useState(null);
  const [uploadProgress, setUploadProgress] = useState([]);
  const [editor, setEditor] = useState(null);
  const [editorTab, setEditorTab] = useState('overview');
  const [trashMode, setTrashMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState('');
  const [message, setMessage] = useState('');
  const [reprocessing, setReprocessing] = useState(false);
  const [protectionProgress, setProtectionProgress] = useState([]);
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const [photoMenuId, setPhotoMenuId] = useState('');
  const [selectedPhotoIds, setSelectedPhotoIds] = useState([]);
  const [operations, setOperations] = useState(null);
  const [storageSummary, setStorageSummary] = useState(null);
  const [optimizingStorage, setOptimizingStorage] = useState(false);
  const fileRef = useRef(null);
  const editorRef = useRef(null);
  const savingRef = useRef(false);
  const changeVersionRef = useRef(0);
  const persistedNamingRef = useRef(JSON.stringify(DEFAULT_SETTINGS.naming));

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [galleryRows, studio] = await Promise.all([listGalleries({ includeTrash: trashMode }), getDbStudioData()]);
      setGalleries(trashMode ? galleryRows.filter((item) => item.status === 'trash') : galleryRows.filter((item) => item.status !== 'trash'));
      setClients(studio.clients || []);
      setProjects(studio.projects || []);
    } catch (error) { setMessage(error?.message || 'Não foi possível carregar galerias.'); }
    finally { setLoading(false); }
  }, [trashMode]);

  useEffect(() => { void load(); }, [load]);

  const openEditor = useCallback(async (targetId, { navigateTo = true } = {}) => {
    setSaving(true);
    try {
      const [data, operationalSummary, storage] = await Promise.all([
        getGallery(targetId),
        getGalleryOperationalSummary(targetId).catch(() => null),
        getGalleryStorageSummary(targetId).catch(() => null),
      ]);
      const normalizedGallery = normalizeEditorGallery(data.gallery);
      setEditor({ ...data, gallery: normalizedGallery });
      setOperations(operationalSummary);
      setStorageSummary(storage);
      editorRef.current = { ...data, gallery: normalizedGallery };
      persistedNamingRef.current = JSON.stringify(normalizedGallery.settings.naming || DEFAULT_SETTINGS.naming);
      changeVersionRef.current = 0;
      setEditorTab('overview'); setDirty(false); setSelectedPhotoIds([]); setProtectionProgress([]);
      if (navigateTo && String(galleryId || '') !== String(targetId)) navigate(`/galerias/${targetId}`);
    } catch (error) { setMessage(error?.message || 'Não foi possível abrir a galeria.'); }
    finally { setSaving(false); }
  }, [galleryId, navigate]);

  useEffect(() => {
    if (galleryId && String(editor?.gallery?.id || '') !== String(galleryId)) void openEditor(galleryId, { navigateTo: false });
    if (!galleryId && editor) setEditor(null);
  }, [galleryId, editor?.gallery?.id, openEditor]);

  const updateEditorGallery = (changes) => {
    changeVersionRef.current += 1;
    setEditor((current) => {
      if (!current) return current;
      const next = { ...current, gallery: { ...current.gallery, ...changes } };
      editorRef.current = next;
      return next;
    });
    setDirty(true);
  };
  const updateSettings = (changes) => updateEditorGallery({ settings: { ...editor.gallery.settings, ...changes } });

  const saveEditor = useCallback(async ({ quiet = false } = {}) => {
    const currentEditor = editorRef.current;
    if (!currentEditor) return null;
    if (savingRef.current) return null;

    const versionAtStart = changeVersionRef.current;
    const currentNaming = currentEditor.gallery.settings.naming || DEFAULT_SETTINGS.naming;
    const namingKey = JSON.stringify(currentNaming);

    savingRef.current = true;
    setSaving(true);

    try {
      await updateGallery(currentEditor.gallery.id, {
        name: currentEditor.gallery.name,
        includedPhotos: currentEditor.gallery.includedPhotos,
        additionalPrice: currentEditor.gallery.additionalPrice,
        selectionDeadline: currentEditor.gallery.selectionDeadline,
        expiresAt: currentEditor.gallery.expiresAt,
        watermarkSettings: currentEditor.gallery.watermarkSettings,
        legalNotice: currentEditor.gallery.legalNotice,
        settings: currentEditor.gallery.settings,
        status: currentEditor.gallery.status,
      });

      if (namingKey !== persistedNamingRef.current) {
        await renameGalleryPhotos(currentEditor.gallery.id, currentNaming);
        persistedNamingRef.current = namingKey;
      }

      const fresh = await getGallery(currentEditor.gallery.id);
      const normalizedFresh = {
        ...fresh,
        gallery: normalizeEditorGallery(fresh.gallery),
      };

      if (changeVersionRef.current === versionAtStart) {
        setEditor(normalizedFresh);
        editorRef.current = normalizedFresh;
        setDirty(false);
      } else {
        setEditor((latest) => {
          if (!latest) return normalizedFresh;
          const merged = {
            ...latest,
            photos: normalizedFresh.photos,
          };
          editorRef.current = merged;
          return merged;
        });
      }

      setLastSavedAt(
        new Date().toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      );
      if (!quiet) setMessage('Alterações salvas com sucesso.');
      await load();
      return normalizedFresh;
    } catch (error) {
      setMessage(error?.message || 'Não foi possível salvar a galeria.');
      return null;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [load]);

  useEffect(() => {
    if (!dirty || !editor) return undefined;
    const timer = window.setTimeout(() => { void saveEditor({ quiet: true }); }, 1800);
    return () => window.clearTimeout(timer);
  }, [dirty, saveEditor]);

  useEffect(() => {
    const beforeUnload = (event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  const filteredProjects = useMemo(() => form.clientId ? projects.filter((project) => String(project.clientId || project.clienteId || '') === String(form.clientId)) : projects, [form.clientId, projects]);
  const clientName = clients.find((item) => String(item.id) === String(editor?.gallery?.clientId))?.nome || '';

  const metrics = useMemo(() => {
    const photos = editor?.photos || [];
    return {
      originals: photos.filter((photo) => photo.originalPath).length,
      previews: photos.filter((photo) => photo.previewPath).length,
      selected: photos.filter((photo) => photo.selected).length,
      edited: photos.filter((photo) => photo.finalPath).length,
      delivered: editor?.gallery?.status === 'delivery' ? photos.filter((photo) => photo.finalPath || photo.originalPath).length : 0,
      failed: photos.filter((photo) => photo.status === 'error' || !photo.previewPath).length,
    };
  }, [editor]);

  const handleCreate = async (event) => {
    event.preventDefault(); setSaving(true); setMessage('');
    try {
      const gallery = await createGallery({ ...form, additionalPrice: parseCurrency(form.additionalPrice), status: 'draft',
        watermarkSettings: { text: form.watermarkText || 'PROTEGIDO', opacity: Number(form.watermarkOpacity || 0.3), spacing: 170, angle: -28, grid: true, showBrand: true, showClient: form.showClient, previewMaxWidth: 1800 },
        legalNotice: form.legalNotice || DEFAULT_LEGAL, settings: form.settings });
      setModalOpen(false); setForm(initialForm); await load(); await openEditor(gallery.id);
    } catch (error) { setMessage(error?.message || 'Não foi possível criar a galeria.'); }
    finally { setSaving(false); }
  };

  const handleFiles = async (files) => {
    const target = uploadGallery || editor?.gallery; if (!target || !files.length) return;
    const client = clients.find((item) => String(item.id) === String(target.clientId));
    setSaving(true); setUploadProgress([]); setMessage('');
    try {
      const result = await uploadGalleryPhotos({ galleryId: target.id, files: [...files], watermarkSettings: target.watermarkSettings, clientName: client?.nome || '',
        onProgress: ({ index, name, progress, status, error }) => setUploadProgress((current) => { const next = [...current]; next[index] = { name, progress, status, error }; return next; }) });
      setMessage(result.failures.length ? `${result.uploaded.length} enviadas. ${result.failures.length} falharam.` : result.skipped?.length ? `${result.uploaded.length} enviadas. ${result.skipped.length} duplicada(s) ignorada(s).` : `${result.uploaded.length} fotografias enviadas com sucesso.`);
      await openEditor(target.id, { navigateTo: Boolean(editor) }); await load();
    } catch (error) { setMessage(error?.message || 'Não foi possível concluir o upload.'); }
    finally { setSaving(false); }
  };

  const applyProtection = async () => {
    if (!editor?.photos?.length || reprocessing) return;
    setReprocessing(true); setProtectionProgress([]); setMessage('');
    try {
      await updateGallery(editor.gallery.id, { watermarkSettings: editor.gallery.watermarkSettings, legalNotice: editor.gallery.legalNotice });
      const result = await reprocessGalleryPreviews({ galleryId: editor.gallery.id, watermarkSettings: editor.gallery.watermarkSettings, clientName,
        onProgress: ({ index, name, progress, status, error }) => setProtectionProgress((current) => { const next = [...current]; next[index] = { name, progress, status, error }; return next; }) });
      setMessage(result.failures.length ? `Proteção atualizada com ${result.failures.length} falha(s).` : 'Proteção atualizada em todas as provas.');
      await openEditor(editor.gallery.id, { navigateTo: false });
    } catch (error) { setMessage(error?.message || 'Não foi possível atualizar as provas.'); }
    finally { setReprocessing(false); }
  };

  const optimizeStorage = async () => {
    if (!editor?.gallery?.id || optimizingStorage) return;
    setOptimizingStorage(true); setProtectionProgress([]); setMessage('Otimizando provas e removendo resíduos…');
    try {
      const result = await optimizeGalleryPreviews({ galleryId: editor.gallery.id, watermarkSettings: editor.gallery.watermarkSettings, clientName,
        onProgress: ({ index, name, progress, status, error }) => setProtectionProgress((current) => { const next = [...current]; next[index] = { name, progress, status, error }; return next; }) });
      setStorageSummary(await getGalleryStorageSummary(editor.gallery.id));
      setMessage(result.failures.length ? `Otimização concluída com ${result.failures.length} falha(s).` : `Otimização concluída. ${result.cleanup.removed} arquivo(s) órfão(s) removido(s).`);
      await openEditor(editor.gallery.id, { navigateTo: false });
    } catch (error) { setMessage(error?.message || 'Não foi possível otimizar o armazenamento.'); }
    finally { setOptimizingStorage(false); }
  };

  const cleanStorage = async () => {
    if (!editor?.gallery?.id || optimizingStorage) return;
    setOptimizingStorage(true);
    try { const result = await cleanupGalleryStorage(editor.gallery.id); setStorageSummary(await getGalleryStorageSummary(editor.gallery.id)); setMessage(`${result.removed} arquivo(s) órfão(s) removido(s).`); }
    catch (error) { setMessage(error?.message || 'Não foi possível limpar o armazenamento.'); }
    finally { setOptimizingStorage(false); }
  };

  const publicLink = (gallery) => {
    const token = getStoredGalleryToken(gallery.id);
    return token ? `${window.location.origin}/galeria/${token}` : '';
  };

  const previewGallery = async () => {
    if (dirty) {
      const saved = await saveEditor({ quiet: true });
      if (!saved) return;
    }
    window.open(
      `${window.location.origin}/galerias/${editor.gallery.id}/preview`,
      '_blank',
      'noopener,noreferrer',
    );
  };

  const publish = async () => {
    if (!editor.photos.length) { setMessage('Envie ao menos uma fotografia antes de publicar.'); setEditorTab('photos'); return; }
    if (!editor.gallery.settings.coverPhotoId && editor.gallery.settings.coverLayout !== 'none') { setMessage('Escolha uma fotografia de capa antes de publicar.'); setEditorTab('cover'); return; }
    if (dirty) {
      const saved = await saveEditor({ quiet: true });
      if (!saved) return;
    }
    setSaving(true);
    try {
      const result = await publishGallery(editor.gallery.id, editor.gallery.settings.purpose === 'delivery' ? 'delivery' : 'selection');
      setEditor((current) => ({ ...current, gallery: normalizeEditorGallery(result.gallery) }));
      setMessage('Galeria publicada. O link do cliente está ativo.'); await load();
    } catch (error) { setMessage(error?.message || 'Não foi possível publicar.'); }
    finally { setSaving(false); }
  };

  const releaseDelivery = async () => {
    if (!editor?.photos?.length) {
      setMessage('Envie ao menos uma fotografia antes de liberar a entrega.');
      setEditorTab('photos');
      return;
    }

    if (dirty) {
      const saved = await saveEditor({ quiet: true });
      if (!saved) return;
    }

    setSaving(true);
    setMessage('');
    try {
      const released = await releaseGalleryDelivery(editor.gallery.id);
      const fresh = await getGallery(editor.gallery.id);
      const normalized = { ...fresh, gallery: normalizeEditorGallery(released) };
      setEditor(normalized);
      editorRef.current = normalized;
      setDirty(false);
      setMessage('Entrega liberada. O cliente já pode visualizar e baixar as fotografias autorizadas.');
      await load();
    } catch (error) {
      setMessage(error?.message || 'Não foi possível liberar a entrega.');
    } finally {
      setSaving(false);
    }
  };

  const copyLink = async () => {
    let link = publicLink(editor.gallery);
    if (!link) {
      const result = await renewGalleryAccess(editor.gallery.id);
      link = `${window.location.origin}/galeria/${result.token}`;
    }
    await navigator.clipboard.writeText(link); setMessage('Link copiado.');
  };

  const chooseCover = (photoId) => { updateSettings({ coverPhotoId: photoId }); setCoverPickerOpen(false); setMessage('Capa escolhida. Salve ou aguarde o salvamento automático.'); };

  const movePhoto = async (photoId, direction) => {
    const ids = editor.photos.map((photo) => photo.id); const index = ids.indexOf(photoId); const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await reorderGalleryPhotos(ids); await openEditor(editor.gallery.id, { navigateTo: false });
  };

  const removePhoto = async (photo) => {
    if (!window.confirm(`Excluir definitivamente a fotografia “${photo.displayName}”?`)) return;
    await deleteGalleryPhoto(photo); await openEditor(editor.gallery.id, { navigateTo: false });
  };

  if (loading && !editor) return <div className="gallery-admin-state"><LoaderCircle className="spin" /> Carregando galerias…</div>;

  return <section className="gallery-admin-page">
    {!editor && <>
      <header className="gallery-admin-heading"><div><span>ENTREGA E SELEÇÃO</span><h1>Galerias</h1><p>Crie experiências privadas para seleção, aprovação e entrega.</p></div><div className="gallery-heading-actions"><button className="secondary" onClick={() => setTrashMode((v) => !v)}>{trashMode ? <RotateCcw /> : <Trash2 />}{trashMode ? 'Voltar às galerias' : 'Lixeira'}</button><button onClick={() => setModalOpen(true)}><Plus /> Nova galeria</button></div></header>
      {message && <div className="gallery-admin-message">{message}</div>}
      <div className="gallery-collection-grid">{galleries.length ? galleries.map((gallery) => <article className="gallery-collection-card" key={gallery.id}><CoverPreview gallery={gallery}/><div className="gallery-collection-copy"><span className={`status ${gallery.status}`}>{STATUS_LABELS[gallery.status]}</span><h2>{capitalizeName(gallery.name)}</h2><p>{clients.find((c) => String(c.id) === String(gallery.clientId))?.nome || 'Cliente não vinculado'}</p><div className="gallery-card-meta"><span>{gallery.includedPhotos} incluídas</span><span>{maskCurrency(gallery.additionalPrice)}</span></div></div><div className="gallery-card-actions">{trashMode ? <><button onClick={async () => { try { await restoreGallery(gallery.id); setMessage('Galeria restaurada.'); await load(); } catch (error) { setMessage(error?.message || 'Não foi possível restaurar a galeria.'); } }}><RotateCcw /> Restaurar</button><button className="danger" onClick={async () => { if (!window.confirm(`Excluir definitivamente “${gallery.name}”? Esta ação não pode ser desfeita.`)) return; try { await deleteGalleryPermanently(gallery.id); setMessage('Galeria excluída definitivamente.'); await load(); } catch (error) { setMessage(error?.message || 'Não foi possível excluir a galeria.'); } }}><Trash2 /> Excluir</button></> : <><button onClick={() => openEditor(gallery.id)}><Settings2 /> Gerenciar</button><button onClick={() => { setUploadGallery(gallery); setUploadProgress([]); }}><Upload /> Fotos</button></>}</div></article>) : <div className="gallery-admin-empty"><Images/><h2>{trashMode ? 'A lixeira está vazia' : 'Nenhuma galeria criada'}</h2></div>}</div>
    </>}

    {editor && <div className="gallery-workspace">
      <header className="gallery-workspace-header"><div className="gallery-workspace-title"><button className="icon secondary" onClick={() => navigate('/galerias')}><ArrowLeft /></button><div><small>GALERIA</small><h1>{capitalizeName(editor.gallery.name)}</h1><span className={`save-indicator ${dirty ? 'dirty' : ''}`}>{saving ? 'Salvando…' : dirty ? 'Alterações pendentes' : lastSavedAt ? `Salvo às ${lastSavedAt}` : 'Tudo salvo'}</span></div></div><div className="gallery-workspace-actions"><button className="secondary" onClick={previewGallery}><Eye /> Pré-visualizar</button><button className="secondary" onClick={copyLink}><Copy /> Link</button><button onClick={publish}><Send /> {editor.gallery.status === 'draft' ? 'Publicar' : 'Atualizar publicação'}</button><button disabled={!dirty || saving} onClick={() => saveEditor()}><Save /> Salvar</button></div></header>

      {message && <div className="gallery-admin-message workspace-message">{message}</div>}
      <section className="gallery-production-strip">{[
        ['Originais', metrics.originals, FileImage], ['Provas', metrics.previews, ShieldCheck], ['Selecionadas', metrics.selected, Heart], ['Editadas', metrics.edited, Palette], ['Entregues', metrics.delivered, CheckCircle2],
      ].map(([label,value,Icon]) => <article key={label}><Icon/><span><strong>{value}</strong><small>{label}</small></span></article>)}{metrics.failed>0 && <article className="warning"><RefreshCw/><span><strong>{metrics.failed}</strong><small>Com falha</small></span></article>}</section>

      <div className="gallery-workspace-layout"><nav className="gallery-workspace-nav">{TABS.map(([id,label,Icon]) => <button className={editorTab===id?'active':''} key={id} onClick={() => setEditorTab(id)}><Icon/>{label}</button>)}</nav><main className="gallery-workspace-content">
        {editorTab==='overview' && <OverviewTab editor={editor} metrics={metrics} operations={operations} setTab={setEditorTab} />}
        {editorTab==='photos' && <PhotosTab editor={editor} selectedPhotoIds={selectedPhotoIds} setSelectedPhotoIds={setSelectedPhotoIds} menuId={photoMenuId} setMenuId={setPhotoMenuId} onUpload={() => {setUploadGallery(editor.gallery);setUploadProgress([])}} onCover={chooseCover} onMove={movePhoto} onDelete={removePhoto} />}
        {editorTab==='cover' && <CoverTab editor={editor} updateSettings={updateSettings} onChoose={() => setCoverPickerOpen(true)} />}
        {editorTab==='appearance' && <AppearanceTab gallery={editor.gallery} updateSettings={updateSettings} />}
        {editorTab==='selection' && <SelectionTab gallery={editor.gallery} updateGallery={updateEditorGallery} updateSettings={updateSettings} />}
        {editorTab==='protection' && <ProtectionTab editor={editor} clientName={clientName} updateGallery={updateEditorGallery} applying={reprocessing} onApply={applyProtection} progress={protectionProgress} />}
        {editorTab==='delivery' && <DeliveryTab gallery={editor.gallery} updateSettings={updateSettings} metrics={metrics} saving={saving} onRelease={releaseDelivery} />}
        {editorTab==='sharing' && <SharingTab gallery={editor.gallery} publicLink={publicLink(editor.gallery)} onCopy={copyLink} onRenew={async()=>{const r=await renewGalleryAccess(editor.gallery.id);setMessage(`Novo link criado: ${window.location.origin}/galeria/${r.token}`)}} />}
        {editorTab==='settings' && <SettingsTab gallery={editor.gallery} updateGallery={updateEditorGallery} storageSummary={storageSummary} optimizingStorage={optimizingStorage} onOptimizeStorage={optimizeStorage} onCleanStorage={cleanStorage} onTrash={async()=>{if(!window.confirm('Mover esta galeria para a lixeira? O link do cliente será desativado imediatamente.')) return; try { await moveGalleryToTrash(editor.gallery.id); setMessage('Galeria movida para a lixeira.'); setEditor(null); editorRef.current = null; navigate('/galerias'); await load(); } catch (error) { setMessage(error?.message || 'Não foi possível mover a galeria para a lixeira.'); }}} />}
      </main></div>
    </div>}

    {modalOpen && <CreateModal form={form} setForm={setForm} clients={clients} projects={filteredProjects} saving={saving} onClose={()=>setModalOpen(false)} onSubmit={handleCreate} />}
    {uploadGallery && <UploadModal gallery={uploadGallery} progress={uploadProgress} fileRef={fileRef} onFiles={handleFiles} onClose={()=>!saving&&setUploadGallery(null)} />}
    {coverPickerOpen && <CoverPicker photos={editor.photos} selectedId={editor.gallery.settings.coverPhotoId} onSelect={chooseCover} onClose={()=>setCoverPickerOpen(false)} />}
  </section>;
}

function OverviewTab({ editor, metrics, operations, setTab }) {
  const charge = operations?.additionalCharge;
  return <div className="workspace-tab">
    <div className="tab-heading"><div><span>VISÃO GERAL</span><h2>Produção da galeria</h2><p>Acompanhe o que já está pronto e o que ainda precisa de atenção.</p></div></div>
    <div className="overview-cards">
      <OverviewCard icon={Images} title="Fotografias" value={editor.photos.length} text="Arquivos cadastrados nesta galeria" action="Gerenciar fotos" onClick={()=>setTab('photos')}/>
      <OverviewCard icon={ImageIcon} title="Capa" value={editor.gallery.settings.coverPhotoId?'Definida':'Pendente'} text="Primeiro impacto da experiência do cliente" action="Configurar capa" onClick={()=>setTab('cover')}/>
      <OverviewCard icon={ShieldCheck} title="Proteção" value={`${Math.round(Number(editor.gallery.watermarkSettings.opacity)*100)}%`} text="Opacidade atual da marca-d’água" action="Revisar proteção" onClick={()=>setTab('protection')}/>
      <OverviewCard icon={Heart} title="Seleção" value={metrics.selected} text={`de ${editor.gallery.includedPhotos} fotografias incluídas`} action="Configurar seleção" onClick={()=>setTab('selection')}/>
      <OverviewCard icon={Eye} title="Visualizações" value={operations?.views || 0} text={operations?.lastAccessAt ? `Último acesso em ${new Date(operations.lastAccessAt).toLocaleDateString('pt-BR')}` : 'Nenhum acesso registrado'} action="Compartilhar" onClick={()=>setTab('sharing')}/>
      <OverviewCard icon={Download} title="Downloads" value={operations?.downloads || 0} text="Downloads registrados nesta galeria" action="Configurar entrega" onClick={()=>setTab('delivery')}/>
      <OverviewCard icon={Heart} title="Interações" value={(operations?.selections || 0) + (operations?.comments || 0)} text={`${operations?.comments || 0} comentário(s) registrado(s)`} action="Ver seleção" onClick={()=>setTab('selection')}/>
      <OverviewCard icon={WalletCards} title="Fotos adicionais" value={charge ? maskCurrency(String(Number(charge.valor || 0).toFixed(2)).replace('.', ',')) : 'Sem cobrança'} text={charge ? `Status: ${charge.status || 'Pendente'}` : 'Criada automaticamente após a seleção'} action="Configurar seleção" onClick={()=>setTab('selection')}/>
    </div>
  </div>
}
function OverviewCard({icon:Icon,title,value,text,action,onClick}){return <article className="overview-card"><Icon/><small>{title}</small><strong>{value}</strong><p>{text}</p><button className="secondary" onClick={onClick}>{action}</button></article>}

function PhotosTab({editor,selectedPhotoIds,setSelectedPhotoIds,menuId,setMenuId,onUpload,onCover,onMove,onDelete}) { return <div className="workspace-tab"><div className="tab-heading"><div><span>FOTOGRAFIAS</span><h2>Gerenciador de fotos</h2><p>Envie, organize, defina a capa e acompanhe o processamento.</p></div><button onClick={onUpload}><Upload/>Adicionar fotos</button></div>{editor.photos.length?<div className="gallery-photo-manager">{editor.photos.map((photo,index)=><PhotoCard key={photo.id} photo={photo} index={index} total={editor.photos.length} selected={selectedPhotoIds.includes(photo.id)} isCover={editor.gallery.settings.coverPhotoId===photo.id} menuOpen={menuId===photo.id} onSelect={()=>setSelectedPhotoIds((current)=>current.includes(photo.id)?current.filter(id=>id!==photo.id):[...current,photo.id])} onMenu={()=>setMenuId(menuId===photo.id?'':photo.id)} onCover={()=>onCover(photo.id)} onMove={onMove} onDelete={()=>onDelete(photo)}/>)}</div>:<div className="gallery-empty-panel"><Images/><h3>Envie as primeiras fotografias</h3><p>Os originais ficam privados e as provas protegidas são geradas automaticamente.</p><button onClick={onUpload}><Upload/>Selecionar fotografias</button></div>}</div> }
function PhotoCard({photo,index,total,selected,isCover,menuOpen,onSelect,onMenu,onCover,onMove,onDelete}){const {url,error}=useAdminPhotoUrl(photo);return <article className={`manager-photo-card ${selected?'selected':''} ${error?'failed':''}`}><button className="photo-checkbox" onClick={onSelect}>{selected?<Check/>:null}</button><button className="photo-menu-button" onClick={onMenu}><MoreHorizontal/></button>{menuOpen&&<div className="photo-menu"><button onClick={onCover}><ImageIcon/>Definir como capa</button><button disabled={index===0} onClick={()=>onMove(photo.id,-1)}><ArrowUp/>Mover antes</button><button disabled={index===total-1} onClick={()=>onMove(photo.id,1)}><ArrowDown/>Mover depois</button><button className="danger" onClick={onDelete}><Trash2/>Excluir</button></div>}<div className="manager-photo-media">{url?<img src={url} alt={photo.displayName}/>:error?<div className="photo-failure"><RefreshCw/><span>Falha na prova</span></div>:<LoaderCircle className="spin"/>}</div><footer><div><strong>{photo.displayName}</strong><small>{photo.width&&photo.height?`${photo.width} × ${photo.height}`:'Processando'}</small></div>{isCover&&<span className="cover-chip">CAPA</span>}</footer></article>}

function CoverTab({editor,updateSettings,onChoose}){const cover=editor.photos.find(p=>p.id===editor.gallery.settings.coverPhotoId)||null;return <div className="workspace-tab"><div className="tab-heading"><div><span>CAPA</span><h2>Primeiro impacto da galeria</h2><p>Escolha uma fotografia e ajuste a composição para desktop e celular.</p></div></div><div className="cover-editor-grid"><div className="cover-controls"><button onClick={onChoose}><ImageIcon/>{cover?'Trocar fotografia':'Escolher fotografia'}</button>{cover&&<button className="secondary" onClick={()=>updateSettings({coverPhotoId:''})}><X/>Remover capa</button>}<label>Modelo<select value={editor.gallery.settings.coverLayout} onChange={e=>updateSettings({coverLayout:e.target.value})}><option value="editorial">Editorial</option><option value="full">Imagem completa</option><option value="split">Dividida</option><option value="minimal">Minimalista</option><option value="none">Sem capa</option></select></label><label>Posição<select value={editor.gallery.settings.coverPosition} onChange={e=>updateSettings({coverPosition:e.target.value})}><option value="center">Centro</option><option value="top">Topo</option><option value="bottom">Base</option><option value="left">Esquerda</option><option value="right">Direita</option></select></label><label>Escurecimento<input type="range" min="0" max="75" value={Number(editor.gallery.settings.coverOverlay||42)} onChange={e=>updateSettings({coverOverlay:Number(e.target.value)})}/><small>{editor.gallery.settings.coverOverlay||42}%</small></label><label>Descrição<textarea rows="4" value={editor.gallery.settings.description||''} onChange={e=>updateSettings({description:e.target.value})}/></label></div><CoverLivePreview gallery={editor.gallery} photo={cover}/></div></div>}
function CoverLivePreview({gallery,photo}){const {url}=useAdminPhotoUrl(photo||{id:'none',previewPath:''});return <div className={`cover-live-preview layout-${gallery.settings.coverLayout}`} style={{'--overlay':Number(gallery.settings.coverOverlay||42)/100}}>{url&&<img className={`position-${gallery.settings.coverPosition}`} src={url} alt=""/>}<div className="cover-live-shade"/><div className="cover-live-copy"><small>PRÉ-VISUALIZAÇÃO</small><h3>{capitalizeName(gallery.name)}</h3><p>{gallery.settings.description||'Uma experiência criada especialmente para você.'}</p></div></div>}

function AppearanceTab({gallery,updateSettings}){return <div className="workspace-tab"><div className="tab-heading"><div><span>APARÊNCIA</span><h2>Identidade visual</h2><p>Veja as mudanças enquanto configura a experiência.</p></div></div><div className="appearance-editor"><div className="gallery-form-grid"><label>Tema<select value={gallery.settings.theme} onChange={e=>updateSettings({theme:e.target.value})}><option value="dark">Escuro</option><option value="light">Claro</option><option value="warm">Quente</option></select></label><label>Tipografia<select value={gallery.settings.typography} onChange={e=>updateSettings({typography:e.target.value})}><option value="editorial">Editorial</option><option value="classic">Clássica</option><option value="modern">Moderna</option><option value="romantic">Romântica</option></select></label><label>Grade<select value={gallery.settings.gridStyle} onChange={e=>updateSettings({gridStyle:e.target.value})}><option value="masonry">Mosaico editorial</option><option value="uniform">Uniforme</option><option value="large">Fotografias grandes</option></select></label><label>Espaçamento<select value={gallery.settings.gridSpacing} onChange={e=>updateSettings({gridSpacing:e.target.value})}><option value="compact">Compacto</option><option value="regular">Regular</option><option value="wide">Amplo</option></select></label><label>Nomes<select value={gallery.settings.naming.mode} onChange={e=>updateSettings({naming:{...gallery.settings.naming,mode:e.target.value}})}><option value="original">Nome original</option><option value="sequence">Prefixo + sequência</option><option value="number">Somente número</option><option value="progress">Prefixo (1 de 200)</option></select></label><label>Prefixo<input value={gallery.settings.naming.prefix} onChange={e=>updateSettings({naming:{...gallery.settings.naming,prefix:capitalizeName(e.target.value)}})}/></label><label className="check full"><input type="checkbox" checked={gallery.settings.showFileNames} onChange={e=>updateSettings({showFileNames:e.target.checked})}/>Exibir nomes das fotografias</label></div><AppearancePreview gallery={gallery}/></div></div>}
function AppearancePreview({gallery}){return <div className={`appearance-preview theme-${gallery.settings.theme} type-${gallery.settings.typography}`}><header><small>PRÉVIA</small><h3>{capitalizeName(gallery.name)}</h3></header><div className={`preview-grid ${gallery.settings.gridStyle} ${gallery.settings.gridSpacing}`}>{[1,2,3,4,5].map((n)=><span key={n}/>)}</div></div>}

function SelectionTab({ gallery, updateGallery, updateSettings }) {
  const money = maskCurrency(gallery.additionalPrice);
  return <div className="workspace-tab"><div className="tab-heading"><div><span>SELEÇÃO</span><h2>Regras de escolha</h2><p>Defina limites, adicionais e interações permitidas.</p></div></div><div className="gallery-form-grid"><label>Fotos incluídas<input type="number" min="0" value={gallery.includedPhotos} onChange={e=>updateGallery({includedPhotos:Number(e.target.value||0)})}/></label><label>Valor por adicional<input inputMode="numeric" value={money} onChange={e=>updateGallery({additionalPrice:parseCurrency(maskCurrency(e.target.value))})}/></label><label>Prazo da seleção<input type="date" value={gallery.selectionDeadline||''} onChange={e=>updateGallery({selectionDeadline:e.target.value})}/></label><label>Finalidade<select value={gallery.settings.purpose} onChange={e=>{const purpose=e.target.value;updateSettings({purpose,downloadMode:purpose==='delivery'?'all':gallery.settings.downloadMode||'selected',allowAdditional:purpose==='delivery'?false:gallery.settings.allowAdditional})}}><option value="selection">Seleção</option><option value="delivery">Entrega</option><option value="both">Seleção e entrega</option></select></label><label className="check"><input type="checkbox" checked={gallery.settings.allowComments} onChange={e=>updateSettings({allowComments:e.target.checked})}/>Permitir comentários</label><label className="check"><input type="checkbox" checked={gallery.settings.allowAdditional} onChange={e=>updateSettings({allowAdditional:e.target.checked})}/>Permitir fotos adicionais</label></div></div>;
}

function ProtectionTab({editor,clientName,updateGallery,applying,onApply,progress}){return <div className="workspace-tab"><div className="tab-heading"><div><span>PROTEÇÃO</span><h2>Provas protegidas</h2><p>A marca é incorporada ao arquivo de visualização.</p></div><button disabled={applying||!editor.photos.length} onClick={onApply}>{applying?<LoaderCircle className="spin"/>:<RefreshCw/>}Aplicar às provas</button></div><div className="gallery-protection-layout"><div className="gallery-form-grid"><label>Texto<input value={editor.gallery.watermarkSettings.text} onChange={e=>updateGallery({watermarkSettings:{...editor.gallery.watermarkSettings,text:e.target.value.toUpperCase()}})}/></label><label>Opacidade<input type="range" min="0.15" max="0.65" step="0.05" value={editor.gallery.watermarkSettings.opacity} onChange={e=>updateGallery({watermarkSettings:{...editor.gallery.watermarkSettings,opacity:Number(e.target.value)}})}/><small>{Math.round(editor.gallery.watermarkSettings.opacity*100)}%</small></label><label className="check full"><input type="checkbox" checked={Boolean(editor.gallery.watermarkSettings.showClient)} onChange={e=>updateGallery({watermarkSettings:{...editor.gallery.watermarkSettings,showClient:e.target.checked}})}/>Incluir nome do cliente</label><label className="full">Aviso legal<textarea rows="6" value={editor.gallery.legalNotice} onChange={e=>updateGallery({legalNotice:e.target.value})}/></label></div><WatermarkSample text={editor.gallery.watermarkSettings.text} opacity={editor.gallery.watermarkSettings.opacity} showClient={editor.gallery.watermarkSettings.showClient} clientName={clientName}/></div>{progress.length>0&&<UploadList rows={progress}/>}</div>}

function DeliveryTab({gallery,updateSettings,metrics,saving,onRelease}){
  const purpose=gallery.settings.purpose||'selection';
  const isReleased=gallery.status==='delivery';
  return <div className="workspace-tab"><div className="tab-heading"><div><span>ENTREGA</span><h2>Arquivos finais</h2><p>Libere todas as fotos ou somente as selecionadas, conforme o pacote contratado.</p></div><button disabled={saving||isReleased} onClick={onRelease}>{isReleased?<CheckCircle2/>:<PackageCheck/>}{isReleased?'Entrega liberada':'Liberar entrega'}</button></div><div className="delivery-summary"><article><strong>{metrics.selected}</strong><span>Selecionadas</span></article><article><strong>{metrics.edited}</strong><span>Com arquivo final</span></article><article><strong>{metrics.delivered}</strong><span>Liberadas</span></article></div><div className="gallery-form-grid"><label>Modo de download<select value={gallery.settings.downloadMode} onChange={e=>updateSettings({downloadMode:e.target.value})}><option value="selected">Somente selecionadas</option><option value="all">Galeria completa</option><option value="individual">Galeria completa, download individual</option></select><small>{purpose==='delivery'?'Para trabalhos sem seleção, use Galeria completa.':'Para pacotes com limite, use Somente selecionadas.'}</small></label><label>Validade do download (dias)<input type="number" min="1" value={gallery.settings.downloadExpiresDays} onChange={e=>updateSettings({downloadExpiresDays:Number(e.target.value||30)})}/></label><label>Limite de downloads<input type="number" min="0" value={gallery.settings.downloadLimit} onChange={e=>updateSettings({downloadLimit:Number(e.target.value||0)})}/><small>0 significa sem limite.</small></label></div>{purpose==='both'&&gallery.status==='selection'&&<div className="gallery-admin-message">A entrega deve ser liberada depois que o cliente concluir a seleção.</div>}{purpose==='delivery'&&<div className="gallery-admin-message">Esta galeria não exige seleção. Ao publicar, o cliente recebe a experiência de entrega e download.</div>}</div>
}
function SharingTab({gallery,publicLink,onCopy,onRenew}){return <div className="workspace-tab"><div className="tab-heading"><div><span>COMPARTILHAR</span><h2>Acesso do cliente</h2><p>Publique a galeria antes de enviar o link.</p></div></div><div className="sharing-card"><Link2/><div><small>LINK EXTERNO</small><strong>{publicLink||'Ainda não disponível neste navegador'}</strong><p>Status: {STATUS_LABELS[gallery.status]}</p></div><div><button onClick={onCopy}><Copy/>Copiar</button><button className="secondary" onClick={onRenew}><RefreshCw/>Renovar</button>{publicLink&&<a href={publicLink} target="_blank" rel="noreferrer"><ExternalLink/>Abrir</a>}</div></div></div>}
function formatBytes(value = 0) { const bytes=Number(value||0); if(bytes<1024)return `${bytes} B`; const units=['KB','MB','GB','TB']; let size=bytes,index=-1; do{size/=1024;index+=1}while(size>=1024&&index<units.length-1); return `${size.toLocaleString('pt-BR',{maximumFractionDigits:2})} ${units[index]}`; }
function SettingsTab({gallery,updateGallery,storageSummary,optimizingStorage,onOptimizeStorage,onCleanStorage,onTrash}){return <div className="workspace-tab"><div className="tab-heading"><div><span>CONFIGURAÇÕES</span><h2>Dados da galeria</h2><p>Informações internas, validade, armazenamento e exclusão.</p></div></div><div className="gallery-form-grid"><label className="full">Nome<input value={gallery.name} onChange={e=>updateGallery({name:capitalizeName(e.target.value)})}/></label><label>Validade do link<input type="date" value={gallery.expiresAt?.slice(0,10)||''} onChange={e=>updateGallery({expiresAt:e.target.value})}/></label></div><div className="gallery-storage-card"><div className="gallery-storage-heading"><HardDrive/><div><h3>Armazenamento econômico</h3><p>Provas leves em WebP. Originais continuam privados e sem perda de qualidade.</p></div></div><div className="gallery-storage-metrics"><article><strong>{storageSummary?.photos||0}</strong><span>Fotografias</span></article><article><strong>{formatBytes(storageSummary?.originalsBytes)}</strong><span>Originais</span></article><article><strong>{formatBytes(storageSummary?.previewsBytes)}</strong><span>Provas</span></article><article><strong>{formatBytes(storageSummary?.estimatedBytes)}</strong><span>Total estimado</span></article></div><div className="gallery-storage-actions"><button disabled={optimizingStorage} onClick={onOptimizeStorage}>{optimizingStorage?<LoaderCircle className="spin"/>:<RefreshCw/>}Otimizar provas</button><button className="secondary" disabled={optimizingStorage} onClick={onCleanStorage}><Trash2/>Limpar resíduos</button></div><small>Uploads repetidos na mesma galeria são ignorados. Arquivos temporários e órfãos podem ser removidos sem apagar fotos válidas.</small></div><div className="danger-zone"><div><h3>Zona de perigo</h3><p>A galeria poderá ser restaurada enquanto estiver na lixeira.</p></div><button className="danger" onClick={onTrash}><Trash2/>Mover para lixeira</button></div></div>}


function CreateModal({form,setForm,clients,projects,saving,onClose,onSubmit}){return <div className="gallery-modal-backdrop"><form className="gallery-modal" onSubmit={onSubmit}><header><div><span>NOVA GALERIA</span><h2>Criar coleção</h2><p>Comece com os dados essenciais e personalize depois.</p></div><button type="button" className="icon secondary" onClick={onClose}><X/></button></header><section className="gallery-form-section"><div className="gallery-form-grid"><label>Cliente<select required value={form.clientId} onChange={e=>{const id=e.target.value;const c=clients.find(x=>String(x.id)===String(id));setForm(v=>({...v,clientId:id,projectId:'',name:c?`Seleção ${capitalizeName(c.nome)}`:v.name}))}}><option value="">Selecione</option>{clients.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></label><label>Trabalho<select value={form.projectId} onChange={e=>setForm(v=>({...v,projectId:e.target.value}))}><option value="">Opcional</option>{projects.map(p=><option key={p.id} value={p.id}>{p.titulo||p.tipoServico}</option>)}</select></label><label className="full">Nome<input required value={form.name} onChange={e=>setForm(v=>({...v,name:capitalizeName(e.target.value)}))}/></label><label>Fotos incluídas<input type="number" min="0" value={form.includedPhotos} onChange={e=>setForm(v=>({...v,includedPhotos:Number(e.target.value||0)}))}/></label><MoneyField label="Valor por adicional" value={form.additionalPrice} onChange={value=>setForm(v=>({...v,additionalPrice:value}))}/><label>Prazo<input type="date" value={form.selectionDeadline} onChange={e=>setForm(v=>({...v,selectionDeadline:e.target.value}))}/></label><label>Finalidade<select value={form.settings.purpose} onChange={e=>{const purpose=e.target.value;setForm(v=>({...v,includedPhotos:purpose==='delivery'?0:v.includedPhotos,settings:{...v.settings,purpose,downloadMode:purpose==='delivery'?'all':'selected',allowAdditional:purpose==='delivery'?false:true}}))}}><option value="selection">Seleção</option><option value="delivery">Entrega</option><option value="both">Seleção e entrega</option></select></label></div></section><footer><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button disabled={saving} type="submit">{saving?<LoaderCircle className="spin"/>:<Plus/>}Criar galeria</button></footer></form></div>}
function MoneyField({label,value,onChange}){return <label>{label}<input inputMode="numeric" value={value} onChange={e=>onChange(maskCurrency(e.target.value))}/></label>}
function UploadModal({gallery,progress,fileRef,onFiles,onClose}){return <div className="gallery-modal-backdrop"><div className="gallery-modal upload-modal"><header><div><span>UPLOAD PROTEGIDO</span><h2>{gallery.name}</h2></div><button className="icon secondary" onClick={onClose}><X/></button></header><button className="gallery-dropzone" onClick={()=>fileRef.current?.click()}><Upload/><strong>Selecionar fotografias</strong><span>Originais privados e provas protegidas.</span></button><input ref={fileRef} hidden multiple type="file" accept="image/*" onChange={e=>onFiles(e.target.files)}/>{progress.length>0&&<UploadList rows={progress}/>}</div></div>}
function CoverPicker({photos,selectedId,onSelect,onClose}){return <div className="gallery-modal-backdrop"><div className="gallery-modal cover-picker"><header><div><span>FOTO DE CAPA</span><h2>Escolha uma fotografia</h2></div><button className="icon secondary" onClick={onClose}><X/></button></header><div className="cover-picker-grid">{photos.map(photo=><button className={selectedId===photo.id?'selected':''} key={photo.id} onClick={()=>onSelect(photo.id)}><AdminPhoto photo={photo}/><span>{photo.displayName}</span>{selectedId===photo.id&&<Check/>}</button>)}</div></div></div>}
function WatermarkSample({text,opacity,showClient,clientName}){const label=showClient&&clientName?`${String(text).toUpperCase()} · ${capitalizeName(clientName)}`:String(text).toUpperCase();return <div className="gallery-watermark-sample"><div className="gallery-watermark-sample-image"/><div className="gallery-watermark-sample-grid" style={{opacity}}>{Array.from({length:18},(_,i)=><span key={i}>{label}</span>)}</div><small>Prévia da proteção</small></div>}
function UploadList({rows}){return <div className="gallery-upload-list">{rows.map((item,index)=>item&&<div key={`${item.name}-${index}`} className={item.status==='error'?'error':''}><span>{item.name}</span><progress value={item.progress} max="100"/><strong>{item.status==='error'?'Erro':`${item.progress}%`}</strong></div>)}</div>}
function AdminPhoto({photo}){const {url,error}=useAdminPhotoUrl(photo);return url?<img src={url} alt={photo.displayName}/>:error?<div className="photo-failure"><RefreshCw/></div>:<LoaderCircle className="spin"/>}
