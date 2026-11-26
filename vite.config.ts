import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ isSsrBuild, isPreview }) => ({
  appType: isPreview ? 'mpa' : 'spa',
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': { target: 'http://127.0.0.1:8787' } } },
  build: { manifest: !isSsrBuild, target: ['chrome107', 'edge107', 'firefox104', 'safari16'] },
}))
