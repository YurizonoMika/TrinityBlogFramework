// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { reactive } from 'vue'
import { api } from '@/lib/api'
import type { RuntimePlugin } from '@/lib/types'

interface PluginState {
  list: RuntimePlugin[]
  loaded: boolean
  owner: string
}

export const plugins = reactive<PluginState>({
  list: [],
  loaded: false,
  owner: '',
})

export async function loadPlugins(owner = '') {
  plugins.owner = owner
  try {
    const qs = owner ? `?username=${encodeURIComponent(owner)}` : ''
    const res = await api<{ plugins: RuntimePlugin[] }>(`/plugins/runtime${qs}`)
    plugins.list = res.plugins
    plugins.loaded = true
  } catch {
    plugins.list = []
  }
}

export function findPlugin(id: string): RuntimePlugin | undefined {
  return plugins.list.find((p) => p.id === id)
}
