import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { buildApp } from '../src/app.js'

const SCHEMA_REF_PREFIX = '#/components/schemas/'

function collectSchemaRefs(node: unknown, refs: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectSchemaRefs(item, refs)
    return
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string' && value.startsWith(SCHEMA_REF_PREFIX)) {
        refs.add(value.slice(SCHEMA_REF_PREFIX.length))
      }
      collectSchemaRefs(value, refs)
    }
  }
}

// @fastify/type-provider-zod registers an input and an output component for
// every named (`.meta({ id })`) schema, even when a given schema is only ever
// used on one side. This walks the $ref graph from `paths` to drop the
// components that end up unreferenced, so the committed contract stays clean.
function pruneUnusedSchemas(spec: { components?: { schemas?: Record<string, unknown> } }): void {
  const schemas = spec.components?.schemas
  if (!schemas) return

  const used = new Set<string>()
  const queue: string[] = []

  const seedRefs = new Set<string>()
  collectSchemaRefs((spec as Record<string, unknown>).paths, seedRefs)
  queue.push(...seedRefs)

  while (queue.length > 0) {
    const name = queue.shift()!
    if (used.has(name)) continue
    used.add(name)

    const nestedRefs = new Set<string>()
    collectSchemaRefs(schemas[name], nestedRefs)
    queue.push(...nestedRefs)
  }

  for (const name of Object.keys(schemas)) {
    if (!used.has(name)) delete schemas[name]
  }
}

async function main(): Promise<void> {
  const app = buildApp()
  await app.ready()

  const spec = app.swagger()
  pruneUnusedSchemas(spec)

  const outFile = path.join(import.meta.dirname, '../../../openapi.json')

  await writeFile(outFile, `${JSON.stringify(spec, null, 2)}\n`)
  await app.close()

  console.log(`OpenAPI spec written to ${outFile}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
