/**
 * Scheduler Module
 *
 * Coordinates cron and file watch schedulers.
 */

export {
    startCronScheduler,
    scheduleCronJob,
    stopCronJob,
    stopAllCronJobs,
    getNextRunTime,
    isCronJobActive,
    getActiveCronJobCount,
    reloadCronJob,
} from './cron';

export {
    startFileWatchers,
    setupFileWatcher,
    stopFileWatcher,
    stopAllFileWatchers,
    isFileWatcherActive,
    getActiveFileWatcherCount,
    reloadFileWatcher,
} from './file-watcher';

/**
 * Start all schedulers
 */
export async function startSchedulers(): Promise<void> {
    const { startCronScheduler } = await import('./cron');
    const { startFileWatchers } = await import('./file-watcher');

    await Promise.all([
        startCronScheduler(),
        startFileWatchers(),
    ]);
}

/**
 * Stop all schedulers
 */
export function stopSchedulers(): void {
    const { stopAllCronJobs } = require('./cron');
    const { stopAllFileWatchers } = require('./file-watcher');

    stopAllCronJobs();
    stopAllFileWatchers();
}
