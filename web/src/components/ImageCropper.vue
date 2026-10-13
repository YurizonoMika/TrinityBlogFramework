<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika) -->

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import Cropper from 'cropperjs'
import 'cropperjs/dist/cropper.css'
import BaseDialog from './BaseDialog.vue'
import AppIcon from './AppIcon.vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    src: string
    aspectRatio?: number
    outputWidth?: number
    outputHeight?: number
    round?: boolean
    title?: string
  }>(),
  { aspectRatio: NaN, outputWidth: 0, outputHeight: 0, round: false, title: '' }
)

const emit = defineEmits<{ (e: 'close'): void; (e: 'done', blob: Blob): void }>()

const imgRef = ref<HTMLImageElement | null>(null)
const busy = ref(false)
let cropper: Cropper | null = null

function destroy() {
  if (cropper) {
    cropper.destroy()
    cropper = null
  }
}

function waitForImage(el: HTMLImageElement): Promise<void> {
  if (el.complete && el.naturalWidth) return Promise.resolve()
  return new Promise((resolve, reject) => {
    el.addEventListener('load', () => resolve(), { once: true })
    el.addEventListener('error', () => reject(new Error('图片加载失败')), { once: true })
  })
}

async function init() {
  await nextTick()
  destroy()
  const el = imgRef.value
  if (!el || !props.src) return
  try {
    await waitForImage(el)
  } catch {
    return
  }
  cropper = new Cropper(el, {
    aspectRatio: Number.isFinite(props.aspectRatio) && props.aspectRatio > 0 ? props.aspectRatio : NaN,
    viewMode: 1,
    dragMode: 'move',
    autoCropArea: 1,
    background: false,
    responsive: true,
    guides: true,
    center: true,
    highlight: true,
    modal: true,
  })
}

watch(
  () => [props.open, props.src] as const,
  ([open]) => {
    if (open) init()
    else destroy()
  }
)

onBeforeUnmount(destroy)

async function confirm() {
  if (!cropper) return
  busy.value = true
  try {
    const options: Cropper.GetCroppedCanvasOptions = {
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
      fillColor: '#ffffff',
    }
    if (props.outputWidth) options.width = props.outputWidth
    if (props.outputHeight) options.height = props.outputHeight
    const canvas = cropper.getCroppedCanvas(options)
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92)
    )
    if (blob) emit('done', blob)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <BaseDialog :open="open" :title="title || '裁剪图片'" @close="emit('close')">
    <div class="cropper-wrap" :class="{ round }">
      <img ref="imgRef" :src="src" alt="" />
    </div>
    <div class="crop-tools">
      <button class="btn btn-outlined btn-sm" @click="cropper?.reset()">
        <AppIcon name="refresh" :size="15" />重置
      </button>
      <button class="btn btn-outlined btn-sm" @click="cropper?.rotate(90)">
        <AppIcon name="refresh" :size="15" />旋转 90°
      </button>
      <span class="md-muted tiny">拖动移动 · 滚轮缩放</span>
    </div>
    <template #actions>
      <button class="btn" @click="emit('close')">取消</button>
      <button class="btn btn-filled" :disabled="busy" @click="confirm">
        <span v-if="busy" class="spinner" style="width: 15px; height: 15px" />
        <AppIcon v-else name="check" :size="16" />确定
      </button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.cropper-wrap {
  position: relative;
  width: 100%;
  height: min(58vh, 420px);
  background: var(--md-surface-container-highest);
  border-radius: var(--md-shape-lg);
  overflow: hidden;
}
.cropper-wrap.round :deep(.cropper-view-box),
.cropper-wrap.round :deep(.cropper-face) {
  border-radius: 50%;
}
.cropper-wrap :deep(img) {
  display: block;
  max-width: 100%;
}
.crop-tools {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  flex-wrap: wrap;
}
.crop-tools .tiny {
  font-size: 0.76rem;
}
</style>
