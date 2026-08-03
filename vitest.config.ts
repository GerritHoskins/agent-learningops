import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'

export default defineConfig({
    plugins: [svelte()],
    resolve: {
        conditions: ['browser'],
    },
    test: {
        bail: process.env.CI ? 1 : 0,
        clearMocks: true,
        environment: 'node',
        include: ['test/**/*.spec.ts'],
        env: {
            LANG: 'en_US.UTF-8',
            TZ: 'Europe/Berlin',
        },
        coverage: {
            provider: 'v8',
            include: ['src/**/*.ts'],
            exclude: ['src/**/*.d.ts'],
        },
    },
})
