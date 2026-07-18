import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, Edit2, PackagePlus, Plus, Search, Trash2, X } from 'lucide-react';
import Modal from '../../components/Modal';
import { readStorage, writeStorage, STORAGE_KEYS } from '../../utils/storage';
import { formatCurrency, parseCurrency } from '../../utils/financeEngine';
import { maskCurrency } from '../../utils/masks';
import { isSupabaseConfigured, supabase } from '../../utils/supabase';
import { syncEquipmentList, upsertRow } from '../../utils/dbData';
import './VariableExpenses.css';

const CATEGORIES = ['Equipamentos','Freelancer','Álbum','Impressão','Materiais','Transporte','Hospedagem','Alimentação em trabalho','Publicidade','Anúncios','Cursos','Softwares','Taxas','Impostos','Outras'];
const IMMEDIATE_METHODS = ['Pix','Dinheiro','Transferência','Débito'];
const RESOURCE_ORIGINS = [
  ['receita_operacional','Receita operacional da empresa'],
  ['aporte_pessoal','Aporte pessoal da titular'],
  ['venda_patrimonio','Venda de patrimônio'],
  ['reembolso','Reembolso'],
  ['emprestimo','Empréstimo recebido'],
  ['reserva_acumulada','Reserva acumulada'],
  ['origem_mista','Origem mista'],
];
const NON_OPERATIONAL_CATEGORY_BY_ORIGIN = {
  aporte_pessoal:'Aporte pessoal da titular',
  venda_patrimonio:'Venda de patrimônio',
  reembolso:'Reembolso',
  emprestimo:'Empréstimo recebido',
};
const VARIABLE_EXPENSE_BACKUP_KEY = 'cv_studio_despesas_variaveis_v2';
const readVariableBackup = () => { try { const value=JSON.parse(localStorage.getItem(VARIABLE_EXPENSE_BACKUP_KEY)||'[]'); return Array.isArray(value)?value:[]; } catch { return []; } };
const writeVariableBackup = (value) => localStorage.setItem(VARIABLE_EXPENSE_BACKUP_KEY, JSON.stringify(Array.isArray(value)?value:[]));
const mergeById = (...lists) => { const map=new Map(); lists.flat().forEach((item)=>{ if(!item?.id)return; const key=String(item.id); map.set(key,{...(map.get(key)||{}),...item}); }); return [...map.values()]; };
const empty = {
  id:null, situacao:'pago_agora', descricao:'', categoria:'Equipamentos', valor:'', dataCompra:'', vencimento:'', parcelas:2,
  formaPagamento:'Pix', contaOrigem:'empresa', fornecedor:'', observacoes:'', projectId:'', clientId:'', profissional:'', servicoRealizado:'',
  dataServico:'', quantidade:'', previsaoEntrega:'', statusPedido:'Pendente', local:'', reembolsavel:false, vidaUtilMeses:60,
  origemRecursos:'', origemRecursosTipo:'receita_operacional', entradaOrigemId:'', origemRecursosDetalhes:'', composicaoRecursos:[],
};
const input = {width:'100%',padding:'11px 12px',borderRadius:8,border:'1px solid var(--border-color)',background:'var(--bg-main)',color:'var(--text-main)'};
const label = {display:'block',fontSize:'.72rem',fontWeight:700,color:'var(--text-secondary)',marginBottom:6};
const addMonths = (iso, months) => { const d=new Date(`${iso}T12:00:00`); d.setMonth(d.getMonth()+months); return d.toISOString().slice(0,10); };
const makeId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `sf-${Date.now()}-${Math.random().toString(16).slice(2)}`);
const newResourceLine = (origin='venda_patrimonio') => ({ id:makeId(), origemTipo:origin, entradaId:'', valor:'' });
const currencyToInput = (value) => maskCurrency(String(Math.round(Number(value||0)*100)));
const statusOf = (x) => {
  if (String(x.status||'').toLowerCase()==='cancelada') return 'cancelada';
  if (x.dataPagamento || x.data_pagamento || String(x.status||'').toLowerCase()==='pago') return 'paga';
  const due=x.vencimento||x.dataVencimento||x.data_vencimento;
  return due && due < new Date().toISOString().slice(0,10) ? 'vencida' : 'pendente';
};

