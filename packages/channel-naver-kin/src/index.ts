export interface NormalizedContent { source:string; externalId:string; title:string; body:string; url:string; collectedAt:string; rawPayload:Record<string,unknown>; }
export async function collect(input:{workspaceId:string;keyword:string;maxResults?:number}): Promise<NormalizedContent[]> {
  const id=process.env.NAVER_CLIENT_ID!, sec=process.env.NAVER_CLIENT_SECRET!;
  const r=await fetch(`https://openapi.naver.com/v1/search/kin.json?query=${encodeURIComponent(input.keyword)}&display=${input.maxResults??10}&sort=date`,{headers:{'X-Naver-Client-Id':id,'X-Naver-Client-Secret':sec}});
  if(!r.ok) throw new Error('Naver API '+r.status);
  const j=await r.json() as {items?:{title:string;description:string;link:string}[]};
  return (j.items??[]).map(i=>({source:'naver_kin',externalId:'nk-'+Buffer.from(i.link).toString('base64url').slice(0,32),title:i.title.replace(/<[^>]*>/g,''),body:i.description.replace(/<[^>]*>/g,''),url:i.link,collectedAt:new Date().toISOString(),rawPayload:i as any}));
}