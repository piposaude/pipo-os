import { signInAsFixtureViewer } from './auth'
import { fixtureStructureRoutes, mockApi } from './api'
import { DATASET_TODAY, VIEWER_ID } from '@/fixtures/pipodesk/dataset'

/**
 * A desk screen ready to render over the prototype data: signed in, the API
 * answering with the fixture, and the clock pinned to the day the dataset was
 * exported — the screen reads the real clock now, so without pinning it every
 * count drifts as the awake/sleeping window moves.
 */
export function mountDeskFixture(): () => void {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date(`${DATASET_TODAY}T12:00:00-03:00`) })
  signInAsFixtureViewer()
  const restoreApi = mockApi(fixtureStructureRoutes(VIEWER_ID))

  return () => {
    restoreApi()
    vi.useRealTimers()
  }
}
