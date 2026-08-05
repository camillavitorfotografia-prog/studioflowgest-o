# StudioFlow V130 — correção definitiva de recarregamento

## Causas encontradas

1. O Supabase pode emitir `SIGNED_IN` novamente quando o navegador ou o PWA volta ao primeiro plano. O AuthContext tratava isso como um novo login, ativava `loading` e desmontava toda a área protegida.
2. A assinatura global do banco invalidava todo o cache em `focus`, `pageshow` e `visibilitychange`.
3. Diversas páginas possuíam listeners próprios de `focus` que disparavam uma nova consulta assim que o usuário voltava ao navegador.
4. O `Outlet` padrão do React Router desmontava o módulo anterior ao trocar de rota. Ao voltar, a página era criada do zero e executava todos os carregamentos novamente.

## Alterações

- A mesma sessão autenticada não ativa mais o loading global em `SIGNED_IN`, `TOKEN_REFRESHED`, `USER_UPDATED` ou `INITIAL_SESSION`.
- Foram removidas invalidações automáticas por foco, pageshow e retorno de visibilidade.
- Foram removidos recarregamentos por foco de Dashboard, Clientes, Agenda, Trabalhos, Documentos, Equipamentos, Perfil, Relatórios, Precificação e Despesas.
- O MainLayout agora mantém cada módulo visitado montado em memória. A troca de página apenas oculta um módulo e mostra outro.
- Atualizações continuam chegando por Realtime do Supabase, eventos de armazenamento e ações explícitas de salvar/atualizar.

## Resultado esperado

- Alternar para outro aplicativo e voltar não mostra a tela global de carregamento.
- Trocar entre módulos já visitados não consulta tudo novamente.
- Formulários, modais, filtros e estado local permanecem preservados ao navegar.
