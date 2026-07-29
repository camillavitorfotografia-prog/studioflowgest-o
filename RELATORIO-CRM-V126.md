# Relatório CRM V126 — responsividade, persistência e duplicidades

## Base utilizada

- Arquivo utilizado exclusivamente como base: `CV-Studio(123).zip`.
- Nenhum arquivo foi recuperado de versões anteriores.
- As alterações foram limitadas ao CRM e a uma migração de saneamento dos leads.

## Problemas confirmados no vídeo

1. O pipeline escondia etapas atrás de setas e exigia navegação por grupos.
2. O formato não era adequado para uso frequente em celular ou tablet.
3. O mesmo lead continuava aparecendo duplicado.
4. Alterar o status de um lead local podia inserir outro registro no Supabase.
5. A exclusão era cancelada quando existiam duas linhas locais com o mesmo identificador ou duas cópias do mesmo lead.
6. O fluxo de edição podia atualizar uma cópia enquanto outra permanecia ativa.

## Correções funcionais

### Persistência canônica do lead

Foi criado um fluxo de resolução da identidade comercial do lead. Antes de editar ou mudar o status, o CRM agora:

1. procura no Supabase registros equivalentes;
2. escolhe um UUID canônico;
3. atualiza esse registro em vez de inserir uma nova cópia;
4. consolida os históricos comerciais das cópias;
5. remove ou envia para a lixeira os UUIDs excedentes;
6. substitui os IDs locais antigos pelo UUID oficial;
7. limpa as cópias equivalentes do espelho local.

A comparação considera telefone, WhatsApp, e-mail, nome, serviço e data do evento, com tolerância para registros antigos incompletos.

### Alteração de status

- Todas as etapas continuam disponíveis no seletor do lead.
- O status é salvo no registro canônico.
- A interface usa atualização otimista e restaura o valor anterior se o salvamento principal falhar.
- O ID local `lead-...` não gera uma nova inserção quando já existe um lead remoto correspondente.
- Cópias remotas antigas são eliminadas após a atualização do registro oficial.

### Edição completa

O formulário existente foi preservado. Ao editar, todos os campos continuam sendo enviados pelo `leadPayload`, incluindo:

- nome;
- telefone e WhatsApp;
- e-mail;
- cidade;
- serviço;
- data do evento;
- origem;
- campanha e indicação;
- orçamento e validade;
- prioridade;
- temperatura;
- probabilidade;
- follow-up;
- observações;
- histórico.

A edição agora atualiza o registro canônico e remove cópias equivalentes.

### Exclusão

- A exclusão não exige mais que exista exatamente uma linha local.
- Todas as cópias equivalentes são tratadas na mesma ação.
- Os UUIDs remotos são enviados para a lixeira.
- Quando a coluna de lixeira não puder ser utilizada, existe tentativa de exclusão direta.
- As cópias locais equivalentes são removidas.
- O cliente e os trabalhos vinculados continuam preservados.

### Migração de saneamento

Foi incluída:

`supabase/migrations/20260728213000_cleanup_duplicate_crm_leads.sql`

Ela identifica duplicidades óbvias já existentes, preserva o registro mais recente, envia os excedentes para a lixeira e cria um índice auxiliar de identidade.

## Novo comportamento responsivo

### Computador

- Todas as etapas aparecem sem setas.
- O pipeline utiliza uma grade automática.
- As nove etapas permanecem visíveis na mesma área.
- Cada etapa possui rolagem interna curta apenas quando contém muitos leads.

### Tablet

- Não existe rolagem horizontal do pipeline.
- Todas as etapas aparecem em um resumo compacto.
- Os leads aparecem em uma grade de duas colunas.
- A lista possui altura controlada e rolagem interna.
- O status pode ser alterado diretamente no card.

### Celular

- Todas as etapas aparecem em uma grade compacta de duas ou três colunas.
- Os leads aparecem em uma lista de uma coluna.
- Tocar em uma etapa filtra a lista sem esconder o resumo geral.
- Tocar no card abre os detalhes completos.
- O seletor de status permanece diretamente acessível.
- Não existem setas de navegação nem rolagem horizontal.

## Arquivos alterados

- `src/pages/CRM/index.jsx`
- `src/pages/CRM/KanbanBoard.jsx`
- `src/pages/CRM/CRM.css`
- `supabase/migrations/20260728213000_cleanup_duplicate_crm_leads.sql`
- `RELATORIO-CRM-V126.md`

## Validações executadas

- Vídeo de 20,8 segundos revisado.
- 138 arquivos JavaScript/JSX analisados pelo parser Babel: nenhum erro de sintaxe.
- 36 arquivos CSS analisados pelo PostCSS: nenhum erro de parsing.
- Imports relativos analisados: nenhum arquivo inexistente.
- ESLint executado em `src/pages/CRM/index.jsx` e `src/pages/CRM/KanbanBoard.jsx`: nenhum erro.
- Fluxos revisados estaticamente: criação, edição, mudança de status, migração de ID local, consolidação de duplicidades e exclusão.

## Limitações da validação

O build não pôde ser concluído neste ambiente porque o `node_modules` enviado foi instalado no Windows e não contém o binding Linux do Rolldown (`@rolldown/binding-linux-x64-gnu`).

Não foi possível executar operações reais na conta Supabase da usuária. A migração precisa ser aplicada no banco utilizado em produção. Depois de extrair o projeto em uma pasta limpa, devem ser executados localmente:

```powershell
npm install
npm run build
npm run dev
```

Após aplicar a migração, testar com um lead duplicado existente:

1. editar um campo e salvar;
2. mudar o status duas vezes;
3. atualizar a página;
4. excluir o lead;
5. atualizar novamente e confirmar que nenhuma cópia reaparece.
