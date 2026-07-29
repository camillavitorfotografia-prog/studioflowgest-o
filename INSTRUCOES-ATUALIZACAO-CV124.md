# StudioFlow CV124 — implantação segura

## Ordem obrigatória

A ordem abaixo é importante. Não publique o front-end antes de aplicar a migration de isolamento.

### 1. Faça backups

- Baixe um backup do banco Supabase.
- Preserve a pasta atual do projeto.
- Preserve `.env` e `.env.local`; eles não estão incluídos no ZIP final.

### 2. Confirme a conta proprietária dos dados existentes

No SQL Editor do Supabase, execute:

```sql
select id, email, created_at
from auth.users
order by created_at asc;
```

A primeira conta deve ser a conta principal que já possui os clientes, financeiro e equipamentos atuais.

### 3. Aplique a migration

Arquivo:

```text
supabase/migrations/20260729090000_multitenant_account_isolation.sql
```

Com Supabase CLI vinculado ao projeto:

```powershell
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push
```

Ou copie o conteúdo da migration e execute no SQL Editor do Supabase.

### 4. Verifique o proprietário legado

```sql
select
  registry.legacy_owner_id,
  users.email,
  users.created_at
from public.studioflow_tenant_registry registry
left join auth.users users on users.id = registry.legacy_owner_id
where registry.singleton = true;
```

O e-mail retornado deve ser o da conta principal.

### 5. Valide o isolamento no banco

Entre com a conta principal e confirme seus dados. Depois entre com a conta de teste e confirme que ela abre vazia.

Na conta de teste, cadastre um cliente, um equipamento e uma despesa. Volte para a conta principal e confirme que esses três registros não aparecem.

Também teste o caminho inverso: a conta de teste não deve visualizar, editar ou excluir registros da conta principal.

### 6. Instale e teste localmente

Na pasta limpa do projeto:

```powershell
npm install
npm run build
npm run lint
npm run dev
```

Teste no modo responsivo do navegador e, principalmente, nos aparelhos reais:

- iPhone;
- iPad vertical;
- iPad horizontal;
- notebook;
- desktop.

### 7. Publique no GitHub

```powershell
git add -A
git status
git commit -m "Isola contas e melhora responsividade no StudioFlow"
git pull --rebase origin main
git push origin main
```

Se a Vercel estiver conectada ao branch `main`, o push inicia o deployment.

### 8. Atualize o ícone no iPhone

Depois que a Vercel terminar:

1. apague o atalho antigo da tela inicial;
2. abra o StudioFlow novamente no Safari;
3. toque em Compartilhar;
4. escolha “Adicionar à Tela de Início”.

O iOS costuma manter o ícone anterior em cache, por isso apenas atualizar a página não é suficiente.

## Teste de aceite mínimo

- Conta nova abre sem clientes, trabalhos, equipamentos, financeiro, CRM, documentos e configurações da conta principal.
- Conta principal mantém os registros antigos.
- Trocar de conta no mesmo navegador não mistura cache nem tema.
- Sete despesas fixas aparecem como sete cadastros; ocorrências futuras são informadas separadamente.
- Despesas no iPhone aparecem em cartões com valor e ações visíveis.
- CRM não corta o status nem usa texto minúsculo.
- Relatório não mostra botões de inconsistência com contador zero.
- Ícone instalado usa fundo preto e logomarca dourada.
