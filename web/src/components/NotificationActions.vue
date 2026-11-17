<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika) -->

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { markNotificationRead } from '@/stores/notifications'
import type { AppNotification, NotificationAction } from '@/stores/notifications'

const props = defineProps<{ notification: AppNotification }>()
const emit = defineEmits<{ (e: 'done', id: number, kind: 'ack' | 'link' | 'action'): void }>()
const router = useRouter()

async function run(action: NotificationAction) {
  if (action.kind === 'ack') {
    // Close the host first: marking read removes this notification (and this
    // component) from the list before an await could complete.
    emit('done', props.notification.id, 'ack')
    await markNotificationRead(props.notification.id)
    return
  }
  if (action.kind === 'action' && action.topic) {
    // Let the owning plugin handle the action in the same click/user-gesture
    // (for example, resuming audio playback).
    window.dispatchEvent(
      new CustomEvent('homepage:notification-action', {
        detail: {
          topic: action.topic,
          pluginId: props.notification.pluginId,
          notificationId: props.notification.id,
        },
      })
    )
    emit('done', props.notification.id, 'action')
    await markNotificationRead(props.notification.id)
    return
  }
  if (action.kind === 'link' && action.url) {
    if (/^\/(?!\/)/.test(action.url)) router.push(action.url)
    else window.open(action.url, '_blank', 'noopener,noreferrer')
  }
  emit('done', props.notification.id, 'link')
}
</script>

<template>
  <div class="notif-actions">
    <button
      v-for="action in notification.actions"
      :key="action.id"
      type="button"
      class="btn btn-sm"
      :class="action.kind === 'ack' ? 'btn-filled' : 'btn-outlined'"
      @click.stop="run(action)"
    >
      {{ action.label }}
    </button>
  </div>
</template>

<style scoped>
.notif-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
</style>
