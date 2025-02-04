export { generateImportGlobs }

import type { Plugin, ResolvedConfig } from 'vite'
import { assert, isSSR_options, isNotNullish } from '../utils'
import { getGlobPath } from './generateImportGlobs/getGlobPath'
import { getGlobRoots } from './generateImportGlobs/getGlobRoots'
import { debugGlob } from '../../utils'
import type { ConfigVpsResolved } from './config/ConfigVps'
import { assertConfigVpsResolved } from './config/assertConfigVps'

const moduleIds = ['virtual:vite-plugin-ssr:pageFiles:server', 'virtual:vite-plugin-ssr:pageFiles:client']

type Config = ResolvedConfig & { vitePluginSsr: ConfigVpsResolved }

function generateImportGlobs(): Plugin {
  let config: Config
  return {
    name: 'vite-plugin-ssr:virtualModulePageFiles',
    async configResolved(config_) {
      assertConfigVpsResolved(config_)
      config = config_
    },
    resolveId(id) {
      if (moduleIds.includes(id)) {
        return id
      }
    },
    async load(id, options) {
      if (moduleIds.includes(id)) {
        const isForClientSide = id === moduleIds[1]
        assert(isForClientSide === !isSSR_options(options))
        const code = await getCode(config, isForClientSide)
        return code
      }
    },
  } as Plugin
}

async function getCode(config: Config, isForClientSide: boolean) {
  const { command } = config
  assert(command === 'serve' || command === 'build')
  const isBuild = command === 'build'
  const globRoots = await getGlobRoots(config)
  debugGlob('Glob roots: ', globRoots)
  const includePaths = globRoots.map((g) => g.includePath)
  const content = getContent(
    includePaths.filter(isNotNullish),
    isBuild,
    isForClientSide,
    config.vitePluginSsr.includeAssetsImportedByServer,
  )
  debugGlob('Glob imports: ', content)
  return content
}

function getContent(
  includePaths: string[],
  isBuild: boolean,
  isForClientSide: boolean,
  includeAssetsImportedByServer: undefined | boolean,
) {
  let fileContent = `// This file was generatead by \`node/plugin/plugins/generateImportGlobs.ts\`.

export const pageFilesLazy = {};
export const pageFilesEager = {};
export const pageFilesExportNamesLazy = {};
export const pageFilesExportNamesEager = {};
export const neverLoaded = {};
export const isGeneratedFile = true;

`

  fileContent += [getGlobs(includePaths, isBuild, 'page'), getGlobs(includePaths, isBuild, 'page.route'), ''].join('\n')
  if (isForClientSide) {
    fileContent += [
      getGlobs(includePaths, isBuild, 'page.client'),
      getGlobs(includePaths, isBuild, 'page.client', 'extractExportNames'),
      getGlobs(includePaths, isBuild, 'page.server', 'extractExportNames'),
      getGlobs(includePaths, isBuild, 'page', 'extractExportNames'),
    ].join('\n')
    if (includeAssetsImportedByServer) {
      fileContent += getGlobs(includePaths, isBuild, 'page.server', 'extractStyles')
    }
  } else {
    fileContent += [
      getGlobs(includePaths, isBuild, 'page.server'),
      getGlobs(includePaths, isBuild, 'page.client', 'extractExportNames'),
    ].join('\n')
  }

  return fileContent
}

function getGlobs(
  includePaths: string[],
  isBuild: boolean,
  fileSuffix: 'page' | 'page.client' | 'page.server' | 'page.route',
  query: 'extractExportNames' | 'extractStyles' | '' = '',
): string {
  const isEager = isBuild && (query === 'extractExportNames' || fileSuffix === 'page.route')

  let pageFilesVar:
    | 'pageFilesLazy'
    | 'pageFilesEager'
    | 'pageFilesExportNamesLazy'
    | 'pageFilesExportNamesEager'
    | 'neverLoaded'
  if (query === 'extractExportNames') {
    if (!isEager) {
      pageFilesVar = 'pageFilesExportNamesLazy'
    } else {
      pageFilesVar = 'pageFilesExportNamesEager'
    }
  } else if (query === 'extractStyles') {
    assert(!isEager)
    pageFilesVar = 'neverLoaded'
  } else {
    if (!isEager) {
      pageFilesVar = 'pageFilesLazy'
    } else {
      pageFilesVar = 'pageFilesEager'
    }
  }

  const varNameSuffix =
    (fileSuffix === 'page' && 'Isomorph') ||
    (fileSuffix === 'page.client' && 'Client') ||
    (fileSuffix === 'page.server' && 'Server') ||
    (fileSuffix === 'page.route' && 'Route')
  assert(varNameSuffix)
  const varName = `${pageFilesVar}${varNameSuffix}`

  const varNameLocals: string[] = []
  return [
    ...includePaths.map((globRoot, i) => {
      const varNameLocal = `${varName}${i + 1}`
      varNameLocals.push(varNameLocal)
      const globPath = `'${getGlobPath(globRoot, fileSuffix)}'`
      const globOptions = `{ eager: ${isEager ? true : false}, query: "${query}" }`
      return `const ${varNameLocal} = import.meta.importGlob(${globPath}, ${globOptions});`
    }),
    `const ${varName} = {${varNameLocals.map((varNameLocal) => `...${varNameLocal}`).join(',')}};`,
    `${pageFilesVar}['.${fileSuffix}'] = ${varName};`,
    '',
  ].join('\n')
}
