# Relatório — Financeiro sem oscilação de carregamento (v129)

## Base utilizada

Esta correção foi aplicada sobre `CV-Studio-123-Agenda-Sincronizada-v128.zip`.
Nenhuma versão anterior foi restaurada e nenhuma função financeira foi removida.

## Problema reproduzido no vídeo

Ao abrir a aba Financeiro, a tela alternava repetidamente entre o Painel Financeiro e o estado “Carregando dados financeiros”. O conteúdo aparecia, desaparecia e reaparecia durante vários segundos.

## Causa técnica

O ciclo era provocado pela combinação de quatro comportamentos:

1. O cálculo financeiro gravava os saldos derivados no `localStorage` dentro de um `useMemo`.
2. `writeStorage` emitia `sf_storage_update` mesmo quando o conteúdo gravado era exatamente igual ao já armazenado.
3. O carregamento da configuração de distribuição também regravava e notificava o mesmo valor.
4. O Financeiro escutava essas notificações e iniciava outra carga, definindo `loading=true` e desmontando visualmente o painel.

O módulo ainda registrava dois listeners de foco para a mesma atualização, permitindo consultas concorrentes e repetidas.

## Correções realizadas

### Persistência e eventos

- `writeStorage` agora não regrava nem emite eventos quando o valor serializado não mudou.
- Foi criada a opção `{ emit: false }` para espelhos e resumos derivados que não representam uma alteração do usuário.
- A configuração financeira carregada do banco é atualizada silenciosamente no cache local.
- Os saldos calculados deixaram de ser persistidos durante o `useMemo`.

### Carregamento do Financeiro

- A aba começa com o último snapshot local disponível, sem apagar o conteúdo enquanto consulta o Supabase.
- Atualizações posteriores acontecem em segundo plano.
- Durante uma atualização de fundo aparece apenas o indicador discreto “Atualizando”.
- O estado de carregamento integral é usado somente quando ainda não existe nenhum dado disponível.
- Configuração financeira, dados do estúdio e ledger canônico são consultados em paralelo.
- Solicitações concorrentes são consolidadas em uma única Promise.
- O listener de foco duplicado foi removido; a assinatura global já contempla foco, visibilidade e realtime.
- Recorrências geradas atualizam o espelho local sem iniciar outra carga imediatamente.

## Arquivos alterados

- `src/pages/Financeiro/index.jsx`
- `src/utils/storage.js`
- `src/utils/financeEngine.js`
- `src/index.css`

## Funções preservadas

- Painel financeiro
- Receitas e cobranças
- Despesas fixas e variáveis
- Fluxo de caixa
- Agenda financeira
- Simulador
- Comparativo
- Planejamento
- Controle
- Ferramentas
- Diagnóstico
- Operações
- DRE
- Inteligência
- Investimentos
- Relatórios
- Alertas
- Atualizações realtime do Supabase

## Validações executadas

- Vídeo de 11,43 segundos revisado quadro a quadro.
- 138 arquivos JavaScript/JSX analisados pelo parser TypeScript: nenhum erro de sintaxe.
- 36 arquivos CSS analisados: nenhum erro de parsing.
- Imports relativos verificados: nenhum arquivo referenciado ausente.
- Integridade dos ZIPs verificada após a compactação.

## Limitações

`npm run build` e a validação visual em navegador não foram executados neste ambiente porque o projeto não inclui `node_modules` e a instalação das dependências depende do registro npm. Execute localmente:

```powershell
npm install
npm run build
npm run dev
```

A correção elimina o ciclo identificado no código e preserva o painel durante atualizações, mas a velocidade final da primeira consulta em um navegador sem cache ainda depende da conexão e do Supabase.
