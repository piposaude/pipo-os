import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE outbound_webhook_deliveries
      DROP COLUMN signing_secret,
      ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now(),
      ADD COLUMN locked_at timestamptz,
      ADD COLUMN response_status integer,
      ADD CONSTRAINT outbound_webhook_deliveries_status_check
        CHECK (status IN ('pending', 'delivered', 'failed', 'dead'))
  `.execute(db)

  await sql`
    CREATE INDEX ix_outbound_deliveries_due
      ON outbound_webhook_deliveries (next_attempt_at)
      WHERE status IN ('pending', 'failed')
  `.execute(db)

  await sql`
    ALTER TABLE webhook_configs
      ALTER COLUMN event_types SET DEFAULT '["ticket.status_changed"]'
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE webhook_configs
      ALTER COLUMN event_types SET DEFAULT '["ticket.closed"]'
  `.execute(db)
  await sql`DROP INDEX ix_outbound_deliveries_due`.execute(db)
  await sql`
    ALTER TABLE outbound_webhook_deliveries
      DROP CONSTRAINT outbound_webhook_deliveries_status_check,
      DROP COLUMN response_status,
      DROP COLUMN locked_at,
      DROP COLUMN next_attempt_at,
      ADD COLUMN signing_secret text
  `.execute(db)
}
