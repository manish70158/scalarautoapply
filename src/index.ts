
import cron from 'node-cron';
import { runOnce } from './worker';

let running = false;

async function safeRun() {
  if (running) {
    console.log('[cron] previous run still in progress, skipping this tick');
    return;
  }
  running = true;
  try {
    await runOnce();
  } catch (e) {
    console.error('[cron] run failed:', e);
  } finally {
    running = false;
  }
}

// Every 5 minutes
cron.schedule('*/1 * * * *', async () => {
  console.log(`[cron] tick at ${new Date().toLocaleString()}`);
  await safeRun();
});

// Run immediately on startup
safeRun();
