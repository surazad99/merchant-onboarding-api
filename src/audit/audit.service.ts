import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { redact } from '../common/utils/redact';
import { AuditAction } from './audit-actions';
import { AuditLog } from './audit-log.entity';

export interface AuditEntry {
  /** Omit for system/worker actions. */
  actorId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(@InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>) {}

  /** Pass `manager` to write the audit row in the same transaction as the business change. */
  async record(entry: AuditEntry, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(AuditLog) : this.repo;
    await repo.save(
      repo.create({
        actorId: entry.actorId ?? null,
        actorType: entry.actorId ? 'USER' : 'SYSTEM',
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: redact(entry.metadata ?? {}),
      }),
    );
  }

  listForEntity(entityType: string, entityId: string, limit = 200): Promise<AuditLog[]> {
    return this.repo.find({
      where: { entityType, entityId },
      order: { createdAt: 'ASC' },
      take: limit,
    });
  }
}
