# Implementação StudioFlow

## Concluído nesta execução

- Mapeamento da arquitetura, módulos, persistência, integrações e regras financeiras existentes.
- Versão explícita do esquema de armazenamento local.
- Normalização não destrutiva de clientes, trabalhos, contratos e equipamentos antigos com valores padrão seguros.
- Backup versionado com data de exportação e compatibilidade com o formato antigo.
- Validação integral do backup antes de qualquer gravação.
- Confirmação obrigatória antes da restauração e mensagens de erro específicas.
- Disparo dos eventos internos de atualização após restauração.
- Etapa de clientes e prevenção de duplicidade concluída.
- Cadastro ampliado com documento, endereço, cidade, nascimento, origem, indicação, observações, datas de contato, próximo retorno e status comercial.
- Histórico manual de contatos isolado por cliente, com inclusão, edição, exclusão confirmada e ordenação decrescente.
- Busca normalizada por nome, telefone, e-mail, CPF/CNPJ e cidade.
- Proteção contra exclusão destrutiva de clientes com trabalhos, contratos ou pagamentos.
- Relacionamentos avaliados por IDs; nenhum cliente é unido ou removido automaticamente.
- Etapa de trabalhos e controle de status concluída.
- Criação e edição de trabalhos para clientes existentes, inclusive vários trabalhos para o mesmo cliente.
- Persistência local funcional sem dependência obrigatória do Supabase.
- Campos de identificação, serviço, localização, entrega, prioridade, custos, arquivamento e relacionamentos preparados.
- Status comercial e de produção independentes, com filtros próprios.
- Busca por trabalho, cliente, telefone, categoria, serviço, cidade, local e status.
- Proteção de exclusão quando existem contratos, pagamentos ou equipamentos vinculados.
- Trabalhos cancelados e arquivados permanecem armazenados.
- Etapa de checklist isolado por trabalho concluída.
- Modelos imutáveis de pré-evento, segurança, fotografia, filmagem e entrega.
- Checklist de novos trabalhos gerado conforme o tipo de serviço; trabalhos antigos exigem inicialização explícita.
- Marcação, desmarcação, progresso geral e por categoria com persistência imediata.
- Inclusão, edição e exclusão confirmada de itens personalizados, sempre no trabalho atual.
- IDs e ordem preservados; itens legados incompletos recebem normalização idempotente.
- Checklist permanece independente dos status, financeiro, contrato, arquivamento e cancelamento.
- Base transacional de contratos, parcelas e recálculo financeiro implementada.
- Contratos criados em Documentos ou pelo assistente passam a gerar registros contratuais separados dos PDFs.
- Entrada representada como primeira parcela, sem duplicação de receita ou pagamento.
- Parcelas possuem IDs próprios, vínculos por cliente/trabalho/contrato, vencimento, pagamento e status derivado.
- Divisão em centavos garante distribuição determinística; a eventual diferença fica nas primeiras parcelas.
- Recebimento integral e reversão são operações puras e recalculáveis, preservando contrato e parcela.
- Agregações de contrato e cliente e sincronização dos valores do trabalho foram centralizadas.

## Arquitetura financeira contratual

- Contrato é a fonte do valor contratado; parcelas definem o cronograma; `valorPago` define o recebido.
- PDFs e documentos continuam registros distintos, vinculados por `contractId`.
- A persistência produz o próximo conjunto completo de contratos antes de atualizar trabalhos.
- Contratos antigos sem parcelas e valores legados de trabalhos continuam preservados.
- A normalização gera IDs conservadores apenas quando ausentes e é idempotente.
- Contratos cancelados permanecem armazenados; nenhum cancelamento gera estorno automático.

## Estratégia do checklist

- Cada checklist é armazenado no próprio trabalho e identificado pelo ID estável do trabalho.
- Os modelos são copiados profundamente e cada item novo recebe ID próprio.
- Fotografia recebe itens de fotografia; filmagem recebe itens de vídeo; serviço combinado recebe ambos.
- Registros antigos não são alterados apenas por visualização; o usuário escolhe criar o modelo padrão.
- Estruturas legadas (`title`/`done`, arrays ou objeto com `itens`) são preservadas e normalizadas sem duplicação.
- Checklist vazio retorna 0%; marcar/desmarcar não recria o item nem altera status de produção.

## Regras e cálculos de trabalhos

