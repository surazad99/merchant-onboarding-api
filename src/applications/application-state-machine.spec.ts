import { ApplicationStatus as S } from '../common/enums';
import {
  ApplicationAction as A,
  canTransition,
  InvalidTransitionError,
  isEditable,
  isTerminal,
  transition,
} from './application-state-machine';

describe('application state machine', () => {
  it.each([
    [S.DRAFT, A.SUBMIT, S.SUBMITTED],
    [S.SUBMITTED, A.START_REVIEW, S.UNDER_REVIEW],
    [S.UNDER_REVIEW, A.APPROVE, S.APPROVED],
    [S.UNDER_REVIEW, A.REJECT, S.REJECTED],
    [S.UNDER_REVIEW, A.REQUEST_INFO, S.INFO_REQUESTED],
    [S.INFO_REQUESTED, A.SUBMIT, S.SUBMITTED],
  ])('%s --%s--> %s', (from, action, to) => {
    expect(transition(from, action)).toBe(to);
  });

  it.each([
    [S.DRAFT, A.APPROVE],
    [S.DRAFT, A.REJECT],
    [S.DRAFT, A.START_REVIEW],
    [S.SUBMITTED, A.APPROVE], // cannot decide before the risk review has completed
    [S.SUBMITTED, A.SUBMIT],
    [S.UNDER_REVIEW, A.SUBMIT],
    [S.INFO_REQUESTED, A.APPROVE],
    [S.APPROVED, A.REJECT],
    [S.APPROVED, A.SUBMIT],
    [S.REJECTED, A.APPROVE],
    [S.REJECTED, A.SUBMIT],
  ])('rejects %s --%s-->', (from, action) => {
    expect(canTransition(from, action)).toBe(false);
    expect(() => transition(from, action)).toThrow(InvalidTransitionError);
  });

  it('only DRAFT and INFO_REQUESTED are editable', () => {
    const editable = Object.values(S).filter(isEditable);
    expect(editable.sort()).toEqual([S.DRAFT, S.INFO_REQUESTED].sort());
  });

  it('APPROVED and REJECTED are terminal', () => {
    expect(Object.values(S).filter(isTerminal).sort()).toEqual([S.APPROVED, S.REJECTED].sort());
    for (const a of Object.values(A)) {
      expect(canTransition(S.APPROVED, a)).toBe(false);
      expect(canTransition(S.REJECTED, a)).toBe(false);
    }
  });
});
