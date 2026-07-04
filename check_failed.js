const { Queue } = require('bullmq');
const connection = require('./src/lib/bullmq').connection;

async function checkFailedJobs() {
  const queue = new Queue('reconciliation_queue', { connection });
  const failed = await queue.getFailed(0, 10);
  console.log('Failed jobs:', JSON.stringify(failed, null, 2));
  process.exit(0);
}
checkFailedJobs();
