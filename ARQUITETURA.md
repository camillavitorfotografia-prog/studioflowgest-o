# Arquitetura StudioFlow

## Stack

- React com Vite.
- Rotas em `src/App.jsx` com `react-router-dom`.
- Layout principal em `src/layouts/MainLayout.jsx`.
- Navegacao principal em `src/components/Sidebar.jsx`.
- Estilos globais em `src/index.css`.
- Persistencia atual baseada em `localStorage`.

## Entidade Central

O projeto e a entidade central do ecossistema StudioFlow.

Fluxo integrado:

CRM -> Projeto -> Cliente -> Agenda -> Financeiro -> Equipamentos -> Checklist -> Relatorios

Nenhum modulo deve funcionar como ilha quando houver dado compartilhavel.

## Modulos Existentes

- Dashboard: pagina inicial e visao executiva.
- CRM: pipeline comercial, leads, conversao para cliente.
- Clientes: cadastro, pagamentos, dados comerciais.
- Trabalhos/Projetos: esteira de producao por cliente/projeto.
- Agenda: eventos manuais e eventos integrados dos clientes.
- Financeiro: receitas, despesas, investimentos, relatorios e distribuicao.
- Precificacao: motor de orcamentos com custos reais e margem.
- Equipamentos: patrimonio e depreciacao.
- Relatorios: consolidacao operacional.
- Perfil: dados do estudio.

## Utilitarios Existentes

- `src/utils/storage.js`: chaves de armazenamento, leitura, escrita, IDs e sincronizacao legada.
- `src/utils/masks.js`: moeda, telefone e capitalizacao de nomes.
- `src/utils/formatters.js`: formatacao e parsing.
- `src/utils/financeEngine.js`: calculos financeiros, depreciacao, snapshots e chaves financeiras.

## Regras de Implementacao

- Centralizar novas chaves em `storage.js` ou `financeEngine.js`, conforme o dominio.
- Reutilizar `Modal`, `PageHeader`, classes `sf-*`, `glass` e padroes globais antes de criar novos estilos.
- Preferir funcoes utilitarias compartilhadas para mascaras, parsing, formatacao e calculos.
- Integrar novos dados ao fluxo existente por `localStorage` e eventos `storage` quando necessario.
- Evitar duplicar estado entre modulos; derivar dados de clientes, leads, projetos, agenda, financeiro e equipamentos sempre que possivel.
