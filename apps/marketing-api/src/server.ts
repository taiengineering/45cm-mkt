import Fastify from 'fastify';
import cors from '@fastify/cors';
import { v4 as uuid } from 'uuid';
import { enqueue, MARKETING_QUEUES, debugRedis, getQueue } from '@45cm/core-queue-runtime';
import { aiGenerate, debugOpenAI } from '@45cm/core-ai-runtime';
import { insertDraft, updateDraft, getDraftById, insertApprovalRequest, updateApprovalStatus, insertContent, insertAnalyticsEvent, insertLead, insertUsageLog, mkt, coreAi } from '@45cm/core-db-runtime';
import { collect } from '@45cm/channel-naver-kin';

const app = Fastify({ logger: true });
app.register(cors, { origin: true });

// ====== Health + Debug ======
app.get('/health', async () => ({ status:'healthy', engine:'marketing-engine', v:'0.2.0', ts:new Date().toISOString() }));
app.get('/debug/openai', async (_req, reply) => reply.send(await debugOpenAI()));
app.get('/debug/redis', async (_req, reply) => reply.send(await debugRedis()));

// ====== Console APIs ======
app.get<{Querystring:{ws?:string;status?:string;limit?:string}}>('/drafts', async (req, reply) => {
  const ws = req.query.ws ?? 'a0000000-0000-0000-0000-000000000001';
  const limit = parseInt(req.query.limit ?? '50', 10);
  let q = mkt().from('drafts').select('*').eq('workspace_id', ws).order('created_at', { ascending: false }).limit(limit);
  if (req.query.status) q = q.eq('status', req.query.status);
  const { data, error } = await q;
  if (error) return reply.status(500).send({ error: error.message });
  return reply.send(data ?? []);
});

app.get<{Querystring:{ws?:string}}>('/analytics/summary', async (req, reply) => {
  const ws = req.query.ws ?? 'a0000000-0000-0000-0000-000000000001';
  const [drafts, clicks, leads, usage] = await Promise.all([
    mkt().from('drafts').select('status', { count: 'exact', head: true }).eq('workspace_id', ws),
    mkt().from('analytics_events').select('*', { count: 'exact', head: true }).eq('workspace_id', ws).eq('event_type', 'cta.clicked'),
    mkt().from('leads').select('*', { count: 'exact', head: true }).eq('workspace_id', ws),
    coreAi().from('ai_usage_log').select('estimated_cost_usd').eq('workspace_id', ws),
  ]);
  const totalCost = (usage.data ?? []).reduce((s: number, r: any) => s + (r.estimated_cost_usd ?? 0), 0);
  return reply.send({ drafts: drafts.count ?? 0, cta_clicks: clicks.count ?? 0, leads: leads.count ?? 0, ai_cost_usd: Math.round(totalCost * 1e6) / 1e6 });
});

app.get<{Querystring:{ws?:string;limit?:string}}>('/analytics/events', async (req, reply) => {
  const ws = req.query.ws ?? 'a0000000-0000-0000-0000-000000000001';
  const { data, error } = await mkt().from('analytics_events').select('*').eq('workspace_id', ws).order('created_at', { ascending: false }).limit(parseInt(req.query.limit ?? '20', 10));
  if (error) return reply.status(500).send({ error: error.message });
  return reply.send(data ?? []);
});

// ====== Queue Observability ======
app.get('/ops/queues', async (_req, reply) => {
  const names = [MARKETING_QUEUES.DRAFT, MARKETING_QUEUES.HUMANIZE, MARKETING_QUEUES.COLLECT, MARKETING_QUEUES.CLASSIFY, MARKETING_QUEUES.APPROVAL, MARKETING_QUEUES.PUBLISH];
  const result: Record<string, unknown> = {};
  for (const name of names) {
    try {
      const q = getQueue(name);
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        q.getWaitingCount(), q.getActiveCount(), q.getCompletedCount(), q.getFailedCount(), q.getDelayedCount(),
      ]);
      result[name] = { waiting, active, completed, failed, delayed };
    } catch (e: any) { result[name] = { error: e.message }; }
  }
  return reply.send({ ts: new Date().toISOString(), queues: result });
});

// ====== Draft Generate ======
app.post<{Body:{workspaceId:string;input:string;contentId?:string;brandVoice?:string}}>('/draft/generate', async (req, reply) => {
  const {workspaceId,input,contentId,brandVoice}=req.body;
  if(!workspaceId||!input) return reply.status(400).send({error:'workspaceId and input required'});
  const traceId=uuid();
  let ai;
  try { ai = await aiGenerate({workspaceId,engine:'marketing',capability:'marketing.generate_draft',input,context:{trace_id:traceId}}); }
  catch(err:any) {
    const status = err.status ?? 'failed';
    try { const draft = await insertDraft({workspace_id:workspaceId,source_content_id:contentId,draft_type:'reply',body:'',status,metadata:{trace_id:traceId,error:err.message}}); return reply.status(502).send({error:'OpenAI '+status,message:err.message,draft_id:draft.id,trace_id:traceId}); }
    catch(_) { return reply.status(502).send({error:'OpenAI '+status,message:err.message,trace_id:traceId}); }
  }
  const log=await insertUsageLog({workspace_id:workspaceId,engine:'marketing',capability:'marketing.generate_draft',provider:'openai',model:ai.model,prompt_tokens:ai.usage.promptTokens,completion_tokens:ai.usage.completionTokens,estimated_cost_usd:ai.usage.estimatedCostUsd,latency_ms:ai.latencyMs,status:'success',trace_id:traceId});
  const draft=await insertDraft({workspace_id:workspaceId,source_content_id:contentId,draft_type:'reply',body:ai.output,ai_usage_log_id:log.id,metadata:{trace_id:traceId}});
  let queued = false;
  try { await enqueue(MARKETING_QUEUES.HUMANIZE,'humanize',{workspace_id:workspaceId,draft_id:draft.id,body:ai.output,trace_id:traceId,brand_voice:brandVoice??'tai'}); queued = true; }
  catch(e:any) { console.error(JSON.stringify({level:'error',msg:'enqueue.failed',error:e.message,trace_id:traceId})); }
  return reply.status(201).send({draft_id:draft.id,trace_id:traceId,model:ai.model,cost_usd:ai.usage.estimatedCostUsd,queued});
});

