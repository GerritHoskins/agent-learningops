import { defineConfig } from 'vite'

export default defineConfig({
    build: {
        outDir: 'dist/electron',
        emptyOutDir: false,
        sourcemap: true,
        minify: false,
        lib: {
            entry: 'src/electron/preload.ts',
            formats: ['cjs'],
            fileName: () => 'preload.cjs',
        },
        rollupOptions: {
            external: ['electron'],
        },
    },
})
