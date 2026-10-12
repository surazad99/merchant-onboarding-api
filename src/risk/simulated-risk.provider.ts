import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusinessType, RiskStatus } from '../common/enums';
import { RiskAssessment, RiskAssessmentInput, RiskProvider } from './risk-provider';

/**
 * Simulates a third-party KYB/risk API.
 *  - Deterministic for the same business (so retries/replays give the same answer).
 *  - Randomly throws (RISK_SIMULATED_FAILURE_RATE) to exercise retry + backoff.
 */
@Injectable()
export class SimulatedRiskProvider extends RiskProvider {
  constructor(private readonly config: ConfigService) {
    super();
  }

  async assess(input: RiskAssessmentInput): Promise<RiskAssessment> {
    const failureRate = Number(this.config.get('RISK_SIMULATED_FAILURE_RATE') ?? 0);
    if (Math.random() < failureRate) {
      throw new Error('Simulated risk provider timeout');
    }

    const digest = createHash('sha256')
      .update(`${input.legalBusinessName.toLowerCase()}|${input.businessType}`)
      .digest();

    let score = digest[0] % 60; // 0..59 baseline from the "KYB lookup"
    const reasons: string[] = [];
    if (input.monthlyVolume > 250_000) {
      score += 40;
      reasons.push('HIGH_PROCESSING_VOLUME');
    }
    if (input.averageTicketSize > 5_000) {
      score += 20;
      reasons.push('HIGH_TICKET_SIZE');
    }
    if (input.businessType === BusinessType.SOLE_PROPRIETORSHIP && input.monthlyVolume > 50_000) {
      score += 5;
      reasons.push('SOLE_PROPRIETOR_HIGH_VOLUME');
    }
    score = Math.min(score, 100);

    const outcome = score >= 60 ? RiskStatus.FLAGGED : RiskStatus.PASSED;
    if (outcome === RiskStatus.FLAGGED) reasons.push('ELEVATED_RISK_SCORE');

    return { score, outcome, reasons, providerReference: `sim-${digest.toString('hex').slice(0, 12)}` };
  }
}