// ====== Collect ======
app.post<{Body:{workspaceId:string;keyword:string;maxResults?:number}}>('/collect', async (req, reply) => {
  const {workspaceId,keyword,maxResults}=req.body;
  if(!workspaceId||!keyword) return reply.status(400).send({error:'required'});
  const items=await collect({workspaceId,keyword,maxResults});
  const saved=[];
  for(const i of items) { saved.push(await insertContent({workspace_id:workspaceId,source:i.source,external_id:i.externalId,content_type:'question',title:i.title,body:i.body,url:i.url,raw_payload:i.rawPayload,collected_at:i.collectedAt})); }
  return reply.send({keyword,collected:saved.length,contents:saved});
});

// ====== Approval ======
app.post<{Body:{workspaceId:string;draftId:string;keyword?:string;channel?:string}}>('/approval/request', async (req, reply) => {
  const {workspaceId,draftId,keyword,channel}=req.body;
  if(!workspaceId||!draftId) return reply.status(400).send({error:'required'});
  const draft=await getDraftById(draftId) as any;
  await updateDraft(draftId,{status:'pending_approval'});
  const approval=await insertApprovalRequest({workspace_id:workspaceId,draft_id:draftId});
  const body=draft.humanized_body??draft.body??'';
  const preview=body.length>500?body.slice(0,500)+'...':body;
  const slk=process.env.SLACK_BOT_TOKEN, ch=process.env.SLACK_CHANNEL_ID;
  if(slk&&ch) { await fetch('https://slack.com/api/chat.postMessage',{method:'POST',headers:{Authorization:'Bearer '+slk,'Content-Type':'application/json'},body:JSON.stringify({channel:ch,text:'Draft approval: '+draftId,blocks:[{type:'header',text:{type:'plain_text',text:'\ud83d\udcdd Draft Approval Request'}},{type:'section',fields:[{type:'mrkdwn',text:'*Keyword:* '+(keyword??'N/A')},{type:'mrkdwn',text:'*Channel:* '+(channel??'naver_kin')},{type:'mrkdwn',text:'*Type:* '+draft.draft_type},{type:'mrkdwn',text:'*Created:* '+draft.created_at}]},{type:'section',text:{type:'mrkdwn',text:'```'+preview+'```'}},{type:'actions',elements:[{type:'button',text:{type:'plain_text',text:'\u2705 Approve'},style:'primary',action_id:'approve_draft',value:'approve:'+approval.id},{type:'button',text:{type:'plain_text',text:'\u274c Reject'},style:'danger',action_id:'reject_draft',value:'reject:'+approval.id},{type:'button',text:{type:'plain_text',text:'\u270f\ufe0f Edit'},action_id:'edit_draft',value:'edit:'+approval.id}]}]})}); }
  return reply.send({approval_id:approval.id,status:'pending'});
});

app.post('/approval/callback', async (req, reply) => {
  const p=typeof req.body==='string'?JSON.parse(req.body):(req.body as any)?.payload?JSON.parse((req.body as any).payload):req.body;
  const a=p?.actions?.[0]; if(!a) return reply.status(400).send({error:'no action'});
  const [cmd,id]=(a.value??'').split(':'); if(!id) return reply.status(400).send({error:'bad value'});
  const m: Record<string,string> = {approve:'approved',reject:'rejected',edit:'edit_requested'};
  await updateApprovalStatus(id, m[cmd]??'rejected', p?.user?.id);
  return reply.send({text:cmd+' applied.'});
});

// ====== CTA ======
app.get<{Params:{ctaId:string};Querystring:{ws?:string;ref?:string;trace?:string}}>('/c/:ctaId', async (req, reply) => {
  const {ctaId}=req.params, ws=req.query.ws??'unknown';
  await insertAnalyticsEvent({workspace_id:ws,event_type:'cta.clicked',subject_type:'cta',subject_id:ctaId,metadata:{ref:req.query.ref,ip:req.ip,ua:req.headers['user-agent'],trace_id:req.query.trace,referrer:req.headers.referer}});
  if(req.query.ref) await insertLead({workspace_id:ws,source:'cta_click',source_ref_id:ctaId,metadata:{ref:req.query.ref}});
  return reply.redirect(302,'https://taieng.co.kr/diagnosis?utm_source=45cm&utm_medium=cta&utm_campaign='+ctaId);
});

const port=parseInt(process.env.PORT??'3100',10);
app.listen({port,host:'0.0.0.0'}).then(()=>console.log(JSON.stringify({level:'info',msg:'api.started',port,version:'0.2.0'})));