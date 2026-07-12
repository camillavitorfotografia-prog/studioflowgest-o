export const CONTRACT_MODELS = [
  { id:'contrato-casamento-2026',type:'casamento',name:'Contrato de Casamento',version:'2026.1',pages:16,hasAttachments:true,sourceUrl:'/contracts/contrato-casamento-2026.pdf',specificFields:['noivos','cerimonia','recepcao','makingOf','preWedding','cobertura','equipe','fotosEssenciais','cronograma','cerimonial','deslocamento','hospedagem','alimentacao'] },
  { id:'contrato-formatura-2026',type:'formatura',name:'Contrato de Formatura',version:'2026.1',pages:12,hasAttachments:false,sourceUrl:'/contracts/contrato-formatura-2026.pdf',specificFields:['instituicao','curso','turma','representante','alunos','ensaio','colacao','duracao','horaExtra','fotosPorAluno','eventoColetivo'] },
  { id:'contrato-ensaio-2026',type:'ensaio',name:'Contrato de Ensaio',version:'2026.1',pages:12,hasAttachments:false,sourceUrl:'/contracts/contrato-ensaio-2026.pdf',specificFields:['tipoEnsaio','participantes','duracao','quantidadeFotos','fotosExtras','local','reagendamento','acompanhantes','albumImpressos'] },
];

export const suggestContractModel = (service='') => {
  const value=service.toLowerCase();
  if(value.includes('formatura'))return CONTRACT_MODELS[1];
  if(value.includes('ensaio'))return CONTRACT_MODELS[2];
  return CONTRACT_MODELS[0];
};
