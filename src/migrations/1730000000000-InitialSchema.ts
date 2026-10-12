import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1730000000000 implements MigrationInterface {
  name = 'InitialSchema1730000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE users (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email         varchar(254) NOT NULL,
        password_hash varchar(100) NOT NULL,
        full_name     varchar(120) NOT NULL,
        role          varchar(16)  NOT NULL,
        is_active     boolean      NOT NULL DEFAULT true,
        created_at    timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT uq_users_email UNIQUE (email),
        CONSTRAINT ck_users_role CHECK (role IN ('ADMIN','REVIEWER','SALES'))
      )`);

    await q.query(`
      CREATE TABLE merchant_applications (
        id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        business_name        varchar(120)  NOT NULL,
        legal_business_name  varchar(160)  NOT NULL,
        business_type        varchar(32)   NOT NULL,
        owner_name           varchar(120)  NOT NULL,
        owner_email          varchar(254)  NOT NULL,
        owner_phone          varchar(20)   NOT NULL,
        owner_tax_id         text,                         -- AES-256-GCM ciphertext (see field-encryption.ts)
        monthly_volume       numeric(14,2) NOT NULL,
        average_ticket_size  numeric(12,2) NOT NULL,
        currency             char(3)       NOT NULL,
        status               varchar(24)   NOT NULL DEFAULT 'DRAFT',
        risk_status          varchar(16)   NOT NULL DEFAULT 'NOT_STARTED',
        submission_count     integer       NOT NULL DEFAULT 0,
        created_by_id        uuid          NOT NULL REFERENCES users(id),
        assigned_reviewer_id uuid          REFERENCES users(id),
        decision_note        text,
        decided_at           timestamptz,
        version              integer       NOT NULL DEFAULT 1,
        created_at           timestamptz   NOT NULL DEFAULT now(),
        updated_at           timestamptz   NOT NULL DEFAULT now(),
        CONSTRAINT ck_app_status CHECK (status IN
          ('DRAFT','SUBMITTED','UNDER_REVIEW','INFO_REQUESTED','APPROVED','REJECTED')),
        CONSTRAINT ck_app_risk_status CHECK (risk_status IN
          ('NOT_STARTED','PENDING','PASSED','FLAGGED','FAILED')),
        CONSTRAINT ck_app_business_type CHECK (business_type IN
          ('SOLE_PROPRIETORSHIP','PARTNERSHIP','LLC','CORPORATION','NONPROFIT')),
        CONSTRAINT ck_app_positive_amounts CHECK (monthly_volume > 0 AND average_ticket_size > 0)
      )`);
    // Supports the scoped list queries (SALES by creator, REVIEWER by assignee) + status filter + ordering.
    await q.query(`CREATE INDEX ix_apps_created_by ON merchant_applications (created_by_id, status, created_at DESC)`);
    await q.query(`CREATE INDEX ix_apps_reviewer ON merchant_applications (assigned_reviewer_id, status, created_at DESC)`);
    await q.query(`CREATE INDEX ix_apps_status ON merchant_applications (status, created_at DESC)`);

    await q.query(`
      CREATE TABLE risk_reviews (
        id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        application_id     uuid        NOT NULL REFERENCES merchant_applications(id) ON DELETE CASCADE,
        submission_number  integer     NOT NULL,
        status             varchar(16) NOT NULL,
        score              integer,
        reasons            jsonb       NOT NULL DEFAULT '[]',
        provider_reference varchar(64),
        attempts           integer     NOT NULL DEFAULT 1,
        created_at         timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_risk_reviews_application_submission UNIQUE (application_id, submission_number),
        CONSTRAINT ck_risk_status CHECK (status IN ('PASSED','FLAGGED','FAILED'))
      )`);

    await q.query(`
      CREATE TABLE audit_logs (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_id    uuid,
        actor_type  varchar(8)  NOT NULL,
        action      varchar(64) NOT NULL,
        entity_type varchar(32) NOT NULL,
        entity_id   uuid        NOT NULL,
        metadata    jsonb       NOT NULL DEFAULT '{}',
        created_at  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_audit_actor_type CHECK (actor_type IN ('USER','SYSTEM'))
      )`);
    await q.query(`CREATE INDEX ix_audit_entity ON audit_logs (entity_type, entity_id, created_at)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE audit_logs`);
    await q.query(`DROP TABLE risk_reviews`);
    await q.query(`DROP TABLE merchant_applications`);
    await q.query(`DROP TABLE users`);
  }
}
