import path from 'path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [dts()],
  build: {
    lib: {
      entry: path.resolve(__dirname, './src/magliajs.ts'),
      name: 'maglia',
      fileName: `magliajs`
    },
  },
  resolve: {
    alias: {
      "@": "./src"
    }
  }
})