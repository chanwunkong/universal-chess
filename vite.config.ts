import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages：從 main 分支的 docs/ 發布，網址為 https://chanwunkong.github.io/universal-chess/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/universal-chess/' : '/',
  build: { outDir: 'docs', emptyOutDir: true },
}))
