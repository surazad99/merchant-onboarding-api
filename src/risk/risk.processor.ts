import { Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ApplicationAction, transition } from '../applications/application-state-machine';
import { MerchantApplication } from '../applications/merchant-application.entity';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { ApplicationStatus, RiskStatus } from '../common/enums';
import { RiskReview } from './risk-review.entity';
import { RiskProvider } from './risk-provider';
import { RISK_QUEUE, RiskJobData } from './risk.constants';

export type RiskJobResult = { outcome: RiskStatus | 'SKIPPED' };

@Processor(RISK_QUEUE)
export class RiskProcessor extends WorkerHost {
  private readonly logger = new Logger(RiskProcessor.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(MerchantApplication) private readonly apps: Repository<MerchantApplication>,
    @InjectRepository(RiskReview) private readonly reviews: Repository<RiskReview>,
    private readonly provider: RiskProvider,
    private readonly audit: AuditService,
  ) {
    super();
  }

  /**
   * Idempotency layers:
   *  1. Deterministic jobId (de-duplicates enqueue).
   *  2. Staleness check: skip unless the application is still SUBMITTED for this exact submission.
   *  3. Re-check under a row lock before writing, so concurrent duplicates serialise.
   *  4. Unique (application_id, submission_number) on risk_reviews as the final guard.
   * The provider call happens OUTSIDE the transaction so no lock is held during network I/O.
   * Throwing here lets BullMQ retry with exponential backoff.
   */
  async process(job: Job<RiskJobData>): Promise<RiskJobResult> {
    const { applicationId, submissionNumber } = job.data;

    const app = await this.apps.findOne({ where: { id: applicationId } });
    if (!this.isActionable(app, submissionNumber)) {
      this.logger.log(`Skipping job ${job.id}: nothing to do for submission ${submissionNumber}`);
      return { outcome: 'SKIPPED' };
    }
    if (await this.reviews.exist({ where: { applicationId, submissionNumber } })) {
      return { outcome: 'SKIPPED' };
    }

    const assessment = await this.provider.assess({
      applicationId,
      submissionNumber,
      businessName: app.businessName,
      legalBusinessName: app.legalBusinessName,
      businessType: app.businessType,
      monthlyVolume: app.monthlyVolume,
      averageTicketSize: app.averageTicketSize,
      currency: app.currency,
    });

    const applied = await this.dataSource.transaction(async (m) => {
      const locked = await this.lockApplication(m, applicationId);
      if (!this.isActionable(locked, submissionNumber)) return false;
      if (await m.exists(RiskReview, { where: { applicationId, submissionNumber } })) return false;

      await m.insert(RiskReview, {
        applicationId,
        submissionNumber,
        status: assessment.outcome,
        score: assessment.score,
        reasons: assessment.reasons,
        providerReference: assessment.providerReference,
        attempts: job.attemptsMade + 1,
      });
      locked.riskStatus = assessment.outcome;
      locked.status = transition(locked.status, ApplicationAction.START_REVIEW);
      await m.save(locked);
      await this.audit.record(
        {
          action: AuditAction.RISK_REVIEW_COMPLETED,
          entityType: 'APPLICATION',
          entityId: applicationId,
          metadata: { submissionNumber, outcome: assessment.outcome, score: assessment.score },
        },
        m,
      );
      return true;
    });

    return { outcome: applied ? assessment.outcome : 'SKIPPED' };
  }

  /** After the final retry is exhausted, fall back to manual review so the application is never stuck. */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<RiskJobData> | undefined, error: Error): Promise<void> {
    if (!job) return;
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) {
      this.logger.warn(`Risk job ${job.id} failed (attempt ${job.attemptsMade}/${maxAttempts}): ${error.message}`);
      return;
    }
    this.logger.error(`Risk job ${job.id} exhausted ${maxAttempts} attempts: ${error.message}`);
    try {
      await this.markManualReview(job.data, job.attemptsMade, error.message);
    } catch (e) {
      this.logger.error(`Could not record failed risk review for job ${job.id}`, e instanceof Error ? e.stack : undefined);
    }
  }

  private async markManualReview(data: RiskJobData, attempts: number, reason: string): Promise<void> {
    const { applicationId, submissionNumber } = data;
    await this.dataSource.transaction(async (m) => {
      const locked = await this.lockApplication(m, applicationId);
      if (!this.isActionable(locked, submissionNumber)) return;
      if (await m.exists(RiskReview, { where: { applicationId, submissionNumber } })) return;

      await m.insert(RiskReview, {
        applicationId,
        submissionNumber,
        status: RiskStatus.FAILED,
        score: null,
        reasons: ['PROVIDER_UNAVAILABLE'],
        providerReference: null,
        attempts,
      });
      locked.riskStatus = RiskStatus.FAILED;
      locked.status = transition(locked.status, ApplicationAction.START_REVIEW);
      await m.save(locked);
      await this.audit.record(
        {
          action: AuditAction.RISK_REVIEW_FAILED,
          entityType: 'APPLICATION',
          entityId: applicationId,
          metadata: { submissionNumber, attempts, reason },
        },
        m,
      );
    });
  }

  private lockApplication(m: EntityManager, id: string) {
    return m.findOne(MerchantApplication, { where: { id }, lock: { mode: 'pessimistic_write' } });
  }

  private isActionable(app: MerchantApplication | null, submissionNumber: number): app is MerchantApplication {
    return !!app && app.submissionCount === submissionNumber && app.status === ApplicationStatus.SUBMITTED;
  }
}
