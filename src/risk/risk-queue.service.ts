import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { RISK_QUEUE, RiskJobData } from './risk.constants';

@Injectable()
export class RiskQueueService {
  constructor(
    @InjectQueue(RISK_QUEUE) private readonly queue: Queue<RiskJobData>,
    private readonly config: ConfigService,
  ) {}

  /** BullMQ custom job ids may not contain ":", hence the dashes. */
  static jobId(applicationId: string, submissionNumber: number): string {
    return `risk-${applicationId}-${submissionNumber}`;
  }

  /**
   * Enqueue is idempotent: the deterministic jobId means adding the same
   * (application, submission) twice is a no-op while the job exists.
   */
  async enqueue(applicationId: string, submissionNumber: number): Promise<void> {
    await this.queue.add(
      'assess',
      { applicationId, submissionNumber },
      {
        jobId: RiskQueueService.jobId(applicationId, submissionNumber),
        attempts: Number(this.config.get('RISK_MAX_ATTEMPTS') ?? 5),
        backoff: { type: 'exponential', delay: Number(this.config.get('RISK_BACKOFF_MS') ?? 2000) },
        removeOnComplete: { age: 24 * 3600, count: 1000 },
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    );
  }
}
