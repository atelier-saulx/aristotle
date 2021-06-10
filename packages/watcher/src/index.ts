import chalk from 'chalk'
import { v4 } from 'internal-ip'
import http from 'http'
import getPort from 'get-port'
import startLiveReload from './livereload'
import build, { BuildOpts } from '@saulx/aristotle-build'
import { BuildError, BuildResult, File } from '@saulx/aristotle-types'
import { genWorker, RenderWorker } from './worker'
import fs from 'fs'
import { join } from 'path'
import { genErrorPage, AristotleError } from './errorHandling'

import {
  parseReq,
  ServeResult,
  serve,
  isPublicFile,
  genRenderOpts,
  defaultRenderer,
  genServeFromFile,
  genServeFromRender,
  hasServer,
} from '@saulx/aristotle-server-utils'

const loadingHtml = fs.readFileSync(join(__dirname, '../static/loading.html'))

// also extra build options!
// e.g exclude etc
type Opts = {
  port: number
  target: string
  reloadPort?: number
  external?: string[]
}

const buildChanged = (newBuild: BuildResult, old: BuildResult): boolean => {
  if (!old) {
    return true
  } else {
    for (const key in newBuild.files) {
      if (!old.files[key]) {
        return true
      }
    }
  }
  return false
}

export default async ({
  target,
  port = 3001,
  reloadPort = 6634,
  external,
}: Opts) => {
  const ip = await v4()

  reloadPort = await getPort({ port: reloadPort })

  // check if server
  const buildOpts: BuildOpts = {
    entryPoints: [target],
    platform: 'browser',
    external,
    sourcemap: true,
  }

  const { update, browser } = startLiveReload(reloadPort)

  console.info(
    chalk.blue('Aristotle development server'),
    'http://' + ip + ':' + port
  )

  const serverTarget = await hasServer(target)

  console.info('  browser', chalk.grey(target))

  let buildresult: BuildResult
  let renderer: RenderWorker
  let rendererBeingBuild: string
  let rendererFiles: { [key: string]: File } = {}
  let rendererError: AristotleError
  let buildErrors: AristotleError[] | undefined
  let serverBuildErrors: AristotleError[] | undefined

  const setBuildErrors = (build: BuildResult): AristotleError[] => {
    return build.errors.map(
      (err: BuildError): AristotleError => {
        return {
          type: 'build',
          build,
          buildError: err,
        }
      }
    )
  }

  build(buildOpts, async (result) => {
    if (result.errors.length) {
      buildresult = result
      buildErrors = setBuildErrors(result)
      update()
    } else if (buildChanged(result, buildresult)) {
      buildErrors = undefined
      // compare all checksums and lengths
      buildresult = result
      for (let key in rendererFiles) {
        if (!result.files[key]) {
          result.files[key] = rendererFiles[key]
        }
      }
      if (rendererBeingBuild) {
        console.info(chalk.grey('Server rebuild in progress...'))
      } else {
        if (renderer) {
          await renderer.updateBuildResult(buildresult)
        }
        update()
      }
    }
  })

  if (serverTarget) {
    console.info('  server ', chalk.grey(serverTarget))
    const buildOptsServer: BuildOpts = {
      entryPoints: [serverTarget],
      platform: 'node',
      sourcemap: true,
      external,
    }
    if (serverTarget) {
      build(buildOptsServer, async (result) => {
        if (result.errors.length) {
          serverBuildErrors = setBuildErrors(result)
          renderer = undefined
          rendererBeingBuild = undefined
          update()
        } else {
          serverBuildErrors = undefined
          rendererFiles = {}

          // update files
          for (let key in result.files) {
            const file = result.files[key]
            if (isPublicFile(file)) {
              rendererFiles[key] = file
              if (buildresult) {
                buildresult.files[key] = file
              }
            }
          }
          const checksum = result.js[0].checksum
          rendererError = undefined
          if (rendererBeingBuild === checksum) {
            console.log(
              chalk.grey('Same renderer being build - ignore', checksum)
            )
          } else {
            rendererBeingBuild = checksum
            const d = Date.now()

            const makeRenderer = async () => {
              renderer = await genWorker(result)
              renderer.once('error', async (err) => {
                console.log(chalk.red('Server crashed'), err.message)
                renderer.stop()
                rendererError = {
                  type: 'runtime',
                  error: err,
                  build: renderer.build,
                }
                renderer = undefined
                update()
              })
              if (buildresult) {
                await renderer.updateBuildResult(buildresult)
              }
              console.info(
                chalk.grey('Server initialized in', Date.now() - d, 'ms')
              )
              rendererBeingBuild = undefined
              update()
            }
            if (!renderer || checksum !== renderer.checksum) {
              if (renderer) {
                try {
                  await renderer.updatecode(result)
                  await renderer.updateBuildResult(buildresult)
                  console.info(
                    chalk.grey('Server updated in', Date.now() - d, 'ms')
                  )
                  rendererBeingBuild = undefined
                  update()
                } catch (err) {
                  console.log(err)
                  renderer.stop()
                  makeRenderer()
                }
              } else {
                makeRenderer()
              }
            } else {
              rendererBeingBuild = undefined
            }
          }
        }
      })
    }
  }

  console.info('')

  const server = http.createServer(async (req, res) => {
    if (!buildresult) {
      res.end(loadingHtml + browser.contents.toString())
      return
    }

    const url = req.url
    const file = buildresult.files[url]

    if (file) {
      serve(req, res, genServeFromFile(file))
    } else {
      const parsedReq = await parseReq(req, false)
      let result: ServeResult
      let bErrors = serverBuildErrors || buildErrors
      if (bErrors) {
        genRenderOpts(parsedReq, buildresult)
        result = await genServeFromRender(await genErrorPage(...bErrors))
      } else if (renderer || rendererError) {
        let error: AristotleError
        if (!rendererError) {
          try {
            const cacheKey = await renderer.checkCache(parsedReq)
            if (cacheKey !== 'default') {
              // console.log(
              //   chalk.grey(
              //     'Using custom mem cache key',
              //     chalk.blue(cacheKey),
              //     'for',
              //     parsedReq.url.href
              //   )
              // )
            }
            const renderResult = await renderer.render(parsedReq)
            if (renderResult !== null) {
              result = await genServeFromRender(renderResult)
            }
          } catch (err) {
            error = {
              type: 'render',
              error: err,
              build: renderer.build,
              parsedReq,
            }
          }
        } else {
          error = rendererError
        }
        if (error) {
          genRenderOpts(parsedReq, buildresult)
          result = await genServeFromRender(await genErrorPage(error))
        }
      } else {
        const renderRes = await defaultRenderer(
          genRenderOpts(parsedReq, buildresult)
        )
        result = await genServeFromRender(renderRes)
      }
      if (result) {
        result.contents = Buffer.concat([result.contents, browser.contents])
        result.contentLength = result.contents.byteLength
        serve(req, res, result)
      } else {
        req.destroy()
      }
    }
  })

  server.listen(port)

  return server
}