export default function VariableExpenses(){
  const [items,setItems]=useState([]); const [projects,setProjects]=useState([]); const [clients,setClients]=useState([]);
  const [open,setOpen]=useState(false); const [form,setForm]=useState(empty); const [search,setSearch]=useState('');
  const load=()=>{
    const allFinances=readStorage(STORAGE_KEYS.finances,[]);
    const backupItems=readVariableBackup();
    const equipmentItems=readStorage(STORAGE_KEYS.equipment,[]);

    // Registros antigos e registros vindos do Supabase podem chegar com
    // tipoGeral=Saida, mas sem tipo=variavel. Eles continuam sendo despesas
    // variáveis e não podem ser descartados pelo filtro da tela.
    const financeItems=allFinances
      .filter(x=>(x.tipo==='variavel'||x.tipoGeral==='Saida'||x.tipo_geral==='Saida') && x.tipo!=='fixa')
      .map(x=>({...x,tipo:'variavel',tipoGeral:'Saida'}));

    const mergedBase=mergeById(financeItems,backupItems.map(x=>({...x,tipo:'variavel',tipoGeral:'Saida'})));
    const linkedKeys=new Set();
    mergedBase.forEach((item)=>{
      [item.patrimonioId,item.patrimonio_id,item.financeExpenseId,item.origemFinanceiraId,item.grupoParcelamentoId,item.id]
        .filter(Boolean)
        .forEach((value)=>linkedKeys.add(String(value)));
    });

    // Recupera compras feitas pelo Financeiro cujo patrimônio foi salvo, mas
    // cujo lançamento foi perdido pela sincronização antiga. O patrimônio é
    // reutilizado; nenhum equipamento novo é criado.
    const normalizeText=(value)=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    const hasEquivalentEquipmentExpense=(equipment)=>{
      const equipmentName=normalizeText(equipment.nome||equipment.modelo||'');
      const equipmentValue=Math.round(Number(equipment.valorCompra??equipment.valor??0)*100);
      const purchaseDate=String(equipment.dataCompra||'').slice(0,10);
      return mergedBase.some((expense)=>{
        if(normalizeText(expense.categoria)!=='equipamentos') return false;
        const expenseName=normalizeText(expense.descricao||expense.nome||'');
        const expenseValue=Math.round(Number(expense.valorTotal??expense.valor??0)*100);
        const expenseDate=String(expense.dataCompra||expense.dataPagamento||expense.data_pagamento||expense.data||'').slice(0,10);
        const sameLinkedId=[expense.patrimonioId,expense.patrimonio_id,expense.financeExpenseId,expense.origemFinanceiraId,expense.grupoParcelamentoId]
          .filter(Boolean).some((value)=>String(value)===String(equipment.id));
        const sameBusinessRecord=Boolean(equipmentName) && equipmentName===expenseName && equipmentValue===expenseValue && (!purchaseDate||!expenseDate||purchaseDate===expenseDate);
        return sameLinkedId||sameBusinessRecord;
      });
    };

    const recoveredFromEquipment=equipmentItems
      .filter((equipment)=>String(equipment?.origem||'').toLowerCase().startsWith('financeiro'))
      .filter((equipment)=>{
        const candidates=[equipment.id,equipment.financeExpenseId,equipment.origemFinanceiraId,equipment.grupoParcelamentoId];
        const hasExplicitLink=candidates.filter(Boolean).some((value)=>linkedKeys.has(String(value)));
        return !hasExplicitLink && !hasEquivalentEquipmentExpense(equipment);
      })
      .map((equipment)=>{
        const id=`recovered-equipment-expense-${equipment.id}`;
        return {
          id,
          tipo:'variavel',
          tipoGeral:'Saida',
          situacao:'pago_agora',
          descricao:equipment.nome||equipment.modelo||'Equipamento',
          categoria:'Equipamentos',
          valor:Number(equipment.valorCompra??equipment.valor??0),
          valorTotal:Number(equipment.valorCompra??equipment.valor??0),
          dataCompra:equipment.dataCompra||'',
          dataPagamento:equipment.dataCompra||'',
          vencimento:'',
          status:'Pago',
          formaPagamento:equipment.formaPagamento||'Não informado',
          contaOrigem:equipment.contaOrigem||'empresa',
          fornecedor:equipment.fornecedor||'',
          observacoes:equipment.observacoes||'',
          vidaUtilMeses:Number(equipment.vidaUtilMeses||Number(equipment.vidaUtilAnos||5)*12),
          patrimonioId:equipment.id,
          financeExpenseId:id,
          recuperadoDoPatrimonio:true,
          criadoEm:equipment.criadoEm||new Date().toISOString(),
          atualizadoEm:new Date().toISOString(),
        };
      });

    const merged=mergeById(mergedBase,recoveredFromEquipment);
    if(recoveredFromEquipment.length){
      writeVariableBackup(merged);
      writeStorage(STORAGE_KEYS.finances,mergeById(merged,allFinances));
      // Tenta reparar também o espelho oficial, sem bloquear a interface.
      void syncFinance(recoveredFromEquipment).catch((error)=>{
        console.warn('Não foi possível sincronizar despesas recuperadas:',error);
      });
    }

    setItems(merged);
    setProjects(readStorage(STORAGE_KEYS.projects,[]));
    setClients(readStorage(STORAGE_KEYS.clients,[]));
  };
  useEffect(()=>{load(); const fn=()=>load(); window.addEventListener('sf_storage_update',fn); return()=>window.removeEventListener('sf_storage_update',fn);},[]);
  const summary=useMemo(()=>{
    const now=new Date(), today=now.toISOString().slice(0,10), ym=today.slice(0,7); let paid=0,pending=0,overdue=0,forecast=0;
    const upcoming=[];
    items.forEach(x=>{ const st=statusOf(x), v=Number(x.valor||0), due=x.vencimento||x.dataVencimento||x.data_vencimento||''; if(st==='paga')paid+=v; if(st==='pendente'||st==='vencida')pending+=v; if(st==='vencida')overdue+=v; if(due.startsWith(ym)&&st!=='cancelada')forecast+=v; if(due>=today&&st==='pendente')upcoming.push(x); });
    upcoming.sort((a,b)=>String(a.vencimento||'').localeCompare(String(b.vencimento||'')));
    return {paid,pending,overdue,forecast,upcoming:upcoming.slice(0,5)};
  },[items]);
  const filtered=useMemo(()=>items.filter(x=>`${x.descricao} ${x.categoria} ${x.fornecedor}`.toLowerCase().includes(search.toLowerCase())),[items,search]);
  const fundingEntries=useMemo(()=>{
    const finances=readStorage(STORAGE_KEYS.finances,[]);
    return finances
      .filter((item)=>{
        const general=String(item.tipoGeral||item.tipo_geral||'').toLowerCase();
        const nature=String(item.naturezaFinanceira||item.natureza_financeira||'').toLowerCase();
        const category=String(item.categoria||'');
        return general==='entrada' && (nature==='nao_operacional'||nature==='não operacional'||Object.values(NON_OPERATIONAL_CATEGORY_BY_ORIGIN).includes(category));
      })
      .filter((item)=>{
        const status=String(item.status||'').toLowerCase();
        return status!=='cancelada' && (['recebida','recebido','pago'].includes(status)||Boolean(item.dataRecebimento||item.data_pagamento||item.dataPagamento));
      })
      .sort((a,b)=>String(b.dataRecebimento||b.data_pagamento||b.vencimento||b.data||'').localeCompare(String(a.dataRecebimento||a.data_pagamento||a.vencimento||a.data||'')));
  },[items,open]);
  const eligibleFundingEntries=useMemo(()=>{
    const wanted=NON_OPERATIONAL_CATEGORY_BY_ORIGIN[form.origemRecursosTipo];
    return wanted?fundingEntries.filter((item)=>item.categoria===wanted):fundingEntries;
  },[fundingEntries,form.origemRecursosTipo]);
  const openNew=()=>{setForm({...empty,dataCompra:new Date().toISOString().slice(0,10)});setOpen(true)};
  const edit=(x)=>{const storedComposition=Array.isArray(x.composicaoRecursos)?x.composicaoRecursos:(Array.isArray(x.detalhes?.composicaoRecursos)?x.detalhes.composicaoRecursos:[]);setForm({...empty,...x,valor:currencyToInput(x.valorTotal||x.valor),parcelas:x.totalParcelas||x.parcelas||2,composicaoRecursos:storedComposition.map((line)=>({...line,id:line.id||makeId(),valor:currencyToInput(line.valor)}))});setOpen(true)};
  const syncFinance=async(rows)=>{
    if(!isSupabaseConfigured) return { ok:true };
    for (const x of rows) {
      await upsertRow({
        table:'financas',
        payload:{
          id:String(x.id), project_id:x.projectId||null, client_id:x.clientId||null, descricao:x.descricao, categoria:x.categoria,
          valor:x.valor, data:x.dataCompra||x.vencimento, data_vencimento:x.vencimento||null,
          data_pagamento:x.dataPagamento||null, tipo:'variavel', tipo_geral:'Saida', status:x.status,
          forma_pagamento:x.formaPagamento, conta_origem:x.contaOrigem, fornecedor:x.fornecedor||null,
          observacoes:x.observacoes||null, detalhes:{
            situacao:x.situacao, valorTotal:x.valorTotal, grupoParcelamentoId:x.grupoParcelamentoId,
            parcelaNumero:x.parcelaNumero, totalParcelas:x.totalParcelas, profissional:x.profissional,
            servicoRealizado:x.servicoRealizado, dataServico:x.dataServico, quantidade:x.quantidade,
            previsaoEntrega:x.previsaoEntrega, statusPedido:x.statusPedido, local:x.local,
            reembolsavel:Boolean(x.reembolsavel), vidaUtilMeses:x.vidaUtilMeses, origemRecursos:x.origemRecursos,
            origemRecursosTipo:x.origemRecursosTipo||'', entradaOrigemId:x.entradaOrigemId||'', origemRecursosDetalhes:x.origemRecursosDetalhes||'', composicaoRecursos:Array.isArray(x.composicaoRecursos)?x.composicaoRecursos:[],
          },
          updated_at:new Date().toISOString(),
        },
      });
    }
    return { ok:true };
  };
  const save=async()=>{
    const total=parseCurrency(form.valor); if(!form.descricao.trim()||total<=0||!form.dataCompra){alert('Informe descrição, valor total e data da compra.');return;}
    const normalizedComposition=(Array.isArray(form.composicaoRecursos)?form.composicaoRecursos:[]).map((line)=>({
      ...line,
      valorNumero:parseCurrency(line.valor),
      entrada:fundingEntries.find((entry)=>String(entry.id)===String(line.entradaId)),
    }));
    if(form.categoria==='Equipamentos' && ['aporte_pessoal','venda_patrimonio','reembolso','emprestimo'].includes(form.origemRecursosTipo) && !form.entradaOrigemId){alert('Selecione a entrada que financiou esta compra.');return;}
    if(form.categoria==='Equipamentos' && form.origemRecursosTipo==='origem_mista'){
      if(normalizedComposition.length<2){alert('Adicione pelo menos duas fontes na composição dos recursos.');return;}
      const invalidLine=normalizedComposition.find((line)=>line.valorNumero<=0 || (line.origemTipo!=='receita_operacional' && line.origemTipo!=='reserva_acumulada' && !line.entradaId));
      if(invalidLine){alert('Preencha o valor e a entrada vinculada de cada fonte. Recursos operacionais e reserva não exigem entrada vinculada.');return;}
      const compositionTotal=normalizedComposition.reduce((sum,line)=>sum+line.valorNumero,0);
      if(Math.abs(compositionTotal-total)>0.01){alert(`A composição dos recursos deve totalizar ${formatCurrency(total)}. Total informado: ${formatCurrency(compositionTotal)}.`);return;}
    }
    if(form.situacao==='a_pagar'&&!form.vencimento){alert('Informe o vencimento.');return;}
    if(form.situacao==='parcelado'&&(!form.vencimento||Number(form.parcelas)<2)){alert('Informe o primeiro vencimento e ao menos 2 parcelas.');return;}
    const all=readStorage(STORAGE_KEYS.finances,[]); const oldGroup=form.grupoParcelamentoId||''; const cleaned=form.id?all.filter(x=>String(x.id)!==String(form.id)&&(!oldGroup||x.grupoParcelamentoId!==oldGroup)):all;
    const group=form.situacao==='parcelado'?(oldGroup||makeId()):''; const count=form.situacao==='parcelado'?Number(form.parcelas):1;
    const selectedFunding=fundingEntries.find((item)=>String(item.id)===String(form.entradaOrigemId));
    const resourceLabel=RESOURCE_ORIGINS.find(([value])=>value===form.origemRecursosTipo)?.[1]||'Receita operacional da empresa';
    const compositionPayload=form.origemRecursosTipo==='origem_mista'
      ? normalizedComposition.map((line)=>({
          id:line.id||makeId(),
          origemTipo:line.origemTipo,
          origemLabel:RESOURCE_ORIGINS.find(([value])=>value===line.origemTipo)?.[1]||line.origemTipo,
          entradaId:line.entradaId||'',
          entradaDescricao:line.entrada?.descricao||line.entrada?.categoria||'',
          valor:line.valorNumero,
        }))
      : [];
    const resourceDescription=form.origemRecursosTipo==='origem_mista'
      ? compositionPayload.map((line)=>`${line.origemLabel}${line.entradaDescricao?` · ${line.entradaDescricao}`:''}: ${formatCurrency(line.valor)}`).join(' + ')
      : selectedFunding
        ? `${resourceLabel}: ${selectedFunding.descricao||selectedFunding.categoria} (${formatCurrency(selectedFunding.valor)})`
        : resourceLabel;
    const baseId=form.id||makeId(); const rows=Array.from({length:count},(_,i)=>({
      ...form,origemRecursos:resourceDescription,composicaoRecursos:compositionPayload,id:count===1?baseId:`${group}-${i+1}`,tipo:'variavel',tipoGeral:'Saida',valor:Math.round((total/count)*100)/100,valorTotal:total,
      grupoParcelamentoId:group,parcelaNumero:i+1,totalParcelas:count,vencimento:form.situacao==='pago_agora'?'':(i?addMonths(form.vencimento,i):form.vencimento),
      dataPagamento:form.situacao==='pago_agora'?form.dataCompra:'',status:form.situacao==='pago_agora'?'Pago':'Pendente',criadoEm:form.criadoEm||new Date().toISOString(),atualizadoEm:new Date().toISOString(),
    }));
    const nextFinances=[...rows,...cleaned];
    const backupCleaned=form.id?readVariableBackup().filter(x=>String(x.id)!==String(form.id)&&(!oldGroup||x.grupoParcelamentoId!==oldGroup)):readVariableBackup();
    const nextVariableBackup=mergeById(rows,backupCleaned).filter(x=>x.tipo==='variavel');
    let nextEquipment=readStorage(STORAGE_KEYS.equipment,[]);
    if(form.categoria==='Equipamentos'){
      const financeKey=group||baseId;
      const existing=nextEquipment.find(x=>x.financeExpenseId===financeKey||x.origemFinanceiraId===financeKey);
      const equipment={
        ...(existing||{}), id:existing?.id||makeId(), nome:form.descricao, categoria:existing?.categoria||'Câmera',
        status:existing?.status||'Ativo', valor:total, valorCompra:total, dataCompra:form.dataCompra,
        fornecedor:form.fornecedor, observacoes:form.observacoes, vidaUtilAnos:Number(form.vidaUtilMeses||60)/12,
        vidaUtilMeses:Number(form.vidaUtilMeses||60), financeExpenseId:financeKey, origemFinanceiraId:financeKey,
        expenseIds:rows.map(row=>row.id), grupoParcelamentoId:group||'', origemRecursos:resourceDescription,
        origemRecursosTipo:form.origemRecursosTipo||'receita_operacional', entradaOrigemId:form.entradaOrigemId||'',
        origemRecursosDetalhes:form.origemRecursosDetalhes||'', composicaoRecursos:compositionPayload,
        origem:'financeiro', criadoEm:existing?.criadoEm||new Date().toISOString(), atualizadoEm:new Date().toISOString(),
      };
      nextEquipment=existing?nextEquipment.map(x=>x.id===existing.id?equipment:x):[equipment,...nextEquipment];
    }
    try {
      writeStorage(STORAGE_KEYS.finances,nextFinances);
      writeVariableBackup(nextVariableBackup);
      writeStorage(STORAGE_KEYS.equipment,nextEquipment);
      await syncFinance(rows);
      if(form.categoria==='Equipamentos') {
        await syncEquipmentList(nextEquipment);
        writeStorage(STORAGE_KEYS.equipment,nextEquipment);
      }
      writeStorage(STORAGE_KEYS.finances,mergeById(nextFinances,readStorage(STORAGE_KEYS.finances,[])));
      writeVariableBackup(nextVariableBackup);
      window.dispatchEvent(new Event('sf_storage_update'));
      setOpen(false);
      load();
    } catch(error) {
      console.error('Erro ao salvar despesa e patrimônio:',error);
      alert('Não foi possível concluir a sincronização. O cadastro foi mantido neste navegador para não perder seus dados.');
      window.dispatchEvent(new Event('sf_storage_update'));
      setOpen(false);
      load();
    }
  };
  const remove=(x)=>{if(!confirm('Excluir este lançamento? Em compras parceladas, somente esta parcela será removida.'))return; const all=readStorage(STORAGE_KEYS.finances,[]).filter(i=>String(i.id)!==String(x.id));writeStorage(STORAGE_KEYS.finances,all);writeVariableBackup(readVariableBackup().filter(i=>String(i.id)!==String(x.id)));window.dispatchEvent(new Event('sf_storage_update'));load();};
  return <div className="sf-finance-section sf-variable-expenses">
    <div className="sf-variable-header"><div><span className="sf-variable-eyebrow">Controle de custos</span><h1>Despesas Variáveis</h1><p>Compras, serviços e custos ligados aos trabalhos, com pagamento imediato, vencimento ou parcelamento.</p></div><button className="sf-primary-button sf-new-expense-button" onClick={openNew}><Plus size={18}/>Nova despesa</button></div>
    <div className="sf-variable-metrics"><Metric icon={CheckCircle2} label="Total pago" value={summary.paid}/><Metric icon={Clock3} label="Total pendente" value={summary.pending}/><Metric icon={AlertTriangle} label="Total vencido" value={summary.overdue}/><Metric icon={CalendarClock} label="Previsão do mês" value={summary.forecast}/></div>
    {summary.upcoming.length>0&&<div className="sf-alert warning"><CalendarClock size={19}/><span><strong>Próximos vencimentos:</strong> {summary.upcoming.map(x=>`${x.descricao} (${new Date(`${x.vencimento}T12:00:00`).toLocaleDateString('pt-BR')})`).join(' · ')}</span></div>}
    <label className="sf-variable-search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar despesa..." style={{background:'transparent',border:0,outline:0,color:'inherit',width:'100%'}}/></label>
    <div className="sf-table-card sf-variable-table-card"><table className="sf-table sf-variable-table"><thead><tr><th>Despesa</th><th>Situação</th><th>Vencimento/Pagamento</th><th>Parcela</th><th>Valor</th><th>Ações</th></tr></thead><tbody>{filtered.map(x=><tr key={x.id}><td data-label="Despesa"><strong>{x.descricao}</strong><small>{x.categoria}{x.fornecedor?` · ${x.fornecedor}`:''}</small></td><td data-label="Situação"><span className={`sf-status ${statusOf(x)}`}>{statusOf(x)}</span></td><td data-label="Data">{x.dataPagamento||x.vencimento?new Date(`${x.dataPagamento||x.vencimento}T12:00:00`).toLocaleDateString('pt-BR'):'-'}</td><td data-label="Parcela">{x.totalParcelas>1?`${x.parcelaNumero}/${x.totalParcelas}`:'Única'}</td><td data-label="Valor">{formatCurrency(x.valor)}</td><td data-label="Ações"><div className="sf-actions"><button className="sf-icon-button" onClick={()=>edit(x)}><Edit2 size={16}/></button><button className="sf-icon-button" onClick={()=>remove(x)}><Trash2 size={16}/></button></div></td></tr>)}</tbody></table></div>
    <Modal isOpen={open} onClose={()=>setOpen(false)} title={form.id?'Editar despesa variável':'Nova despesa variável'}><div style={{display:'grid',gap:16}}>
      <div><span style={label}>Situação</span><div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:8}}>{[['pago_agora','Pago agora'],['a_pagar','A pagar'],['parcelado','Parcelado']].map(([v,t])=><button key={v} type="button" className={form.situacao===v?'sf-primary-button':'sf-secondary-button'} onClick={()=>setForm({...form,situacao:v})}>{t}</button>)}</div></div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:12}}><Field t="Descrição"><input style={input} value={form.descricao} onChange={e=>setForm({...form,descricao:e.target.value})}/></Field><Field t="Categoria"><select style={input} value={form.categoria} onChange={e=>setForm({...form,categoria:e.target.value})}>{CATEGORIES.map(x=><option key={x}>{x}</option>)}</select></Field><Field t="Valor total"><input style={input} value={form.valor} onChange={e=>setForm({...form,valor:maskCurrency(e.target.value)})} placeholder="R$ 0,00"/></Field><Field t="Data da compra/serviço"><input type="date" style={input} value={form.dataCompra} onChange={e=>setForm({...form,dataCompra:e.target.value})}/></Field><Field t="Forma de pagamento"><select style={input} value={form.formaPagamento} onChange={e=>setForm({...form,formaPagamento:e.target.value})}>{[...IMMEDIATE_METHODS,'Crédito','Boleto','Outro'].map(x=><option key={x}>{x}</option>)}</select></Field><Field t="Conta de origem"><select style={input} value={form.contaOrigem} onChange={e=>setForm({...form,contaOrigem:e.target.value})}><option value="empresa">Empresa</option><option value="salario">Salário/Pessoal</option><option value="reserva">Reserva</option></select></Field>
      {form.situacao!=='pago_agora'&&<Field t={form.situacao==='parcelado'?'Primeiro vencimento':'Vencimento'}><input type="date" style={input} value={form.vencimento} onChange={e=>setForm({...form,vencimento:e.target.value})}/></Field>}{form.situacao==='parcelado'&&<Field t="Quantidade de parcelas"><input type="number" min="2" style={input} value={form.parcelas} onChange={e=>setForm({...form,parcelas:e.target.value})}/></Field>}</div>
      {form.categoria==='Equipamentos'&&<CategoryBox title="Equipamento e patrimônio"><Grid><Field t="Fornecedor"><input style={input} value={form.fornecedor} onChange={e=>setForm({...form,fornecedor:e.target.value})}/></Field><Field t="Vida útil (meses)"><input type="number" min="1" style={input} value={form.vidaUtilMeses} onChange={e=>setForm({...form,vidaUtilMeses:e.target.value})}/></Field><Field t="Origem dos recursos"><select style={input} value={form.origemRecursosTipo} onChange={e=>setForm({...form,origemRecursosTipo:e.target.value,entradaOrigemId:'',origemRecursosDetalhes:'',composicaoRecursos:e.target.value==='origem_mista'?[newResourceLine('venda_patrimonio'),newResourceLine('receita_operacional')]:[]})}>{RESOURCE_ORIGINS.map(([value,text])=><option key={value} value={value}>{text}</option>)}</select></Field>{['aporte_pessoal','venda_patrimonio','reembolso','emprestimo'].includes(form.origemRecursosTipo)&&<Field t="Entrada vinculada"><select style={input} value={form.entradaOrigemId} onChange={e=>setForm({...form,entradaOrigemId:e.target.value})}><option value="">Selecione a entrada</option>{eligibleFundingEntries.map(entry=><option key={entry.id} value={entry.id}>{entry.descricao||entry.categoria} · {formatCurrency(entry.valor)}</option>)}</select></Field>}</Grid>{form.origemRecursosTipo==='origem_mista'&&<div style={{display:'grid',gap:10}}><div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}><strong style={{fontSize:'.9rem'}}>Composição dos recursos</strong><button type="button" className="sf-secondary-button" onClick={()=>setForm({...form,composicaoRecursos:[...(form.composicaoRecursos||[]),newResourceLine('aporte_pessoal')]})}><Plus size={15}/>Adicionar fonte</button></div>{(form.composicaoRecursos||[]).map((line,index)=>{const requiresEntry=!['receita_operacional','reserva_acumulada'].includes(line.origemTipo);const wanted=NON_OPERATIONAL_CATEGORY_BY_ORIGIN[line.origemTipo];const options=wanted?fundingEntries.filter((entry)=>entry.categoria===wanted):fundingEntries;return <div key={line.id||index} style={{display:'grid',gridTemplateColumns:'minmax(150px,1fr) minmax(170px,1.35fr) minmax(130px,.7fr) auto',gap:8,alignItems:'end',padding:10,border:'1px solid var(--border-color)',borderRadius:9}}><Field t="Origem"><select style={input} value={line.origemTipo} onChange={e=>setForm({...form,composicaoRecursos:form.composicaoRecursos.map((item,i)=>i===index?{...item,origemTipo:e.target.value,entradaId:''}:item)})}>{RESOURCE_ORIGINS.filter(([value])=>value!=='origem_mista').map(([value,text])=><option key={value} value={value}>{text}</option>)}</select></Field><Field t="Entrada vinculada"><select style={input} value={line.entradaId||''} disabled={!requiresEntry} onChange={e=>setForm({...form,composicaoRecursos:form.composicaoRecursos.map((item,i)=>i===index?{...item,entradaId:e.target.value}:item)})}><option value="">{requiresEntry?'Selecione a entrada':'Não se aplica'}</option>{options.map(entry=><option key={entry.id} value={entry.id}>{entry.descricao||entry.categoria} · {formatCurrency(entry.valor)}</option>)}</select></Field><Field t="Valor usado"><input style={input} value={line.valor||''} onChange={e=>setForm({...form,composicaoRecursos:form.composicaoRecursos.map((item,i)=>i===index?{...item,valor:maskCurrency(e.target.value)}:item)})} placeholder="R$ 0,00"/></Field><button type="button" className="sf-icon-button" aria-label="Remover fonte" disabled={(form.composicaoRecursos||[]).length<=2} onClick={()=>setForm({...form,composicaoRecursos:form.composicaoRecursos.filter((_,i)=>i!==index)})}><X size={16}/></button></div>})}<div className="sf-alert info"><span>Total da composição: <strong>{formatCurrency((form.composicaoRecursos||[]).reduce((sum,line)=>sum+parseCurrency(line.valor),0))}</strong> de <strong>{formatCurrency(parseCurrency(form.valor))}</strong></span></div></div>}<small>A conta de origem informa de onde o pagamento saiu. A origem dos recursos informa de onde esse dinheiro veio. Será criado um único patrimônio, mesmo em compra parcelada.</small></CategoryBox>}
      {form.categoria==='Freelancer'&&<CategoryBox title="Dados do freelancer"><Grid><Field t="Profissional"><input style={input} value={form.profissional} onChange={e=>setForm({...form,profissional:e.target.value})}/></Field><Field t="Serviço realizado"><input style={input} value={form.servicoRealizado} onChange={e=>setForm({...form,servicoRealizado:e.target.value})}/></Field><Field t="Trabalho vinculado"><select style={input} value={form.projectId} onChange={e=>setForm({...form,projectId:e.target.value})}><option value="">Sem vínculo</option>{projects.map(p=><option key={p.id} value={p.id}>{p.clienteNome||p.titulo||'Trabalho'}</option>)}</select></Field><Field t="Data do serviço"><input type="date" style={input} value={form.dataServico} onChange={e=>setForm({...form,dataServico:e.target.value})}/></Field></Grid></CategoryBox>}
      {['Álbum','Impressão','Materiais'].includes(form.categoria)&&<CategoryBox title="Pedido e produção"><Grid><Field t="Cliente"><select style={input} value={form.clientId} onChange={e=>setForm({...form,clientId:e.target.value})}><option value="">Selecione</option>{clients.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></Field><Field t="Trabalho"><select style={input} value={form.projectId} onChange={e=>setForm({...form,projectId:e.target.value})}><option value="">Sem vínculo</option>{projects.map(p=><option key={p.id} value={p.id}>{p.clienteNome||p.titulo||'Trabalho'}</option>)}</select></Field><Field t="Fornecedor"><input style={input} value={form.fornecedor} onChange={e=>setForm({...form,fornecedor:e.target.value})}/></Field><Field t="Quantidade"><input type="number" style={input} value={form.quantidade} onChange={e=>setForm({...form,quantidade:e.target.value})}/></Field><Field t="Previsão de entrega"><input type="date" style={input} value={form.previsaoEntrega} onChange={e=>setForm({...form,previsaoEntrega:e.target.value})}/></Field><Field t="Status do pedido"><select style={input} value={form.statusPedido} onChange={e=>setForm({...form,statusPedido:e.target.value})}><option>Pendente</option><option>Em produção</option><option>Enviado</option><option>Entregue</option></select></Field></Grid></CategoryBox>}
      {['Transporte','Hospedagem','Alimentação em trabalho'].includes(form.categoria)&&<CategoryBox title="Custo do trabalho"><Grid><Field t="Trabalho relacionado"><select style={input} value={form.projectId} onChange={e=>setForm({...form,projectId:e.target.value})}><option value="">Sem vínculo</option>{projects.map(p=><option key={p.id} value={p.id}>{p.clienteNome||p.titulo||'Trabalho'}</option>)}</select></Field><Field t="Local"><input style={input} value={form.local} onChange={e=>setForm({...form,local:e.target.value})}/></Field></Grid><label style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" checked={form.reembolsavel} onChange={e=>setForm({...form,reembolsavel:e.target.checked})}/>Pode ser reembolsado</label></CategoryBox>}
      <Field t="Observações"><textarea style={{...input,minHeight:90}} value={form.observacoes} onChange={e=>setForm({...form,observacoes:e.target.value})}/></Field><button className="sf-primary-button" onClick={save}>Salvar despesa</button>
    </div></Modal>
  </div>;
}
const Field=({t,children})=><label><span style={label}>{t}</span>{children}</label>;
const Grid=({children})=><div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:12}}>{children}</div>;
const CategoryBox=({title,children})=><div style={{padding:14,border:'1px solid var(--border-color)',borderRadius:10,display:'grid',gap:10}}><strong>{title}</strong>{children}</div>;
const Metric=({icon:Icon,label:valueLabel,value})=><div className="sf-metric-card"><div className="sf-metric-icon"><Icon size={18}/></div><span>{valueLabel}</span><strong>{formatCurrency(value)}</strong></div>;
