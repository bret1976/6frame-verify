import { Queue } from "bullmq";
import { Redis } from "ioredis";

let connection: Redis | null = null;
let verifyQueue: Queue | null = null;

function getRedis() {
  if (!connection) {
    const url = process.env.REDIS_URL || "redis://localhost:6379";
    connection = new Redis(url, { maxRetriesPerRequest: null });
  }
  return connection;
}

export function getVerifyQueue(): Queue {
  if (!verifyQueue) {
    verifyQueue = new Queue("verify-jobs", { connection: getRedis() });
  }
  return verifyQueue;
}

export async function enqueueVerifyJob(jobId: string) {
  await getVerifyQueue().add(
    "run",
    { jobId },
    {
      jobId,
      attempts: 2,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  );
}
