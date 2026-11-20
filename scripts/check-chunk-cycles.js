#!/usr/bin/env node
/** Build with Vite and check the emitted static import graph before writing it. */
import { build } from 'vite'

await build({
  plugins: [
    {
      name: 'check-chunk-cycles',
      generateBundle(_, bundle) {
        const checked = new Set()
        const visiting = new Set()
        const names = new Set()

        function visit(file) {
          const chunk = bundle[file]
          if (chunk?.type !== 'chunk' || checked.has(file)) return
          if (visiting.has(file)) {
            const path = Array.from(visiting)
            throw new Error(
              'Circular chunk: ' + [...path.slice(path.indexOf(file)), file].join(' -> ')
            )
          }

          visiting.add(file)
          for (const dependency of chunk.imports) visit(dependency)
          visiting.delete(file)
          checked.add(file)
        }

        for (const chunk of Object.values(bundle)) {
          if (chunk.type !== 'chunk') continue
          if (names.has(chunk.name)) throw new Error('Chunk name collision: ' + chunk.name)
          names.add(chunk.name)
          visit(chunk.fileName)
        }
      },
    },
  ],
})
