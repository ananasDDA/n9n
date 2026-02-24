import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Для GitHub Pages: если репо будет в формате user.github.io/repo-name,
// раскомментируй base: '/repo-name/'
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  // base: '/AI_Arch/',  // для GitHub Pages (Project site)
})
