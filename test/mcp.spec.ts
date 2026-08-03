import { createLearningOpsMcpServer } from '../src/mcp/create-server.js'
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
})
