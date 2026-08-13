import { getRouteApi } from '@tanstack/react-router'
import LoginPage from './index'

const routeApi = getRouteApi('/_public/login/')

// Reads the route's search params and hands them to LoginPage as props, so
// the page itself stays router-agnostic (and story/test-friendly).
export function LoginRoute() {
  const { redirect, error } = routeApi.useSearch()
  return <LoginPage redirect={redirect} error={error} />
}
