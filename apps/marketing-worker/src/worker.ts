import { createWorker, MARKETING_QUEUES } from '@45cm/core-queue-runtime';
import { aiGenerate } from '@45cm/core-ai-runtime';
import { buildHumanizeSystemPrompt, getBrandVoice } from '@45cm/core-ai-runtime/dist/humanize/rules';
import { updateDraft, insertUsageLog } from '@45cm/core-db-runtime';

const w = createWorker(MARKETING_QUEUES.HUMANIZE, async (job) => {
  const d = job.data as any;
  const traceId = d.trace_id ?? 'unknown';
  const brandVoice = getBrandVoice(d.brand_voice ?? 'tai');
  const systemPrompt = buildHumanizeSystemPrompt(brandVoice);

  console.log(JSON.stringify({ level:'info', msg:'humanize.start', job_id:job.id, draft_id:d.draft_id, trace_id:traceId, brand_voice:brandVoice.id, attempt:job.attemptsMade+1 }));

  try {
    const ai = await aiGenerate({
      workspaceId: d.workspace_id,
      engine: 'marketing',
      capability: 'marketing.rewrite_humanize',
      input: d.body,
      context: { systemPrompt, trace_id: traceId },
    });

    await insertUsageLog({
      workspace_id: d.workspace_id, engine:'marketing', capability:'marketing.rewrite_humanize',
      provider:'openai', model:ai.model, prompt_tokens:ai.usage.promptTokens,
      completion_tokens:ai.usage.completionTokens, estimated_cost_usd:ai.usage.estimatedCostUsd,
      latency_ms:ai.latencyMs, status:'success', trace_id:traceId,
    });

    await updateDraft(d.draft_id, { humanized_body: ai.output, status: 'humanized' });
    console.log(JSON.stringify({ level:'info', msg:'humanize.done', job_id:job.id, draft_id:d.draft_id, model:ai.model, latency_ms:ai.latencyMs, cost_usd:ai.usage.estimatedCostUsd, trace_id:traceId }));
  } catch (err: any) {
    const status = err.status ?? 'failed';
    console.error(JSON.stringify({ level:'error', msg:'humanize.failed', job_id:job.id, draft_id:d.draft_id, status, error:err.message, trace_id:traceId }));
    try {
      await updateDraft(d.draft_id, { status });
      await insertUsageLog({ workspace_id:d.workspace_id, engine:'marketing', capability:'marketing.rewrite_humanize', provider:'openai', model:'gpt-4o-mini', prompt_tokens:0, completion_tokens:0, estimated_cost_usd:0, latency_ms:0, status, trace_id:traceId });
    } catch (_) {}
    return; // DO NOT throw — worker stays alive
  }
});

w.on('ready', () => console.log(JSON.stringify({ level:'info', msg:'worker.ready', queue:MARKETING_QUEUES.HUMANIZE })));
w.on('error', (e) => console.error(JSON.stringify({ level:'error', msg:'worker.error', error:String(e) })));
setInterval(() => {}, 60_000);
process.on('SIGTERM', async () => { await w.close(); process.exit(0); });
console.log(JSON.stringify({ level:'info', msg:'worker.started', queues:[MARKETING_QUEUES.HUMANIZE] }));