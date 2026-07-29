# Relatório CRM V124

Base utilizada: `CV-Studio-122-CRM-Redesign-Mockup.zip`.

## Problemas confirmados no vídeo

1. A tela não correspondia à proposta visual aprovada: a área "Ações do dia" aparecia antes dos indicadores e do pipeline, os cartões ainda estavam densos e o Kanban tinha pouco destaque.
2. Ao alterar o status de um lead criado localmente, o Supabase retornava:
   `invalid input syntax for type uuid: "lead-..."`.
3. O identificador local antigo poderia permanecer no cache após o Supabase gerar um UUID, criando risco de cartão duplicado no recarregamento.

## Correções implementadas

### Persistência do status

- IDs locais com prefixo `lead-` não são mais usados em filtros de uma coluna UUID.
- Leads antigos ainda não sincronizados são inseridos no Supabase com o payload completo e recebem um UUID válido.
- O espelho local troca o ID antigo pelo UUID retornado pelo Supabase.
- O registro local antigo é removido para impedir duplicidade.
- O erro anterior é limpo após uma atualização concluída com sucesso.
- O mesmo tratamento defensivo foi aplicado a gravações de lead sem campo de status.

### Redesign do CRM

- Indicadores principais agora são: Leads ativos, Potenciais, Follow-ups hoje e Fechamentos do mês.
- Indicadores receberam ícones, hierarquia tipográfica e gráficos decorativos discretos.
- Pipeline virou o principal bloco da tela.
- "Ações do dia" foi movido para depois do pipeline.
- Colunas do Kanban ficaram mais estreitas e contínuas em uma única linha horizontal.
- Cartões mostram somente nome, serviço, data, prioridade, temperatura, próxima ação e valor.
- Informações completas continuam disponíveis ao abrir o lead.
- Mudança de status continua disponível no próprio cartão.
- Estado "Salvando status..." permanece visível e bloqueia ações concorrentes.
- Botão de nota rápida foi preservado.
- Assistente comercial foi reduzido a um controle compacto.
- Breakpoints foram ajustados para notebook, tablet e celular.

## Arquivos alterados

- `src/pages/CRM/index.jsx`
- `src/pages/CRM/CRM.css`
- `src/pages/CRM/CRMStats.jsx`
- `src/pages/CRM/KanbanBoard.jsx`
- `src/utils/dbData.js`

## Validações executadas

- 138 arquivos JavaScript/JSX analisados: nenhum erro de sintaxe.
- 36 arquivos CSS analisados: nenhum erro de parsing.
- Imports relativos verificados: nenhum arquivo referenciado ausente.
- O vídeo de 16,4 segundos foi analisado e o erro UUID foi confirmado visualmente.

## Limitação

O build Vite não pôde ser concluído neste ambiente porque o `node_modules` disponível foi instalado para outro sistema operacional e não contém o binding Linux do Rolldown (`@rolldown/binding-linux-x64-gnu`). Execute localmente:

```powershell
npm install
npm run build
npm run dev
```

