import { z } from 'zod'

/** A GET past ~300 uuids is cut by the ingress (414) before reaching the API. */
export const MAX_COMPANY_IDS = 100

export const companySummarySchema = z
  .object({
    id: z.uuid(),
    name: z.string().nullable(),
    taxId: z.string().nullable(),
  })
  .meta({
    id: 'CompanySummary',
    description:
      'A company as the company-service knows it. taxId is the CNPJ as the company-service stores it. Either can be null when the company-service has none.',
  })

export const companyListSchema = z
  .object({
    data: z.array(companySummarySchema),
  })
  .meta({
    id: 'CompanyList',
    description:
      'The companies asked for that the company-service knows. An unknown id is left out.',
  })

export const listCompaniesQuerySchema = z.object({
  ids: z
    .union([
      z.array(z.uuid().toLowerCase()).max(MAX_COMPANY_IDS),
      z
        .uuid()
        .toLowerCase()
        .transform((id) => [id]),
    ])
    .optional()
    .describe(`Repetido: ?ids=a&ids=b. No máximo ${MAX_COMPANY_IDS}.`),
})

export type CompanyList = z.infer<typeof companyListSchema>
