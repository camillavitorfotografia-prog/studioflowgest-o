# Regras de Negocio StudioFlow

## Filosofia

O StudioFlow e um ecossistema integrado. Nenhuma informacao deve ser digitada duas vezes quando puder ser preenchida, calculada, sugerida ou sincronizada automaticamente.

## Fluxo Principal

CRM -> Projeto -> Cliente -> Agenda -> Financeiro -> Equipamentos -> Checklist -> Relatorios

## CRM

- Leads devem carregar historico.
- Leads aprovados devem poder virar clientes/projetos.
- Dados comerciais relevantes devem alimentar cliente, agenda e financeiro.

## Projeto e Cliente

- Projeto e a entidade operacional central.
- Cliente carrega contato, trabalho, data, valor, pagamentos e status.
- Pagamentos devem atualizar financeiro automaticamente quando aplicavel.
- Datas de trabalho devem alimentar agenda e esteira de producao.

## Agenda

- Eventos manuais coexistem com eventos gerados por clientes/projetos.
- Eventos integrados devem indicar origem e evitar edicao conflitante fora do modulo dono.
- Dados de cliente/projeto devem preencher agenda automaticamente.

## Financeiro

- Receitas devem vir dos pagamentos de clientes.
- Custos fixos, variaveis e equipamentos devem alimentar precificacao e relatorios.
- Distribuicao financeira deve respeitar configuracao existente.
- Relatorios devem ser derivados dos dados reais do sistema.

## Equipamentos

- Equipamentos devem alimentar depreciacao e custo real dos projetos.
- Precificacao deve considerar equipamentos selecionados e depreciacao mensal.

## Campos e Validacoes

- Nome: primeira letra de cada palavra em maiuscula, mantendo preposicoes em minusculo quando adequado.
- Telefone e WhatsApp: mascara automatica.
- CPF, CNPJ, CEP, Instagram, email e site: validar e mascarar automaticamente quando implementados.
- Moeda: usar mascara e parsing compartilhados.
- Evitar formularios longos; dividir informacoes em cards objetivos.

## Automacoes Esperadas

- Preencher dados ja conhecidos automaticamente.
- Calcular totais, saldos, margens, custos, lucros e pendencias automaticamente.
- Sugerir a proxima acao da tela com base no contexto.
- Sincronizar dados entre modulos por armazenamento compartilhado e eventos internos.
