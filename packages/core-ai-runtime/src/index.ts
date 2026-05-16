import OpenAI from 'openai';
import { v4 as uuid } from 'uuid';
import type { AiGenerateRequest, AiGenerateResult } from '@45cm/core-shared-types';

const MODELS: Record<string,string> = { 'marketing.generate_draft':'gpt-4o-mini', 'marketing.rewrite_humanize':'gpt-4o-mini', 'marketing.classify_intent':'gpt-4o-mini' };
const COST: Record<string,{i:number;o:number}> = { 'gpt-4o-mini':{i:0.00015,o:0.0006} };
const TIMEOUT_MS = 30_000;

let sdkVersion = 'unknown';
try { sdkVersion = require('openai/package.json').version; } catch(_) {}

let client: OpenAI|null = null;
function oai(): OpenAI {
  if (!client) {
    const key = process.env.OPENAI_API_KEY;
    console.log(JSON.stringify({ level:'info', msg:'openai.client.init', key_exists:!!key, key_prefix:key?.slice(0,12), sdk_version:sdkVersion }));
    client = new OpenAI({ apiKey: key, timeout: TIMEOUT_MS, maxRetries: 0 });
  }
  return client;
}

export type AiStatus = 'success' | 'failed' | 'timeout' | 'fallback';

export interface AiGenerateResultExt extends AiGenerateResult {
  providerRequestId: string;
  status: AiStatus;
}

export async function aiGenerate(req: AiGenerateRequest): Promise<AiGenerateResultExt> {
  const model = MODELS[req.capability] ?? 'gpt-4o-mini';
  const traceId = (req as any).traceId ?? (req.context as any)?.trace_id ?? uuid();
  const start = Date.now();

  console.log(JSON.stringify({
    level:'info', msg:'openai.request.start',
    trace_id: traceId, workspace_id: req.workspaceId,
    capability: req.capability, provider:'openai', model,
    input_length: req.input.length, timeout_ms: TIMEOUT_MS,
  }));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const r = await oai().chat.completions.create(
      {
        model, max_tokens: 2048, temperature: 0.7,
        messages: [
          ...((req.context as any)?.systemPrompt ? [{ role: 'system' as const, content: (req.context as any).systemPrompt }] : []),
          { role: 'user' as const, content: req.input },
        ],
      },
      { signal: controller.signal },
    );

    const ms = Date.now() - start;
    const rates = COST[model] ?? COST['gpt-4o-mini'];
    const pt = r.usage?.prompt_tokens ?? 0;
    const ct = r.usage?.completion_tokens ?? 0;
    const cost = Math.round(((pt / 1000) * rates.i + (ct / 1000) * rates.o) * 1e6) / 1e6;

    console.log(JSON.stringify({
      level:'info', msg:'openai.request.success',
      trace_id: traceId, provider:'openai', model: r.model,
      latency_ms: ms, prompt_tokens: pt, completion_tokens: ct,
      total_tokens: pt + ct, cost_usd: cost,
    }));

    return {
      requestId: uuid(), output: r.choices[0]?.message?.content ?? '',
      model: r.model, usage: { promptTokens: pt, completionTokens: ct, estimatedCostUsd: cost },
      latencyMs: ms, providerRequestId: r.id, status: 'success',
    };
  } catch (err: any) {
    const ms = Date.now() - start;
    const isTimeout = err.name === 'AbortError' || err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED' || err.message?.includes('abort');
    const status: AiStatus = isTimeout ? 'timeout' : 'failed';

    console.error(JSON.stringify({
      level:'error', msg:'openai.request.failed',
      trace_id: traceId, provider:'openai', model,
      latency_ms: ms, status,
      error_name: err.name, error_message: err.message,
      error_status: err.status, error_code: err.code,
      error_type: err.type,
    }));

    const wrapped = new Error(`OpenAI ${status}: ${err.message}`);
    (wrapped as any).status = status;
    throw wrapped;
  } finally {
    clearTimeout(timer);
  }
}

export async function debugOpenAI(): Promise<{ ok: boolean; model?: string; latency_ms?: number; error?: string; status: AiStatus; sdk_version: string }> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const r = await oai().chat.completions.create(
      { model: 'gpt-4o-mini', max_tokens: 5, messages: [{ role: 'user', content: 'ping' }] },
      { signal: controller.signal },
    );
    return { ok: true, model: r.model, latency_ms: Date.now() - start, status: 'success', sdk_version: sdkVersion };
  } catch (err: any) {
    const isTimeout = err.name === 'AbortError' || err.message?.includes('abort');
    return { ok: false, error: err.message, latency_ms: Date.now() - start, status: isTimeout ? 'timeout' : 'failed', sdk_version: sdkVersion };
  } finally {
    clearTimeout(timer);
  }
}