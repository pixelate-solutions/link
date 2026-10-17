/** Drain the job queue locally: `npm run jobs:work` (loops until empty). */
import { runJobs } from "../server/jobs";

for (;;) {
  const { processed } = await runJobs({ limit: 20 });
  if (!processed) break;
  console.log(`processed ${processed} jobs`);
}
process.exit(0);
