import { z } from 'zod'

export const googleLoginQuerySchema = z.object({
  redirect: z.string().optional(),
})

export const googleCallbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
})

export const meResponseSchema = z
  .object({
    email: z.email(),
    policies: z.array(z.string()),
  })
  .meta({ id: 'AuthMe' })

export type MeResponse = z.infer<typeof meResponseSchema>
