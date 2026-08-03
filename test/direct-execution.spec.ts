import { isDirectExecution } from '../src/runtime/direct-execution.js'
import { describe, expect, it } from 'vitest'

describe('direct execution detection', () => {
    it('matches encoded module URLs to entry paths containing spaces', () => {
        expect(
            isDirectExecution(
                'file:///Volumes/Samsung%20Evo970/projects/agent-learningops/dist/cli.js',
                '/Volumes/Samsung Evo970/projects/agent-learningops/dist/cli.js',
            ),
        ).toBe(true)
    })

    it('rejects different or missing entry paths', () => {
        expect(isDirectExecution('file:///tmp/cli.js', '/tmp/server.js')).toBe(false)
        expect(isDirectExecution('file:///tmp/cli.js', undefined)).toBe(false)
    })
})
