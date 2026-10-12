import { AuthUser } from '../common/auth-user';
import { Role } from '../common/enums';
import { ApplicationPolicy } from './application.policy';

const user = (id: string, role: Role): AuthUser => ({ id, role, email: `${id}@example.test` });
const app = { createdById: 'sales-1', assignedReviewerId: 'rev-1' };
const policy = new ApplicationPolicy();

describe('ApplicationPolicy (object-level authorization)', () => {
  describe('canView', () => {
    it('ADMIN sees everything', () => expect(policy.canView(user('a', Role.ADMIN), app)).toBe(true));
    it('SALES sees only their own', () => {
      expect(policy.canView(user('sales-1', Role.SALES), app)).toBe(true);
      expect(policy.canView(user('sales-2', Role.SALES), app)).toBe(false);
    });
    it('REVIEWER sees only applications assigned to them', () => {
      expect(policy.canView(user('rev-1', Role.REVIEWER), app)).toBe(true);
      expect(policy.canView(user('rev-2', Role.REVIEWER), app)).toBe(false);
      expect(policy.canView(user('rev-1', Role.REVIEWER), { ...app, assignedReviewerId: null })).toBe(false);
    });
  });

  describe('canEdit', () => {
    it('ADMIN and the owning SALES user can edit', () => {
      expect(policy.canEdit(user('a', Role.ADMIN), app)).toBe(true);
      expect(policy.canEdit(user('sales-1', Role.SALES), app)).toBe(true);
    });
    it('other SALES users and REVIEWERs cannot', () => {
      expect(policy.canEdit(user('sales-2', Role.SALES), app)).toBe(false);
      expect(policy.canEdit(user('rev-1', Role.REVIEWER), app)).toBe(false);
    });
  });

  describe('canDecide', () => {
    it('only the assigned REVIEWER may decide', () => {
      expect(policy.canDecide(user('rev-1', Role.REVIEWER), app)).toBe(true);
      expect(policy.canDecide(user('rev-2', Role.REVIEWER), app)).toBe(false);
    });
    it('ADMIN and SALES may not decide, even on their own application', () => {
      expect(policy.canDecide(user('a', Role.ADMIN), app)).toBe(false);
      expect(policy.canDecide(user('sales-1', Role.SALES), app)).toBe(false);
    });
    it('nobody may decide an unassigned application', () => {
      expect(policy.canDecide(user('rev-1', Role.REVIEWER), { ...app, assignedReviewerId: null })).toBe(false);
    });
  });
});
