import { v4 as uuid } from 'uuid';
export const MARKETING_EVENTS = { KEYWORD_DETECTED:'marketing.keyword.detected', DRAFT_GENERATED:'marketing.draft.generated', DRAFT_HUMANIZED:'marketing.draft.humanized', APPROVAL_REQUESTED:'marketing.approval.requested', CTA_CLICKED:'marketing.cta.clicked' } as const;
export const AI_EVENTS = { USAGE_RECORDED:'ai.usage.recorded' } as const;
export function createEvent(p:{eventType:string;eventVersion:number;workspaceId:string;engine:string;source:string;capability?:string;payload:unknown;traceId?:string}) {
  return { event_id:uuid(), event_type:p.eventType, event_version:p.eventVersion, workspace_id:p.workspaceId, engine:p.engine, source:p.source, capability:p.capability, priority:'P3' as const, status:'created' as const, payload:p.payload, created_at:new Date().toISOString() };
}
export function emitEvent(e:unknown) { /* TODO: persist */ }