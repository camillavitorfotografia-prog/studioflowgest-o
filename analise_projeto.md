# Relatório de Análise Técnica: StudioFlow

Este documento apresenta a análise completa do ecossistema do **StudioFlow**, detalhando seu funcionamento técnico, arquitetura de dados, relacionamentos, regras de negócios, pontos fortes, riscos identificados e o plano estratégico para a continuidade do desenvolvimento.

---

## 1. Como o Projeto Funciona

O **StudioFlow** é estruturado como um SPA (Single Page Application) moderno construído com **React**, **Vite** e estilizado com **CSS Vanilla** robusto e customizado (Design System próprio com classes `sf-*`, `glass`, etc.).

### Arquitetura de Fluxo de Dados
O sistema opera sob duas camadas de persistência sincronizadas:
1. **Local Storage**: Atua como a fonte de dados imediata de leitura e escrita do cliente e o fallback de persistência offline. É atualizado reativamente em múltiplos contextos por meio de eventos nativos do navegador (`storage`) e eventos customizados (`sf_storage_update`).
2. **Supabase (Backend-as-a-Service)**: Quando configurado (`.env`), sincroniza de forma transparente com as tabelas na nuvem (`clientes`, `projetos`, `leads`, `financas`, `equipamentos`, `perfil`).

O motor operacional segue um fluxo integrado não fragmentado:
```
CRM (Leads) ➔ Conversão ➔ Cliente & Trabalho ➔ Contratos & Parcelamento ➔ Agenda & Produção ➔ Financeiro (Distribuição) & Equipamentos ➔ Relatórios
```

