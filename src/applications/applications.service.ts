import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth-user';
import { ApplicationStatus, ReviewDecision, RiskStatus } from '../common/enums';
import { RiskQueueService } from '../risk/risk-queue.service';
import { RiskReview } from '../risk/risk-review.entity';
import { UsersService } from '../users/users.service';
import { ApplicationPolicy } from './application.policy';
import { ApplicationAction, isEditable, isTerminal, transition } from './application-state-machine';
import { AssignReviewerDto } from './dto/assign-reviewer.dto';
import { CreateApplicationDto } from './dto/create-application.dto';
import { ListApplicationsQuery } from './dto/list-applications.query';
import { ReviewDecisionDto } from './dto/review-decision.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { MerchantApplication } from './merchant-application.entity';

const DECISION_TO_ACTION: Record<ReviewDecision, ApplicationAction> = {
  [ReviewDecision.APPROVE]: ApplicationAction.APPROVE,
  [ReviewDecision.REJECT]: ApplicationAction.REJECT,
  [ReviewDecision.REQUEST_INFO]: ApplicationAction.REQUEST_INFO,
};

@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger(ApplicationsService.name);

  constructor(
    @InjectRepository(MerchantApplication) private readonly repo: Repository<MerchantApplication>,
    @InjectRepository(RiskReview) private readonly riskReviews: Repository<RiskReview>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly policy: ApplicationPolicy,
    private readonly riskQueue: RiskQueueService,
    private readonly users: UsersService,
  ) {}

  // ---------------------------------------------------------------- queries

  async list(user: AuthUser, query: ListApplicationsQuery) {
    const qb = this.repo.createQueryBuilder('a');
    this.policy.applyVisibilityScope(qb, user, 'a');
    if (query.status) qb.andWhere('a.status = :status', { status: query.status });
    if (query.riskStatus) qb.andWhere('a.riskStatus = :riskStatus', { riskStatus: query.riskStatus });

    const [items, total] = await qb
      .orderBy('a.createdAt', 'DESC')
      .addOrderBy('a.id', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return { items, total, page: query.page, limit: query.limit };
  }

  async getVisible(user: AuthUser, id: string): Promise<MerchantApplication> {
    const app = await this.repo.findOne({ where: { id } });
    return this.assertVisible(user, app);
  }

  async listRiskReviews(user: AuthUser, id: string): Promise<RiskReview[]> {
    await this.getVisible(user, id);
    return this.riskReviews.find({ where: { applicationId: id }, order: { submissionNumber: 'DESC' } });
  }

  async getAuditTrail(id: string) {
    const app = await this.repo.findOne({ where: { id } });
    if (!app) throw new NotFoundException('Application not found');
    return this.audit.listForEntity('APPLICATION', id);
  }

  // --------------------------------------------------------------- commands

  create(user: AuthUser, dto: CreateApplicationDto): Promise<MerchantApplication> {
    return this.dataSource.transaction(async (m) => {
      const app = await m.save(
        m.create(MerchantApplication, {
          ...dto,
          ownerTaxId: dto.ownerTaxId ?? null,
          createdById: user.id,
        }),
      );
      await this.audit.record(
        {
          actorId: user.id,
          action: AuditAction.APPLICATION_CREATED,
          entityType: 'APPLICATION',
          entityId: app.id,
          metadata: { businessName: app.businessName, businessType: app.businessType },
        },
        m,
      );
      return app;
    });
  }

  update(user: AuthUser, id: string, dto: UpdateApplicationDto): Promise<MerchantApplication> {
    return this.dataSource.transaction(async (m) => {
      const app = await this.lockVisible(m, user, id);
      this.assertCanEdit(user, app);

      const changedFields = (Object.keys(dto) as (keyof UpdateApplicationDto)[]).filter(
        (k) => dto[k] !== undefined && dto[k] !== (app as unknown as Record<string, unknown>)[k],
      );
      Object.assign(app, dto);
      const saved = await m.save(app);
      await this.audit.record(
        {
          actorId: user.id,
          action: AuditAction.APPLICATION_UPDATED,
          entityType: 'APPLICATION',
          entityId: id,
          metadata: { changedFields }, // field NAMES only - never values
        },
        m,
      );
      return saved;
    });
  }

  async submit(user: AuthUser, id: string): Promise<MerchantApplication> {
    const app = await this.dataSource.transaction(async (m) => {
      const locked = await this.lockVisible(m, user, id);
      if (!this.policy.canEdit(user, locked)) {
        throw new ForbiddenException('You cannot submit this application');
      }
      const from = locked.status;
      locked.status = transition(from, ApplicationAction.SUBMIT);
      locked.riskStatus = RiskStatus.PENDING;
      locked.submissionCount += 1;
      locked.decisionNote = null;
      locked.decidedAt = null;
      const saved = await m.save(locked);
      await this.audit.record(
        {
          actorId: user.id,
          action: AuditAction.APPLICATION_SUBMITTED,
          entityType: 'APPLICATION',
          entityId: id,
          metadata: { from, submissionNumber: saved.submissionCount },
        },
        m,
      );
      return saved;
    });

    // Enqueue only after the commit so the worker can never see uncommitted state.
    // Trade-off (documented in README): if Redis is down here the app stays SUBMITTED;
    // an ADMIN can re-enqueue via POST /applications/:id/risk-review/enqueue (idempotent).
    try {
      await this.riskQueue.enqueue(app.id, app.submissionCount);
    } catch (err) {
      this.logger.error(`Failed to enqueue risk review for ${app.id}`, err instanceof Error ? err.stack : undefined);
    }
    return app;
  }

  assignReviewer(user: AuthUser, id: string, dto: AssignReviewerDto): Promise<MerchantApplication> {
    return this.dataSource.transaction(async (m) => {
      const app = await this.lockVisible(m, user, id);
      if (isTerminal(app.status)) {
        throw new ConflictException(`Cannot reassign an application in status ${app.status}`);
      }
      const reviewer = await this.users.findActiveReviewer(dto.reviewerId);
      if (!reviewer) throw new BadRequestException('reviewerId must reference an active REVIEWER');

      const previousReviewerId = app.assignedReviewerId;
      app.assignedReviewerId = reviewer.id;
      const saved = await m.save(app);
      await this.audit.record(
        {
          actorId: user.id,
          action: AuditAction.APPLICATION_ASSIGNED,
          entityType: 'APPLICATION',
          entityId: id,
          metadata: { reviewerId: reviewer.id, previousReviewerId },
        },
        m,
      );
      return saved;
    });
  }

  decide(user: AuthUser, id: string, dto: ReviewDecisionDto): Promise<MerchantApplication> {
    return this.dataSource.transaction(async (m) => {
      const app = await this.lockVisible(m, user, id);
      // Visible but not the assigned reviewer (e.g. ADMIN) -> 403. Hidden -> 404 (see lockVisible).
      if (!this.policy.canDecide(user, app)) {
        throw new ForbiddenException('Only the assigned reviewer can record a decision');
      }
      const from = app.status;
      app.status = transition(from, DECISION_TO_ACTION[dto.decision]); // 409 if not UNDER_REVIEW
      app.decisionNote = dto.note ?? null;
      app.decidedAt = new Date();
      const saved = await m.save(app);
      await this.audit.record(
        {
          actorId: user.id,
          action: AuditAction.REVIEW_DECISION,
          entityType: 'APPLICATION',
          entityId: id,
          metadata: { decision: dto.decision, from, to: saved.status },
        },
        m,
      );
      return saved;
    });
  }

  /** Reconciliation for the "committed but not enqueued" gap. Idempotent thanks to the deterministic jobId. */
  async requeueRiskReview(user: AuthUser, id: string): Promise<void> {
    const app = await this.getVisible(user, id);
    if (app.status !== ApplicationStatus.SUBMITTED) {
      throw new ConflictException('Only SUBMITTED applications have a pending risk review');
    }
    await this.riskQueue.enqueue(app.id, app.submissionCount);
    await this.audit.record({
      actorId: user.id,
      action: AuditAction.RISK_REVIEW_REQUEUED,
      entityType: 'APPLICATION',
      entityId: id,
      metadata: { submissionNumber: app.submissionCount },
    });
  }

  // ---------------------------------------------------------------- helpers

  /**
   * 404 (not 403) for objects the caller may not see, so IDs of other users'
   * applications cannot be probed for existence.
   */
  private assertVisible(user: AuthUser, app: MerchantApplication | null): MerchantApplication {
    if (!app || !this.policy.canView(user, app)) throw new NotFoundException('Application not found');
    return app;
  }

  private async lockVisible(m: EntityManager, user: AuthUser, id: string): Promise<MerchantApplication> {
    const app = await m.findOne(MerchantApplication, { where: { id }, lock: { mode: 'pessimistic_write' } });
    return this.assertVisible(user, app);
  }

  private assertCanEdit(user: AuthUser, app: MerchantApplication): void {
    if (!this.policy.canEdit(user, app)) throw new ForbiddenException('You cannot edit this application');
    if (!isEditable(app.status)) {
      throw new ConflictException(`Application is not editable in status ${app.status}`);
    }
  }
}
