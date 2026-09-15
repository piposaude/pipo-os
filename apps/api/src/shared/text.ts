/** Twin of `normalizeText` in web/src/lib/pipodesk/filter.ts and of the SQL in
 *  tickets/filter-resolver: decompose, drop the combining marks, lower. */
export const foldText = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
