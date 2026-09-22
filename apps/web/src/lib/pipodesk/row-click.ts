import type { MouseEvent } from 'react'

const CONTROL = 'a,button,input,label,select,textarea'

/** A click that started on a control belongs to the control: a row that acts on
 *  it too fires a second time on the same click. */
export const clickedControl = (event: MouseEvent): boolean =>
  (event.target as HTMLElement).closest(CONTROL) !== null
