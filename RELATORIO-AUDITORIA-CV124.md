# StudioFlow — Relatório da atualização CV-Studio(124)

## Base utilizada

Esta atualização foi feita exclusivamente sobre o arquivo `CV-Studio(124).zip`. O estado recebido foi preservado; não houve restauração de versões antigas nem substituição dos recursos que já funcionavam.

## Prioridade 1 — isolamento completo entre contas

### Problema confirmado
Uma conta recém-criada conseguia visualizar dados pertencentes à conta principal. Isso envolvia duas origens:

1. registros do Supabase sem proprietário obrigatório e políticas RLS permissivas ou ausentes;
2. chaves do `localStorage` compartilhadas por todas as sessões do mesmo navegador.

### Correções

- Criada a migration `supabase/migrations/20260729090000_multitenant_account_isolation.sql`.
- Adicionado `user_id` às estruturas privadas existentes, quando a tabela existir.
- Registros legados sem proprietário são vinculados à conta legada definida no registro de tenancy.
- RLS passa a ser obrigatória para leitura, criação, edição e exclusão.
- Contas autenticadas só podem operar registros cujo `user_id` seja igual a `auth.uid()`.
- Uploads novos usam o UUID da conta como primeira pasta do Storage.
- A conta legada mantém acesso apenas aos arquivos antigos sem pasta de usuário; ela não recebe acesso aos arquivos de contas novas.
- Chaves privadas do `localStorage` passaram a ser fisicamente separadas por conta.
- Ao trocar de usuário, caches de dados são invalidados antes da renderização dos módulos privados.
- Configurações, equipe, perfil, tema, CRM, financeiro, equipamentos, projetos, documentos e demais espelhos locais ficam no escopo da conta ativa.
- O perfil remoto é carregado e salvo pelo `user_id` da sessão.
- A aplicação falha de forma segura caso a migration de isolamento ainda não tenha sido aplicada. Isso evita publicar uma interface aparentemente funcional, mas insegura.

### Estruturas protegidas pela migration

A migration trata, quando existentes: `leads`, `clientes`, `projetos`, `financas`, `equipamentos`, `perfil`, galerias e fotos, portais, biblioteca de arquivos, documentos, contratos, propostas, integrações e tabelas de WhatsApp.

### Atenção obrigatória

A migration deve ser aplicada **antes** de publicar esta versão do front-end. O proprietário dos dados legados é definido inicialmente como o usuário mais antigo do Supabase Auth. Antes da publicação, confirme no SQL Editor que esse usuário é a conta principal correta.

## Ícone do StudioFlow no iPhone, iPad e Android

Foram criados e configurados:

- `public/apple-touch-icon.png` — 180 × 180;
- `public/favicon-64.png`;
- `public/icon-192.png`;
- `public/icon-512.png`;
- `public/icon-maskable-512.png`;
- `public/studioflow-icon-black.png`;
- `public/site.webmanifest`.

O ícone usa fundo preto e a logomarca dourada do StudioFlow. O `index.html` recebeu manifest, favicon, Apple Touch Icon, `viewport-fit=cover`, nome do app e cores do modo standalone.

Após publicar, o atalho antigo precisa ser removido do iPhone e adicionado novamente, pois o iOS mantém o ícone anterior em cache.

## Relatório anual e despesas fixas

### Problema
O relatório exibia “23 despesas pendentes” sem diferenciar sete cadastros de despesas fixas das ocorrências mensais geradas por recorrência. Despesas futuras também pareciam uma inconsistência.

### Correções

- Contagem separada de cadastros de despesas fixas.
- Contagem separada de ocorrências geradas no exercício.
- Separação entre ocorrências vencidas e não pagas e ocorrências futuras.
- Somente despesas vencidas entram no alerta de atenção.
- Informações de espelhos ignorados e exclusões normais ficam em “Detalhes técnicos da consolidação”.
- Botões com contador zero não são exibidos.
- Quando não há inconsistência acionável, a tela informa “Consolidação concluída sem inconsistências”.
- Tipografia, contraste, controles e áreas seguras foram ajustados para iPhone e iPad.

## Financeiro no celular e tablet

- A faixa de abas do desktop é substituída por um seletor de módulo no iPhone/iPad.
- Despesas fixas e variáveis deixam de usar uma tabela de desktop cortada no celular.
- Cada despesa vira um cartão com descrição, categoria, vencimento, pagamento, status, valor e ações.
- Valores e botões não ficam mais fora da área visível.
- Controles possuem área de toque adequada e texto de 16 px.
- A parte inferior respeita a área segura e a barra do navegador do iPhone.

