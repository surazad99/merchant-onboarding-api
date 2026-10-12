import { BusinessType, RiskStatus } from '../common/enums';

/** Deliberately minimal input: no owner PII or tax ID is ever sent to the (simulated) third party. */
export interface RiskAssessmentInput {
  applicationId: string;
  submissionNumber: number;
  businessName: string;
  legalBusinessName: string;
  businessType: BusinessType;
  monthlyVolume: number;
  averageTicketSize: number;
  currency: string;
}

export interface RiskAssessment {
  score: number;
  outcome: RiskStatus.PASSED | RiskStatus.FLAGGED;
  reasons: string[];
  providerReference: string;
}

/** Abstract class doubles as the DI token, so tests can swap in a controllable fake. */
export abstract class RiskProvider {
  abstract assess(input: RiskAssessmentInput): Promise<RiskAssessment>;
}
