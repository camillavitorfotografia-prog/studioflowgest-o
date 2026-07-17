import { requestIntegrationAction } from './integrationsService';

const firstValue = (...values) => values.find((value) => value !== undefined && value !== null && String(value).trim() !== '');

const normalizeDate = (value) => {
  if (!value) return '';
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
};

const normalizeTime = (value) => {
  if (!value) return '';
  const match = String(value).match(/(\d{1,2}):(\d{2})/);
  if (!match) return '';
  return `${String(match[1]).padStart(2, '0')}:${match[2]}`;
};

const normalizeStatus = (project = {}) => String(firstValue(
  project.statusProducao,
  project.status,
  project.financeiro?.statusProducao,
  project.financeiro?.workflowStatus,
  '',
)).toLowerCase();

const shouldCreateMeet = (project = {}) => {
  const source = project.financeiro?.projectData || project.projectData || project;
  const type = String(firstValue(source.tipoServico, project.tipoServico, project.tipo_servico, '')).toLowerCase();
  const local = String(firstValue(source.local, project.local, project.financeiro?.local, '')).toLowerCase();
  return type.includes('reuni') || local.includes('online') || local.includes('meet');
};

export const projectToGoogleCalendarItem = (project = {}) => {
  const source = project.financeiro?.projectData || project.projectData || project;
  const date = normalizeDate(firstValue(source.data, source.dataEvento, project.data, project.dataEvento));
  if (!project.id || !date) return null;

  const time = normalizeTime(firstValue(source.horario, project.horario, project.financeiro?.horario));
  const endTime = normalizeTime(firstValue(source.horarioFim, source.endTime, project.horarioFim));
  const clientName = firstValue(
    source.clienteNome,
    source.nomeCliente,
    project.clienteNome,
    project.nomeCliente,
    project.cliente_nome_importado,
    project.financeiro?.clienteNome,
    'Cliente',
  );
  const service = firstValue(source.tipoServico, project.tipoServico, project.tipo_servico, 'Trabalho');
  const location = firstValue(source.local, project.local, project.financeiro?.local, '');
  const status = normalizeStatus(project);

  return {
    localId: String(project.id),
    title: `${service} — ${clientName}`,
    description: [
      'Evento sincronizado pelo StudioFlow.',
      `Cliente: ${clientName}`,
      `Serviço: ${service}`,
      project.observacoes ? `Observações: ${project.observacoes}` : '',
    ].filter(Boolean).join('\n'),
    date,
    time,
    endTime,
    allDay: !time,
    location: String(location || ''),
    status,
    createMeet: shouldCreateMeet(project),
    metadata: {
      clientName,
      service,
      studioflowProjectId: String(project.id),
    },
  };
};

export const syncGoogleCalendarProjects = async (projects = [], { force = false } = {}) => {
  const items = projects.map(projectToGoogleCalendarItem).filter(Boolean);
  if (!items.length) {
    return { ok: true, created: 0, updated: 0, skipped: 0, deleted: 0, total: 0 };
  }
  return requestIntegrationAction('integration-sync', {
    provider: 'google_calendar',
    action: 'sync_projects',
    force,
    items,
  });
};

export const syncSingleProjectToGoogle = async (project) => {
  const item = projectToGoogleCalendarItem(project);
  if (!item) return null;
  return requestIntegrationAction('integration-sync', {
    provider: 'google_calendar',
    action: 'sync_projects',
    items: [item],
  });
};
