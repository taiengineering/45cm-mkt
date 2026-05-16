import Fastify from 'fastify';
import { v4 as uuid } from 'uuid';
import { enqueue, MARKETING_QUEUES, debugRedis } from '@45cm/core-queue-runtime';
import { aiGenerate, debugOpenAI } from '@45cm/core-ai-runtime';
import { insertDraft, updateDraft, getDraftById, insertApprovalRequest, updateApprovalStatus, insertContent, insertAnalyticsEvent, insertLead, insertUsageLog } from '@45cm/core-db-runtime';
import { collect } from '@45cm/channel-naver-kin';

const app = Fastify({ logger: true });

app.get('/health', async () => ({ status:'healthy', engine:'marketing-engine', v:'0.1.0', ts:new Date().toISOString() }));
app.get('/debug/openai', async (_req, reply) => reply.send(await debugOpenAI()));
app.get('/debug/redis', async (_req, reply) => reply.send(await debugRedis()));

app.post<{Body:{workspaceId:string;input:string;contentId?:string}}>('/draft/generate', async (req, reply) => {
  const {workspaceId,input,contentId}=req.body;
  if(!workspaceId||!input) return reply.status(400).send({error:'workspaceId and input required'});
  const traceId=uuid();

  let ai;
  try {
    ai = await aiGenerate({workspaceId,engine:'marketing',capability:'marketing.generate_draft',input,context:{trace_id:traceId}});
  } catch(err:any) {
    const status = err.status ?? 'failed';
    try {
      const draft = await insertDraft({workspace_id:workspaceId,source_content_id:contentId,draft_type:'reply',body:'',status,metadata:{trace_id:traceId,error:err.message}});
      return reply.status(502).send({error:'OpenAI '+status,message:err.message,draft_id:draft.id,trace_id:traceId});
    } catch(_) { return reply.status(502).send({error:'OpenAI '+status,message:err.message,trace_id:traceId}); }
  }

  const log=await insertUsageLog({workspace_id:workspaceId,engine:'marketing',capability:'marketing.generate_draft',provider:'openai',model:ai.model,prompt_tokens:ai.usage.promptTokens,completion_tokens:ai.usage.completionTokens,estimated_cost_usd:ai.usage.estimatedCostUsd,latency_ms:ai.latencyMs,status:'success',trace_id:traceId});
  const draft=await insertDraft({workspace_id:workspaceId,source_content_id:contentId,draft_type:'reply',body:ai.output,ai_usage_log_id:log.id,metadata:{trace_id:traceId}});

  // Enqueue with timeout — don't block API response
  let queued = false;
  try {
    await enqueue(MARKETING_QUEUES.HUMANIZE,'humanize',{workspace_id:workspaceId,draft_id:draft.id,body:ai.output,trace_id:traceId});
    queued = true;
  } catch(e:any) {
    console.error(JSON.stringify({level:'error',msg:'enqueue.failed',queue:MARKETING_QUEUES.HUMANIZE,error:e.message,trace_id:traceId}));
  }

  return reply.status(201).send({draft_id:draft.id,trace_id:traceId,model:ai.model,cost_usd:ai.usage.estimatedCostUsd,queued});
});

app.post<{Body:{workspaceId:string;keyword:string;maxResults?:number}}>('/collect', async (req, reply) => {
  const {workspaceId,keyword,maxResults}=req.body;
  if(!workspaceId||!keyword) return reply.status(400).send({error:'required'});
  const items=await collect({workspaceId,keyword,maxResults});
  const saved=[];
  for(const i of items) { saved.push(await insertContent({workspace_id:workspaceId,source:i.source,external_id:i.externalId,content_type:'question',title:i.title,body:i.body,url:i.url,raw_payload:i.rawPayload,collected_at:i.collectedAt})); }
  return reply.send({keyword,collected:saved.length,contents:saved});
});

app.post<{Body:{workspaceId:string;draftId:string}}>('/approval/request', async (req, reply) => {
  const {workspaceId,draftId}=req.body;
  if(!workspaceId||!draftId) return reply.status(400).send({error:'required'});
  const draft=await getDraftById(draftId);
  await updateDraft(draftId,{status:'pending_approval'});
  const approval=await insertApprovalRequest({workspace_id:workspaceId,draft_id:draftId});
  const body=(draft as any).humanized_body??(draft as any).body??'';
  const preview=body.length>300?body.slice(0,300)+'...':body;
  const slk=process.env.SLACK_BOT_TOKEN, ch=process.env.SLACK_CHANNEL_ID;
  if(slk&&ch) { await fetch('https://slack.com/api/chat.postMessage',{method:'POST',headers:{Authorization:'Bearer '+slk,'Content-Type':'application/json'},body:JSON.stringify({channel:ch,text:'Draft approval: '+draftId,blocks:[{type:'header',text:{type:'plain_text',text:'Draft Approval'}},{type:'section',text:{type:'mrkdwn',text:'```'+preview+'```'}},{type:'actions',elements:[{type:'button',text:{type:'plain_text',text:'Approve'},style:'primary',action_id:'approve',value:'approve:'+approval.id},{type:'button',text:{type:'plain_text',text:'Reject'},style:'danger',action_id:'reject',value:'reject:'+approval.id}]}]})}); }
  return reply.send({approval_id:approval.id,status:'pending'});
});

app.post('/approval/callback', async (req, reply) => {
  const p=typeof req.body==='string'?JSON.parse(req.body):(req.body as any)?.payload?JSON.parse((req.body as any).payload):req.body;
  const a=p?.actions?.[0]; if(!a) return reply.status(400).send({error:'no action'});
  const [cmd,id]=(a.value??'').split(':'); if(!id) return reply.status(400).send({error:'bad value'});
  await updateApprovalStatus(id,cmd==='approve'?'approved':'rejected',p?.user?.id);
  return reply.send({text:cmd+' done'});
});

app.get<{Params:{ctaId:string};Querystring:{ws?:string;ref?:string}}>('/c/:ctaId', async (req, reply) => {
  const {ctaId}=req.params, ws=req.query.ws??'unknown';
  await insertAnalyticsEvent({workspace_id:ws,event_type:'cta.clicked',subject_type:'cta',subject_id:ctaId,metadata:{ref:req.query.ref,ip:req.ip}});
  if(req.query.ref) await insertLead({workspace_id:ws,source:'cta_click',source_ref_id:ctaId});
  return reply.redirect(302,'https://taieng.co.kr/diagnosis?utm_source=45cm&utm_campaign='+ctaId);
});

const port=parseInt(process.env.PORT??'3100',10);
app.listen({port,host:'0.0.0.0'}).then(()=>console.log(JSON.stringify({level:'info',msg:'api.started',port})));