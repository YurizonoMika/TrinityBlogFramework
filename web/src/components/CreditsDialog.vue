<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 YurizonoMika (https://github.com/YurizonoMika) -->

<script setup lang="ts">
import BaseDialog from './BaseDialog.vue'
import AppIcon from './AppIcon.vue'
import { site } from '@/stores/site'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const year = new Date().getFullYear()

interface Component {
  name: string
  version: string
  license: string
  url: string
}

const components: Component[] = [
  { name: 'Vue', version: '3.5', license: 'MIT', url: 'https://vuejs.org' },
  { name: 'Vue Router', version: '4.6', license: 'MIT', url: 'https://router.vuejs.org' },
  { name: 'Vite', version: '6.4', license: 'MIT', url: 'https://vitejs.dev' },
  { name: 'TypeScript', version: '5.7', license: 'Apache-2.0', url: 'https://www.typescriptlang.org' },
  { name: '@vitejs/plugin-vue', version: '5.2', license: 'MIT', url: 'https://github.com/vitejs/vite-plugin-vue' },
  { name: 'vue-tsc', version: '2.2', license: 'MIT', url: 'https://github.com/vuejs/language-tools' },
  { name: 'marked', version: '15.0', license: 'MIT', url: 'https://marked.js.org' },
  { name: 'DOMPurify', version: '3.4', license: 'MPL-2.0 OR Apache-2.0', url: 'https://github.com/cure53/DOMPurify' },
  { name: 'Cropper.js', version: '1.6', license: 'MIT', url: 'https://fengyuanchen.github.io/cropperjs' },
  {
    name: '@material/material-color-utilities',
    version: '0.4',
    license: 'Apache-2.0',
    url: 'https://github.com/material-foundation/material-color-utilities',
  },
  { name: 'Node.js (node:sqlite)', version: '24+', license: 'MIT', url: 'https://nodejs.org' },
  { name: 'Express', version: '4.22', license: 'MIT', url: 'https://expressjs.com' },
  { name: 'cors', version: '2.8', license: 'MIT', url: 'https://github.com/expressjs/cors' },
  { name: 'jsonwebtoken', version: '9.0', license: 'MIT', url: 'https://github.com/auth0/node-jsonwebtoken' },
  { name: 'bcryptjs', version: '2.4', license: 'MIT', url: 'https://github.com/dcodeIO/bcrypt.js' },
  { name: 'Multer', version: '2.4', license: 'MIT', url: 'https://github.com/expressjs/multer' },
  { name: 'sharp', version: '0.33', license: 'Apache-2.0', url: 'https://sharp.pixelplumbing.com' },
  {
    name: 'nxapi',
    version: '1.6.1-next',
    license: 'AGPL-3.0-or-later',
    url: 'https://github.com/samuelthomas2774/nxapi',
  },
]
</script>

<template>
  <BaseDialog :open="open" title="版权与开源许可" wide @close="emit('close')">
    <div class="credits-head">
      <div>
        <h3>{{ 'Trinity Blog Framework' }}</h3>
        <p class="md-muted">Designed By @YurizonoMika, 本应用基于以下开源组件构建。</p>
      </div>
    </div>

    <div class="credits-license">
      <span class="lic strong">AGPL-3.0-or-later</span>
      <span class="credits-license-text">
        本作品为自由软件，可依据 AGPL-3.0 再分发和/或修改；通过网络提供服务时须向使用者提供完整源码。
      </span>
      <a href="https://github.com/YurizonoMika" target="_blank" rel="noopener">
        获取源代码 <AppIcon name="open_in_new" :size="14" />
      </a>
    </div>

    <ul class="credits-list">
      <li v-for="c in components" :key="c.name">
        <a :href="c.url" target="_blank" rel="noopener">
          <span class="credits-name">{{ c.name }}</span>
          <span class="credits-ver">{{ c.version }}</span>
        </a>
        <span class="lic" :class="c.license.includes('AGPL') ? 'strong' : ''">{{ c.license }}</span>
      </li>
    </ul>

    <div class="credits-note">
      <p>
        Material Design 3 设计规范由 Google 提供（Apache-2.0）。<strong>nxapi</strong> 以
        <strong>AGPL-3.0-or-later</strong> 授权，本项目通过它访问 Nintendo Switch Online API。
      </p>
      <p>
        本项目与 Nintendo 无任何关联；Nintendo Switch、Nintendo Switch Online 及相关名称是任天堂的商标。
        各开源组件的版权归其各自作者所有。
      </p>
    </div>

    <template #actions>
      <button class="btn btn-filled" @click="emit('close')">
        <AppIcon name="check" :size="16" />知道了
      </button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.credits-head {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-bottom: 18px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--md-outline-variant);
}
.credits-logo {
  width: 56px;
  height: 56px;
  border-radius: var(--md-shape-lg);
  overflow: hidden;
  background: var(--md-primary-container);
  color: var(--md-on-primary-container);
  display: grid;
  place-items: center;
  font-size: 1.6rem;
  font-weight: 800;
  flex: none;
}

.credits-head h3 {
  font-size: 1.15rem;
  font-weight: 700;
}
.credits-head p {
  font-size: 0.82rem;
  margin-top: 2px;
}
.credits-section {
  margin-top: 20px;
}
.credits-license {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 16px;
  padding: 12px 14px;
  border-radius: var(--md-shape-lg);
  background: var(--md-tertiary-container);
  color: var(--md-on-tertiary-container);
  font-size: 0.8rem;
}
.credits-license .lic {
  background: color-mix(in srgb, var(--md-on-tertiary-container) 14%, transparent);
  color: var(--md-on-tertiary-container);
}
.credits-license-text {
  flex: 1;
  min-width: 180px;
  line-height: 1.6;
}
.credits-license a {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: inherit;
  font-weight: 700;
  white-space: nowrap;
}
.credits-license a:hover {
  text-decoration: underline;
}
.credits-group {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--md-on-surface-variant);
  margin-bottom: 10px;
}
.credits-list {
  list-style: none;
  margin: 18px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.credits-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 4px;
  border-bottom: 1px solid color-mix(in srgb, var(--md-outline-variant) 45%, transparent);
}
.credits-list a {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  color: var(--md-on-surface);
  text-decoration: none;
  min-width: 0;
}
.credits-list a:hover .credits-name {
  color: var(--md-primary);
  text-decoration: underline;
}
.credits-name {
  font-weight: 600;
  font-size: 0.92rem;
}
.credits-ver {
  font-size: 0.74rem;
  color: var(--md-on-surface-variant);
  font-family: var(--md-font-mono);
}
.lic {
  flex: none;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: var(--md-shape-full);
  background: var(--md-secondary-container);
  color: var(--md-on-secondary-container);
  white-space: nowrap;
}
.lic.strong {
  background: var(--md-tertiary-container);
  color: var(--md-on-tertiary-container);
}
.credits-note {
  margin-top: 20px;
  padding: 14px 16px;
  border-radius: var(--md-shape-lg);
  background: var(--md-surface-container);
  font-size: 0.8rem;
  line-height: 1.7;
  color: var(--md-on-surface-variant);
}
.credits-note p + p {
  margin-top: 8px;
}
</style>
