import { BuildResult } from '@saulx/aristotle-types'
import {
  RenderFunction,
  CacheFunction,
  defaultRenderer,
  defaultCache,
  parseReq,
  ServeResult,
  serve,
  genRenderOpts,
  genServeFromFile,
  genServeFromRender,
} from '@saulx/aristotle-server-utils'
import getSsl from '@saulx/ops-get-ssl'
import https from 'https'
import http from 'http'
import chalk from 'chalk'
import createBuildResult from './createBuildResult'

console.log('this is a server!')

type ServerOpts = {
  port: number
  renderer?: RenderFunction
  cacheFunction?: CacheFunction
  buildJson?: string
  buildResult?: BuildResult
}

const createServer = async ({
  port,
  buildResult,
  buildJson,
  renderer,
  cacheFunction,
}: ServerOpts) => {
  // @ts-ignore pretty strange it does have types...
  const ssl = getSsl()

  if (!buildResult && buildJson) {
    buildResult = await createBuildResult(buildJson)
  }

  if (!renderer) {
    renderer = defaultRenderer
  }

  if (!cacheFunction) {
    cacheFunction = defaultCache
  }

  let ts: number = Date.now()
  const cache: {
    [key: string]: { result: ServeResult; ts: number; refs: Set<string> }
  } = {}
  const cachedPaths: { [key: string]: string } = {}

  setInterval(() => {
    ts = Date.now()
    for (let key in cache) {
      if (cache[key].ts + cache[key].result.memCache * 1e3 < ts) {
        cache[key].refs.forEach((v) => {
          delete cachedPaths[v]
        })
        delete cache[key]
      }
    }
  }, 1e3)

  const handler = async (
    req: http.IncomingMessage,
    res: http.OutgoingMessage
  ) => {
    const url = req.url
    const file = buildResult.files[url]
    if (file) {
      serve(req, res, genServeFromFile(file))
    } else {
      const parsedReq = await parseReq(req, false)
      let result: ServeResult
      const cacheKey = cacheFunction(parsedReq)
      const checksum = cacheKey && cachedPaths[cacheKey]
      const cachedResult = checksum && cache[checksum]
      if (cachedResult) {
        serve(req, res, cachedResult.result)
      } else {
        const renderResult = await renderer(
          genRenderOpts(parsedReq, buildResult)
        )
        if (renderResult !== null) {
          result = await genServeFromRender(renderResult, true)
        }
        if (result) {
          if (result.memCache) {
            if (!cache[result.checksum]) {
              cache[result.checksum] = {
                ts,
                result: result,
                refs: new Set(),
              }
            }
            cachedPaths[cacheKey] = result.checksum
            cache[result.checksum].refs.add(cacheKey)
          }
          serve(req, res, result)
        } else {
          req.destroy()
        }
      }
    }
  }

  const server = ssl
    ? https.createServer(ssl, handler)
    : http.createServer(handler)

  server.listen(port)

  console.info(
    chalk.blue(`Start ${ssl ? 'ssl' : 'non ssl'} server on port`),
    port
  )
}

export default createServer
