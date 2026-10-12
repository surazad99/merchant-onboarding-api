import { ConfigService } from '@nestjs/config';
import { BusinessType, RiskStatus } from '../common/enums';
import { SimulatedRiskProvider } from './simulated-risk.provider';

const input = {
  applicationId: 'id',
  submissionNumber: 1,
  businessName: 'Acme',
  legalBusinessName: 'Acme LLC',
  businessType: BusinessType.LLC,
  monthlyVolume: 1000,
  averageTicketSize: 20,
  currency: 'USD',
};
const provider = (rate: string) => new SimulatedRiskProvider({ get: () => rate } as unknown as ConfigService);

describe('SimulatedRiskProvider', () => {
  it('is deterministic for the same business (safe to retry / replay)', async () => {
    const p = provider('0');
    expect(await p.assess(input)).toEqual(await p.assess(input));
  });

  it('flags very high volume merchants', async () => {
    const r = await provider('0').assess({ ...input, monthlyVolume: 900_000, averageTicketSize: 9_000 });
    expect(r.outcome).toBe(RiskStatus.FLAGGED);
    expect(r.reasons).toEqual(expect.arrayContaining(['HIGH_PROCESSING_VOLUME', 'HIGH_TICKET_SIZE']));
  });

  it('throws when the simulated failure rate is 100%', async () => {
    await expect(provider('1').assess(input)).rejects.toThrow(/timeout/);
  });
});
