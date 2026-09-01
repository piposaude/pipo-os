/** Whether shortcuts spell ⌘ or Ctrl. Read once at load; safe fallback is
 *  Ctrl when `navigator` is missing. */
export const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '')
