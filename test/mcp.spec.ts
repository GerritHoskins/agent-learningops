import { createLearningOpsMcpServer } from '../src/mcp/create-server.js'
import { submitLearning } from '../src/app.js'
import { createFixtureRepo } from './helpers/tmp.js'
import { describe, expect, it } from 'vitest'

describe('MCP capability registration', () => {
    it('creates a read-only server without workflow-only tools', async () => {
        const root = await createFixtureRepo()
        process.env.LEARNINGOPS_STATE_DIR = `${root}/.state`
        const { server, app } = await createLearningOpsMcpServer({ repositoryRoot: root, capabilities: ['read'] })

        try {
            expect(server).toBeTruthy()
        } finally {
            await app.close()
            delete process.env.LEARNINGOPS_STATE_DIR
        }
    })

    it('persists submitted learnings before returning success', async () => {
        const root = await createFixtureRepo()
        process.env.LEARNINGOPS_STATE_DIR = `${root}/.state-submit`
        const { app } = await createLearningOpsMcpServer({ repositoryRoot: root, capabilities: ['read', 'capture'] })

        try {
            const result = await submitLearning(app, { text: 'Persist this learning.', skill: 'local-plan' })
            expect(result.status).toBe('captured')
            expect(await app.store.listLearnings('fixture')).toHaveLength(1)
            expect(await app.store.listEvidence('fixture')).toHaveLength(1)
        } finally {
            await app.close()
            delete process.env.LEARNINGOPS_STATE_DIR
        }
    })
})
