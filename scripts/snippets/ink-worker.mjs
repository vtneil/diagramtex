// A scoring thread for compare.mjs: { key, ref, app, refDpi, appDpi, overlay } in, { key, result | error } out.
import { parentPort } from 'node:worker_threads';
import { score } from './ink.mjs';

parentPort.on('message', (job) => {
  try {
    parentPort.postMessage({ key: job.key, result: score(job.ref, job.app, { refDpi: job.refDpi, appDpi: job.appDpi, overlayPath: job.overlay }) });
  } catch (error) {
    parentPort.postMessage({ key: job.key, error: String(error?.message || error) });
  }
});
