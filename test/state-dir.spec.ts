import { configSchema } from '../src/domain/schemas.js'
import { resolveStateDirectory } from '../src/config/state-dir.js'
import { findRepositoryRoot } from '../src/config/schema.js'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'

describe('state directory resolution', () => {
    afterEach(() => {
        delete process.env.LEARNINGOPS_STATE_DIR
        delete process.env.XDG_STATE_HOME
    })

    it('scopes the default state directory by the validated repository id', () => {
        process.env.XDG_STATE_HOME = '/tmp/learningops-state'
        const config = configSchema.parse({ schemaVersion: 1, repositoryId: 'fixture-repository' })

        expect(resolveStateDirectory(config)).toBe(
            '/tmp/learningops-state/agent-learningops/fixture-repository',
        )
    })

    it('isolates repositories that share the same repository id', () => {
        process.env.XDG_STATE_HOME = '/tmp/learningops-state'
        const config = configSchema.parse({ schemaVersion: 1, repositoryId: 'fixture-repository' })

        expect(resolveStateDirectory(config, '/tmp/repository-one')).not.toBe(
            resolveStateDirectory(config, '/tmp/repository-two'),
        )
    })

    it('walks upward when the config is absent from a nested directory', async () => {
        const root = await mkdtemp(join(tmpdir(), 'learningops-root-'))
        const nested = join(root, 'nested')

        try {
            await mkdir(nested)
            await writeFile(join(root, 'agent-learningops.config.json'), '{}')

            await expect(findRepositoryRoot(nested)).resolves.toBe(root)
        } finally {
            await rm(root, { recursive: true, force: true })
        }
    })
})
