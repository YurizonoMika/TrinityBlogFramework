<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika) -->

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { api, getToken } from '@/lib/api'
import { auth } from '@/stores/auth'
import type { RuntimePlugin } from '@/lib/types'

const props = defineProps<{
  plugin: RuntimePlugin
  source?: string
  title?: string
  data?: unknown
  kind?: 'widget' | 'page' | 'module' | 'overlay'
  id?: string
}>()

const hostRef = ref<HTMLElement | null>(null)
const loading = ref(true)
const error = ref('')
const resolvedData = ref<any>(null)
let cleanup: (() => void) | undefined

const FRAMEWORK_CSS = `
  :host { display: block; color: var(--md-on-surface); font-family: var(--md-font, system-ui, sans-serif); }
  * { box-sizing: border-box; }
  h1,h2,h3 { margin: 0 0 .4em; line-height: 1.25; }
  p { margin: .5em 0; color: var(--md-on-surface-variant); }
  a { color: var(--md-primary); }
  .card { background: var(--md-surface-container-low); border-radius: 24px; padding: 18px; border: 1px solid color-mix(in srgb, var(--md-outline-variant) 50%, transparent); }
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 38px; padding: 0 18px; border: none; border-radius: 999px; background: transparent; color: var(--md-primary); font-weight: 600; cursor: pointer; }
  .btn-filled { background: var(--md-primary); color: var(--md-on-primary); }
  .btn-tonal { background: var(--md-secondary-container); color: var(--md-on-secondary-container); }
  .btn-outlined { border: 1px solid var(--md-outline); }
  .btn-danger { background: var(--md-error-container); color: var(--md-on-error-container); }
  .btn-sm { min-height: 32px; padding: 0 12px; font-size: .82rem; }
  .chip { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border-radius: 8px; background: var(--md-secondary-container); color: var(--md-on-secondary-container); font-size: .8rem; border: none; cursor: pointer; }
  .chip.active { background: var(--md-primary); color: var(--md-on-primary); }
  .badge { display: inline-flex; padding: 2px 8px; border-radius: 999px; font-size: .68rem; font-weight: 700; background: var(--md-secondary-container); color: var(--md-on-secondary-container); }
  input, select, textarea { font: inherit; color: inherit; }
  code, pre { font-family: var(--md-font-mono, monospace); background: var(--md-surface-container-high); border-radius: 8px; }
  code { padding: 2px 6px; }
  pre { padding: 12px; overflow: auto; }
`

function unwrap(r: any) {
  return r && typeof r === 'object' && 'data' in r ? r.data : r
}

function makeApi(pluginId: string) {
  const base = `/plugins/${pluginId}`
  const assetUrl = (name: string) => {
    const token = getToken()
    const qs = token ? `?token=${encodeURIComponent(token)}` : ''
    return `/api/plugins/${pluginId}/storage/${encodeURIComponent(name)}${qs}`
  }
  return {
    pluginId,
    isAdmin: Boolean(auth.user),
    call(route: string, opts: { method?: string; body?: unknown; query?: Record<string, string> } = {}) {
      const qs = opts.query ? `?${new URLSearchParams(opts.query)}` : ''
      return api(`${base}/call/${route}${qs}`, { method: opts.method || 'GET', body: opts.body }).then(unwrap)
    },
    data(source: string, query?: Record<string, string>) {
      const qs = query ? `?${new URLSearchParams(query)}` : ''
      return api(`${base}/data/${source}${qs}`, { auth: false }).then(unwrap)
    },
    storage: {
      url: assetUrl,
      list: () => api(`${base}/storage`),
      upload: (files: File[]) => {
        const form = new FormData()
        for (const f of files) form.append('files', f)
        return api(`${base}/storage`, { method: 'POST', body: form, raw: true })
      },
      remove: (name: string) => api(`${base}/storage/${encodeURIComponent(name)}`, { method: 'DELETE' }),
      removeBefore: (date: string) =>
        api(`${base}/storage?before=${encodeURIComponent(date)}`, { method: 'DELETE' }),
    },
  }
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
  return html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/ on\w+="[^"]*"/gi, '')
}

async function load() {
  loading.value = true
  error.value = ''
  cleanup?.()
  cleanup = undefined
  try {
    let data: any = props.data ?? null
    const source = props.source || props.plugin.cardSources[0]?.id
    if (data == null && source) {
      const res = await api<{ data: unknown }>(`/plugins/${props.plugin.id}/data/${source}`)
      data = res.data
    }
    resolvedData.value = data

    const template = props.plugin.hasUi
      ? await api<string>(`/plugins/${props.plugin.id}/ui?rev=${encodeURIComponent(props.plugin.rev)}`)
      : ''

    loading.value = false
    if (props.plugin.hasUi || props.plugin.hasJs) {
      await nextTick()
      const host = hostRef.value
      if (host) {
        const root = host.shadowRoot || host.attachShadow({ mode: 'open' })
        root.innerHTML =
          `<style>${FRAMEWORK_CSS}</style>` +
          (template ? interpolate(stripScripts(template), data || {}) : '')
        if (props.plugin.hasJs) {
          try {
            const mod = await import(
              /* @vite-ignore */ `/plugins/${props.plugin.id}/ui.js?v=${encodeURIComponent(props.plugin.rev)}`
            )
            if (typeof mod?.mount === 'function') {
              cleanup = mod.mount({
                pluginId: props.plugin.id,
                kind: props.kind || 'widget',
                id: props.id || '',
                root,
                host,
                api: makeApi(props.plugin.id),
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

onBeforeUnmount(() => cleanup?.())
onMounted(load)
watch(() => `${props.plugin.id}:${props.source || ''}`, load)
</script>

<template>
  <div class="plugin-view">
    <div v-if="loading" class="skeleton" style="height: 84px; border-radius: 20px" />
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
