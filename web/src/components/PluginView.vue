<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika) -->

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { api } from '@/lib/api'
import { auth } from '@/stores/auth'
import { theme } from '@/stores/theme'
import { alertDialog, confirmDialog } from '@/stores/dialog'
import type { RuntimePlugin } from '@/lib/types'

const props = defineProps<{
  plugin: RuntimePlugin
  source?: string
  title?: string
  data?: unknown
  kind?: 'widget' | 'page' | 'module' | 'overlay' | 'topbar' | 'footer' | 'editor-tool' | 'settings'
  id?: string
  /** when to mount the plugin: immediately, when scrolled near, or when idle */
  mount?: 'eager' | 'visible' | 'idle'
  /** editor bridge: insert text at the cursor / close the dialog / edit an existing form */
  editor?: {
    insert?: (text: string) => void
    close?: () => void
    edit?: (id: string) => void
  }
}>()

const rootRef = ref<HTMLElement | null>(null)
const hostRef = ref<HTMLElement | null>(null)
const loading = ref(true)
const error = ref('')
const resolvedData = ref<any>(null)
const started = ref(false)
let cleanup: (() => void) | undefined
let observer: IntersectionObserver | null = null
let cancelScheduled: (() => void) | null = null

function startLoad() {
  if (started.value) return
  started.value = true
  load()
}

/** Defer the initial load so many plugins don't all mount during first paint. */
function scheduleLoad() {
  const mode = props.mount || 'eager'
  if (mode === 'eager') {
    startLoad()
    return
  }
  if (mode === 'visible') {
    if (typeof IntersectionObserver === 'undefined' || !rootRef.value) {
      startLoad()
      return
    }
    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer?.disconnect()
          observer = null
          startLoad()
        }
      },
      { rootMargin: '400px 0px' }
    )
    observer.observe(rootRef.value)
    return
  }
  // idle
  const ric = (window as any).requestIdleCallback as
    | ((cb: () => void, opts?: { timeout: number }) => number)
    | undefined
  const cic = (window as any).cancelIdleCallback as ((id: number) => void) | undefined
  if (typeof ric === 'function') {
    const id = ric(() => startLoad(), { timeout: 1500 })
    cancelScheduled = () => cic?.(id)
  } else {
    const id = window.setTimeout(() => startLoad(), 120)
    cancelScheduled = () => clearTimeout(id)
  }
}

const FRAMEWORK_CSS = `
  :host { display: block; color: var(--md-on-surface); font-family: var(--md-font, system-ui, sans-serif); }
  * { box-sizing: border-box; }
  h1,h2,h3 { margin: 0 0 .4em; line-height: 1.25; }
  p { margin: .5em 0; color: var(--md-on-surface-variant); }
  a { color: var(--md-primary); }
  .card { background: var(--md-surface-container-low); border-radius: var(--md-shape-xl); padding: 18px; border: 1px solid color-mix(in srgb, var(--md-outline-variant) 50%, transparent); }
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 38px; padding: 0 18px; border: none; border-radius: var(--md-shape-full); background: transparent; color: var(--md-primary); font-weight: 600; cursor: pointer; }
  .btn-filled { background: var(--md-primary); color: var(--md-on-primary); }
  .btn-tonal { background: var(--md-secondary-container); color: var(--md-on-secondary-container); }
  .btn-outlined { border: 1px solid var(--md-outline); }
  .btn-danger { background: var(--md-error-container); color: var(--md-on-error-container); }
  .btn-sm { min-height: 32px; padding: 0 12px; font-size: .82rem; }
  .chip { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border-radius: 8px; background: var(--md-secondary-container); color: var(--md-on-secondary-container); font-size: .8rem; border: none; cursor: pointer; }
  .chip.active { background: var(--md-primary); color: var(--md-on-primary); }
  .badge { display: inline-flex; padding: 2px 8px; border-radius: var(--md-shape-full); font-size: .68rem; font-weight: 700; background: var(--md-secondary-container); color: var(--md-on-secondary-container); }
  input, select, textarea { font: inherit; color: inherit; }
  code, pre { font-family: var(--md-font-mono, monospace); background: var(--md-surface-container-high); border-radius: 8px; }
  code { padding: 2px 6px; }
  pre { padding: 12px; overflow: auto; }
`

