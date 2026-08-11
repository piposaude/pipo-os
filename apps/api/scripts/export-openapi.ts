import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { buildApp } from '../src/app.js'

async function main(): Promise<void> {
  const app = buildApp()
  await app.ready()

  const spec = app.swagger()
  const outFile = path.join(import.meta.dirname, '../../../openapi.json')

  await writeFile(outFile, `${JSON.stringify(spec, null, 2)}\n`)
  await app.close()

  console.log(`OpenAPI spec written to ${outFile}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
