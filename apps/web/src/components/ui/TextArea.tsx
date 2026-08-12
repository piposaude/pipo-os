import { forwardRef, useId, type TextareaHTMLAttributes } from 'react'
import styles from './TextArea.module.css'

export interface TextAreaProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'children'
> {
  /** Visible label rendered above the textarea */
  label?: string
  /** Marks the field as having an error */
  error?: boolean
  /** Error message shown below the textarea when error=true */
  errorMessage?: string
  /** Hint text shown below the textarea when there is no error */
  hint?: string
}

// Local primitive: the design system has no TextArea yet. Mirrors the DS
// TextInput API/visuals; candidate to contribute upstream.
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, error = false, errorMessage, hint, required, id, className, rows = 4, ...rest },
  ref,
) {
  const generatedId = useId()
  const textareaId = id ?? generatedId
  const classes = [styles.textarea, error ? styles.textareaError : undefined, className]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={styles.wrapper}>
      {label && (
        <label className={styles.label} htmlFor={textareaId}>
          {label}
          {required && (
            <span className={styles.required} aria-hidden="true">
              {' *'}
            </span>
          )}
        </label>
      )}
      <textarea
        ref={ref}
        id={textareaId}
        className={classes}
        required={required}
        rows={rows}
        aria-invalid={error || undefined}
        {...rest}
      />
      {error && errorMessage ? (
        <span className={styles.errorMessage} role="alert">
          {errorMessage}
        </span>
      ) : (
        hint && <span className={styles.hint}>{hint}</span>
      )}
    </div>
  )
})
