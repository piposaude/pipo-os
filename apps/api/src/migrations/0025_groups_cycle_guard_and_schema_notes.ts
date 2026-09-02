import { sql, type Kysely } from 'kysely'

/**
 * The `parent_id <> id` CHECK from 0024 only covers depth 1. A cycle at depth
 * two or more (A → B → A) needs to walk the ancestors, which a CHECK cannot
 * do — so it is a trigger, and it lives in the database on purpose: the API is
 * not the only writer here (migrations, backfills and psql sessions are too),
 * and `ancestorsOf` in the frontend guards its own traversal but cannot stop
 * the write.
 *
 * A separate migration instead of editing 0024: that one may already be
 * applied, and the migrator never re-runs a recorded migration.
 *
 * It also carries two `COMMENT ON COLUMN`s, which is why the name is not only
 * about the trigger: what the schema deliberately does not enforce belongs in
 * the database, not only in the repository.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // The hop ceiling is not the depth rule (three levels, PD-050) — it is what
  // keeps the walk finite if a cycle ever gets in through a path this trigger
  // does not cover.
  await sql`
    CREATE FUNCTION ticket_groups_reject_cycle() RETURNS trigger
    LANGUAGE plpgsql AS $$
    DECLARE
      ancestor uuid := NEW.parent_id;
      hops int := 0;
    BEGIN
      WHILE ancestor IS NOT NULL LOOP
        IF ancestor = NEW.id THEN
          RAISE EXCEPTION
            'ticket_groups: parent_id % would close a cycle on %', NEW.parent_id, NEW.id;
        END IF;
        hops := hops + 1;
        IF hops > 32 THEN
          RAISE EXCEPTION 'ticket_groups: ancestor chain of % is longer than 32 hops', NEW.id;
        END IF;
        SELECT parent_id INTO ancestor FROM ticket_groups WHERE id = ancestor;
      END LOOP;
      RETURN NEW;
    END;
    $$
  `.execute(db)

  // `UPDATE OF parent_id`, so renaming a group does not walk the tree. The
  // WHEN skips the roots, which are the common insert.
  await sql`
    CREATE TRIGGER ticket_groups_no_cycle
      BEFORE INSERT OR UPDATE OF parent_id ON ticket_groups
      FOR EACH ROW WHEN (NEW.parent_id IS NOT NULL)
      EXECUTE FUNCTION ticket_groups_reject_cycle()
  `.execute(db)

  /* Two rules this schema deliberately does NOT enforce, written where whoever
     asks "why is there no constraint for this?" will look: `\d+` in psql. A
     comment in the repository does not reach the person reading the database. */
  await sql`
    COMMENT ON COLUMN ticket_groups.parent_id IS
      'Cycles are refused by the ticket_groups_no_cycle trigger. A single root is NOT enforced: a unique partial index on parent_id IS NULL cannot coexist with the parentless groups POST /api/groups creates. PD-050 decides whether the API refuses a second root.'
  `.execute(db)

  await sql`
    COMMENT ON COLUMN ticket_group_companies.company_id IS
      'No foreign key, and none is possible: companies live in another service, so there is no table to reference. Being a uuid is all the database guarantees — never that it names a company. Validation belongs to the edge that writes it (PD-051).'
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`COMMENT ON COLUMN ticket_group_companies.company_id IS NULL`.execute(db)
  await sql`COMMENT ON COLUMN ticket_groups.parent_id IS NULL`.execute(db)
  await sql`DROP TRIGGER IF EXISTS ticket_groups_no_cycle ON ticket_groups`.execute(db)
  await sql`DROP FUNCTION IF EXISTS ticket_groups_reject_cycle()`.execute(db)
}
