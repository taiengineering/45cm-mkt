export type Priority = 'P1'|'P2'|'P3'|'P4';
export type EventStatus = 'created'|'queued'|'processing'|'completed'|'failed'|'ignored';
export interface AiGenerateRequest { workspaceId:string; engine:string; capability:string; input:string; context?:Record<string,unknown>; }
export interface AiGenerateResult { requestId:string; output:string; model:string; usage:{promptTokens:number;completionTokens:number;estimatedCostUsd:number}; latencyMs:number; }