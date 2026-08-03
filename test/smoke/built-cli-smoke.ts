import { createFixtureRepo } from '../helpers/tmp.js'
import { spawn } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = await createFixtureRepo()
const state = await mkdtemp(join(tmpdir(), 'learningops-built-cli-smoke-'))
const result = await runNode([resolve(process.cwd(), 'dist/cli.js'), 'doctor', '--json'], root, state)
const diagnostics = JSON.parse(result.stdout) as { repositoryId?: string; targetCount?: number }

if (diagnostics.repositoryId !== 'fixture') {
    throw new Error(`Expected fixture repositoryId, received ${String(diagnostics.repositoryId)}`)
}

if (diagnostics.targetCount !== 1) {
    throw new Error(`Expected one configured target, received ${String(diagnostics.targetCount)}`)
}

process.stdout.write(`${JSON.stringify({ repositoryId: diagnostics.repositoryId, targetCount: diagnostics.targetCount })}\n`)

async function runNode(args: string[], cwd: string, stateDirectory: string): Promise<{ stdout: string }> {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, args, {
            cwd,
            env: {
                ...process.env,
                LEARNINGOPS_STATE_DIR: stateDirectory,
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        })
        let stdout = ''
        let stderr = ''

        child.stdout.setEncoding('utf8')
        child.stderr.setEncoding('utf8')
        child.stdout.on('data', (chunk) => {
            stdout += chunk
        })
        child.stderr.on('data', (chunk) => {
            stderr += chunk
        })
        child.once('error', reject)
        child.once('close', (code) => {
            if (code === 0) {
                resolve({ stdout })
                return
            }

            reject(new Error(`node ${args.join(' ')} failed with code ${String(code)}: ${stderr}`))
        })
    })
}
