import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/test-script/**']
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Monaco 自带几十个语言定义，整体 ~4MB；拆成独立 chunk 由 React.lazy 触发加载，
    // 进入 Scripts tab 才需要它，首屏不被拖慢。
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/monaco-editor')) return 'monaco'
          if (id.includes('node_modules/@monaco-editor/react')) return 'monaco'
          return undefined
        }
      }
    }
  },
  optimizeDeps: {
    exclude: ['test-script']
  },
  base:'./'
})
