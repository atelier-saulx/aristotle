const fs = require('mz/fs')
const { findPkg } = require('./package')
const { join, basename, dirname } = require('path')
const f = require('../index.js')
const { browserResolve } = require('./browser')
const { isFile } = require('./match')
const { parseFilePath, moduleId, relativePath } = require('./path')
const resolveFrom = require('resolve-from')

const resolvePkg = (store, path) => {
  const pkgDir = dirname(path)
  return (store.resolved[path] = {
    browser: path,
    node: path,
    pkgDir,
    path,
    original: path,
    pkgFile: path,
    id: moduleId(relativePath(path, pkgDir)),
    isEqual: true
  })
}

const resolve = async (store, path) => {
  const base = basename(path)
  if (base === 'package.json') {
    return resolvePkg(store, path)
  }

  const original = path
  let pkgDir, pkgFile, pkg

  try {
    pkgDir = await findPkg(path)
    pkgFile = join(pkgDir, 'package.json')
    pkg = await f.parseFile({ store, path: pkgFile })
  } catch (err) {
    throw err
  }

  const pkgParsed = pkg.node.parsed.js

  const pkgRealFile = store.files[pkgFile]
  const version = (pkgRealFile && pkgRealFile.node.parsed.js.version) || ''

  let realMain = pkgParsed.main

  if (realMain) {
    await fs.exists(join(pkgDir, realMain))
  }

  if (
    path === pkgDir ||
    resolveFrom.silent(dirname(path), pkgParsed.name) === path
  ) {
    path = join(pkgDir, pkgParsed.module || pkgParsed.main || 'index.js')
  } else if (
    pkgParsed.module &&
    path === join(pkgDir, pkgParsed.main || 'index.js')
  ) {
    path = join(pkgDir, pkgParsed.module)
  }

  if (!isFile(path)) {
    const indexJs = join(path, 'index.js')
    path = (await fs.exists(indexJs)) ? indexJs : path + '.js'
  }

  let node = path
  let browser = await browserResolve(pkg, path, pkgDir)
  if (browser !== path) browser = (await resolve(store, browser)).browser

  const filePath = parseFilePath(pkgDir, path, pkgParsed, browser, node)

  if (
    store.paths[filePath] &&
    store.paths[filePath] !== path &&
    store.resolved[store.paths[filePath]]
  ) {
    const prevResolved = store.resolved[store.paths[filePath]]

    // console.log(
    //   path,
    //   prevResolved.version,
    //   'vs',
    //   version,
    //   'use',
    //   store.paths[filePath]
    // )

    return prevResolved
  }

  store.paths[filePath] = path

  const resolved = {
    browser,
    node,
    pkgDir,
    pkgFile,
    version,
    path,
    original,
    id: moduleId(relativePath(node, pkgDir), version),
    isEqual: node === browser
  }

  return resolved
}

module.exports = async (store, path) => {
  if (path in store.resolved) {
    return store.resolved[path]
  } else {
    const resolved = await resolve(store, path)

    store.resolved[resolved.path] = resolved

    if (resolved.path !== resolved.original) {
      store.resolved[resolved.original] = store.resolved[resolved.path]
    }

    return resolved
  }
}