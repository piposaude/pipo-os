import { z } from 'zod'
import type { ErrorDetail } from './errors.js'

export const emailSchema = z.email()

export const isEmail = (value: unknown): value is string => emailSchema.safeParse(value).success

export const errorDetailSchema = z
  .object({
    field: z.string(),
    message: z.string(),
    code: z.string(),
  })
  .meta({ id: 'ErrorDetail' }) satisfies z.ZodType<ErrorDetail>

// Every module used to declare its own copy of this under the same OpenAPI id,
// which only produced one component because the last registration wins.
export const errorResponseSchema = z
  .object({
    error: z.string(),
    message: z.string(),
    // Optional, never an empty array: a 404 has no fields to report, and [] would
    // claim the fields were checked and all passed.
    details: z.array(errorDetailSchema).nonempty().optional(),
  })
  .meta({ id: 'ErrorResponse' })
