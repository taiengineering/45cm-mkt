import IORedis from 'ioredis';
import { Queue, Worker, Job } from 'bullmq';

let redis: IORedis | null = null;
function conn(): IORedis {
  if (!redis) { redis = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null }); }
  return redis;
}

const queues = new Map<string, Queue>();
export function getQueue(name: string): Queue {
  if (!queues.has(name)) queues.set(name, new Queue(name, { connection: conn(), defaultJobOptions: { attempts:3, backoff:{type:'exponential',delay:30000} } }));
  return queues.get(name)!;
}

export async function enqueue(queueName: string, jobName: string, data: Record<string,unknown> & {workspace_id:string}): Promise<string> {
  const job = await getQueue(queueName).add(jobName, data);
  return job.id ?? '';
}

export function createWorker(queueName: string, processor: (job: Job) => Promise<void>, opts?: {concurrency?:number}): Worker {
  return new Worker(queueName, processor, { connection: conn(), concurrency: opts?.concurrency ?? 2 });
}

export const MARKETING_QUEUES = { COLLECT:'45.marketing.collect', CLASSIFY:'45.marketing.classify', DRAFT:'45.marketing.draft', HUMANIZE:'45.marketing.humanize', APPROVAL:'45.marketing.approval', PUBLISH:'45.marketing.publish' } as const;
export const AI_QUEUES = { GENERATE:'45.ai.generate' } as const;