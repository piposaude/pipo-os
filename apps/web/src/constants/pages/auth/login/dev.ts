// Kept apart from the page's shared constants so it is imported only by
// DevLoginButton — otherwise this copy would survive in the production bundle
// even though the component that uses it is eliminated.
export default {
  button: 'Entrar como usuário local',
  unavailable: 'Login local indisponível. Suba a API com `pnpm dev`.',
}
