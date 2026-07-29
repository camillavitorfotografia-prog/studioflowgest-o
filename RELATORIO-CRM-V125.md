# StudioFlow — Correção CRM V125

Base utilizada: `CV-Studio-122-CRM-Redesign-Status-Corrigido-v124.zip`.

## Problemas confirmados no vídeo

1. O pipeline exigia uma rolagem horizontal muito longa para atravessar as nove etapas.
2. As colunas e cartões aumentavam a altura total da página, gerando rolagem vertical desnecessária.
3. Um lead com identificador local `lead-...` recebia um UUID do Supabase, mas o espelho local gravava novamente o ID antigo.
4. Na alteração seguinte de status, o sistema entendia que o lead ainda era local e executava outro `INSERT`, criando uma nova cópia.
5. Cópias já criadas anteriormente eram combinadas apenas por ID, portanto continuavam aparecendo como cartões separados.

## Correções realizadas

### Persistência e duplicidade

- O UUID retornado pelo Supabase agora tem precedência absoluta no espelho local.
- O campo `id` existente no payload é removido antes de salvar o cache local.
- O identificador local anterior é removido quando o lead recebe um UUID real.
- A leitura do CRM consolida registros idênticos por uma chave segura composta por telefone ou e-mail, serviço e data do evento.
- Quando existem versões local e remota do mesmo lead, a versão com UUID é priorizada.
- Quando existem várias versões remotas do mesmo lead, a mais recentemente atualizada é exibida.
- O espelho local é regravado somente com a lista consolidada, impedindo que clones reapareçam na interface.
- Nenhuma exclusão automática foi executada diretamente no Supabase. Registros históricos duplicados ficam ocultos pela consolidação, e novas duplicações deixam de ser geradas.

### Responsividade e rolagem

- O pipeline deixou de renderizar todas as etapas em uma faixa horizontal contínua.
- A quantidade de colunas visíveis agora se adapta à largura da tela:
  - celular estreito: 1 coluna;
  - celular grande/tablet pequeno: 2 colunas;
  - notebook compacto: 3 colunas;
  - desktop: 4 colunas;
  - telas grandes: 5 colunas.
- Foram adicionados seletor de etapa e botões para navegar por grupos de etapas.
- A rolagem horizontal extensa foi eliminada.
- As listas de cartões possuem rolagem vertical interna com altura limitada pela viewport.
- Cabeçalho, filtros, indicadores, cartões e seções recolhidas foram compactados.
- O pipeline mantém todas as nove etapas e todas as funções anteriores, incluindo arrastar, seletor de status, nota rápida e abertura dos detalhes.

## Arquivos alterados

- `src/pages/CRM/index.jsx`
- `src/pages/CRM/KanbanBoard.jsx`
- `src/pages/CRM/CRM.css`

## Validações executadas

- Revisão integral do vídeo de 31 segundos.
- Simulação da consolidação de um ID local e dois UUIDs duplicados: apenas o UUID mais recente permaneceu.
- Simulação da atualização do espelho local: o UUID não foi sobrescrito pelo ID `lead-...`.
- 138 arquivos JavaScript/JSX analisados sem erros de sintaxe.
- 36 arquivos CSS analisados sem erros de parsing.
- Imports relativos conferidos: nenhum arquivo ausente.

## Limitação do ambiente

O `npm run build` foi iniciado com as dependências enviadas anteriormente, mas não pôde ser concluído porque o `node_modules` era do Windows e não continha o binding Linux `@rolldown/binding-linux-x64-gnu`. Execute no Windows:

```powershell
npm install
npm run build
npm run dev
```
