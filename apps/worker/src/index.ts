import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { processJob } from "./processor.js";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

console.log("[worker] 6Frame Verify starting", {
  redis: redisUrl.replace(/:[^:@]+@/, ":***@"),
  version: "1.0.0",
});

const worker = new Worker(
  "verify-jobs",
  async (job) => {
    const jobId = String(job.data.jobId);
    console.log("[worker] pickup", jobId);
    await processJob(jobId);
  },
  { connection, concurrency: Number(process.env.WORKER_CONCURRENCY || 1) },
);

worker.on("completed", (job) => console.log("[worker] completed", job.id));
worker.on("failed", (job, err) => console.error("[worker] failed", job?.id, err.message));

process.on("SIGTERM", async () => {
  await worker.close();
  await connection.quit();
  process.exit(0);
});
