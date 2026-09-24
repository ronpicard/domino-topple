import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative asset paths work on both username.github.io and /repository/ Pages sites.
  base: './',
  build: {
    // Rapier ships its WASM inlined, so its chunk is large by design.
    chunkSizeWarningLimit: 2600,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('/node_modules/@dimforge/')) return 'rapier'
          if (id.includes('/node_modules/three/')) return 'three'
          return undefined
        },
      },
    },
  },
})
