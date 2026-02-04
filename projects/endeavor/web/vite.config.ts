import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@forge/client': path.resolve(__dirname, './src/lib/forge/client.ts'),
      '@forge/react': path.resolve(__dirname, './src/lib/forge/react.tsx'),
    },
  },
  server: {
    port: 3000,
    allowedHosts: ['.ngrok-free.app', '.ngrok.io', 'localhost'],
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8082',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:8082',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8082',
        ws: true,
      },
    },
  },
})
