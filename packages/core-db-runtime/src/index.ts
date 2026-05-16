import { createClient } from '@supabase/supabase-js';
let _mkt:any=null, _ai:any=null;
export function mkt():any { if(!_mkt) _mkt=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_KEY!,{db:{schema:'marketing'}}); return _mkt; }
export function coreAi():any { if(!_ai) _ai=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_KEY!,{db:{schema:'core_ai'}}); return _ai; }

export async function insertContent(d:any) { const {data,error}=await mkt().from('contents').insert(d).select().single(); if(error) throw error; return data; }
export async function insertDraft(d:any) { const {data,error}=await mkt().from('drafts').insert({...d,status:d.status??'draft'}).select().single(); if(error) throw error; return data; }
export async function updateDraft(id:string,u:any) { const {data,error}=await mkt().from('drafts').update({...u,updated_at:new Date().toISOString()}).eq('id',id).select().single(); if(error) throw error; return data; }
export async function getDraftById(id:string) { const {data,error}=await mkt().from('drafts').select('*').eq('id',id).single(); if(error) throw error; return data; }
export async function insertApprovalRequest(d:any) { const {data,error}=await mkt().from('approval_requests').insert({...d,transport:'slack',status:'pending'}).select().single(); if(error) throw error; return data; }
export async function updateApprovalStatus(id:string,status:string,by?:string,reason?:string) { const {data,error}=await mkt().from('approval_requests').update({status,approved_by:by,reason,updated_at:new Date().toISOString()}).eq('id',id).select().single(); if(error) throw error; return data; }
export async function insertAnalyticsEvent(d:any) { const {data,error}=await mkt().from('analytics_events').insert(d).select().single(); if(error) throw error; return data; }
export async function insertLead(d:any) { const {data,error}=await mkt().from('leads').insert({...d,lead_status:'new'}).select().single(); if(error) throw error; return data; }
export async function insertUsageLog(d:any) { const {data,error}=await coreAi().from('ai_usage_log').insert(d).select().single(); if(error) throw error; return data; }