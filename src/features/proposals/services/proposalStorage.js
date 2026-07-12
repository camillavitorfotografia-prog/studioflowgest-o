import { createId,readStorage,writeStorage } from '../../../utils/storage';
import { FINANCE_STORAGE_KEYS } from '../../../utils/financeEngine';
export const PROPOSALS_KEY='cv_studio_proposals';
export const capturePricingSnapshot=()=>({id:`pricing-${Date.now()}`,state:readStorage(FINANCE_STORAGE_KEYS.pricing,{}),config:readStorage(FINANCE_STORAGE_KEYS.pricingConfig,{}),capturedAt:new Date().toISOString()});
export const loadProposals=()=>readStorage(PROPOSALS_KEY,[]);
export const saveProposal=(proposal)=>{const items=loadProposals();const record={...proposal,id:proposal.id||createId('proposal'),updatedAt:new Date().toISOString(),createdAt:proposal.createdAt||new Date().toISOString()};writeStorage(PROPOSALS_KEY,proposal.id?items.map((item)=>item.id===proposal.id?record:item):[record,...items]);return record};