function unwrap(r: any) {
  return r && typeof r === 'object' && 'data' in r ? r.data : r
}

/** Link the active theme stylesheet into a plugin's shadow root. */
function applyShadowTheme(root: ShadowRoot) {
  let link = root.querySelector('link.oc-plugin-theme') as HTMLLinkElement | null
  if (theme.hasCss && theme.cssUrl) {
    if (!link) {
      link = document.createElement('link')
      link.rel = 'stylesheet'
      link.className = 'oc-plugin-theme'
      root.appendChild(link)
    }
    if (link.getAttribute('href') !== theme.cssUrl) link.setAttribute('href', theme.cssUrl)
  } else if (link) {
    link.remove()
  }
}

function makeApi(pluginId: string, owner: string) {
  const base = `/plugins/${pluginId}`
  const q = (extra?: Record<string, string>) => {
    const params = new URLSearchParams(extra || {})
    if (owner) params.set('username', owner)
    const s = params.toString()
    return s ? `?${s}` : ''
  }
  const assetUrl = (name: string) =>
    `/api/plugins/${pluginId}/storage/${encodeURIComponent(name)}${q()}`
  return {
    pluginId,
    owner,
    get isAdmin() {
      return Boolean(auth.user)
    },
    editor: props.editor,
    dialog: {
      confirm: (opts: any) => confirmDialog(opts),
      alert: (opts: any) => alertDialog(opts),
    },
    call(route: string, opts: { method?: string; body?: unknown; query?: Record<string, string> } = {}) {
      return api(`${base}/call/${route}${q(opts.query)}`, { method: opts.method || 'GET', body: opts.body }).then(unwrap)
    },
    data(source: string, query?: Record<string, string>) {
      return api(`${base}/data/${source}${q(query)}`, { auth: false }).then(unwrap)
    },
    storage: {
      url: assetUrl,
      list: () => api(`${base}/storage${q()}`),
      upload: (files: File[], onProgress?: (ratio: number) => void) =>
        sendFiles('POST', `${base}/storage${q()}`, 'files', files, onProgress),
      replace: (name: string, file: File, onProgress?: (ratio: number) => void) =>
        sendFiles('PUT', `${base}/storage/${encodeURIComponent(name)}${q()}`, 'file', [file], onProgress),
      remove: (name: string) => api(`${base}/storage/${encodeURIComponent(name)}${q()}`, { method: 'DELETE' }),
      removeBefore: (date: string) => api(`${base}/storage${q({ before: date })}`, { method: 'DELETE' }),
    },
  }
}

