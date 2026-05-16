import OpenAI from 'openai';
import { v4 as uuid } from 'uuid';
import type { AiGenerateRequest, AiGenerateResult } from '@45cm/core-shared-types';

const MODELS: Record<string,string> = { 'marketing.generate_draft':'gpt-4o-mini', 'marketing.rewrite_humanize':'gpt-4o-mini', 'marketing.classify_intent':'gpt-4o-mini' };
const COST: Record<string,{i:number;o:number}> = { 'gpt-4o-mini':{i:0.00015,o:0.0006} };

let client: OpenAI|null = null;
function oai(): OpenAI { if(!client) client = new OpenAI({apiKey:process.env.OPENAI_API_KEY!}); return client; }

export async function aiGenerate(req: AiGenerateRequest): Promise<AiGenerateResult & {providerRequestId:string}> {
  const model = MODELS[req.capability] ?? 'gpt-4o-mini';
  const start = Date.now();
  const r = await oai().chat.completions.create({
    model, max_tokens:2048, temperature:0.7,
    messages: [
      ...((req.context as any)?.systemPrompt ? [{role:'system' as const,content:(req.context as any).systemPrompt}] : []),
      {role:'user' as const, content:req.input}
    ]
  });
  const ms = Date.now()-start;
  const rates = COST[model]??COST['gpt-4o-mini'];
  const pt = r.usage?.prompt_tokens??0, ct = r.usage?.completion_tokens??0;
  return { requestId:uuid(), output:r.choices[0]?.message?.content??'', model:r.model, usage:{promptTokens:pt,completionTokens:ct,estimatedCostUsd:Math.round(((pt/1000)*rates.i+(ct/1000)*rates.o)*1e6)/1e6}, latencyMs:ms, providerRequestId:r.id };
}