import test from 'ava'
import build from '../../src'
import { join } from 'path'

test.serial.only('build', async (t) => {
  const { js, files, dependencies } = await build({
    entryPoints: [join(__dirname, 'app.tsx')],
    external: ['redis'],
  })

  const txt = js[0].text
  // console.log(txt.substring(txt.indexOf('SMURK')))

  t.truthy(dependencies.redis)
  t.is(Object.keys(files).length, 5)
})

test.serial('build error handling', async (t) => {
  const { errors } = await build({
    entryPoints: [join(__dirname, 'error.tsx')],
  })

  t.true(Array.isArray(errors))
  t.is(errors.length, 1)
})
