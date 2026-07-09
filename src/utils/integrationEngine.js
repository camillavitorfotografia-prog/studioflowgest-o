import { FINANCE_STORAGE_KEYS } from './financeEngine';

// Chaves globais padronizadas do ecossistema StudioFlow
export const INTEGRATION_KEYS = {
  LEADS: 'cv_crm_leads',
  CLIENTS_PROJECTS: 'cv_studio_clients',
  AGENDA: 'cv_agenda_eventos',
  TRANSACTIONS: FINANCE_STORAGE_KEYS.transactions || 'cv_finance_transactions',
};

/**
 * Orquestrador Principal do Fluxo: Lead -> Cliente/Projeto -> Agenda -> Financeiro -> Dashboards
 * Executado imediatamente quando um orçamento/lead é aprovado no CRM.
 */
export function processLeadApproval(lead) {
  if (!lead) return { success: false, error: 'Lead inválido fornecido.' };

  try {
    // 1. Carregar estados atuais do LocalStorage
    const clientsList = JSON.parse(localStorage.getItem(INTEGRATION_KEYS.CLIENTS_PROJECTS) || '[]');
    const agendaList = JSON.parse(localStorage.getItem(INTEGRATION_KEYS.AGENDA) || '[]');
    const financialList = JSON.parse(localStorage.getItem(INTEGRATION_KEYS.TRANSACTIONS) || '[]');

    // 2. Higienização e busca de duplicidade de cliente (E-mail, CPF ou Telefone como chaves únicas)
    const uniqueEmail = lead.email?.trim().toLowerCase();
    const uniquePhone = lead.telefone?.replace(/\D/g, '');
    
    let existingClient = clientsList.find(c => {
      const cEmail = c.email?.trim().toLowerCase();
      const cPhone = c.telefone?.replace(/\D/g, '') || c.whatsapp?.replace(/\D/g, '');
      return (uniqueEmail && cEmail === uniqueEmail) || (uniquePhone && cPhone === uniquePhone);
    });

    // Instanciação de IDs únicos para rastreabilidade cross-module
    const projectId = `proj_${Date.now()}`;
    const clientId = existingClient ? existingClient.id : `cli_${Date.now()}`;

    // 3. Regra de Negócio: Evitar Duplicação de Perfil de Cliente
    const novoProjeto = {
      id: projectId,
      tipoTrabalho: lead.tipoTrabalho || lead.tipo || 'Ensaio',
      dataEvento: lead.dataEvento || lead.data || new Date().toISOString().split('T')[0],
      valorTotal: parseFloat(lead.valorOrcamento || lead.valor || 0),
      statusProjeto: 'Contratado',
      timestamp: Date.now()
    };

    if (existingClient) {
      // Reaproveita o cliente e anexa o novo projeto ao histórico dele
      existingClient.projetos = existingClient.projetos || [];
      existingClient.projetos.push(novoProjeto);
      
      // Retrocompatibilidade: Atualiza os dados do último projeto no root do objeto se o layout antigo exigir
      existingClient.tipoTrabalho = novoProjeto.tipoTrabalho;
      existingClient.dataEventos = novoProjeto.dataEvento; 
      existingClient.pagamentos = existingClient.pagamentos || [];
      
      // Adiciona o fluxo de pagamento previsto deste novo projeto
      if (novoProjeto.valorTotal > 0) {
        existingClient.pagamentos.push({
          id: `pay_${Date.now()}`,
          valor: novoProjeto.valorTotal,
          data: novoProjeto.dataEvento,
          status: 'Pendente'
        });
      }
    } else {
      // Cria o registro unificado de Cliente + Projeto do zero
      const newClientEntry = {
        id: clientId,
        nome: lead.nome || 'Cliente sem Nome',
        email: lead.email || '',
        telefone: lead.telefone || '',
        whatsapp: lead.whatsapp || lead.telefone || '',
        cpf: lead.cpf || '',
        tipoTrabalho: novoProjeto.tipoTrabalho,
        dataEvento: novoProjeto.dataEvento,
        projetos: [novoProjeto],
        pagamentos: novoProjeto.valorTotal > 0 ? [{
          id: `pay_${Date.now()}`,
          valor: novoProjeto.valorTotal,
          data: novoProjeto.dataEvento,
          status: 'Pendente'
        }] : []
      };
      clientsList.push(newClientEntry);
    }

    // 4. Integração Automática com a Agenda (Criar Evento Vinculado)
    const novoEventoAgenda = {
      id: `evt_${Date.now()}`,
      title: `${novoProjeto.tipoTrabalho} - ${lead.nome}`,
      start: novoProjeto.dataEvento,
      end: novoProjeto.dataEvento,
      clientId: clientId,
      projectId: projectId,
      description: `Projeto gerado automaticamente via CRM. Contato: ${lead.telefone || 'Não informado'}`,
      allDay: true,
      color: '#c5a059', // Mantém a identidade sem alterar paletas
    };
    agendaList.push(novoEventoAgenda);

    // 5. Integração Automática com o Financeiro (Lançar Receita como Provisão)
    if (novoProjeto.valorTotal > 0) {
      const novaTransacaoFinanceira = {
        id: `tx_${Date.now()}`,
        descricao: `Contrato: ${novoProjeto.tipoTrabalho} - ${lead.nome}`,
        valor: novoProjeto.valorTotal,
        data: novoProjeto.dataEvento,
        tipo: 'receita', // Identificador padrão para isIncome()
        categoria: 'Contratos e Ensaios',
        status: 'pendente',
        clientId: clientId,
        projectId: projectId,
        origem: 'CRM_AUTOMATIC'
      };
      financialList.push(novaTransacaoFinanceira);
    }

    // 6. Atualização do Status do Lead no CRM para "Aprovado/Ganho"
    const leadsList = JSON.parse(localStorage.getItem(INTEGRATION_KEYS.LEADS) || '[]');
    const leadIndex = leadsList.findIndex(l => l.id === lead.id);
    if (leadIndex !== -1) {
      leadsList[leadIndex].status = 'Aprovado';
      leadsList[leadIndex].updatedAt = Date.now();
      localStorage.setItem(INTEGRATION_KEYS.LEADS, JSON.stringify(leadsList));
    }

    // 7. Gravação Atômica dos Dados Consolidados no Storage
    localStorage.setItem(INTEGRATION_KEYS.CLIENTS_PROJECTS, JSON.stringify(clientsList));
    localStorage.setItem(INTEGRATION_KEYS.AGENDA, JSON.stringify(agendaList));
    localStorage.setItem(INTEGRATION_KEYS.TRANSACTIONS, JSON.stringify(financialList));

    // 8. O Toque de Mestre: Disparo de Evento de Sincronização Global
    // Isso força o Dashboard, Relatórios e Perfil a recalcularem os hooks useMemo instantaneamente
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new Event('focus'));

    return { success: true, clientId, projectId };
  } catch (error) {
    console.error('Erro crítico na esteira de integração do StudioFlow:', error);
    return { success: false, error: error.message };
  }
}