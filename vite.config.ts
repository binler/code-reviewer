import { defineConfig } from 'vite'

export default defineConfig({
  define: {
    'process.env.NODE_ENV': '"production"',
    'process': 'undefined',
    'global': 'window'
  },
  build: {
    target: 'es2020',
    minify: 'esbuild',
    outDir: 'media',
    emptyOutDir: false,
    lib: {
      entry: 'src/ui/react/index.tsx',
      name: 'sidebar',
      formats: ['iife'],
      fileName: () => 'sidebar.js'
    },
    rollupOptions: {
      output: { inlineDynamicImports: true }
    }
  }
})
