import { normalizeProductionStatus } from './projectEngine';

const text = (value = '') => String(value ?? '').trim();

export const getOfficialProjectClientId = (project = {}) => text(
  project.clientId
  || project.clienteId
  || project.client_id
  || project.cliente_id,
);

export const getOfficialProjectDate = (project = {}) => (
  project.data
  || project.dataEvento
  || project.data_evento
  || project.dataTrabalho
  || project.data_trabalho
  || project.eventDate
  || ''
);

export const getOfficialProjectYear = (project = {}) => {
  const value = getOfficialProjectDate(project);
  if (!value) return null;
  const match = text(value).match(/^(\d{4})/);
  if (match) return Number(match[1]);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getFullYear();
};

export const getOfficialProjectStatus = (project = {}) => normalizeProductionStatus(
  project.statusProducao
  || project.status_producao
  || project.financeiro?.statusProducao
  || project.status
  || project.financeiro?.workflowStatus,
);

export const isOfficialProjectHidden = (project = {}) => Boolean(
  project.arquivado
  || project.archived
  || project.deletedAt
  || project.deleted_at
  || project.excluido
  || project.financeiro?.hideFromClients === true
  || project.financeiro?.ocultarDaListaClientes === true
  || project.hideFromClients === true
  || project.ocultarDaListaClientes === true,
);

const projectService = (project = {}) => text(
  project.titulo
  || project.tipoServico
  || project.tipo_servico
  || project.servico
  || project.categoria,
).toLocaleLowerCase('pt-BR');

const projectAmount = (project = {}) => Number(
  project.valorContratado
  ?? project.valor_contratado
  ?? project.financeiro?.valorContratado
  ?? project.financeiro?.valor_contratado
  ?? 0,
) || 0;

const updatedAt = (project = {}) => {
  const candidates = [
    project.updated_at,
    project.updatedAt,
    project.created_at,
    project.createdAt,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const value = new Date(candidate).getTime();
    if (!Number.isNaN(value)) return value;
  }
  return 0;
};

const duplicateKey = (project = {}) => [
  getOfficialProjectClientId(project),
  text(getOfficialProjectDate(project)).slice(0, 10),
  projectService(project),
  projectAmount(project).toFixed(2),
].join('|');

/**
 * Fonte operacional única usada por Trabalhos e Relatórios.
 * Mantém trabalhos reais distintos, remove somente cópias idênticas e exige
 * vínculo com um cliente oficial existente.
 */
export const buildOfficialProjectRegistry = ({
  projects = [],
  clients = [],
  year,
  includeUndated = false,
  includeCancelled = false,
  includeArchived = false,
} = {}) => {
  const clientsById = new Map(
    clients
      .filter((client) => client?.id)
      .map((client) => [String(client.id), client]),
  );

  const byId = new Map();
  projects.forEach((project) => {
    if (!project?.id) return;
    const id = String(project.id);
    const current = byId.get(id);
    if (!current || updatedAt(project) >= updatedAt(current)) byId.set(id, project);
  });

  const filtered = [...byId.values()].filter((project) => {
    const clientId = getOfficialProjectClientId(project);
    if (!clientId || !clientsById.has(clientId)) return false;
    if (!includeArchived && isOfficialProjectHidden(project)) return false;
    if (!includeCancelled && getOfficialProjectStatus(project) === 'cancelado') return false;

    const projectYear = getOfficialProjectYear(project);
    if (projectYear == null) return includeUndated;
    return year == null || projectYear === Number(year);
  });

  const bySignature = new Map();
  filtered.forEach((project) => {
    const key = duplicateKey(project);
    const current = bySignature.get(key);
    if (!current || updatedAt(project) >= updatedAt(current)) bySignature.set(key, project);
  });

  return [...bySignature.values()].map((project) => {
    const client = clientsById.get(getOfficialProjectClientId(project));
    return {
      ...project,
      clientId: String(client.id),
      clienteId: String(client.id),
      client_id: String(client.id),
      cliente_id: String(client.id),
      clienteNome: client.nome || client.name || project.clienteNome || project.cliente_nome || '',
      cliente: client,
    };
  });
};

export const COMPLETED_PROJECT_STATUSES = new Set([
  'evento_realizado',
  'selecao',
  'edicao',
  'revisao',
  'pronto_entrega',
  'entregue',
  'finalizado',
]);

export const isCompletedOfficialProject = (project = {}) => (
  COMPLETED_PROJECT_STATUSES.has(getOfficialProjectStatus(project))
);
