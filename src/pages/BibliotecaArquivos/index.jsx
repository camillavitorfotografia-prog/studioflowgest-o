import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArchiveRestore,
  Download,
  Eye,
  File,
  FileArchive,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Folder,
  FolderPlus,
  Grid2X2,
  Heart,
  Image as ImageIcon,
  LayoutList,
  LoaderCircle,
  MoreHorizontal,
  Search,
  ShieldCheck,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { getDbStudioData } from '../../utils/dbData';
import { capitalizeName } from '../../utils/masks';
import {
  createLibraryFolder,
  createLibrarySignedUrl,
  listLibraryFiles,
  listLibraryFolders,
  moveLibraryFileToTrash,
  permanentlyDeleteLibraryFile,
  restoreLibraryFile,
  updateLibraryFile,
  uploadLibraryFile,
} from '../../features/fileLibrary/storage/fileLibraryStorage';
import './BibliotecaArquivos.css';

const formatBytes = (bytes = 0) => {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(1)} GB`;
};

const formatDate = (value) => {
  if (!value) return 'Sem data';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem data';
  return new Intl.DateTimeFormat('pt-BR').format(date);
};

const typeFromMime = (mime = '') => {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.includes('pdf') || mime.includes('document') || mime.includes('text')) return 'document';
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('compressed')) return 'archive';
  return 'other';
};


const normalizeProjectType = (value = '') => {
  const text = String(value || '').trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!text) return 'Outros';
  if (text.includes('casamento civil')) return 'Casamento civil';
  if (text.includes('casamento')) return 'Casamento';
  if (text.includes('gestante')) return 'Gestante';
  if (text.includes('familia')) return 'Família';
  if (text.includes('formatura')) return 'Formatura';
  if (text.includes('casal') || text.includes('pre wedding') || text.includes('pre-wedding')) return 'Ensaio de casal';
  if (text.includes('pessoal') || text.includes('individual')) return 'Ensaio pessoal';
  if (text.includes('ensaio')) return 'Ensaio';
  return String(value || 'Outros').trim();
};

const iconForFile = (file) => {
  const type = typeFromMime(file.mimeType);
  if (type === 'image') return FileImage;
  if (type === 'video') return FileVideo;
  if (type === 'audio') return FileAudio;
  if (type === 'document') return FileText;
  if (type === 'archive') return FileArchive;
  return File;
};

export default function BibliotecaArquivos() {
  const inputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [view, setView] = useState('grid');
  const [scope, setScope] = useState('active');
  const [typeFilter, setTypeFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [folderFilter, setFolderFilter] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [uploadQueue, setUploadQueue] = useState([]);
  const [selected, setSelected] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [folderModal, setFolderModal] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [uploadContext, setUploadContext] = useState({ clientId: '', projectId: '', portalVisible: false });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [libraryFiles, libraryFolders, studioData] = await Promise.all([
        listLibraryFiles(),
        listLibraryFolders(),
        getDbStudioData(),
      ]);
      setFiles(libraryFiles);
      setFolders(libraryFolders);
      setClients(studioData.clients || []);
      setProjects(studioData.projects || []);
    } catch (loadError) {
      setError(loadError.message || 'Não foi possível carregar a biblioteca.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filteredProjects = useMemo(() => (
    clientFilter
      ? projects.filter((project) => String(project.clientId || project.clienteId || '') === String(clientFilter))
      : projects
  ), [projects, clientFilter]);

  const projectTypeOptions = useMemo(() => (
    [...new Set(filteredProjects.map((project) => normalizeProjectType(
      project.tipoServico || project.titulo || project.categoria || 'Outros',
    )))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  ), [filteredProjects]);

  const projectTypeById = useMemo(() => new Map(
    projects.map((project) => [String(project.id), normalizeProjectType(
      project.tipoServico || project.titulo || project.categoria || 'Outros',
    )]),
  ), [projects]);

  const filteredFiles = useMemo(() => files.filter((file) => {
    if (scope === 'trash' && file.status !== 'trash') return false;
    if (scope !== 'trash' && file.status === 'trash') return false;
    if (scope === 'favorites' && !file.favorite) return false;
    if (scope === 'portal' && !file.portalVisible) return false;
    if (typeFilter !== 'all' && typeFromMime(file.mimeType) !== typeFilter) return false;
    if (clientFilter && String(file.clientId || '') !== String(clientFilter)) return false;
    if (projectFilter && projectTypeById.get(String(file.projectId || '')) !== projectFilter) return false;
    if (folderFilter && String(file.folderId || '') !== String(folderFilter)) return false;
    const term = query.trim().toLowerCase();
    if (term && !`${file.name} ${file.originalName}`.toLowerCase().includes(term)) return false;
    return true;
  }), [files, scope, typeFilter, clientFilter, projectFilter, folderFilter, query, projectTypeById]);

  const summary = useMemo(() => ({
    active: files.filter((file) => file.status !== 'trash').length,
    favorites: files.filter((file) => file.favorite && file.status !== 'trash').length,
    portal: files.filter((file) => file.portalVisible && file.status !== 'trash').length,
    size: files.filter((file) => file.status !== 'trash').reduce((sum, file) => sum + file.sizeBytes, 0),
  }), [files]);

  const handleFiles = async (fileList) => {
    const entries = Array.from(fileList || []);
    if (!entries.length) return;

    setUploadQueue(entries.map((file) => ({ id: `${file.name}-${file.lastModified}`, name: file.name, progress: 0, status: 'uploading' })));

    for (const file of entries) {
      const queueId = `${file.name}-${file.lastModified}`;
      try {
        const saved = await uploadLibraryFile(file, {
          folderId: folderFilter || null,
          clientId: uploadContext.clientId || null,
          projectId: uploadContext.projectId || null,
          portalVisible: uploadContext.portalVisible,
        }, (progress) => {
          setUploadQueue((queue) => queue.map((item) => item.id === queueId ? { ...item, progress } : item));
        });
        setFiles((current) => [saved, ...current]);
        setUploadQueue((queue) => queue.map((item) => item.id === queueId ? { ...item, progress: 100, status: 'done' } : item));
      } catch (uploadError) {
        setUploadQueue((queue) => queue.map((item) => item.id === queueId ? { ...item, status: 'error', error: uploadError.message } : item));
      }
    }
  };

  const patchFile = async (file, changes) => {
    try {
      const updated = await updateLibraryFile(file.id, changes);
      setFiles((current) => current.map((item) => item.id === file.id ? updated : item));
      setSelected((current) => current?.id === file.id ? updated : current);
    } catch (actionError) {
      setError(actionError.message || 'Não foi possível atualizar o arquivo.');
    }
  };

  const openPreview = async (file) => {
    setSelected(file);
    setPreviewUrl('');
    try {
      setPreviewUrl(await createLibrarySignedUrl(file, 3600));
    } catch (previewError) {
      setError(previewError.message || 'Não foi possível abrir o arquivo.');
    }
  };

  const downloadFile = async (file) => {
    const url = await createLibrarySignedUrl(file, 300);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.originalName || file.name;
    anchor.target = '_blank';
    anchor.rel = 'noreferrer';
    anchor.click();
  };

  const createFolder = async (event) => {
    event.preventDefault();
    try {
      const folder = await createLibraryFolder({
        name: folderName,
        clientId: clientFilter || null,
        projectId: projectFilter || null,
      });
      setFolders((current) => [folder, ...current]);
      setFolderName('');
      setFolderModal(false);
    } catch (folderError) {
      setError(folderError.message || 'Não foi possível criar a pasta.');
    }
  };

  return (
    <div className="file-library-page">
      <header className="file-library-header">
        <div>
          <span>GESTÃO DE ARQUIVOS</span>
          <h1>Biblioteca</h1>
          <p>Centralize fotos, vídeos, documentos e entregas vinculadas aos seus clientes e trabalhos.</p>
        </div>
        <div className="file-library-header-actions">
          <button type="button" className="secondary" onClick={() => setFolderModal(true)}><FolderPlus /> Nova pasta</button>
          <button type="button" className="primary" onClick={() => inputRef.current?.click()}><UploadCloud /> Enviar arquivos</button>
          <input ref={inputRef} type="file" multiple hidden onChange={(event) => void handleFiles(event.target.files)} />
        </div>
      </header>

      <section className="file-library-summary">
        <article><Folder /><span><strong>{summary.active}</strong><small>Arquivos ativos</small></span></article>
        <article><Heart /><span><strong>{summary.favorites}</strong><small>Favoritos</small></span></article>
        <article><ShieldCheck /><span><strong>{summary.portal}</strong><small>Liberados no portal</small></span></article>
        <article><ArchiveRestore /><span><strong>{formatBytes(summary.size)}</strong><small>Armazenamento usado</small></span></article>
      </section>

      {error && <div className="file-library-error">{error}<button type="button" onClick={() => setError('')}><X /></button></div>}

      <section className="file-library-toolbar">
        <div className="file-library-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar arquivos..." /></div>
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
          <option value="all">Todos os tipos</option><option value="image">Imagens</option><option value="video">Vídeos</option><option value="audio">Áudios</option><option value="document">Documentos</option><option value="archive">Compactados</option><option value="other">Outros</option>
        </select>
        <select value={clientFilter} onChange={(event) => { setClientFilter(event.target.value); setProjectFilter(''); }}>
          <option value="">Todos os clientes</option>{clients.map((client) => <option key={client.id} value={client.id}>{capitalizeName(client.nome)}</option>)}
        </select>
        <select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}>
          <option value="">Todos os trabalhos</option>{projectTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
        <select value={folderFilter} onChange={(event) => setFolderFilter(event.target.value)}>
          <option value="">Todas as pastas</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
        </select>
        <div className="file-library-view-toggle"><button className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')}><Grid2X2 /></button><button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}><LayoutList /></button></div>
      </section>

      <nav className="file-library-scopes">
        {[['active', 'Todos'], ['favorites', 'Favoritos'], ['portal', 'Área do Cliente'], ['trash', 'Lixeira']].map(([id, label]) => <button key={id} className={scope === id ? 'active' : ''} onClick={() => setScope(id)}>{label}</button>)}
      </nav>

      <section
        className={`file-library-dropzone${isDragging ? ' dragging' : ''}`}
        onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setIsDragging(false); }}
        onDrop={(event) => { event.preventDefault(); setIsDragging(false); void handleFiles(event.dataTransfer.files); }}
      >
        {isDragging && <div className="file-library-drag-overlay"><UploadCloud /><strong>Solte os arquivos para enviar</strong></div>}

        {loading ? (
          <div className="file-library-empty"><LoaderCircle className="spin" /><h2>Carregando biblioteca</h2></div>
        ) : filteredFiles.length ? (
          <div className={`file-library-items ${view}`}>
            {filteredFiles.map((file) => {
              const Icon = iconForFile(file);
              const client = clients.find((item) => String(item.id) === String(file.clientId));
              const project = projects.find((item) => String(item.id) === String(file.projectId));
              return (
                <article key={file.id} className="file-library-item">
                  <button type="button" className="file-library-preview" onClick={() => void openPreview(file)}>
                    <Icon />
                    <span>{file.extension ? file.extension.toUpperCase() : 'ARQUIVO'}</span>
                  </button>
                  <div className="file-library-item-copy">
                    <strong title={file.name}>{file.name}</strong>
                    <small>{formatBytes(file.sizeBytes)} · {formatDate(file.createdAt)}</small>
                    {(client || project) && <p>{client ? capitalizeName(client.nome) : ''}{client && project ? ' · ' : ''}{project ? capitalizeName(project.titulo || project.tipoServico || 'Trabalho') : ''}</p>}
                  </div>
                  <div className="file-library-item-badges">{file.portalVisible && <span className="portal">Portal</span>}{file.favorite && <Heart className="favorite" />}</div>
                  <div className="file-library-item-actions">
                    {scope === 'trash' ? <><button title="Restaurar" onClick={() => void restoreLibraryFile(file.id).then(load)}><ArchiveRestore /></button><button title="Excluir definitivamente" className="danger" onClick={() => void permanentlyDeleteLibraryFile(file).then(load)}><Trash2 /></button></> : <><button title="Favoritar" onClick={() => void patchFile(file, { favorite: !file.favorite })}><Heart /></button><button title="Liberar no portal" onClick={() => void patchFile(file, { portalVisible: !file.portalVisible })}><ShieldCheck /></button><button title="Baixar" onClick={() => void downloadFile(file)}><Download /></button><button title="Mover para lixeira" className="danger" onClick={() => void moveLibraryFileToTrash(file.id).then(load)}><Trash2 /></button><button title="Mais opções"><MoreHorizontal /></button></>}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="file-library-empty"><ImageIcon /><h2>Nenhum arquivo encontrado</h2><p>Envie arquivos ou ajuste os filtros para visualizar sua biblioteca.</p><button type="button" onClick={() => inputRef.current?.click()}><UploadCloud /> Enviar arquivos</button></div>
        )}
      </section>

      {uploadQueue.length > 0 && <aside className="file-library-upload-queue"><header><strong>Envios</strong><button onClick={() => setUploadQueue([])}><X /></button></header>{uploadQueue.map((item) => <article key={item.id}><span>{item.status === 'uploading' ? <LoaderCircle className="spin" /> : item.status === 'done' ? <ShieldCheck /> : <X />}</span><div><strong>{item.name}</strong><div><i style={{ width: `${item.progress}%` }} /></div><small>{item.status === 'error' ? item.error : `${item.progress}%`}</small></div></article>)}</aside>}

      {selected && <div className="file-library-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}><section className="file-library-preview-modal"><header><div><strong>{selected.name}</strong><small>{selected.originalName}</small></div><button onClick={() => setSelected(null)}><X /></button></header><div className="file-library-preview-content">{!previewUrl ? <LoaderCircle className="spin" /> : typeFromMime(selected.mimeType) === 'image' ? <img src={previewUrl} alt={selected.name} /> : typeFromMime(selected.mimeType) === 'video' ? <video src={previewUrl} controls /> : selected.mimeType.includes('pdf') ? <iframe src={previewUrl} title={selected.name} /> : <div className="file-library-generic-preview"><File /><p>Pré-visualização não disponível para este formato.</p><button onClick={() => void downloadFile(selected)}><Download /> Baixar arquivo</button></div>}</div><footer><label><input type="checkbox" checked={selected.favorite} onChange={() => void patchFile(selected, { favorite: !selected.favorite })} /> Favorito</label><label><input type="checkbox" checked={selected.portalVisible} onChange={() => void patchFile(selected, { portalVisible: !selected.portalVisible })} /> Exibir na Área do Cliente</label><button onClick={() => void downloadFile(selected)}><Download /> Baixar</button></footer></section></div>}

      {folderModal && <div className="file-library-modal-backdrop"><form className="file-library-folder-modal" onSubmit={createFolder}><header><div><FolderPlus /><span><strong>Nova pasta</strong><small>Organize arquivos por cliente, trabalho ou etapa.</small></span></div><button type="button" onClick={() => setFolderModal(false)}><X /></button></header><label>Nome da pasta<input autoFocus value={folderName} onChange={(event) => setFolderName(capitalizeName(event.target.value))} placeholder="Ex.: Casamento Camilla e Junior" /></label><footer><button type="button" className="secondary" onClick={() => setFolderModal(false)}>Cancelar</button><button type="submit" className="primary">Criar pasta</button></footer></form></div>}
    </div>
  );
}
