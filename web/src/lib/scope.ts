// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika)

import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { auth } from '@/stores/auth'

// routes that always belong to the logged-in user (their own account area)
const ACCOUNT_ROUTES = new Set(['settings', 'write', 'edit'])

/**
 * The user whose content / navigation the current page is scoped to.
 *  - `/user/:username` and `?username=` → that user
 *  - account pages (settings / write / editor) → the logged-in user
 *  - everything else → '' (the site owner)
 */
export function usePageOwner() {
  const route = useRoute()
  return computed(() => {
    const param = route.params.username
    if (typeof param === 'string' && param) return param
    const query = route.query.username
    if (typeof query === 'string' && query) return query
    if (auth.user && ACCOUNT_ROUTES.has(String(route.name))) return auth.user.username
    return ''
  })
}