- Edição preserva ID, criação e relacionamentos; apenas `atualizadoEm` é renovado.
- Entrega prevista usa dias corridos e cálculo centralizado, sem criar datas fictícias.
- Hora final deve ser posterior à inicial; valores, custos e prazo não podem ser negativos.
- Saldo pendente, lucro estimado e lucro real são derivados sem gerar lançamentos financeiros.
- Status antigos conhecidos são normalizados; valores desconhecidos são preservados.
- Alterações de status não quitam financeiro, concluem contrato, arquivam ou excluem registros automaticamente.

## Regras de duplicidade

- Prioridade: CPF/CNPJ, e-mail, telefone, nome idêntico e nome semelhante.
- Documento, telefone e e-mail são correspondências fortes; nome é correspondência fraca.
- Campos vazios nunca correspondem e a edição ignora o próprio registro.
- O usuário pode usar o cadastro encontrado, continuar com um novo cadastro ou cancelar.
- A restauração de backup não executa deduplicação.

## Arquivos modificados

- `src/utils/storage.js`
- `src/utils/backup.js`
- `src/pages/Configuracoes/index.jsx`
- `src/pages/Clientes/index.jsx`
- `src/utils/clientIdentity.js`
- `src/pages/Trabalhos/index.jsx`
- `src/pages/Trabalhos/Trabalhos.css`
- `src/utils/projectEngine.js`
- `src/utils/checklistEngine.js`
- `src/utils/dbData.js`
- `src/utils/integratedData.js`
- `src/utils/contractEngine.js`
- `src/pages/Documentos/index.jsx`
- `STUDIOFLOW_IMPLEMENTACAO.md`

## Próximos passos, na ordem solicitada

1. Completar financeiro, equipamentos, agenda, dashboard e relatórios.
2. Implementar alertas internos e concluir configurações.
3. Executar testes integrados de restauração com cópias reais anonimizadas.

## Verificações da etapa de clientes

- Validações isoladas: telefone nacional com/sem código 55, e-mail sem distinção de caixa, documento com/sem pontuação, nome com/sem acento, campos vazios, autoedição, busca e vínculos por ID — aprovadas.
- `npm run lint` — aprovado.
- `npm run build` — aprovado; permanece apenas o aviso não bloqueante de tamanho do bundle.
- Não há infraestrutura de testes automatizados instalada no projeto, portanto nenhuma biblioteca foi adicionada.

## Pendências reais

- Validar restaurações com cópias reais anonimizadas quando houver arquivos de amostra disponíveis.
- A seleção detalhada de equipamentos fica para a etapa própria de equipamentos; `equipamentoIds` já está preparado.
- Próximo módulo recomendado: Contratos, parcelas e recálculo financeiro.

## Verificações da etapa de checklist

- Modelos de fotografia, filmagem e serviço combinado — aprovados.
- Isolamento entre dois trabalhos, marcação, desmarcação e progresso 0%/100% — aprovados.
- Inclusão, edição com ID preservado e exclusão de item personalizado — aprovadas.
- Normalização repetida de item legado sem ID — idempotente e aprovada.
- `npm run lint` — aprovado.
- `npm run build` — aprovado; permanece apenas o aviso não bloqueante de tamanho do bundle.
- `git diff --check` — aprovado.

## Verificações da etapa de trabalhos

- Validações isoladas de status legados, prazo de entrega, trabalho sem data, busca, atraso, saldo e lucros — aprovadas.
- `npm run lint` — aprovado.
- `npm run build` — aprovado; permanece apenas o aviso não bloqueante de tamanho do bundle.
- `git diff --check` — aprovado.
- Nenhuma biblioteca foi instalada e nenhuma estrutura paralela de trabalhos foi criada.

## Observações de compatibilidade

- IDs existentes não são alterados.
- A leitura normalizada não sobrescreve o `localStorage` automaticamente.
- Backups antigos sem envelope de versão continuam aceitos.
- Registros e chaves desconhecidos não são importados.
- O layout e a navegação não foram alterados.

## Verificações da etapa de contratos

- Divisão de R$ 700,00 em R$ 233,34 + R$ 233,33 + R$ 233,33 — aprovada.
- Entrada, geração de parcelas, IDs únicos, soma em centavos e vínculos — aprovados.
- Recebimento, saldo, reversão, vencimento derivado e agregação de dois contratos do mesmo cliente — aprovados.
- Normalização repetida de contrato/parcela legados — idempotente e aprovada.
- `npm run lint` — aprovado.
- `npm run build` — aprovado; permanece apenas o aviso não bloqueante de tamanho do bundle.
- `git diff --check` — aprovado.

## Limitações reais

- Pagamentos parciais não foram expostos na interface; o motor reconhece o estado legado, mas o fluxo atual usa recebimento integral por parcela.
- Multas, juros, créditos, estornos automáticos e assinatura digital externa permanecem fora do escopo.
