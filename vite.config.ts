import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
    root: 'src/renderer',
    base: './',
    plugins: [tailwindcss(), svelte({ configFile: 'svelte.config.js' })],
    build: {
        outDir: '../../dist/renderer',
        emptyOutDir: false,
    },
})
