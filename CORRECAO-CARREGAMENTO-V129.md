# StudioFlow V129 — correção estrutural de navegação

## Problema corrigido
As páginas principais eram desmontadas ao trocar de rota. Ao retornar, cada módulo executava novamente suas consultas ao Supabase, mostrava o estado de carregamento e perdia formulários/modais ainda não salvos.

## Solução aplicada
- Implementado `PersistentOutlet` no layout principal.
- As telas principais permanecem montadas após a primeira visita.
- Ao trocar de módulo, a tela anterior é apenas ocultada, sem ser destruída.
- Estados locais, formulários, modais e dados já carregados são preservados.
- A posição de rolagem de cada página também é restaurada ao voltar.
- Rotas específicas e editores continuam com comportamento normal para evitar manter telas dinâmicas indevidamente.

## Arquivo alterado
- `src/layouts/MainLayout.jsx`

## Validação necessária após o deploy
1. Entrar no CRM e abrir um lead.
2. Começar a preencher um contato sem salvar.
3. Ir para Agenda ou Clientes.
4. Voltar ao CRM.
5. Confirmar que a tela reaparece imediatamente e que a edição continua aberta.

## Observação de build
O ZIP recebido continha dependências nativas de outro sistema operacional. Por isso, a compilação não pôde ser concluída neste ambiente. O Vercel reinstala as dependências adequadas durante o deploy.
