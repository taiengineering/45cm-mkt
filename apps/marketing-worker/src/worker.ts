import { createWorker, MARKETING_QUEUES } from '@45cm/core-queue-runtime';
import { aiGenerate } from '@45cm/core-ai-runtime';
import { updateDraft, insertUsageLog } from '@45cm/core-db-runtime';
import { createEvent, emitEvent, MARKETING_EVENTS } from '@45cm/core-event-runtime';

const w = createWorker(MARKETING_QUEUES.HUMANIZE, async (job) => {
  const d = job.data as any;
  console.log('[humanize] draft='+d.draft_id);
  const ai = await aiGenerate({workspaceId:d.workspace_id,engine:'marketing',capability:'marketing.rewrite_humanize',input:d.body,context:{systemPrompt:'다음 한국어 마케팅 답변을 자연스럽고 전문적이며 사람이 쓴 것처럼 다시 작성해주세요. AI 느낌을 완전히 제거하세요.'}});
  await insertUsageLog({workspace_id:d.workspace_id,engine:'marketing',capability:'marketing.rewrite_humanize',provider:'openai',model:ai.model,prompt_tokens:ai.usage.promptTokens,completion_tokens:ai.usage.completionTokens,estimated_cost_usd:ai.usage.estimatedCostUsd,latency_ms:ai.latencyMs,status:'success',trace_id:d.trace_id});
  await updateDraft(d.draft_id,{humanized_body:ai.output,status:'humanized'});
  console.log('[humanize] done draft='+d.draft_id);
});

w.on('ready', () => console.log('[worker] humanize ready'));
w.on('error', e => console.error('[worker] error',e));
setInterval(()=>{},60000);
process.on('SIGTERM', async () => { await w.close(); process.exit(0); });
console.log('[worker] started');