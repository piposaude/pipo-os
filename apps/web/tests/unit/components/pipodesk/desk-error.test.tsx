import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DeskError } from '@/components/pipodesk/shell/DeskError'
import { captureException } from '@pipo-os/observability/sentry-react'
import constants from '@/constants/pipodesk/error'

vi.mock('@pipo-os/observability/sentry-react', () => ({
  captureException: vi.fn(),
}))

/**
 * A render error used to reach the single boundary at the root of the app,
 * which blanks every screen and offers "reload" — and reloading reads the same
 * stored preferences back, so a deterministic failure had no way out through
 * the interface.
 */
describe('DeskError', () => {
  it('should explain the failure instead of blanking the screen', () => {
    render(<DeskError error={new Error('boom')} reset={() => {}} />)

    expect(screen.getByRole('heading', { name: constants.title })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: constants.retry })).toBeInTheDocument()
  })

  /** This boundary catches BELOW `SentryErrorBoundary`, which therefore never
   *  sees the error: handling it here would make it vanish from Sentry. */
  it('should still report the error to Sentry, which no longer catches it', () => {
    const error = new Error('boom')

    render(<DeskError error={error} reset={() => {}} />)

    expect(captureException).toHaveBeenCalledWith(error)
  })

  it('should drop the desk preferences and retry, so a bad stored value is escapable', async () => {
    localStorage.setItem('pipodesk:columns', '{"hidden":"não é lista"}')
    localStorage.setItem('pipodesk:sidebar-collapsed', 'true')
    // Another app's key on the same origin — recovery is not a reset button.
    localStorage.setItem('pipo-os:session', 'keep-me')
    const reset = vi.fn()

    render(<DeskError error={new Error('boom')} reset={reset} />)
    await userEvent.click(screen.getByRole('button', { name: constants.retry }))

    expect(localStorage.getItem('pipodesk:columns')).toBeNull()
    expect(localStorage.getItem('pipodesk:sidebar-collapsed')).toBeNull()
    expect(localStorage.getItem('pipo-os:session')).toBe('keep-me')
    expect(reset).toHaveBeenCalledTimes(1)
  })
})