### Relacionamentos e Entidades
- **Cliente ([Clientes](file:///c:/Users/Camilla%20Vitor/Desktop/CV-Studio/src/pages/Clientes/index.jsx))**: Entidade comercial primária. Armazena histórico completo de contatos, CPF/CNPJ, dados cadastrais e vínculos por ID com projetos e contratos.
- **Trabalho/Projeto ([Trabalhos](file:///c:/Users/Camilla%20Vitor/Desktop/CV-Studio/src/pages/Trabalhos/index.jsx))**: Entidade operacional central. Contém os status de produção e comercial independentes, prazos automáticos de entrega, equipe alocada, checklist de tarefas gerado por categoria de serviço e custos de produção.
- **Contrato ([contractEngine.js](file:///c:/Users/Camilla%20Vitor/Desktop/CV-Studio/src/utils/contractEngine.js))**: Fonte jurídica e do valor negociado. Um contrato pertence a um cliente e está associado a um trabalho específico.
- **Parcela (Installments)**: Subentidade transacional do contrato. Cada parcela possui um ID estável, vencimento, valor, valor pago e status (vencida, pendente, paga). O controle financeiro calcula a divisão em centavos de forma exata.
- **Financeiro ([financeEngine.js](file:///c:/Users/Camilla%20Vitor/Desktop/CV-Studio/src/utils/financeEngine.js))**: Motor que consolida as transações. Receitas de projetos confirmadas acionam a distribuição nas contas virtuais do estúdio (`reserva`, `empresa` e `salario` - este último subdividido entre os sócios Camilla e Junior) conforme percentuais definidos em configurações.

---

## 2. Pontos Fortes

1. **Desacoplamento e Resiliência**: O motor local (`storage.js` e `integratedData.js`) garante que o sistema permaneça 100% funcional caso o Supabase esteja indisponível.
2. **Normalização Idempotente**: As camadas de leitura aplicam valores padrão seguros (`CLIENT_DEFAULTS`, `PROJECT_DEFAULTS`, etc.) protegendo a interface de quebrar ao ler dados legados ou inconsistentes.
3. **Distribuição Automatizada de Receitas**: Processamento automático que elimina a necessidade de dividir manualmente cada entrada do estúdio entre as necessidades da empresa, reservas e salários.
4. **Precisão Transacional**: Geração e recálculo de parcelas usando divisão exata em centavos (`splitCents`), garantindo que a soma das parcelas reflita precisamente o valor efetivo do contrato, com as diferenças de arredondamento distribuídas de forma previsível na entrada ou nas primeiras parcelas.
5. **Segurança de Backup**: Restauração com validação integral pré-gravação, protegendo o usuário de carregar arquivos corrompidos ou chaves desconhecidas.

---

## 3. Riscos Identificados

1. **Ausência de Testes Automatizados**: A falta de uma suite de testes (e.g., Jest/Vitest) para validar os motores de cálculo de parcelas, depreciação e conciliação de saldos eleva o risco de regressões em refatorações futures.
2. **Duplicidade de Fluxo Financeiro na Interface**: 
   - A interface de Documentos/Contratos gera contratos e parcelas no storage.
   - O Financeiro atual, no entanto, opera em grande parte sobre transações avulsas de entradas e saídas. Existe o risco de o usuário registrar um recebimento no financeiro de forma avulsa sem abater a parcela do contrato correspondente, gerando duplicidade ou inconsistência nos saldos.
3. **Ciclos de Sincronização Local vs. Remoto**: Sincronizar reativamente por eventos de storage e, simultaneamente, escutar canais em tempo real do Postgres do Supabase exige extremo cuidado para evitar loops de concorrência ou salvamento de estados obsoletos.

---

## 4. Módulos Existentes e Status de Implementação

| Módulo | Status | Descrição Técnica |
| :--- | :--- | :--- |
| **CRM** | **Implementado** | Pipeline de vendas, controle de estágios de leads, contatos, conversão direta para cliente e trabalho físico. |
| **Clientes** | **Implementado** | Cadastro completo, busca multidimensional, controle de duplicidades inteligente e bloqueio de exclusão em caso de dependências operacionais. |
| **Trabalhos** | **Implementado** | Controle de status comercial/produção, estimativa de lucros derivados, cálculo de prazos de entrega e checklists integrados por tipo de serviço. |
| **Documentos** | **Implementado** | Editor de propostas/contratos, versionamento e assistente de geração de contratos físicos baseados em propostas aceitas. |
| **Contratos** | **Implementado** | Motor transacional (`contractEngine.js`) que calcula parcelas, gerencia pagamentos de parcelas, reversões e consolidação financeira dos contratos. |
| **Financeiro** | **Parcial** | O painel exibe saldos, despesas fixas/variáveis e receitas. Contudo, a interface de recebimento de parcelas e liquidação direta das parcelas de contratos ainda precisa ser unificada visualmente no fluxo diário. |
| **Equipamentos** | **Parcial** | O storage e o motor de depreciação linear existem, mas a interface de gestão do inventário, alocação de equipamentos a projetos e impacto dinâmico na precificação necessitam de refinamento. |
| **Agenda** | **Parcial** | Exibe calendário, mas a sincronização de eventos de trabalhos precisa ser finalizada de modo 100% reativo, separando eventos integrados (bloqueados para edição direta) de compromissos manuais. |
| **Dashboard** | **Implementado** | Painel principal funcional calculando receitas e despesas por caixa, taxas de conversão de leads e progresso de metas. |
| **Relatórios** | **Pendente** | Necessita de consolidação de dados de produtividade por equipe, lucratividade real agregada e relatórios gerenciais das contas de distribuição. |

---

## 5. Plano Estratégico de Continuidade

Para finalizar o StudioFlow mantendo a integridade e consistência estrita dos dados, propõe-se a seguinte ordem de desenvolvimento:

### Fase 1: Unificação Financeira & Parcelas
- **Objetivo**: Integrar o fluxo de parcelas dos contratos diretamente na interface do módulo Financeiro.
- **Ações**:
  - Expor a lista de parcelas a vencer/vencidas na aba de Receitas do Financeiro.
  - Implementar ação de recebimento de parcela no Financeiro disparando `receiveInstallment` do `contractEngine.js`.
  - Impedir que receitas ligadas a contratos sejam adicionadas como transações avulsas sem vínculo com parcelas.

### Fase 2: Gestão e Depreciação de Equipamentos
- **Objetivo**: Finalizar a interface de Equipamentos e acoplar a depreciação real ao custo operacional dos projetos.
- **Ações**:
  - Implementar listagem e cadastro de equipamentos integrando o motor linear de depreciação.
  - Expor o custo de depreciação nos projetos na aba de Precificação e nos relatórios de custos reais dos trabalhos.

### Fase 3: Agenda Reativa e Integrada
- **Objetivo**: Integrar a Agenda de forma que projetos gerem eventos automaticamente e reativamente.
- **Ações**:
  - Finalizar a leitura reativa de trabalhos na Agenda.
  - Implementar alerts visuais na agenda para datas com conflitos de equipamentos ou equipe.

### Fase 4: Relatórios & Auditoria de Contas
- **Objetivo**: Prover relatórios analíticos reais.
- **Ações**:
  - Desenvolver exportação de relatórios gerenciais das contas (`reserva`, `empresa`, `salario`).
  - Desenvolver relatório de lucratividade real por projeto confrontando o valor recebido das parcelas vs. despesas reais e custos de depreciação alocados.
