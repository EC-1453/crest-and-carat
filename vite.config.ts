import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ isSsrBuild, isPreview }) => ({
  appType: isPreview ? 'mpa' : 'spa',
  plugins: [react(), tailwindcss()],
  build: { manifest: !isSsrBuild, target: ['chrome107', 'edge107', 'firefox104', 'safari16'] },
}))
