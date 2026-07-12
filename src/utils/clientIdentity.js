const digits = (value) => String(value || '').replace(/\D/g, '');

export const normalizePhone = (value) => {
  const valueDigits = digits(value);
  return valueDigits.length > 11 && valueDigits.startsWith('55') ? valueDigits.slice(2) : valueDigits;
};
export const normalizeEmail = (value) => String(value || '').trim().toLocaleLowerCase('pt-BR');
export const normalizeDocument = digits;
export const normalizeName = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const similarity = (left, right) => {
  if (!left || !right) return 0;
  const a = new Set(left.split(' '));
  const b = new Set(right.split(' '));
  const common = [...a].filter((part) => b.has(part)).length;
  return common / Math.max(a.size, b.size);
};

export const findClientDuplicates = (candidate, clients = [], ignoredId = null) => clients
  .filter((client) => String(client.id) !== String(ignoredId || ''))
  .map((client) => {
    const checks = [
      ['cpfCnpj', 'CPF ou CNPJ', normalizeDocument],
      ['email', 'e-mail', normalizeEmail],
      ['telefone', 'telefone', normalizePhone],
      ['nome', 'nome completo', normalizeName],
    ];
    const exact = checks.find(([field, , normalize]) => normalize(candidate[field]) && normalize(candidate[field]) === normalize(client[field] || (field === 'telefone' ? client.whatsapp : '')));
    if (exact) return { client, field: exact[0], reason: exact[1], strong: exact[0] !== 'nome', score: 5 - checks.indexOf(exact) };
    const nameScore = similarity(normalizeName(candidate.nome), normalizeName(client.nome));
    return nameScore >= 0.75 ? { client, field: 'nome', reason: 'nome semelhante', strong: false, score: nameScore } : null;
  })
  .filter(Boolean)
  .sort((a, b) => b.score - a.score);

export const clientMatchesSearch = (client, query) => {
  const text = normalizeName(query);
  if (!text) return true;
  const queryDigits = digits(query);
  return [client.nome, client.email, client.cidade].some((value) => normalizeName(value).includes(text))
    || (queryDigits && [client.telefone, client.whatsapp, client.cpfCnpj].some((value) => digits(value).includes(queryDigits)));
};

export const getClientRelations = (clientId, { projects = [], contracts = [] } = {}) => {
  const belongsToClient = (item) => [item.clientId, item.clienteId, item.cliente_id, item.client_id].some((id) => String(id || '') === String(clientId));
  const linkedProjects = projects.filter(belongsToClient);
  const linkedContracts = contracts.filter(belongsToClient);
  const payments = linkedProjects.flatMap((project) => project.pagamentos || project.receitas || project.financeiro?.receitas || []);
  return { projects: linkedProjects, contracts: linkedContracts, payments };
};
