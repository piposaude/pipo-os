export {
  CHECK_VIOLATION,
  FK_VIOLATION,
  INVALID_TEXT_REPRESENTATION,
  NOT_NULL_VIOLATION,
  UNIQUE_VIOLATION,
} from './pg.js'

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
