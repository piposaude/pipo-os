export const UNIQUE_VIOLATION = '23505'
export const FK_VIOLATION = '23503'
export const NOT_NULL_VIOLATION = '23502'
export const CHECK_VIOLATION = '23514'
export const INVALID_TEXT_REPRESENTATION = '22P02'

export async function codeOf(write: Promise<unknown>): Promise<string | undefined> {
  try {
    await write
    return undefined
  } catch (err) {
    if (err instanceof Error && 'code' in err) return err.code as string
    // No Postgres code means the test itself is broken, not a constraint firing.
    throw err
  }
}