## CRM no celular e tablet

- Nome, serviço, etiquetas, próxima ação, valor e mudança de etapa receberam tamanhos legíveis.
- Cards não possuem altura fixa que corte o seletor de status.
- O seletor de etapa possui altura e espaçamento adequados para toque.
- O resumo do pipeline usa três colunas em iPhones comuns e quatro no tablet, reduzindo rolagem sem reduzir a fonte.
- Listas secundárias continuam recolhíveis.

## Responsividade geral

Foram adicionadas regras finais para:

- fonte base de 16 px em iPhone/iPad;
- títulos de 28–34 px no celular;
- textos auxiliares com no mínimo 14 px e contraste adequado;
- botões, selects e inputs com 44–48 px de altura;
- `safe-area-inset` no topo e rodapé;
- eliminação de largura mínima herdada em tabelas convertidas em cards;
- modais dentro da altura útil da tela;
- Agenda mensal sem largura mínima de desktop;
- Clientes com cards, campos e ações legíveis;
- Equipamentos em cartões com ações de toque;
- formulários em duas colunas no iPad quando houver largura suficiente.

A compactação foi feita por reorganização e redução de espaços desnecessários, não por diminuir excessivamente as letras.

## Tema claro e escuro

- O tema passa a ser salvo por conta.
- A mudança de conta reaplica o tema correto.
- Eventos de armazenamento entre abas reconhecem também a chave fisicamente escopada.
- Permanecem as variáveis e correções de tema já existentes na versão recebida.

## Armazenamento e uploads

- Metadados transitórios continuam sendo eliminados quando houver falta de espaço.
- A limpeza agora reconhece também chaves transitórias armazenadas dentro do escopo da conta.
- Assets novos de modelos de documentos são enviados para uma pasta iniciada pelo UUID do usuário.

## Arquivos criados

- `src/utils/accountScope.js`
- `public/site.webmanifest`
- novos ícones em `public/`
- `supabase/migrations/20260729090000_multitenant_account_isolation.sql`
- `RELATORIO-AUDITORIA-CV124.md`
- `INSTRUCOES-ATUALIZACAO-CV124.md`

## Principais arquivos alterados

- `index.html`
- `src/main.jsx`
- `src/App.jsx`
- `src/contexts/AuthContext.jsx`
- `src/utils/dbData.js`
- `src/utils/storage.js`
- `src/utils/theme.js`
- `src/features/documents/storage/documentStorageAdapter.js`
- `src/pages/Relatorios/annualReportData.js`
- `src/pages/Relatorios/index.jsx`
- `src/pages/Relatorios/Relatorios.css`
- `src/pages/Financeiro/Despesas.jsx`
- `src/index.css`
- `src/styles/responsiveAuditFixes.css`
- `src/pages/CRM/CRM.css`
- `src/pages/Clientes/Clientes.css`
- `src/pages/Equipamentos/Equipamentos.css`
- `src/pages/Agenda/Agenda.css`

## Testes e validações realmente executados

- 139 arquivos JavaScript/JSX analisados pelo parser Babel: sem erro de sintaxe.
- 36 arquivos CSS analisados pelo parser `tinycss2`: sem erro de parsing.
- Imports relativos de 139 arquivos verificados: nenhum arquivo referenciado ausente.
- Teste automatizado do escopo local com duas contas: conta B não leu nem sobrescreveu os dados da conta A; migração legada preservou a conta proprietária.
- Verificação estática da migration: blocos `DO/END`, delimitadores e parênteses balanceados.
- Inspeção visual do Apple Touch Icon gerado.
- Integridade do ZIP final verificada após o empacotamento.

## Limitações de validação

- `npm run build` não pôde ser concluído neste ambiente porque as dependências não estavam instaladas (`vite: not found`).
- A reinstalação foi bloqueada pela indisponibilidade do registro npm no ambiente de execução.
- Não houve acesso ao seu Supabase de produção; portanto, a migration não foi executada aqui.
- Não foi possível fazer o teste real com duas contas conectadas ao banco de produção nem abrir o projeto no Safari do iPhone/iPad neste ambiente.
- As verificações de isolamento no banco precisam ser concluídas depois de aplicar a migration, conforme o roteiro de `INSTRUCOES-ATUALIZACAO-CV124.md`.

Por essas limitações, não se afirma que o projeto esteja “100% sem erros”. A versão foi preparada para uma publicação controlada, condicionada à migration, ao build local e aos testes de duas contas.
