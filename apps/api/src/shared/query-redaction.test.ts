import { describe, expect, it } from 'vitest'
import { PII_QUERY_PARAMS } from '@pipo-os/observability/redact'
import { QUERY_FIELD_PII } from '../modules/tickets/rows-schema.js'
import { LIST_QUERY_FIELD_PII } from '../modules/tickets/schemas.js'
import { USERS_QUERY_FIELD_PII } from '../modules/users/schemas.js'

/** The query string is logged whole, so a parameter a person types has to be
 *  named in the redaction list as well as classified here. */
describe('the query string of every route that takes one', () => {
  it.each([
    ['GET /tickets/rows', QUERY_FIELD_PII],
    ['GET /tickets', LIST_QUERY_FIELD_PII],
    ['GET /users', USERS_QUERY_FIELD_PII],
  ])('redacts every parameter of %s classified as typed by a person', (_route, classification) => {
    const typed = Object.entries(classification)
      .filter(([, why]) => why === true)
      .map(([field]) => field)

    expect(typed.length).toBeGreaterThan(0)
    // Contains, not equals: the list is the whole API's, each route is one of them.
    expect(PII_QUERY_PARAMS).toEqual(expect.arrayContaining(typed))
  })
})
