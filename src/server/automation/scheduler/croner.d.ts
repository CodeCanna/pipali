/**
 * Type declarations for croner library
 * https://github.com/hexagon/croner
 */

declare module 'croner' {
    export interface CronOptions {
        /** Timezone for the cron job (e.g., "America/New_York") */
        timezone?: string;
        /** Start date for the cron job */
        startAt?: Date | string;
        /** Stop date for the cron job */
        stopAt?: Date | string;
        /** Maximum number of runs */
        maxRuns?: number;
        /** Interval between runs in milliseconds */
        interval?: number;
        /** Protect against overlapping runs */
        protect?: boolean;
        /** Context to pass to the callback */
        context?: unknown;
    }

    export class Cron {
        constructor(
            pattern: string,
            options?: CronOptions,
            callback?: () => void | Promise<void>
        );
        constructor(
            pattern: string,
            callback?: () => void | Promise<void>
        );

        /** Get the next scheduled run time */
        nextRun(): Date | null;

        /** Get multiple next scheduled run times */
        nextRuns(count: number): Date[];

        /** Stop the cron job */
        stop(): void;

        /** Resume the cron job */
        resume(): void;

        /** Trigger the cron job immediately */
        trigger(): void;

        /** Check if the cron job is running */
        isRunning(): boolean;

        /** Check if the cron job is busy (currently executing) */
        isBusy(): boolean;

        /** Get the current pattern */
        getPattern(): string;
    }

    export default Cron;
}
