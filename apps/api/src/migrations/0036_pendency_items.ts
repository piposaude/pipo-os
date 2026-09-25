import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE pendency_items (
      id text PRIMARY KEY,
      label text NOT NULL,
      category text NOT NULL CONSTRAINT pendency_items_category_check
        CHECK (category IN ('document', 'signature', 'correction', 'data')),
      enrollment_type text CONSTRAINT pendency_items_enrollment_type_check
        CHECK (enrollment_type IN (
          'inclusion', 'exclusion', 'plan_change', 'registration_data_change', 'combined_change'
        )),
      active boolean NOT NULL DEFAULT true,
      position integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db)

  await sql`
    CREATE TRIGGER trg_pendency_items_updated_at
    BEFORE UPDATE ON pendency_items
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db)

  /* Events name these ids in their metadata with no foreign key, so an item
     leaves the list by active = false, never by DELETE or a new id. */
  await sql`
    INSERT INTO pendency_items (id, label, category, enrollment_type, position) VALUES
      ('rg', 'RG do titular', 'document', null, 1),
      ('rg-dependente', 'RG do dependente', 'document', 'inclusion', 2),
      ('cpf', 'CPF do titular', 'document', null, 3),
      ('comprovante-residencia', 'Comprovante de residência', 'document', null, 4),
      ('certidao-nascimento', 'Certidão de nascimento do dependente', 'document', 'inclusion', 5),
      ('certidao-casamento', 'Certidão de casamento', 'document', 'inclusion', 6),
      ('uniao-estavel', 'Escritura de união estável', 'document', 'inclusion', 7),
      ('ficha-inclusao', 'Ficha de inclusão', 'document', 'inclusion', 8),
      ('ficha-exclusao', 'Ficha de exclusão', 'document', 'exclusion', 9),
      ('declaracao-saude', 'Declaração de saúde — preenchimento', 'document', 'inclusion', 10),
      ('carta-empresa', 'Carta da empresa solicitando', 'document', null, 11),
      ('carteira-trabalho', 'Carteira de trabalho — página de admissão', 'document', 'inclusion', 12),
      ('comprovante-desligamento', 'Comprovante de desligamento', 'document', 'exclusion', 13),
      ('carta-portabilidade', 'Carta de portabilidade da operadora anterior', 'document', 'inclusion', 14),
      ('contrato-social', 'Contrato social da empresa', 'document', null, 15),
      ('assin-ficha-inclusao-rh', 'Ficha de inclusão — assinatura do RH', 'signature', 'inclusion', 16),
      ('assin-ficha-inclusao-membro', 'Ficha de inclusão — assinatura do beneficiário', 'signature', 'inclusion', 17),
      ('assin-ficha-exclusao-rh', 'Ficha de exclusão — assinatura do RH', 'signature', 'exclusion', 18),
      ('assin-declaracao-saude', 'Declaração de saúde — assinatura', 'signature', 'inclusion', 19),
      ('assin-termo-adesao', 'Termo de adesão — assinatura do beneficiário', 'signature', 'inclusion', 20),
      ('assin-aditivo', 'Aditivo contratual — assinatura da empresa', 'signature', null, 21),
      ('corr-ilegivel', 'Documento ilegível — reenviar', 'correction', null, 22),
      ('corr-pessoa-errada', 'Documento de outra pessoa', 'correction', null, 23),
      ('dado-email-pessoal', 'E-mail pessoal do beneficiário', 'data', null, 24),
      ('dado-nome-mae', 'Nome da mãe', 'data', 'inclusion', 25)
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE pendency_items`.execute(db)
}
