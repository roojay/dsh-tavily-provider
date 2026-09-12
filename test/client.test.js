import assert from 'node:assert/strict'
import test from 'node:test'

const tick = () => new Promise((resolve) => setImmediate(resolve))

test('client bundle uses current credential remotes and a keyed settings slot', async (t) => {
  const originalWindow = globalThis.window
  t.after(() => { globalThis.window = originalWindow })

  let definition
  globalThis.window = {
    __ModuleLoader__: {
      load(value) { definition = value }
    }
  }
  await import(`../src/client.js?test=${Date.now()}`)
  assert.equal(definition.id, 'dsh-tavily-provider')

  const React = { createElement() {} }
  const exports = definition.factory((name) => {
    assert.equal(name, 'react')
    return React
  })
  assert.deepEqual(exports.inject, ['slots', 'locale', 'remote', 'remote.credentials'])

  const configured = new Set(['TAVILY_SEARCH_ENABLED'])
  const calls = []
  const remote = {
    credentials: {
      async describe(refs) {
        return {
          ok: true,
          value: Object.fromEntries(refs.map((ref) => [ref, {
            configured: configured.has(ref),
            writable: true
          }]))
        }
      },
      async set(ref, value) {
        calls.push(['set', ref, value])
        configured.add(ref)
        return { ok: true, value: undefined }
      },
      async unset(ref) {
        calls.push(['unset', ref])
        configured.delete(ref)
        return { ok: true, value: undefined }
      }
    },
    $on(event, listener) {
      calls.push(['on', event, listener])
      return () => {}
    }
  }
  let registration
  const slots = {
    inject(name, callback) {
      assert.equal(name, 'settings.plugin.item')
      return callback()
    },
    register(value) {
      registration = value
      return () => {}
    }
  }
  const locale = { register() { return () => {} } }
  const ctx = {
    get(name) { return { slots, locale, remote }[name] },
    effect(factory) { return factory() }
  }

  exports.apply(ctx)
  await tick()

  assert.equal(registration.name, 'settings.plugin.item')
  assert.equal(registration.key, 'web-search-tavily')
  assert.equal(registration.locale, 'web-search-tavily')
  assert(calls.some((entry) => entry[0] === 'on' && entry[1] === 'credentials/reference-updated'))

  const controller = new exports.__test.TavilyCardController(remote)
  await tick()
  assert.equal(controller.store.getSnapshot().enabled, true)
  controller.setEnabled(false)
  await controller.save()
  assert(calls.some((entry) => entry[0] === 'unset' && entry[1] === 'TAVILY_SEARCH_ENABLED'))
  controller.setKey('new-secret')
  await controller.save()
  assert(calls.some((entry) => entry[0] === 'set' && entry[1] === 'TAVILY_API_KEY' && entry[2] === 'new-secret'))
})
