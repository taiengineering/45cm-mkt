import { createWorker, MARKETING_QUEUES } from '@45cm/core-queue-runtime';
import { aiGenerate } from '@45cm/core-ai-runtime';
import { updateDraft, insertUsageLog } from '@45cm/core-db-runtime';

// ====== Step 4: Worker MUST NOT die on AI failure ======
const w = createWorker(MARKETING_QUEUES.HUMANIZE, async (job) => {
  const d = job.data as any;
  console.log(JSON.stringify({ level:'info', msg:'humanize.start', job_id:job.id, draft_id:d.draft_id, trace_id:d.trace_id, attempt:job.attemptsMade+1 }));

  try {
    const ai = await aiGenerate({
      workspaceId: d.workspace_id,
      engine: 'marketing',
      capability: 'marketing.rewrite_humanize',
      input: d.body,
      context: {
        systemPrompt: '다음 한국어 마케팅 답변을 자연스럽고 전문적이며 사람이 쓴 것처럼 다시 작성해주세요. AI 느낌을 완전히 제거하세요.',
        trace_id: d.trace_id,
      },
    });

    await insertUsageLog({
      workspace_id: d.workspace_id, engine:'marketing', capability:'marketing.rewrite_humanize',
      provider:'openai', model:ai.model, prompt_tokens:ai.usage.promptTokens,
      completion_tokens:ai.usage.completionTokens, estimated_cost_usd:ai.usage.estimatedCostUsd,
      latency_ms:ai.latencyMs, status:'success', trace_id:d.trace_id,
    });

    // Step 5: draft → humanized
    await updateDraft(d.draft_id, { humanized_body: ai.output, status: 'humanized' });
    console.log(JSON.stringify({ level:'info', msg:'humanize.done', job_id:job.id, draft_id:d.draft_id, model:ai.model }));

  } catch (err: any) {
    const status = err.status ?? 'failed';
    console.error(JSON.stringify({ level:'error', msg:'humanize.failed', job_id:job.id, draft_id:d.draft_id, status, error:err.message }));

    // Step 5: mark draft failed/timeout — DO NOT re-throw
    try {
      await updateDraft(d.draft_id, { status });
      await insertUsageLog({
        workspace_id: d.workspace_id, engine:'marketing', capability:'marketing.rewrite_humanize',
        provider:'openai', model:'gpt-4o-mini', prompt_tokens:0, completion_tokens:0,
        estimated_cost_usd:0, latency_ms:0, status, trace_id:d.trace_id,
      });
    } catch (_) { /* DB failure is non-fatal here */ }

    // Step 4: DO NOT throw — worker stays alive
    return;
  }
});

w.on('ready', () => console.log(JSON.stringify({ level:'info', msg:'worker.ready', queue:MARKETING_QUEUES.HUMANIZE })));
w.on('error', (e) => console.error(JSON.stringify({ level:'error', msg:'worker.error', error:String(e) })));
setInterval(() => {}, 60_000);
process.on('SIGTERM', async () => { await w.close(); process.exit(0); });
console.log(JSON.stringify({ level:'info', msg:'worker.started', queues:[MARKETING_QUEUES.HUMANIZE] }));