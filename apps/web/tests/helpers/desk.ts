import { signInAsFixtureViewer } from './auth'
import { fixtureStructureRoutes, mockApi, type ApiMock } from './api'
import { DATASET_TODAY, VIEWER_ID } from '@/fixtures/pipodesk/dataset'

/**
 * A desk screen ready to render over the prototype data: signed in, the API
 * answering with the fixture, and the clock pinned to the day the dataset was
 * exported — the screen reads the real clock now, so without pinning it every
 * count drifts as the awake/sleeping window moves.
 */
export function mountDeskFixture(
  writes: Record<string, number> = {},
  routes: Record<string, unknown> = {},
): ApiMock {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date(`${DATASET_TODAY}T12:00:00-03:00`) })
  signInAsFixtureViewer()
  const api = mockApi({ ...fixtureStructureRoutes(VIEWER_ID), ...routes }, writes)

  const restore = api.restore
  api.restore = () => {
    restore()
    vi.useRealTimers()
  }
  return api
}
