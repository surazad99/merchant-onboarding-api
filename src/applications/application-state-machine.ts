import { ConflictException } from '@nestjs/common';
import { ApplicationStatus } from '../common/enums';

export enum ApplicationAction {
  SUBMIT = 'SUBMIT',
  /** System-only: fired by the risk worker once the risk result is persisted. */
  START_REVIEW = 'START_REVIEW',
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  REQUEST_INFO = 'REQUEST_INFO',
}

const S = ApplicationStatus;
const A = ApplicationAction;

/**
 * Single source of truth for the lifecycle.
 *
 *   DRAFT --SUBMIT--> SUBMITTED --START_REVIEW--> UNDER_REVIEW --APPROVE--> APPROVED
 *                        ^                              |------REJECT---> REJECTED
 *                        |                              '--REQUEST_INFO-> INFO_REQUESTED
 *                        '------------------SUBMIT------------------------------'
 */
const TRANSITIONS: Record<ApplicationStatus, Partial<Record<ApplicationAction, ApplicationStatus>>> = {
  [S.DRAFT]: { [A.SUBMIT]: S.SUBMITTED },
  [S.SUBMITTED]: { [A.START_REVIEW]: S.UNDER_REVIEW },
  [S.UNDER_REVIEW]: {
    [A.APPROVE]: S.APPROVED,
    [A.REJECT]: S.REJECTED,
    [A.REQUEST_INFO]: S.INFO_REQUESTED,
  },
  [S.INFO_REQUESTED]: { [A.SUBMIT]: S.SUBMITTED },
  [S.APPROVED]: {},
  [S.REJECTED]: {},
};

export const EDITABLE_STATUSES: readonly ApplicationStatus[] = [S.DRAFT, S.INFO_REQUESTED];
export const TERMINAL_STATUSES: readonly ApplicationStatus[] = [S.APPROVED, S.REJECTED];

export class InvalidTransitionError extends ConflictException {
  constructor(from: ApplicationStatus, action: ApplicationAction) {
    super(`Cannot ${action} an application in status ${from}`);
  }
}

export function canTransition(from: ApplicationStatus, action: ApplicationAction): boolean {
  return TRANSITIONS[from]?.[action] !== undefined;
}

export function transition(from: ApplicationStatus, action: ApplicationAction): ApplicationStatus {
  const next = TRANSITIONS[from]?.[action];
  if (!next) throw new InvalidTransitionError(from, action);
  return next;
}

export const isEditable = (status: ApplicationStatus) => EDITABLE_STATUSES.includes(status);
export const isTerminal = (status: ApplicationStatus) => TERMINAL_STATUSES.includes(status);
