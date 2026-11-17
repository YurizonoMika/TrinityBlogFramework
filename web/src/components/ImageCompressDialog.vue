<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika) -->

<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import BaseDialog from './BaseDialog.vue'
import { compressImageFile, formatBytes } from '@/lib/imageCompress'
import { imageCompress, finishImageCompression } from '@/stores/imageCompress'

const busy = computed(
  () => imageCompress.phase === 'running' || imageCompress.phase === 'done'
)
const percent = computed(() => Math.max(0, Math.min(100, Math.round(imageCompress.progress * 100))))

function close() {
  if (busy.value) return
  finishImageCompression(null)
}

async function start() {
  const file = imageCompress.file
  if (!file) return
  imageCompress.phase = 'running'
  imageCompress.progress = 0
  imageCompress.error = ''
  imageCompress.after = 0
  try {
    const result = await compressImageFile(file, {
      maxBytes: imageCompress.maxBytes,
      onProgress: (ratio) => {
        imageCompress.progress = ratio
      },
    })
    if (!result) {
      throw new Error(`压缩后仍超过 ${formatBytes(imageCompress.maxBytes)}，请选择更小的图片`)
    }
    imageCompress.after = result.size
    imageCompress.progress = 1
    imageCompress.phase = 'done'
    // Let the 100% state be visible before the upload starts.
    await new Promise((resolve) => setTimeout(resolve, 280))
    finishImageCompression(result)
  } catch (err: any) {
    imageCompress.phase = 'error'
    imageCompress.error = String(err?.message || err || '压缩失败')
  }
}
</script>

<template>
  <BaseDialog
    :open="imageCompress.open"
    :title="busy ? '正在压缩图片' : '图片过大'"
    :close-on-scrim="!busy"
    :hide-close="busy"
    @close="close"
  >
    <template v-if="imageCompress.phase === 'confirm'">
      <p>
        「{{ imageCompress.file?.name }}」大小为
        <strong>{{ formatBytes(imageCompress.before) }}</strong
        >，超过 {{ formatBytes(imageCompress.maxBytes) }} 的上传限制。
      </p>
      <p class="md-muted">
        是否压缩后上传？图片会转换为 WebP，必要时降低分辨率与质量；原图不会被修改。
      </p>
    </template>

    <template v-else-if="imageCompress.phase === 'running' || imageCompress.phase === 'done'">
      <p>{{ imageCompress.phase === 'done' ? '压缩完成，正在上传…' : '正在压缩图片…' }}</p>
      <div
        class="compress-track"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="percent"
      >
        <div class="compress-fill" :style="{ width: percent + '%' }" />
      </div>
      <p class="md-muted tiny">
        {{ percent }}% · {{ formatBytes(imageCompress.before) }}
        <template v-if="imageCompress.after">
          → {{ formatBytes(imageCompress.after) }}
        </template>
      </p>
    </template>

    <p v-else class="compress-error">{{ imageCompress.error }}</p>

    <template #actions>
      <template v-if="imageCompress.phase === 'confirm'">
        <button class="btn" @click="close">取消</button>
        <button class="btn btn-filled" @click="start">
          <AppIcon name="image" :size="16" />压缩并上传
        </button>
      </template>
      <button
        v-else-if="imageCompress.phase === 'error'"
        class="btn btn-filled"
        @click="close"
      >
        知道了
      </button>
      <span v-else-if="busy" class="md-muted tiny">请稍候…</span>
    </template>
  </BaseDialog>
</template>

<style scoped>
.compress-track {
  height: 8px;
  margin: 14px 0 8px;
  overflow: hidden;
  border-radius: var(--md-shape-full);
  background: var(--md-surface-container-highest);
}
.compress-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--md-primary);
  transition: width 0.18s var(--md-ease-standard);
}
.compress-error {
  color: var(--md-error);
  line-height: 1.7;
}
</style>
