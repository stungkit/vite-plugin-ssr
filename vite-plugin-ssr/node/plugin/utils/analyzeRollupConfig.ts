export { analyzeRollupConfig }

import type { ResolvedConfig } from 'vite'
import { isSSR_config } from '../../../utils/isSSR'
import { assert } from '../utils'

// Subset of: `import type { NormalizedOutputOptions } from 'rollup'` (to avoid mismatch upon different Rollup versions)
type NormalizedOutputOptions = { entryFileNames: string | ((chunkInfo: any) => string); format: string }
// Subset of: `import type { OutputBundle } from 'rollup'` (to avoid mismatch upon different Rollup versions)
type OutputBundle = Record<string, unknown>
type RollupResolved = {
  options: NormalizedOutputOptions
  bundle: OutputBundle
}

function analyzeRollupConfig(rollupResolved: RollupResolved, config: ResolvedConfig) {
  assert(isSSR_config(config))
  const isEsm = isEsmFormat(rollupResolved)
  const fileExt = getFileExt(rollupResolved)
  assert(fileExt !== 'mjs' || isEsm)
  const pageFilesOutput = `pageFiles.${fileExt}`
  {
    const bundleFiles = Object.keys(rollupResolved.bundle)
    assert(bundleFiles.includes(pageFilesOutput))
  }
  return { isEsm, pageFilesOutput }
}

function getFileExt(rollupResolved: { options: NormalizedOutputOptions; bundle: OutputBundle }): 'js' | 'mjs' {
  const { entryFileNames } = rollupResolved.options
  const fileExt = typeof entryFileNames === 'string' && entryFileNames.endsWith('.mjs') ? 'mjs' : 'js'
  return fileExt
}

function isEsmFormat(rollupResolved: RollupResolved): boolean {
  const { format } = rollupResolved.options
  assert(typeof format === 'string')
  assert(
    format === 'amd' ||
      format === 'cjs' ||
      format === 'es' ||
      format === 'iife' ||
      format === 'system' ||
      format === 'umd',
  )
  return format === 'es'
}
