import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'

// Software version = the plugin/theme SDK version (single source of truth in
// server/src/sdk.js), exposed to the app at build time.
const sdkSource = readFileSync(new URL('../server/src/sdk.js', import.meta.url), 'utf-8')
const sdkVersion = (sdkSource.match(/SDK_VERSION\s*=\s*['"]([^'"]+)['"]/) || [])[1] || '0.0.0'

export default defineConfig({
  plugins: [vue()],
  define: {
    __APP_VERSION__: JSON.stringify(sdkVersion),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787',
      '/uploads': 'http://localhost:8787',
    },
  },
})
