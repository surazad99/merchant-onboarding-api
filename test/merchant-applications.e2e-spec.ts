import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { BusinessType, Role, RiskStatus } from '../src/common/enums';
import { RiskAssessment, RiskAssessmentInput, RiskProvider } from '../src/risk/risk-provider';
import { RiskProcessor } from '../src/risk/risk.processor';
import { UsersService } from '../src/users/users.service';

/** Controllable stand-in for the third-party risk API. */
class FakeRiskProvider extends RiskProvider {
  failuresRemaining = 0;
  calls = 0;
  async assess(_input: RiskAssessmentInput): Promise<RiskAssessment> {
    this.calls++;
    if (this.failuresRemaining > 0) {
      this.failuresRemaining--;
      throw new Error('simulated provider outage');
    }
    return { score: 12, outcome: RiskStatus.PASSED, reasons: [], providerReference: 'fake-ref' };
  }
}

const PASSWORD = 'Correct-Horse-Battery-9';
const TAX_ID = '123-45-6789';

const validApplication = () => ({
  businessName: 'Himal Coffee',
  legalBusinessName: 'Himal Coffee Roasters Pvt. Ltd.',
  businessType: BusinessType.LLC,
  ownerName: 'Test Owner',
  ownerEmail: 'owner@example.test',
  ownerPhone: '+9779800000000',
  ownerTaxId: TAX_ID,
  monthlyVolume: 25000,
  averageTicketSize: 40,
  currency: 'USD',
});

async function waitFor<T>(fn: () => Promise<T | undefined | false>, timeoutMs = 20000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > deadline) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 100));
  }
}

