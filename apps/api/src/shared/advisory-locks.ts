/** Advisory locks are keyed per database, so two callers that pick the same
 *  number serialize against each other: take a key from here, never inline. */
export const ADVISORY_LOCKS = {
  groupHierarchy: 8050,
  groupPortfolios: 8051,
} as const
