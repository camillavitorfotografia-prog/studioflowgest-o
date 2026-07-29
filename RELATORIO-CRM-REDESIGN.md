# CRM — redesign minimalista inspirado no mockup aprovado

Base utilizada: `CV-Studio-122-CRM-Corrigido.zip`, derivada exclusivamente do `CV-Studio(122).zip` enviado pela usuária.

## Objetivo

Reorganizar visualmente a tela do CRM para aproximá-la do mockup aprovado, sem remover recursos nem alterar a lógica funcional já existente.

## Alterações realizadas

- título simplificado para `CRM` e subtítulo mais claro;
- nova barra superior compacta com busca, origem, serviço, status e acesso aos filtros avançados;
- filtros avançados permanecem disponíveis, mas recolhidos por padrão;
- cards dos indicadores comerciais reorganizados em uma linha de quatro métricas compactas;
- pipeline Kanban recebeu fundo unificado, colunas mais estreitas e leitura horizontal contínua;
- cards dos leads ficaram menores e exibem apenas as informações essenciais;
- probabilidade e informações secundárias continuam disponíveis no detalhe do lead;
- feedback `Salvando status...` foi preservado;
- ações do dia, follow-ups e análises permanecem no sistema, porém com menor peso visual;
- ajustes específicos para notebook, tablet e celular;
- tema claro continua baseado nas variáveis existentes, sem cores brancas fixas sobre superfícies claras.

## Arquivos alterados

- `src/pages/CRM/index.jsx`
- `src/pages/CRM/CRM.css`

## Validações executadas

- análise sintática JSX com o parser TypeScript: nenhum erro nos arquivos `index.jsx`, `KanbanBoard.jsx` e `CRMStats.jsx`;
- conferência de balanceamento das chaves do arquivo principal;
- revisão das classes adicionadas e dos breakpoints responsivos.

## Limitação

O build não foi executado neste ambiente porque o ZIP corrigido não contém `node_modules` e o comando `vite` não está instalado localmente. Execute no computador:

```powershell
npm install
npm run build
npm run dev
```

