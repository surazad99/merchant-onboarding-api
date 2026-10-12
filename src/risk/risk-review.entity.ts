import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { RiskStatus } from '../common/enums';

/**
 * One row per (application, submission). The unique constraint is the last line of
 * defence for worker idempotency: a duplicate/retried job cannot persist a second result.
 */
@Entity('risk_reviews')
@Unique('uq_risk_reviews_application_submission', ['applicationId', 'submissionNumber'])
export class RiskReview {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  applicationId!: string;

  @Column({ type: 'int' })
  submissionNumber!: number;

  @Column({ type: 'varchar', length: 16 })
  status!: RiskStatus;

  @Column({ type: 'int', nullable: true })
  score!: number | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  reasons!: string[];

  @Column({ type: 'varchar', length: 64, nullable: true })
  providerReference!: string | null;

  /** Number of job attempts it took (1 = first try). */
  @Column({ type: 'int', default: 1 })
  attempts!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
