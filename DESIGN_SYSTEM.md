# Design System StudioFlow

## Identidade

- SaaS premium.
- Tema escuro.
- Visual moderno, elegante e produtivo.
- Pouco ruido visual.
- Espacamento generoso.
- Hierarquia clara.

## Tokens Globais

Usar as variaveis de `src/index.css`:

- `--bg-main`: fundo principal.
- `--bg-card`: cards e paineis.
- `--bg-menu`: sidebar/menu.
- `--text-main`: texto principal.
- `--text-secondary`: texto auxiliar.
- `--color-highlight`: destaque dourado.
- `--color-success`, `--color-danger`, `--color-warning`, `--color-button`.
- `--border-color`, `--shadow-sm`, `--shadow-lg`.
- `--radius-sm`, `--radius-md`, `--radius-lg`.

## Componentes Visuais

- Cards: usar `sf-card`, `sf-table-card`, `glass` ou padroes equivalentes existentes.
- Botoes primarios: `sf-primary-button`.
- Botoes secundarios: `sf-secondary-button`.
- Navegacao interna: `sf-finance-nav` quando houver abas do modulo.
- Metricas: `sf-metric-grid` e `sf-card metric`.
- Tabelas: `sf-table-card` e `sf-table`.
- Campos: `sf-field`, inputs escuros, borda discreta, foco dourado.
- Seletores segmentados: `sf-segmented`.
- Toggles/cards de escolha: `sf-toggle-card`, `sf-choice-grid`.

## Responsividade

- Desktop, notebook, tablet, iPad, iPhone e Android sem scroll horizontal.
- Usar grids com `repeat(auto-fit, minmax(...))`.
- Em mobile, reduzir colunas para `1fr`.
- Tabelas podem ter overflow horizontal controlado dentro do card, nunca na pagina inteira.
- Textos devem quebrar corretamente sem sobreposicao.

## Restricoes

Nao alterar sem pedido explicito:

- Sidebar.
- Dashboard.
- Layout geral.
- Paleta.
- Tipografia.
- Cards.
- Botoes.
- Inputs.
- Espacamentos.
- Responsividade existente.

Novas telas devem parecer nativas do StudioFlow, nao paginas anexadas.
