/** Postgres SQLSTATEs the code reacts to. Named here so a rethrow and the test
 *  that proves it cannot drift to different literals. */
export const UNIQUE_VIOLATION = '23505'
export const FK_VIOLATION = '23503'
export const NOT_NULL_VIOLATION = '23502'
export const CHECK_VIOLATION = '23514'
export const INVALID_TEXT_REPRESENTATION = '22P02'
