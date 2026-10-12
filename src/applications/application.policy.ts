import { Injectable } from '@nestjs/common';
import { SelectQueryBuilder } from 'typeorm';
import { AuthUser } from '../common/auth-user';
import { Role } from '../common/enums';
import { MerchantApplication } from './merchant-application.entity';

type Ownership = Pick<MerchantApplication, 'createdById' | 'assignedReviewerId'>;

/**
 * Object-level authorization, in one place.
 *  - ADMIN:    sees and edits everything, but is NOT allowed to record risk decisions.
 *  - SALES:    sees/edits only applications they created.
 *  - REVIEWER: sees only applications assigned to them; only they may decide.
 */
@Injectable()
export class ApplicationPolicy {
  canView(user: AuthUser, app: Ownership): boolean {
    switch (user.role) {
      case Role.ADMIN:
        return true;
      case Role.SALES:
        return app.createdById === user.id;
      case Role.REVIEWER:
        return app.assignedReviewerId === user.id;
      default:
        return false;
    }
  }

  canEdit(user: AuthUser, app: Ownership): boolean {
    return user.role === Role.ADMIN || (user.role === Role.SALES && app.createdById === user.id);
  }

  canDecide(user: AuthUser, app: Ownership): boolean {
    return user.role === Role.REVIEWER && app.assignedReviewerId === user.id;
  }

  /** Same rules as canView, expressed as a SQL predicate so list endpoints can never over-fetch. */
  applyVisibilityScope(qb: SelectQueryBuilder<MerchantApplication>, user: AuthUser, alias: string) {
    switch (user.role) {
      case Role.ADMIN:
        return qb;
      case Role.SALES:
        return qb.andWhere(`${alias}.createdById = :scopeUserId`, { scopeUserId: user.id });
      case Role.REVIEWER:
        return qb.andWhere(`${alias}.assignedReviewerId = :scopeUserId`, { scopeUserId: user.id });
      default:
        return qb.andWhere('1 = 0');
    }
  }
}
