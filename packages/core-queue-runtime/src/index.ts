import IORedis from 'ioredis';
import { Queue, Worker, Job } from 'bullmq';

let redis: IORedis | null = null;
function conn(): IORedis {
  if (!redis) {
    const url = process.env.REDIS_URL;
    console.log(JSON.stringify({ level:'info', msg:'redis.init', url: url?.replace(/:[^:@]+@/, ':***@') }));
    redis = new IORedis(url!, { maxRetriesPerRequest: null, connectTimeout: 5000 });
    redis.on('error', (e) => console.error(JSON.stringify({ level:'error', msg:'redis.error', error:e.message })));
    redis.on('connect', () => console.log(JSON.stringify({ level:'info', msg:'redis.connected' })));
  }
  return redis;
}

const queues = new Map<string, Queue>();
export function getQueue(name: string): Queue {
  if (!queues.has(name)) queues.set(name, new Queue(name, { connection: conn(), defaultJobOptions: { attempts:3, backoff:{type:'exponential',delay:30000} } }));
  return queues.get(name)!;
}

export async function enqueue(queueName: string, jobName: string, data: Record<string,unknown> & {workspace_id:string}): Promise<string> {
  const timeout = new Promise<never>((_,rej) => setTimeout(() => rej(new Error('enqueue timeout 10s')), 10000));
  const add = getQueue(queueName).add(jobName, data).then(j => j.id ?? '');
  return Promise.race([add, timeout]);
}

export function createWorker(queueName: string, processor: (job: Job) => Promise<void>, opts?: {concurrency?:number}): Worker {
  return new Worker(queueName, processor, { connection: conn(), concurrency: opts?.concurrency ?? 2 });
}

export async function debugRedis(): Promise<{ok:boolean; latency_ms?:number; error?:string}> {
  const start = Date.now();
  try {
    const r = conn();
    const pong = await Promise.race([
      r.ping(),
      new Promise<never>((_,rej) => setTimeout(() => rej(new Error('ping timeout 5s')), 5000)),
    ]);
    return { ok: pong === 'PONG', latency_ms: Date.now() - start };
  } catch (e: any) {
    return { ok: false, error: e.message, latency_ms: Date.now() - start };
  }
}

export const MARKETING_QUEUES = { COLLECT:'45.marketing.collect', CLASSIFY:'45.marketing.classify', DRAFT:'45.marketing.draft', HUMANIZE:'45.marketing.humanize', APPROVAL:'45.marketing.approval', PUBLISH:'45.marketing.publish' } as const;
export const AI_QUEUES = { GENERATE:'45.ai.generate' } as const;