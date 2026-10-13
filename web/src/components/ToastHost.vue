<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika) -->

<script setup lang="ts">
import { toasts, dismissToast } from '@/stores/toast'
</script>

<template>
  <div class="snackbar-host">
    <transition-group name="toast">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="snackbar"
        :class="t.kind"
        @click="dismissToast(t.id)"
      >
        {{ t.message }}
      </div>
    </transition-group>
  </div>
</template>

<style scoped>
.toast-leave-active {
  transition: opacity var(--md-dur-short) var(--md-ease-standard),
    transform var(--md-dur-short) var(--md-ease-standard);
}
.toast-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
