window.__ModuleLoader__.load({
  id: 'dsh-tavily-provider',
  factory: function (require) {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    var React = require('react')

    var NAMESPACE = 'web-search-tavily'
    var KEY_REF = 'TAVILY_API_KEY'
    var ENABLED_REF = 'TAVILY_SEARCH_ENABLED'

    var dictionaries = {
      zh: {
        title: 'Tavily 网页搜索',
        description: '打开后使用 Tavily；关闭后回落到官方 DeepSeek 搜索。',
        enable: '使用 Tavily',
        enabled: 'Tavily',
        disabled: '官方 DeepSeek',
        unsaved: '未保存',
        apiKey: 'API Key',
        keyOk: '已配置密钥',
        keyMissing: '未配置，将使用 keyless',
        keyClearing: '保存后清除密钥',
        clearKey: '清除密钥',
        keyPlaceholderKeep: '留空表示保持当前密钥',
        keyPlaceholderEmpty: '可选；留空使用 Tavily keyless',
        keyPlaceholderClear: '输入新密钥可取消清除',
        keyHint: '密钥只写入 DSH 凭据中心，不进入设置文件。',
        test: '连通测试',
        testing: '测试中…',
        testOk: '连通正常',
        testFailed: '测试失败：',
        timeout: '超时',
        invalidKey: '密钥无效',
        network: '网络错误',
        unavailable: '测试入口不可用',
        unknown: '未知错误',
        discard: '放弃修改',
        save: '保存',
        saving: '保存中…',
        saveFailed: '保存失败'
      },
      en: {
        title: 'Tavily web search',
        description: 'Use Tavily when enabled; fall back to official DeepSeek search when disabled.',
        enable: 'Use Tavily',
        enabled: 'Tavily',
        disabled: 'Official DeepSeek',
        unsaved: 'Unsaved',
        apiKey: 'API Key',
        keyOk: 'Key configured',
        keyMissing: 'No key; keyless mode will be used',
        keyClearing: 'Key will be cleared on save',
        clearKey: 'Clear key',
        keyPlaceholderKeep: 'Leave blank to keep the current key',
        keyPlaceholderEmpty: 'Optional; leave blank for Tavily keyless',
        keyPlaceholderClear: 'Enter a new key to cancel clearing',
        keyHint: 'The key is stored only in DSH credentials, never in the settings document.',
        test: 'Test connection',
        testing: 'Testing…',
        testOk: 'Connected',
        testFailed: 'Test failed: ',
        timeout: 'timed out',
        invalidKey: 'invalid key',
        network: 'network error',
        unavailable: 'test endpoint unavailable',
        unknown: 'unknown error',
        discard: 'Discard',
        save: 'Save',
        saving: 'Saving…',
        saveFailed: 'Save failed'
      }
    }

    function createSnapshotStore(initial) {
      var value = initial
      var listeners = new Set()
      return {
        getSnapshot: function () { return value },
        subscribe: function (listener) {
          listeners.add(listener)
          return function () { listeners.delete(listener) }
        },
        set: function (next) {
          value = next
          listeners.forEach(function (listener) { listener() })
        }
      }
    }

    function messageOf(result) {
      if (result && result.error && typeof result.error.message === 'string') {
        return result.error.message
      }
      return 'remote operation failed'
    }

    function addStyles() {
      if (typeof document === 'undefined') return function () {}
      var id = 'dsh-tavily-provider-card'
      if (document.querySelector('style[data-plugin-css="' + id + '"]')) return function () {}
      var tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-tavily-provider'
      tag.dataset.pluginCss = id
      tag.textContent = [
        '.dshTavilyCard{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l4);border-radius:16px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);overflow:hidden}',
        '.dshTavilyCard[data-open=true]{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}',
        '.dshTavilyHead{box-sizing:border-box;width:100%;min-height:64px;display:flex;align-items:center;gap:12px;border:0;background:transparent;color:inherit;padding:12px 16px;text-align:left;cursor:pointer;font:inherit}',
        '.dshTavilyHead:focus-visible,.dshTavilyButton:focus-visible,.dshTavilyInput:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}',
        '.dshTavilyHeading{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}',
        '.dshTavilyTitle{font-size:14px;font-weight:600;line-height:20px}',
        '.dshTavilyDescription,.dshTavilyHint,.dshTavilyStatus{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}',
        '.dshTavilyMode{flex:none;border-radius:999px;padding:2px 8px;background:var(--dsw-alias-interactive-bg-hover);font-size:11px;white-space:nowrap}',
        '.dshTavilyBody{display:flex;flex-direction:column;gap:14px;border-top:.5px solid var(--dsw-alias-border-l2);padding:14px 16px 16px}',
        '.dshTavilyRow{display:flex;align-items:center;gap:10px}',
        '.dshTavilyLabel{flex:1;min-width:0;font-size:13px;font-weight:500}',
        '.dshTavilySwitch{position:relative;width:38px;height:22px;flex:none}',
        '.dshTavilySwitch input{position:absolute;inset:0;opacity:0;margin:0;cursor:pointer}',
        '.dshTavilyTrack{display:block;width:38px;height:22px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover-solid)}',
        '.dshTavilyTrack:after{content:"";position:absolute;left:3px;top:3px;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-label-primary);transition:transform .15s}',
        '.dshTavilySwitch input:checked+.dshTavilyTrack{background:var(--dsw-alias-state-business-primary)}',
        '.dshTavilySwitch input:checked+.dshTavilyTrack:after{transform:translateX(16px);background:#fff}',
        '.dshTavilyInput{box-sizing:border-box;width:100%;height:36px;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:inherit;padding:0 10px;font:inherit;font-size:13px}',
        '.dshTavilyMeta{display:flex;align-items:center;justify-content:space-between;gap:8px}',
        '.dshTavilyActions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
        '.dshTavilyButton{height:32px;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);padding:0 12px;font:inherit;font-size:12px;cursor:pointer}',
        '.dshTavilyButton[data-primary=true]{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}',
        '.dshTavilyButton:disabled,.dshTavilySwitch input:disabled{opacity:.45;cursor:default}',
        '.dshTavilyError{color:var(--dsw-alias-state-error-primary)}',
        '@media(prefers-reduced-motion:reduce){.dshTavilyTrack:after{transition:none}}'
      ].join('')
      document.head.appendChild(tag)
      return function () { tag.remove() }
    }

    function TavilyCardController(remote) {
      this.remote = remote
      this.enabled = false
      this.keyConfigured = false
      this.keyWritable = true
      this.enabledWritable = true
      this.draftEnabled = false
      this.draftKey = ''
      this.clearKey = false
      this.saving = false
      this.failed = false
      this.probing = false
      this.probe = null
      this.refreshGeneration = 0
      this.store = createSnapshotStore(this.projection())
      this.refresh()
    }

    TavilyCardController.prototype.projection = function () {
      return {
        enabled: this.draftEnabled,
        keyConfigured: this.keyConfigured,
        keyWritable: this.keyWritable,
        enabledWritable: this.enabledWritable,
        draftKey: this.draftKey,
        clearKey: this.clearKey,
        dirty: this.draftEnabled !== this.enabled || this.draftKey.trim() !== '' || this.clearKey,
        saving: this.saving,
        failed: this.failed,
        probing: this.probing,
        probe: this.probe
      }
    }

    TavilyCardController.prototype.publish = function () {
      this.store.set(this.projection())
    }

    TavilyCardController.prototype.describe = async function (ref) {
      var result = await this.remote.credentials.describe([ref])
      if (!result.ok) throw new Error(messageOf(result))
      return result.value[ref] || { configured: false, writable: true }
    }

    TavilyCardController.prototype.refresh = async function () {
      var generation = ++this.refreshGeneration
      try {
        var results = await Promise.all([this.describe(ENABLED_REF), this.describe(KEY_REF)])
        if (generation !== this.refreshGeneration) return
        this.enabled = results[0].configured === true
        this.enabledWritable = results[0].writable !== false
        this.keyConfigured = results[1].configured === true
        this.keyWritable = results[1].writable !== false
        this.draftEnabled = this.enabled
        this.draftKey = ''
        this.clearKey = false
        this.failed = false
      } catch {
        if (generation !== this.refreshGeneration) return
        this.failed = true
      }
      this.publish()
    }

    TavilyCardController.prototype.setEnabled = function (value) {
      this.draftEnabled = value
      this.failed = false
      this.probe = null
      this.publish()
    }

    TavilyCardController.prototype.setKey = function (value) {
      this.draftKey = value
      this.clearKey = false
      this.failed = false
      this.probe = null
      this.publish()
    }

    TavilyCardController.prototype.stageClearKey = function () {
      this.draftKey = ''
      this.clearKey = true
      this.failed = false
      this.probe = null
      this.publish()
    }

    TavilyCardController.prototype.discard = function () {
      this.draftEnabled = this.enabled
      this.draftKey = ''
      this.clearKey = false
      this.failed = false
      this.probe = null
      this.publish()
    }

    TavilyCardController.prototype.assertRemote = function (result) {
      if (!result.ok) throw new Error(messageOf(result))
    }

    TavilyCardController.prototype.save = async function () {
      if (this.saving) return
      this.saving = true
      this.failed = false
      this.publish()
      try {
        if (this.enabledWritable) {
          this.assertRemote(this.draftEnabled
            ? await this.remote.credentials.set(ENABLED_REF, 'true')
            : await this.remote.credentials.unset(ENABLED_REF))
        }
        var key = this.draftKey.trim()
        if (this.keyWritable && key !== '') {
          this.assertRemote(await this.remote.credentials.set(KEY_REF, key))
        } else if (this.keyWritable && this.clearKey) {
          this.assertRemote(await this.remote.credentials.unset(KEY_REF))
        }
        this.saving = false
        await this.refresh()
      } catch {
        this.saving = false
        this.failed = true
        this.publish()
      }
    }

    TavilyCardController.prototype.testConnection = async function () {
      if (this.probing || this.saving) return
      this.probing = true
      this.probe = null
      this.publish()
      try {
        var body = {}
        var key = this.draftKey.trim()
        if (key !== '') body.apiKey = key
        else if (this.clearKey) body.clearKey = true
        var response = await fetch('/api/tavily-probe', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify(body)
        })
        var value = await response.json().catch(function () { return {} })
        this.probe = response.status === 404
          ? { ok: false, code: 'unavailable' }
          : value.ok === true
            ? { ok: true }
            : {
                ok: false,
                code: typeof value.code === 'string' ? value.code : 'unknown',
                status: value.status,
                error: value.error
              }
      } catch {
        this.probe = { ok: false, code: 'network' }
      }
      this.probing = false
      this.publish()
    }

    TavilyCardController.prototype.inject = function () {
      var self = this
      return {
        hooks: { tavilyCard: this.store },
        setEnabled: function (value) { self.setEnabled(value) },
        setKey: function (value) { self.setKey(value) },
        stageClearKey: function () { self.stageClearKey() },
        discard: function () { self.discard() },
        save: function () { return self.save() },
        testConnection: function () { return self.testConnection() }
      }
    }

    function probeText(t, probe) {
      if (probe === null) return ''
      if (probe.ok) return t('testOk')
      if (probe.code === 'timeout') return t('testFailed') + t('timeout')
      if (probe.code === 'invalid_key') return t('testFailed') + t('invalidKey')
      if (probe.code === 'network') return t('testFailed') + t('network')
      if (probe.code === 'unavailable') return t('testFailed') + t('unavailable')
      if (probe.code === 'http') return t('testFailed') + 'HTTP ' + String(probe.status || '')
      return t('testFailed') + (probe.error || t('unknown'))
    }

    function TavilyCard(props) {
      var t = props.t
      var state = props.useTavilyCard(function (value) { return value })
      var openState = React.useState(false)
      var open = openState[0]
      var setOpen = openState[1]
      var keyBadge = state.clearKey
        ? t('keyClearing')
        : state.keyConfigured
          ? t('keyOk')
          : t('keyMissing')
      var keyPlaceholder = state.clearKey
        ? t('keyPlaceholderClear')
        : state.keyConfigured
          ? t('keyPlaceholderKeep')
          : t('keyPlaceholderEmpty')
      var blocked = !state.dirty || state.saving

      return React.createElement('div', {
        className: 'dshTavilyCard',
        'data-open': String(open)
      },
      React.createElement('button', {
        type: 'button',
        className: 'dshTavilyHead',
        'aria-expanded': open,
        onClick: function () { setOpen(!open) }
      },
      React.createElement('span', { className: 'dshTavilyHeading' },
        React.createElement('span', { className: 'dshTavilyTitle' }, t('title')),
        React.createElement('span', { className: 'dshTavilyDescription' }, t('description'))
      ),
      state.dirty
        ? React.createElement('span', { className: 'dshTavilyMode' }, t('unsaved'))
        : null,
      React.createElement('span', { className: 'dshTavilyMode' }, state.enabled ? t('enabled') : t('disabled'))
      ),
      open
        ? React.createElement('div', { className: 'dshTavilyBody' },
            React.createElement('div', { className: 'dshTavilyRow' },
              React.createElement('span', { className: 'dshTavilyLabel' }, t('enable')),
              React.createElement('label', { className: 'dshTavilySwitch' },
                React.createElement('input', {
                  type: 'checkbox',
                  role: 'switch',
                  checked: state.enabled,
                  disabled: !state.enabledWritable || state.saving,
                  onChange: function (event) { props.setEnabled(event.target.checked) }
                }),
                React.createElement('span', { className: 'dshTavilyTrack', 'aria-hidden': 'true' })
              )
            ),
            React.createElement('div', null,
              React.createElement('div', { className: 'dshTavilyMeta' },
                React.createElement('span', { className: 'dshTavilyLabel' }, t('apiKey')),
                React.createElement('span', { className: 'dshTavilyStatus' }, keyBadge),
                state.keyConfigured && state.keyWritable && !state.clearKey
                  ? React.createElement('button', {
                      type: 'button',
                      className: 'dshTavilyButton',
                      disabled: state.saving,
                      onClick: props.stageClearKey
                    }, t('clearKey'))
                  : null
              ),
              React.createElement('input', {
                className: 'dshTavilyInput',
                type: 'password',
                autoComplete: 'off',
                spellCheck: false,
                placeholder: keyPlaceholder,
                value: state.draftKey,
                disabled: !state.keyWritable || state.saving,
                onChange: function (event) { props.setKey(event.target.value) }
              }),
              React.createElement('p', { className: 'dshTavilyHint' }, t('keyHint'))
            ),
            React.createElement('div', { className: 'dshTavilyMeta' },
              React.createElement('span', {
                className: state.probe && !state.probe.ok
                  ? 'dshTavilyStatus dshTavilyError'
                  : 'dshTavilyStatus',
                role: 'status',
                'aria-live': 'polite'
              }, state.probing ? t('testing') : probeText(t, state.probe)),
              React.createElement('div', { className: 'dshTavilyActions' },
                React.createElement('button', {
                  type: 'button',
                  className: 'dshTavilyButton',
                  disabled: state.probing || state.saving,
                  onClick: props.testConnection
                }, state.probing ? t('testing') : t('test')),
                React.createElement('button', {
                  type: 'button',
                  className: 'dshTavilyButton',
                  disabled: blocked,
                  onClick: props.discard
                }, t('discard')),
                React.createElement('button', {
                  type: 'button',
                  className: 'dshTavilyButton',
                  'data-primary': 'true',
                  disabled: blocked,
                  onClick: props.save
                }, state.saving ? t('saving') : t('save'))
              )
            ),
            state.failed
              ? React.createElement('div', {
                  className: 'dshTavilyStatus dshTavilyError',
                  role: 'alert'
                }, t('saveFailed'))
              : null
          )
        : null)
    }

    function apply(ctx) {
      var slots = ctx.get('slots')
      var locale = ctx.get('locale')
      var remote = ctx.get('remote')
      if (!slots || !locale || !remote || !remote.credentials) return

      ctx.effect(function () { return addStyles() }, 'tavily-provider: styles')
      ctx.effect(function () {
        return locale.register(NAMESPACE, dictionaries)
      }, 'tavily-provider: dictionaries')

      var controller = new TavilyCardController(remote)
      ctx.effect(function () {
        return remote.$on('credentials/reference-updated', function (ref) {
          if (ref === KEY_REF || ref === ENABLED_REF) controller.refresh()
        })
      }, 'tavily-provider: credential refresh')

      slots.inject('settings.plugin.item', function () {
        return slots.register({
          name: 'settings.plugin.item',
          key: NAMESPACE,
          locale: NAMESPACE,
          inject: function () { return controller.inject() }
        }, TavilyCard)
      })
    }

    exports.apply = apply
    exports.inject = ['slots', 'locale', 'remote', 'remote.credentials']
    exports.__test = {
      createSnapshotStore: createSnapshotStore,
      TavilyCardController: TavilyCardController
    }
    return module.exports
  }
})
