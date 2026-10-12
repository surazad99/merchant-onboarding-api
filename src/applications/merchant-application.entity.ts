import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  ValueTransformer,
  VersionColumn,
} from 'typeorm';
import { encryptedTransformer } from '../common/crypto/field-encryption';
import { ApplicationStatus, BusinessType, RiskStatus } from '../common/enums';

// numeric columns come back from pg as strings; expose them as numbers.
const numeric: ValueTransformer = {
  to: (v?: number | null) => v,
  from: (v?: string | null) => (v == null ? v : Number(v)),
};

@Entity('merchant_applications')
export class MerchantApplication {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  businessName!: string;

  @Column({ type: 'varchar', length: 160 })
  legalBusinessName!: string;

  @Column({ type: 'varchar', length: 32 })
  businessType!: BusinessType;

  // Owner / contact information
  @Column({ type: 'varchar', length: 120 })
  ownerName!: string;

  @Column({ type: 'varchar', length: 254 })
  ownerEmail!: string;

  @Column({ type: 'varchar', length: 20 })
  ownerPhone!: string;

  /** Encrypted at rest (AES-256-GCM). Never returned by the API (masked) and never logged. */
  @Column({ type: 'text', nullable: true, transformer: encryptedTransformer })
  ownerTaxId!: string | null;

  // Requested processing information
  @Column({ type: 'numeric', precision: 14, scale: 2, transformer: numeric })
  monthlyVolume!: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: numeric })
  averageTicketSize!: number;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ type: 'varchar', length: 24, default: ApplicationStatus.DRAFT })
  status!: ApplicationStatus;

  @Column({ type: 'varchar', length: 16, default: RiskStatus.NOT_STARTED })
  riskStatus!: RiskStatus;

  /** Incremented on every (re)submission; part of the risk-job idempotency key. */
  @Column({ type: 'int', default: 0 })
  submissionCount!: number;

  @Column({ type: 'uuid' })
  createdById!: string;

  @Column({ type: 'uuid', nullable: true })
  assignedReviewerId!: string | null;

  @Column({ type: 'text', nullable: true })
  decisionNote!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt!: Date | null;

  @VersionColumn()
  version!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