describe('Merchant applications (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let http: ReturnType<typeof request>;
  const provider = new FakeRiskProvider();
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
  const get = (who: string, url: string) => request(app.getHttpServer()).get(url).set(auth(who));
  const post = (who: string, url: string, body?: object) =>
    request(app.getHttpServer()).post(url).set(auth(who)).send(body);
  const patch = (who: string, url: string, body: object) =>
    request(app.getHttpServer()).patch(url).set(auth(who)).send(body);

  const createApp = async (who: string) => {
    const res = await post(who, '/applications', validApplication()).expect(201);
    return res.body.id as string;
  };
  const submitAndWaitForRisk = async (who: string, id: string) => {
    await post(who, `/applications/${id}/submit`).expect(202);
    return waitFor(async () => {
      const res = await get('admin', `/applications/${id}`);
      return res.body.status === 'UNDER_REVIEW' ? res.body : false;
    });
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RiskProvider)
      .useValue(provider)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    http = request(app.getHttpServer());

    ds = app.get(DataSource);
    await ds.query('TRUNCATE audit_logs, risk_reviews, merchant_applications, users CASCADE');

    const users = app.get(UsersService);
    const seed: [string, Role][] = [
      ['admin', Role.ADMIN],
      ['reviewer1', Role.REVIEWER],
      ['reviewer2', Role.REVIEWER],
      ['sales1', Role.SALES],
      ['sales2', Role.SALES],
    ];
    for (const [name, role] of seed) {
      const u = await users.create({ email: `${name}@example.test`, password: PASSWORD, fullName: name, role });
      ids[name] = u.id;
      const res = await http.post('/auth/login').send({ email: `${name}@example.test`, password: PASSWORD });
      tokens[name] = res.body.accessToken;
    }
  });

  beforeEach(() => {
    provider.failuresRemaining = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  // ------------------------------------------------------------------ auth
  describe('authentication', () => {
    it('issues a JWT for valid credentials', async () => {
      const res = await http.post('/auth/login').send({ email: 'admin@example.test', password: PASSWORD }).expect(200);
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('rejects a wrong password and an unknown email identically', async () => {
      const a = await http.post('/auth/login').send({ email: 'admin@example.test', password: 'wrong-password-123' });
      const b = await http.post('/auth/login').send({ email: 'nobody@example.test', password: 'wrong-password-123' });
      expect(a.status).toBe(401);
      expect(b.status).toBe(401);
      expect(a.body.message).toBe(b.body.message);
    });

    it('protects routes: no token / garbage token -> 401', async () => {
      await http.get('/applications').expect(401);
      await http.get('/applications').set('Authorization', 'Bearer not.a.jwt').expect(401);
    });

    it('denies deactivated users immediately, even with a valid token', async () => {
      const u = await app.get(UsersService).create({
        email: 'gone@example.test', password: PASSWORD, fullName: 'Gone', role: Role.SALES,
      });
      const login = await http.post('/auth/login').send({ email: 'gone@example.test', password: PASSWORD });
      await ds.query('UPDATE users SET is_active = false WHERE id = $1', [u.id]);
      await http.get('/applications').set('Authorization', `Bearer ${login.body.accessToken}`).expect(401);
    });
  });

  // ------------------------------------------------------------ role checks
  describe('role-based access', () => {
    it('only ADMIN can create users', async () => {
      const body = { email: 'new@example.test', password: PASSWORD, fullName: 'New User', role: 'SALES' };
      await post('sales1', '/users', body).expect(403);
      await post('reviewer1', '/users', body).expect(403);
      const res = await post('admin', '/users', body).expect(201);
      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('REVIEWER cannot create applications', async () => {
      await post('reviewer1', '/applications', validApplication()).expect(403);
    });
  });

  // -------------------------------------------------------------- validation
  describe('validation', () => {
    it('rejects unknown/forbidden fields (mass-assignment protection)', async () => {
      await post('sales1', '/applications', { ...validApplication(), status: 'APPROVED', createdById: ids.sales2 }).expect(400);
    });
    it('rejects invalid input', async () => {
      await post('sales1', '/applications', { ...validApplication(), ownerEmail: 'nope', monthlyVolume: -5 }).expect(400);
    });
    it('rejects a malformed id', async () => {
      await get('admin', '/applications/not-a-uuid').expect(400);
    });
  });

  // ------------------------------------------- object-level authorization
  describe('object-level authorization (cannot be bypassed)', () => {
    let appId: string;
    beforeAll(async () => {
      appId = await createApp('sales1');
    });

    it('owner can read and update their own application', async () => {
      await get('sales1', `/applications/${appId}`).expect(200);
      await patch('sales1', `/applications/${appId}`, { businessName: 'Himal Coffee 2' }).expect(200);
    });

    it("SALES user cannot READ another SALES user's application by ID", async () => {
      await get('sales2', `/applications/${appId}`).expect(404);
    });

    it("SALES user cannot UPDATE another SALES user's application by ID", async () => {
      await patch('sales2', `/applications/${appId}`, { businessName: 'hijacked' }).expect(404);
      const res = await get('sales1', `/applications/${appId}`);
      expect(res.body.businessName).toBe('Himal Coffee 2');
    });

    it("SALES user cannot SUBMIT another SALES user's application by ID", async () => {
      await post('sales2', `/applications/${appId}/submit`).expect(404);
      const res = await get('sales1', `/applications/${appId}`);
      expect(res.body.status).toBe('DRAFT');
    });

    it("lists never leak other users' applications", async () => {
      const mine = await get('sales1', '/applications').expect(200);
      expect(mine.body.items.some((a: { id: string }) => a.id === appId)).toBe(true);
      const theirs = await get('sales2', '/applications').expect(200);
      expect(theirs.body.items.some((a: { id: string }) => a.id === appId)).toBe(false);
      expect(theirs.body.total).toBe(0);
    });

    it('an unassigned REVIEWER cannot see or decide the application', async () => {
      await get('reviewer1', `/applications/${appId}`).expect(404);
      await post('reviewer1', `/applications/${appId}/decision`, { decision: 'APPROVE' }).expect(404);
    });

    it('SALES cannot assign or decide', async () => {
      await post('sales1', `/applications/${appId}/assign`, { reviewerId: ids.reviewer1 }).expect(403);
      await post('sales1', `/applications/${appId}/decision`, { decision: 'APPROVE' }).expect(403);
    });

    it('SALES cannot read the audit trail', async () => {
      await get('sales1', `/applications/${appId}/audit`).expect(403);
    });
  });

  // ------------------------------------------------- lifecycle + decisions
  describe('full lifecycle with async risk review', () => {
    let appId: string;

    it('create -> edit -> submit -> risk worker moves it to UNDER_REVIEW', async () => {
      appId = await createApp('sales1');
      await patch('sales1', `/applications/${appId}`, { monthlyVolume: 30000 }).expect(200);

      const submitted = await post('sales1', `/applications/${appId}/submit`).expect(202);
      expect(submitted.body.status).toBe('SUBMITTED');
      expect(submitted.body.riskStatus).toBe('PENDING');

      const reviewed = await waitFor(async () => {
        const res = await get('admin', `/applications/${appId}`);
        return res.body.status === 'UNDER_REVIEW' ? res.body : false;
      });
      expect(reviewed.riskStatus).toBe('PASSED');

      const reviews = await get('admin', `/applications/${appId}/risk-reviews`).expect(200);
      expect(reviews.body).toHaveLength(1);
      expect(reviews.body[0]).toMatchObject({ submissionNumber: 1, status: 'PASSED', score: 12 });
    });

    it('cannot edit or re-submit once submitted', async () => {
      await patch('sales1', `/applications/${appId}`, { businessName: 'late edit' }).expect(409);
      await post('sales1', `/applications/${appId}/submit`).expect(409);
    });

    it('only an ADMIN can assign, and only to an active REVIEWER', async () => {
      await post('admin', `/applications/${appId}/assign`, { reviewerId: ids.sales2 }).expect(400);
      await post('admin', `/applications/${appId}/assign`, { reviewerId: ids.reviewer1 }).expect(200);
    });

    it('ADMIN and non-assigned REVIEWER cannot record a decision; assigned reviewer can', async () => {
      await post('admin', `/applications/${appId}/decision`, { decision: 'APPROVE' }).expect(403);
      await post('reviewer2', `/applications/${appId}/decision`, { decision: 'APPROVE' }).expect(404);
      await post('reviewer1', `/applications/${appId}/decision`, { decision: 'REJECT' }).expect(400); // note required
    });

    it('REQUEST_INFO reopens editing; resubmission triggers a fresh risk review', async () => {
      const res = await post('reviewer1', `/applications/${appId}/decision`, {
        decision: 'REQUEST_INFO',
        note: 'Please confirm the owner phone number.',
      }).expect(200);
      expect(res.body.status).toBe('INFO_REQUESTED');

      await patch('sales1', `/applications/${appId}`, { ownerPhone: '+9779811111111' }).expect(200);
      await post('sales1', `/applications/${appId}/submit`).expect(202);
      await waitFor(async () => {
        const r = await get('admin', `/applications/${appId}`);
        return r.body.status === 'UNDER_REVIEW' && r.body.submissionCount === 2 ? r.body : false;
      });
      const reviews = await get('admin', `/applications/${appId}/risk-reviews`);
      expect(reviews.body.map((r: { submissionNumber: number }) => r.submissionNumber)).toEqual([2, 1]);
    });

    it('approval is final: invalid transitions are rejected with 409', async () => {
      const approved = await post('reviewer1', `/applications/${appId}/decision`, { decision: 'APPROVE' }).expect(200);
      expect(approved.body.status).toBe('APPROVED');

      await post('reviewer1', `/applications/${appId}/decision`, { decision: 'REJECT', note: 'changed my mind' }).expect(409);
      await post('sales1', `/applications/${appId}/submit`).expect(409);
      await patch('sales1', `/applications/${appId}`, { businessName: 'valid name' }).expect(409);
      await post('admin', `/applications/${appId}/assign`, { reviewerId: ids.reviewer2 }).expect(409);
    });

    it('cannot decide an application that is not UNDER_REVIEW', async () => {
      const draft = await createApp('sales2');
      await post('admin', `/applications/${draft}/assign`, { reviewerId: ids.reviewer1 }).expect(200);
      await post('reviewer1', `/applications/${draft}/decision`, { decision: 'APPROVE' }).expect(409);
    });

    it('lists with status filter and pagination', async () => {
      for (let i = 0; i < 3; i++) await createApp('sales2');
      const page1 = await get('sales2', '/applications?status=DRAFT&limit=2&page=1').expect(200);
      expect(page1.body.items).toHaveLength(2);
      expect(page1.body.total).toBeGreaterThanOrEqual(4);
      const none = await get('sales2', '/applications?status=APPROVED').expect(200);
      expect(none.body.total).toBe(0);
      await get('sales2', '/applications?limit=1000').expect(400);
    });

    it('reviewer sees only their assigned applications in lists', async () => {
      const res = await get('reviewer1', '/applications').expect(200);
      expect(res.body.items.length).toBeGreaterThan(0);
      for (const a of res.body.items) expect(a.assignedReviewerId).toBe(ids.reviewer1);
    });
  });

  // ------------------------------------------------ async reliability
  describe('risk review reliability', () => {
    it('retries transient provider failures with backoff and still completes once', async () => {
      provider.failuresRemaining = 2;
      const before = provider.calls;
      const id = await createApp('sales1');
      const done = await submitAndWaitForRisk('sales1', id);
      expect(done.riskStatus).toBe('PASSED');
      expect(provider.calls - before).toBe(3); // 2 failures + 1 success
      const reviews = await get('admin', `/applications/${id}/risk-reviews`);
      expect(reviews.body).toHaveLength(1);
      expect(reviews.body[0].attempts).toBe(3);
    });

    it('after exhausting retries, falls back to manual review (riskStatus FAILED) instead of getting stuck', async () => {
      provider.failuresRemaining = 100;
      const id = await createApp('sales1');
      const done = await submitAndWaitForRisk('sales1', id);
      expect(done.riskStatus).toBe(RiskStatus.FAILED);
      const audit = await get('admin', `/applications/${id}/audit`).expect(200);
      expect(audit.body.map((a: { action: string }) => a.action)).toContain('RISK_REVIEW_FAILED');
    });

    it('is idempotent: replaying / duplicating the job never re-processes or double-writes', async () => {
      const id = await createApp('sales1');
      await submitAndWaitForRisk('sales1', id);
      const callsAfterFirstRun = provider.calls;

      const processor = app.get(RiskProcessor);
      const fakeJob = { id: 'dup', attemptsMade: 0, data: { applicationId: id, submissionNumber: 1 } } as never;
      await Promise.all([processor.process(fakeJob), processor.process(fakeJob), processor.process(fakeJob)]);

      expect(provider.calls).toBe(callsAfterFirstRun); // stale/duplicate jobs are skipped before calling the provider
      const [{ count }] = await ds.query('SELECT count(*)::int AS count FROM risk_reviews WHERE application_id = $1', [id]);
      expect(count).toBe(1);
      const res = await get('admin', `/applications/${id}`);
      expect(res.body.status).toBe('UNDER_REVIEW');
    });

    it('concurrent duplicate jobs racing on a SUBMITTED application persist exactly one result', async () => {
      // Park the application in SUBMITTED without letting the real worker handle it.
      const id = await createApp('sales1');
      await ds.query(
        `UPDATE merchant_applications SET status = 'SUBMITTED', risk_status = 'PENDING', submission_count = 1 WHERE id = $1`,
        [id],
      );
      const processor = app.get(RiskProcessor);
      const job = { id: 'race', attemptsMade: 0, data: { applicationId: id, submissionNumber: 1 } } as never;
      await Promise.all([processor.process(job), processor.process(job), processor.process(job)]);

      const [{ count }] = await ds.query('SELECT count(*)::int AS count FROM risk_reviews WHERE application_id = $1', [id]);
      expect(count).toBe(1);
      const audit = await ds.query(
        `SELECT count(*)::int AS count FROM audit_logs WHERE entity_id = $1 AND action = 'RISK_REVIEW_COMPLETED'`,
        [id],
      );
      expect(audit[0].count).toBe(1);
    });

    it('ADMIN can re-enqueue a pending review (reconciliation), and it is a no-op if already handled', async () => {
      const id = await createApp('sales1');
      await post('admin', `/applications/${id}/risk-review/enqueue`).expect(409); // still DRAFT
      await submitAndWaitForRisk('sales1', id);
      await post('admin', `/applications/${id}/risk-review/enqueue`).expect(409); // already UNDER_REVIEW
    });
  });

  // -------------------------------------------------- audit + sensitive data
  describe('audit trail and sensitive data', () => {
    let appId: string;
    beforeAll(async () => {
      appId = await createApp('sales1');
      await patch('sales1', `/applications/${appId}`, { ownerTaxId: '987-65-4321', businessName: 'Renamed' }).expect(200);
      await submitAndWaitForRisk('sales1', appId);
      await post('admin', `/applications/${appId}/assign`, { reviewerId: ids.reviewer1 }).expect(200);
      await post('reviewer1', `/applications/${appId}/decision`, { decision: 'APPROVE' }).expect(200);
    });

    it('records creation, update, submission, risk result, assignment and the decision', async () => {
      const res = await get('admin', `/applications/${appId}/audit`).expect(200);
      const actions = res.body.map((a: { action: string }) => a.action);
      expect(actions).toEqual(
        expect.arrayContaining([
          'APPLICATION_CREATED',
          'APPLICATION_UPDATED',
          'APPLICATION_SUBMITTED',
          'RISK_REVIEW_COMPLETED',
          'APPLICATION_ASSIGNED',
          'REVIEW_DECISION',
        ]),
      );
      const decision = res.body.find((a: { action: string }) => a.action === 'REVIEW_DECISION');
      expect(decision.actorId).toBe(ids.reviewer1);
      const risk = res.body.find((a: { action: string }) => a.action === 'RISK_REVIEW_COMPLETED');
      expect(risk.actorType).toBe('SYSTEM');
    });

    it('never stores secrets or sensitive values in audit metadata', async () => {
      const rows = await ds.query('SELECT metadata::text AS m FROM audit_logs');
      const all = rows.map((r: { m: string }) => r.m).join('\n');
      expect(all).not.toContain('987-65-4321');
      expect(all).not.toContain(TAX_ID);
      expect(all).not.toContain(PASSWORD);
      expect(all.toLowerCase()).not.toContain('password');
    });

    it('encrypts the tax ID at rest and returns it only masked', async () => {
      const [row] = await ds.query('SELECT owner_tax_id FROM merchant_applications WHERE id = $1', [appId]);
      expect(row.owner_tax_id.startsWith('v1:')).toBe(true);
      expect(row.owner_tax_id).not.toContain('987-65-4321');

      const res = await get('admin', `/applications/${appId}`).expect(200);
      expect(res.body).not.toHaveProperty('ownerTaxId');
      expect(res.body.ownerTaxIdMasked).toBe('*******4321');
    });
  });
});
