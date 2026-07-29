# INSTRUÇÕES DE FINALIZAÇÃO — CV-Studio(125)

## 1. Instalar em uma pasta limpa

Extraia o ZIP final em uma pasta nova. Copie da instalação atual somente:

```text
.env
.env.local
```

Não copie:

```text
node_modules
dist
.vercel
tmp
.git
```

## 2. Instalar dependências e validar localmente

No terminal do VS Code, dentro da pasta nova:

```powershell
npm install
npm run lint
npm run build
npm run dev
```

O lint pode apresentar avisos, mas deve terminar com **0 erros**. O build deve concluir antes da publicação.

## 3. Migration já aplicada — não executar novamente

A migration abaixo já foi aplicada ao Supabase e registrada no histórico remoto:

```text
20260729113857_multitenant_account_isolation.sql
```

Não execute esse SQL novamente.

## 4. Aplicar a migration complementar de integridade

Arquivo novo:

```text
supabase/migrations/20260729173000_finalize_account_integrity.sql
```

Como o histórico antigo de migrations continua parcialmente desalinhado, **não use `supabase db push`**.

### 4.1 Fazer um novo backup

Com Docker Desktop aberto:

```powershell
New-Item -ItemType Directory -Force .\tmp | Out-Null
npx supabase@latest db dump --linked -f .\tmp\studioflow-schema-before-final-integrity.sql
npx supabase@latest db dump --linked --data-only --use-copy -f .\tmp\studioflow-data-before-final-integrity.sql
npx supabase@latest db dump --linked --role-only -f .\tmp\studioflow-roles-before-final-integrity.sql
```

Guarde os arquivos fora do repositório.

### 4.2 Copiar a migration em uma transação

```powershell
$migration = Get-ChildItem ".\supabase\migrations\20260729173000_finalize_account_integrity.sql" | Select-Object -First 1
$sql = Get-Content -LiteralPath $migration.FullName -Raw
$wrappedSql = "begin;`r`n$sql`r`ncommit;"
$wrappedSql | Set-Clipboard
```

No Supabase:

1. Abra **SQL Editor → New query**.
2. Cole com `Ctrl + V`.
3. Confirme `begin;` no início e `commit;` no final.
4. Clique em **Run** uma única vez.

Se houver erro, não execute novamente. A transação deve desfazer as mudanças; revise a mensagem antes de uma nova tentativa.

### 4.3 Verificar a migration

```sql
select
  column_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'migration_payloads'
  and column_name = 'user_id';
```

Deve existir `user_id` não nulo.

```sql
select
  relrowsecurity,
  relforcerowsecurity
from pg_class
where oid = 'public.migration_payloads'::regclass;
```

Os dois valores devem ser `true`.

Confira os validadores de propriedade:

```sql
select
  event_object_table,
  trigger_name
from information_schema.triggers
where trigger_schema = 'public'
  and trigger_name like 'zz_studioflow_owner_%'
order by event_object_table, trigger_name;
```

### 4.4 Registrar a migration como aplicada

Somente depois de o SQL terminar com sucesso:

```powershell
npx supabase@latest migration repair --status applied 20260729173000 --linked
npx supabase@latest migration list
```

A linha `20260729173000` deve aparecer em LOCAL e REMOTE.

## 5. Teste obrigatório de isolamento entre contas

### Conta principal

Entre com a conta principal e confirme:

- Clientes;
- CRM;
- Trabalhos;
- Equipamentos;
- Financeiro;
- Agenda;
- Documentos;
- Galerias.

### Conta secundária

Entre em uma segunda conta. Ela deve abrir sem dados da conta principal.

Crie na conta secundária:

- um cliente;
- um lead;
- um trabalho;
- um equipamento;
- uma despesa.

Atualize a página, confirme persistência e volte à conta principal. Nenhum desses registros pode aparecer na conta principal.

## 6. Testes funcionais mínimos antes do deploy

### CRM

- criar lead;
- editar todos os campos;
- mudar de etapa várias vezes;
- confirmar que não duplica;
- excluir;
- atualizar a página.

### Trabalhos e Agenda

- criar trabalho;
- alterar data e etapa;
- confirmar sincronização no calendário;
- cancelar ou excluir.

### Financeiro e Relatórios

- criar receita;
- criar despesa fixa e variável;
- confirmar pagamento;
- conferir Dashboard e Relatório anual;
- confirmar que valores pagos não voltam para “a receber”.

### Documentos

- criar proposta;
- aprovar proposta;
- confirmar criação do trabalho oficial;
- criar contrato;
- alterar status;
- excluir um rascunho;
- abrir em outro dispositivo.

### Galerias

- criar, publicar e abrir link público;
- selecionar fotos;
- confirmar fotos extras;
- testar lightbox, capa, marca-d’água e tema.

## 7. Teste móvel

No iPhone e no iPad, confira:

- textos legíveis;
- nenhuma informação cortada;
- botões e campos fáceis de tocar;
- ausência de rolagem horizontal acidental;
- CRM, Financeiro, Relatórios, Trabalhos, modais e tabelas;
- iPad vertical e horizontal.

Depois do deploy, apague o atalho antigo da tela inicial e adicione novamente para o iOS carregar o novo ícone.

## 8. Limpeza do Git antes do commit

Na pasta do repositório atual:

```powershell
git rm --cached --ignore-unmatch .env .env.local
git rm -r --cached --ignore-unmatch tmp node_modules dist .vercel
git add -A
git status
```

Confirme que `.env`, `.env.local` e backups SQL não aparecem em `Changes to be committed`.

Depois:

```powershell
git commit -m "Finaliza segurança, persistência e responsividade do StudioFlow"
git pull --rebase origin main
git push origin main
```

Se a Vercel estiver conectada ao branch `main`, o push iniciará o deploy automaticamente.

## 9. Observação sobre migrations antigas

Mesmo após registrar `20260729173000`, não use:

```powershell
npx supabase@latest db push
```

até o histórico antigo ser reconciliado. Essa organização deve ser feita separadamente, comparando cada migration local com o estado real do banco.
