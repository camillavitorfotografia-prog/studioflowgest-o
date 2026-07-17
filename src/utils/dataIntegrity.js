const text = (value = '') => String(value || '')
  .trim()
  .toLocaleLowerCase('pt-BR')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

const digits = (value = '') => String(value || '').replace(/\D/g, '');

export const normalizeIntegrityName = text;
export const normalizeIntegrityPhone = (value = '') => {
  const normalized = digits(value);
  return normalized.length > 11 && normalized.startsWith('55') ? normalized.slice(2) : normalized;
};
export const normalizeIntegrityEmail = (value = '') => String(value || '').trim().toLocaleLowerCase('pt-BR');
export const normalizeIntegrityDocument = digits;

const clientUpdatedAt = (client = {}) => {
  const timestamp = new Date(client.updated_at || client.updatedAt || client.created_at || client.createdAt || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const clientCompleteness = (client = {}) => [
  client.nome,
  client.email,
  client.telefone || client.whatsapp,
  client.cpfCnpj || client.cpf_cnpj,
  client.endereco,
  client.cidade,
  client.observacoes,
].filter((value) => String(value || '').trim()).length;

const clientIdentityKeys = (client = {}) => {
  const keys = [];
  const document = normalizeIntegrityDocument(client.cpfCnpj || client.cpf_cnpj);
  const email = normalizeIntegrityEmail(client.email);
  const phone = normalizeIntegrityPhone(client.telefone || client.whatsapp);
  const name = normalizeIntegrityName(client.nome || client.name);
  if (document) keys.push(`document:${document}`);
  if (email) keys.push(`email:${email}`);
  if (phone) keys.push(`phone:${phone}`);
  if (name) keys.push(`name:${name}`);
  return keys;
};

const mergeClient = (primary = {}, secondary = {}) => {
  const merged = { ...secondary, ...primary };
  Object.keys(secondary).forEach((key) => {
    const primaryValue = primary[key];
    if ((primaryValue === '' || primaryValue === null || primaryValue === undefined)
      && secondary[key] !== undefined) merged[key] = secondary[key];
  });
  return merged;
};

export const consolidateClients = (clients = []) => {
  const groups = [];
  const keyToGroup = new Map();

  clients.forEach((client) => {
    const keys = clientIdentityKeys(client);
    const matchingIndexes = [...new Set(keys.map((key) => keyToGroup.get(key)).filter((value) => value !== undefined))];
    let index = matchingIndexes[0];
    if (index === undefined) {
      index = groups.length;
      groups.push([]);
    }
    groups[index].push(client);
    keys.forEach((key) => keyToGroup.set(key, index));
  });

  const aliases = new Map();
  const canonical = groups.filter(Boolean).map((group) => {
    const ordered = [...group].sort((left, right) => {
      const score = clientCompleteness(right) - clientCompleteness(left);
      return score || clientUpdatedAt(right) - clientUpdatedAt(left);
    });
    const winner = ordered[0];
    const merged = ordered.slice(1).reduce((current, item) => mergeClient(current, item), winner);
    group.forEach((item) => {
      if (item?.id != null && merged?.id != null) aliases.set(String(item.id), String(merged.id));
    });
    return merged;
  });

  return { clients: canonical, clientIdAliases: aliases, duplicateCount: Math.max(0, clients.length - canonical.length) };
};

export const getProjectClientId = (project = {}) => String(
  project.clientId || project.clienteId || project.client_id || project.cliente_id || '',
);

export const getProjectImportedClientName = (project = {}) => String(
  project.clienteNome || project.cliente_nome || project.clienteNomeImportado
  || project.cliente_nome_importado || project.financeiro?.clienteNomeImportado
  || project.cliente?.nome || '',
).trim();

export const resolveClientForImportedName = (name, clients = []) => {
  const target = normalizeIntegrityName(name);
  if (!target) return null;
  const exact = clients.filter((client) => normalizeIntegrityName(client.nome || client.name) === target);
  if (exact.length === 1) return exact[0];
  const prefix = clients.filter((client) => {
    const current = normalizeIntegrityName(client.nome || client.name);
    return current && (current.startsWith(`${target} `) || target.startsWith(`${current} `));
  });
  return prefix.length === 1 ? prefix[0] : null;
};

export const attachProjectsToCanonicalClients = (projects = [], clients = [], aliases = new Map()) => projects.map((project) => {
  const originalId = getProjectClientId(project);
  const aliasedId = originalId ? (aliases.get(originalId) || originalId) : '';
  const importedMatch = !aliasedId ? resolveClientForImportedName(getProjectImportedClientName(project), clients) : null;
  const clientId = aliasedId || (importedMatch?.id ? String(importedMatch.id) : '');
  return clientId ? {
    ...project,
    clientId,
    clienteId: clientId,
    client_id: clientId,
    cliente_id: clientId,
  } : project;
});

const projectDate = (project = {}) => String(project.data || project.dataEvento || project.dataTrabalho || project.data_trabalho || '').slice(0, 10);
const projectService = (project = {}) => normalizeIntegrityName(project.tipoServico || project.tipo_servico || project.servico || project.categoria || '');
const projectUpdatedAt = (project = {}) => {
  const timestamp = new Date(project.updated_at || project.updatedAt || project.created_at || project.createdAt || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const consolidateProjects = (projects = [], clients = [], aliases = new Map()) => {
  const attached = attachProjectsToCanonicalClients(projects, clients, aliases);
  const groups = new Map();
  const excluded = [];
  attached.forEach((project, projectIndex) => {
    const status = normalizeIntegrityName(project.statusProducao || project.status_producao || project.status || '');
    if (project.deletedAt || project.deleted_at || project.excluido || project.arquivado
      || ['cancelado', 'cancelada', 'excluido', 'excluida'].includes(status)) {
      excluded.push(project);
      return;
    }
    const external = project.externalId || project.external_id || project.importFingerprint || project.import_fingerprint || project.legacyId || project.legacy_id;
    const clientId = getProjectClientId(project);
    const imported = normalizeIntegrityName(getProjectImportedClientName(project));
    const date = projectDate(project);
    const service = projectService(project);

    // Importações antigas podem gerar IDs externos diferentes para o mesmo
    // trabalho. A identidade operacional deve ser o cliente + data do evento +
    // serviço. O ID externo só é usado quando não existe data suficiente para
    // fazer uma consolidação segura.
    const identity = date
      ? `${clientId || imported || 'sem-cliente'}|${date}|${service || 'sem-servico'}`
      : `undated:${external || project.id || `index-${projectIndex}`}|${clientId || imported || 'sem-cliente'}|${service || 'sem-servico'}`;
    if (!groups.has(identity)) groups.set(identity, []);
    groups.get(identity).push(project);
  });

  const canonical = [];
  const projectIdAliases = new Map();
  let duplicateCount = 0;
  groups.forEach((group) => {
    const winner = [...group].sort((a, b) => projectUpdatedAt(b) - projectUpdatedAt(a))[0];
    canonical.push(winner);
    group.forEach((item) => {
      if (item?.id != null && winner?.id != null) projectIdAliases.set(String(item.id), String(winner.id));
    });
    duplicateCount += Math.max(0, group.length - 1);
  });
  return { projects: canonical, projectIdAliases, duplicateCount, excludedCount: excluded.length };
};
