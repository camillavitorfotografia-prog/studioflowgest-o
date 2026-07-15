import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  FolderOpen,
  ImageIcon,
  LoaderCircle,
  LockKeyhole,
  Mail,
  MapPin,
  WalletCards,
} from 'lucide-react';
import Logo from '../../assets/studioflow-logo.png';
import { createPublicPortalFileUrl, loadPublicClientPortal } from '../../features/clientPortal/storage/clientPortalStorage';
import { formatCurrency } from '../../utils/formatters';
import { capitalizeName, maskPhone } from '../../utils/masks';
import './PortalCliente.css';

const getProjectTitle = (project = {}) => (
  capitalizeName(
    project.titulo
    || project.tipo_servico
    || project.tipoServico
    || 'Seu trabalho',
  )
);

const getProjectDate = (project = {}) => (
  project.data
  || project.data_evento
  || project.dataTrabalho
  || ''
);

const formatPortalDate = (value) => {
  if (!value) return '';

  const normalizedValue = String(value).slice(0, 10);
  const [year, month, day] = normalizedValue.split('-');

  if (year && month && day) {
    return `${day}/${month}/${year}`;
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat('pt-BR').format(parsedDate);
};

const STATUS_LABELS = {
  novo: 'Novo',
  planejamento: 'Em planejamento',
  em_planejamento: 'Em planejamento',
  pre_producao: 'Pré-produção',
  aguardando_evento: 'Aguardando evento',
  evento_realizado: 'Evento realizado',
  selecao: 'Em seleção',
  edicao: 'Em edição',
  revisao: 'Em revisão',
  pronto_entrega: 'Pronto para entrega',
  entregue: 'Entregue',
  finalizado: 'Finalizado',
  pausado: 'Pausado',
  cancelado: 'Cancelado',
};

const normalizeStatusLabel = (value) => {
  const normalized = String(value || 'em_planejamento')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');

  return STATUS_LABELS[normalized]
    || capitalizeName(normalized.replace(/_/g, ' '));
};

const getDocumentTitle = (document = {}) => (
  capitalizeName(
    document.payload?.name
    || document.name
    || (
      document.document_type === 'contract'
      || document.documentType === 'contract'
        ? 'Contrato'
        : 'Proposta'
    ),
  )
);

export default function PortalCliente() {
  const { accessToken } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const result = await loadPublicClientPortal(accessToken);

        if (!active) return;

        if (!result) {
          setError(
            'Este acesso não existe, expirou ou foi desativado.',
          );
        } else {
          setData(result);
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError.message
            || 'Não foi possível abrir o portal.',
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [accessToken]);

  const portal = data?.portal || {};
  const client = data?.client || {};
  const projects = Array.isArray(data?.projects)
    ? data.projects
    : [];
  const documents = Array.isArray(data?.documents)
    ? data.documents
    : [];
  const files = Array.isArray(data?.files)
    ? data.files
    : [];
  const galleries = Array.isArray(data?.galleries)
    ? data.galleries
    : [];
  const sections = portal.sections || {};

  const downloadPortalFile = async (file) => {
    try {
      const url = await createPublicPortalFileUrl(
        accessToken,
        file.id,
      );
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (downloadError) {
      setError(
        downloadError.message
        || 'Não foi possível baixar o arquivo.',
      );
    }
  };

  const financial = useMemo(
    () => projects.reduce(
      (summary, project) => {
        const total = Number(
          project.valor_contratado
          || project.valorContratado
          || project.financeiro?.valorContratado
          || 0,
        );

        const paid = Number(
          project.valor_recebido
          || project.valorRecebido
          || project.financeiro?.valorRecebido
          || 0,
        );

        return {
          total: summary.total + total,
          paid: summary.paid + paid,
          pending:
            summary.pending
            + Math.max(0, total - paid),
        };
      },
      {
        total: 0,
        paid: 0,
        pending: 0,
      },
    ),
    [projects],
  );

  if (loading) {
    return (
      <div className="client-portal-state">
        <LoaderCircle className="spin" />
        <p>Preparando seu espaço…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="client-portal-state error">
        <LockKeyhole />
        <h1>Acesso indisponível</h1>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="client-portal-page">
      <header className="client-portal-header">
        <img src={Logo} alt="StudioFlow" />

        <span>
          <LockKeyhole />
          Área privada
        </span>
      </header>

      <main>
        <section className="client-portal-hero">
          <div className="client-portal-hero-copy">
            <span className="eyebrow">
              Olá,{' '}
              {capitalizeName(
                client.nome
                || client.name
                || 'bem-vindo(a)',
              )}
            </span>

            <h1>
              {capitalizeName(
                portal.name
                || 'Seu espaço no estúdio',
              )}
            </h1>

            <p>
              {portal.welcome_message
              || portal.welcomeMessage
              || 'Acompanhe aqui as informações importantes do seu trabalho.'}
            </p>
          </div>

          <div className="client-portal-hero-badge">
            <CheckCircle2 />
            <strong>Acesso seguro</strong>
            <small>
              Informações atualizadas pelo estúdio
            </small>
          </div>
        </section>

        {sections.overview !== false && (
          <section className="client-portal-kpis">
            <article>
              <FolderOpen />
              <span>
                <strong>{projects.length}</strong>
                <small>Trabalhos</small>
              </span>
            </article>

            <article>
              <FileText />
              <span>
                <strong>{documents.length}</strong>
                <small>Documentos</small>
              </span>
            </article>

            <article>
              <WalletCards />
              <span>
                <strong>
                  {formatCurrency(financial.pending)}
                </strong>
                <small>Saldo pendente</small>
              </span>
            </article>
          </section>
        )}

        <div className="client-portal-grid">
          {sections.schedule !== false && (
            <section className="client-portal-panel client-portal-panel-schedule">
              <header>
                <div>
                  <CalendarDays />
                  <span>
                    <h2>Cronograma</h2>
                    <p>
                      Datas e etapas dos seus trabalhos
                    </p>
                  </span>
                </div>
              </header>

              <div className="client-portal-timeline">
                {projects.length ? (
                  projects.map((project) => (
                    <article key={project.id}>
                      <span className="timeline-dot" />

                      <div>
                        <strong>
                          {getProjectTitle(project)}
                        </strong>

                        <p>
                          {getProjectDate(project)
                            ? formatPortalDate(
                              getProjectDate(project),
                            )
                            : 'Data a definir'}

                          {project.local
                            ? ` · ${capitalizeName(project.local)}`
                            : ''}
                        </p>

                        <small>
                          {normalizeStatusLabel(
                            project.status_producao
                            || project.statusProducao
                            || project.status,
                          )}
                        </small>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="client-portal-empty">
                    <CalendarDays />
                    <strong>
                      Nenhum compromisso cadastrado
                    </strong>
                    <p>
                      Quando houver uma nova data ou etapa,
                      ela aparecerá aqui.
                    </p>
                  </div>
                )}
              </div>
            </section>
          )}

          {sections.financial !== false && (
            <section className="client-portal-panel">
              <header>
                <div>
                  <WalletCards />
                  <span>
                    <h2>Financeiro</h2>
                    <p>Resumo dos valores</p>
                  </span>
                </div>
              </header>

              <div className="client-portal-financial">
                <div>
                  <span>Valor contratado</span>
                  <strong>
                    {formatCurrency(financial.total)}
                  </strong>
                </div>

                <div>
                  <span>Valor recebido</span>
                  <strong>
                    {formatCurrency(financial.paid)}
                  </strong>
                </div>

                <div className="pending">
                  <span>Saldo pendente</span>
                  <strong>
                    {formatCurrency(financial.pending)}
                  </strong>
                </div>
              </div>
            </section>
          )}

          {sections.documents !== false && (
            <section className="client-portal-panel">
              <header>
                <div>
                  <FileCheck2 />
                  <span>
                    <h2>Documentos</h2>
                    <p>Contratos e propostas</p>
                  </span>
                </div>
              </header>

              <div className="client-portal-documents">
                {documents.length ? (
                  documents.map((document) => (
                    <article key={document.id}>
                      <span>
                        {document.document_type === 'contract'
                        || document.documentType === 'contract'
                          ? <FileCheck2 />
                          : <FileText />}
                      </span>

                      <div>
                        <strong>
                          {getDocumentTitle(document)}
                        </strong>

                        <small>
                          {normalizeStatusLabel(
                            document.status
                            || 'Disponível',
                          )}
                        </small>
                      </div>

                      {document.payload?.downloadUrl && (
                        <a
                          href={document.payload.downloadUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Baixar ${getDocumentTitle(document)}`}
                        >
                          <Download />
                        </a>
                      )}
                    </article>
                  ))
                ) : (
                  <div className="client-portal-empty compact">
                    <FileText />
                    <strong>
                      Nenhum documento disponível
                    </strong>
                    <p>
                      Contratos e propostas liberados pelo
                      estúdio aparecerão aqui.
                    </p>
                  </div>
                )}
              </div>
            </section>
          )}

          {sections.files !== false && (
            <section className="client-portal-panel">
              <header>
                <div>
                  <FolderOpen />
                  <span>
                    <h2>Arquivos</h2>
                    <p>Galerias e entregas</p>
                  </span>
                </div>
              </header>

              {galleries.length > 0 && (
                <div className="client-portal-galleries">
                  {galleries.map((gallery) => (
                    <a
                      key={gallery.id}
                      href={gallery.publicUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span className="client-portal-gallery-icon">
                        <ImageIcon />
                      </span>

                      <div>
                        <strong>
                          {capitalizeName(gallery.name || 'Galeria')}
                        </strong>
                        <small>
                          {Number(gallery.photoCount || 0)} fotografia(s)
                          {gallery.purpose === 'selection'
                            ? ` · ${Number(gallery.selectedCount || 0)} selecionada(s)`
                            : ' · Disponível para entrega'}
                        </small>
                      </div>

                      <ExternalLink />
                    </a>
                  ))}
                </div>
              )}

              {files.length > 0 && (
                <div className="client-portal-files">
                  {files.map((file) => (
                    <article key={file.id}>
                      <span>
                        <ImageIcon />
                      </span>

                      <div>
                        <strong>
                          {capitalizeName(file.name || 'Arquivo')}
                        </strong>
                        <small>
                          {file.extension
                            ? file.extension.toUpperCase()
                            : 'ARQUIVO'}
                        </small>
                      </div>

                      <button
                        type="button"
                        onClick={() => void downloadPortalFile(file)}
                        aria-label={`Baixar ${file.name || 'arquivo'}`}
                      >
                        <Download />
                      </button>
                    </article>
                  ))}
                </div>
              )}

              {!galleries.length && !files.length && (
                <div className="client-portal-empty compact">
                  <ImageIcon />
                  <strong>
                    Nenhum arquivo liberado
                  </strong>
                  <p>
                    Galerias, vídeos e outros arquivos
                    aparecerão aqui quando estiverem prontos.
                  </p>
                </div>
              )}
            </section>
          )}

          {sections.messages !== false && (
            <section className="client-portal-panel">
              <header>
                <div>
                  <Mail />
                  <span>
                    <h2>Contato</h2>
                    <p>Fale com o estúdio</p>
                  </span>
                </div>
              </header>

              <div className="client-portal-contact">
                {client.email && (
                  <a href={`mailto:${client.email}`}>
                    <Mail />
                    {client.email}
                  </a>
                )}

                {client.whatsapp && (
                  <a
                    href={`https://wa.me/55${String(
                      client.whatsapp,
                    ).replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Clock3 />
                    {maskPhone(client.whatsapp)}
                  </a>
                )}

                {client.cidade && (
                  <span>
                    <MapPin />
                    {capitalizeName(client.cidade)}
                  </span>
                )}
              </div>
            </section>
          )}
        </div>
      </main>

      <footer>
        Portal seguro criado com StudioFlow
      </footer>
    </div>
  );
}