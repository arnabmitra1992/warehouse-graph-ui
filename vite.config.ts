import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const simulatorProxyTarget = env.VITE_SIMULATOR_API_PROXY_TARGET?.trim()

  return {
    plugins: [react()],
    base: env.VITE_APP_BASE_PATH || '/',
    server: simulatorProxyTarget
      ? {
          proxy: {
            '/api': {
              target: simulatorProxyTarget,
              changeOrigin: true,
              secure: false,
              rewrite: (path) => path.replace(/^\/api/, ''),
            },
          },
        }
      : undefined,
  }
})
