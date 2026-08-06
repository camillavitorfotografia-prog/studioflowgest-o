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


const genericServices = new Set([
  '',
  'outro',
  'serviço não informado',
  'servico nao informado',
  'não informado',
  'nao informado',
]);

const isGenericService = (project = {}) => genericServices.has(projectService(project));

const projectCompletenessScore = (project = {}) => {
  let score = 0;
  if (!isGenericService(project)) score += 100;
  if (project.external_id || project.externalId) score += 12;
  if (project.import_fingerprint || project.importFingerprint) score += 10;
  if (project.tipoServico || project.tipo_servico || project.servico || project.categoria) score += 8;
  if (project.valorContratado ?? project.valor_contratado ?? project.financeiro?.valorContratado) score += 6;
  if (project.financeiro && Object.keys(project.financeiro).length > 0) score += 5;
  if (project.contrato && Object.keys(project.contrato).length > 0) score += 4;
  if (project.timeline_completa || project.timelineCompleta) score += 3;
  return score;
};

const sameImportOrigin = (left = {}, right = {}) => {
  const leftExternal = text(left.external_id || left.externalId);
  const rightExternal = text(right.external_id || right.externalId);
  if (leftExternal && rightExternal && leftExternal === rightExternal) return true;

  const leftFingerprint = text(left.import_fingerprint || left.importFingerprint);
  const rightFingerprint = text(right.import_fingerprint || right.importFingerprint);
  if (leftFingerprint && rightFingerprint && leftFingerprint === rightFingerprint) return true;

  return false;
};

const clientDateKey = (project = {}) => [
  getOfficialProjectClientId(project),
  text(getOfficialProjectDate(project)).slice(0, 10),
].join('|');

const chooseCanonicalProject = (current, candidate) => {
  if (!current) return candidate;

  const currentScore = projectCompletenessScore(current);
  const candidateScore = projectCompletenessScore(candidate);
  if (candidateScore !== currentScore) return candidateScore > currentScore ? candidate : current;

  return updatedAt(candidate) >= updatedAt(current) ? candidate : current;
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
    bySignature.set(key, chooseCanonicalProject(current, project));
  });

  // Importações antigas criaram, em alguns casos, duas linhas para o mesmo
  // cliente e a mesma data: uma genérica ("Outro") e outra com o serviço
  // correto. Esses pares não são trabalhos distintos. Mantemos o registro mais
  // completo e específico, sem colapsar dois trabalhos reais quando ambos têm
  // serviços específicos diferentes.
  const byClientDate = new Map();
  [...bySignature.values()].forEach((project) => {
    const key = clientDateKey(project);
    const current = byClientDate.get(key);

    if (!current) {
      byClientDate.set(key, project);
      return;
    }

    const shouldMerge = (
      isGenericService(current)
      || isGenericService(project)
      || sameImportOrigin(current, project)
    );

    if (shouldMerge) {
      byClientDate.set(key, chooseCanonicalProject(current, project));
      return;
    }

    // Dois serviços específicos na mesma data podem ser trabalhos legítimos.
    // Mantemos ambos usando a assinatura completa como chave secundária.
    byClientDate.set(`${key}|${duplicateKey(project)}`, project);
  });

  return [...byClientDate.values()].map((project) => {
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