/** Multipart upload with progress via XHR (fetch can't report upload progress). */
function sendFiles(
  method: string,
  path: string,
  field: string,
  files: File[],
  onProgress?: (ratio: number) => void
): Promise<any> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    for (const f of files) form.append(field, f)
    const xhr = new XMLHttpRequest()
    xhr.open(method, `/api${path}`)
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total)
    }
    xhr.onload = () => {
      let data: any = null
      try {
        data = JSON.parse(xhr.responseText)
      } catch {
        data = null
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data)
      else reject(new Error(data?.error || `请求失败 (${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error('网络错误'))
    xhr.send(form)
  })
}

function interpolate(template: string, data: unknown): string {
  const value = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  return template.replace(/\{\{\s*([\w.$-]+)\s*\}\}/g, (_m, path: string) => {
    const result = path.split('.').reduce<unknown>((acc, key) => {
      if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key]
      return undefined
    }, value)
    if (result === undefined || result === null) return ''
    return typeof result === 'object' ? JSON.stringify(result) : String(result)
  })
}

function stripScripts(html: string): string {
  let out = String(html || '')
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '').replace(/<script\b[^>]*\/?>/gi, '')
  out = out.replace(/\s+on[a-zA-Z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/g, '')
  out = out.replace(
    /(\s(?:href|src|action|formaction|xlink:href)\s*=\s*)(["'])\s*javascript:[^"']*\2/gi,
    '$1$2#$2'
  )
  return out
}

async function load() {
  loading.value = true
  error.value = ''
  cleanup?.()
  cleanup = undefined
  const owner = props.plugin.owner || ''
  const ownerQs = owner ? `&username=${encodeURIComponent(owner)}` : ''
  try {
    let data: any = props.data ?? null
    const source = props.source || props.plugin.cardSources[0]?.id
    if (data == null && source) {
      const res = await api<{ data: unknown }>(
        `/plugins/${props.plugin.id}/data/${source}${owner ? `?username=${encodeURIComponent(owner)}` : ''}`
      )
      data = res.data
    }
    resolvedData.value = data

    const template = props.plugin.hasUi
      ? await api<string>(
          `/plugins/${props.plugin.id}/ui?rev=${encodeURIComponent(props.plugin.rev)}${ownerQs}`
        )
      : ''

    loading.value = false
    if (props.plugin.hasUi || props.plugin.hasJs) {
      await nextTick()
      const host = hostRef.value
      if (host) {
        const root = host.shadowRoot || host.attachShadow({ mode: 'open' })
        // reserved <style> slot for the framework base; the active theme is
        // linked (so a theme also styles the native UI components plugins render
        // through, and its relative assets/fonts resolve)
        root.innerHTML = `<style></style>` + (template ? interpolate(stripScripts(template), data || {}) : '')
        const base = root.querySelector('style')
        if (base) base.textContent = FRAMEWORK_CSS
        applyShadowTheme(root)
        if (props.plugin.hasJs) {
          try {
            const mod = await import(
              /* @vite-ignore */ `/api/plugins/${props.plugin.id}/asset/ui.js?rev=${encodeURIComponent(props.plugin.rev)}${ownerQs}`
            )
            if (typeof mod?.mount === 'function') {
              cleanup = mod.mount({
                pluginId: props.plugin.id,
                kind: props.kind || 'widget',
                id: props.id || '',
                root,
                host,
                owner,
                data: resolvedData.value,
                api: makeApi(props.plugin.id, owner),
              })
            }
          } catch (e) {
            console.error(`[plugin:${props.plugin.id}] ui.js failed`, e)
          }
        }
      }
    }
  } catch (e: any) {
    error.value = String(e?.message || e)
    loading.value = false
  }
}

onBeforeUnmount(() => {
  observer?.disconnect()
  cancelScheduled?.()
  cleanup?.()
})
onMounted(scheduleLoad)
watch(
  () => `${props.plugin.id}:${props.source || ''}:${auth.user ? 'auth' : 'guest'}`,
  () => {
    if (started.value) load()
  }
)
// keep the plugin's shadow DOM in sync when the active theme changes
watch(
  () => `${theme.id}:${theme.cssUrl}`,
  () => {
    const root = hostRef.value?.shadowRoot
    if (root) applyShadowTheme(root)
  }
)
</script>

<template>
  <div ref="rootRef" class="plugin-view">
    <div
      v-if="loading"
      class="skeleton"
      :style="
        kind === 'topbar'
          ? 'height: 42px; width: 128px; border-radius: var(--md-shape-full)'
          : 'height: 84px; border-radius: var(--md-shape-xl)'
      "
    />
    <div v-else-if="error" class="plugin-error md-muted">插件加载失败：{{ error }}</div>
    <template v-else>
      <div v-if="plugin.hasUi || plugin.hasJs" ref="hostRef" class="plugin-ui" />
      <div v-else class="plugin-default card">
        <h3 class="plugin-default-title">{{ title || plugin.name }}</h3>
        <pre v-if="resolvedData">{{ JSON.stringify(resolvedData, null, 2) }}</pre>
        <p v-else class="md-muted">该插件未提供 UI。</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.plugin-default-title {
  font-size: 1.05rem;
  font-weight: 700;
  margin-bottom: 10px;
}
.plugin-default pre {
  font-family: var(--md-font-mono);
  font-size: 0.8rem;
  background: var(--md-surface-container-high);
  padding: 12px;
  border-radius: var(--md-shape-md);
  overflow: auto;
  max-height: 260px;
}
.plugin-error {
  font-size: 0.84rem;
  color: var(--md-error);
}
</style>
