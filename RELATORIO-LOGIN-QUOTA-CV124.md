# Correção de login — quota do armazenamento local

## Problema observado

Após a aplicação correta da migration multicontas, a autenticação do Supabase era concluída, mas a sessão era descartada durante a preparação da conta.

O erro visível era semelhante a:

```text
Failed to execute 'setItem' on 'Storage': Setting the value of
'studioflow:user:<uuid>:cv_studio_pricing_scenario_name' exceeded the quota.
```

A causa estava na migração do `localStorage`: o sistema criava a nova chave isolada por usuário antes de remover a chave legada. Com o armazenamento já próximo do limite do navegador, essa duplicação temporária disparava `QuotaExceededError`. O `AuthContext` tratava esse erro auxiliar como falha da sessão e devolvia o usuário para o login.

## Correções aplicadas

- A migração de chaves antigas agora **move** cada valor: lê em memória, remove a chave antiga e só então grava a chave isolada.
- Se uma chave isolada já existir, a cópia antiga redundante é removida.
- Metadados transitórios de upload e cache, além do escopo temporário `guest`, podem ser limpos para liberar espaço.
- Se ainda faltar espaço, a chave legada é restaurada e fica acessível apenas para a conta proprietária, nunca para outra conta.
- Falhas de quota em preferências e caches passam a ser não bloqueantes: a aplicação mantém o estado em memória e a sessão continua ativa.
- A migração do cache local foi separada da autenticação no `AuthContext`; ela não pode mais invalidar uma sessão confirmada pelo Supabase.
- O nome da migration local foi alinhado ao timestamp realmente registrado no Supabase: `20260729113857_multitenant_account_isolation.sql`.

## Arquivos alterados

- `src/utils/accountScope.js`
- `src/contexts/AuthContext.jsx`
- `supabase/migrations/20260729113857_multitenant_account_isolation.sql` (renomeado para corresponder ao histórico remoto)
- `INSTRUCOES-ATUALIZACAO-CV124.md`
- `RELATORIO-AUDITORIA-CV124.md`

## Validações executadas

- Validação sintática com `@babel/parser` nos dois arquivos JavaScript/JSX alterados.
- Teste simulado de quota cheia durante a migração: a chave foi movida sem duplicação e o login não foi interrompido.
- Teste simulado de falta total de espaço: a chave antiga foi restaurada e permaneceu visível somente para o proprietário legado; uma segunda conta recebeu `null`.
- Teste de gravação de preferência com quota cheia: a operação não lançou exceção e o escopo autenticado permaneceu ativo.

## Limitação

O `npm ci` não pôde concluir neste ambiente porque o registro interno não encontrou o pacote `zod-validation-error@4.0.2`. Portanto, o build completo precisa ser executado localmente.
