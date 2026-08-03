import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { createFixtureRepo } from '../helpers/tmp.js'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = await createFixtureRepo()
const packageRoot = process.cwd()
const state = await mkdtemp(join(tmpdir(), 'learningops-mcp-smoke-'))
const serverEntry = process.env.LEARNINGOPS_MCP_ENTRY ?? 'src/server.ts'
const command = serverEntry.endsWith('.ts') ? resolve(packageRoot, 'node_modules/.bin/tsx') : process.execPath
const serverArgs = serverEntry.endsWith('.ts')
    ? [resolve(packageRoot, serverEntry), '--capabilities', 'read']
    : [resolve(packageRoot, serverEntry), '--capabilities', 'read']
const transport = new StdioClientTransport({
    command,
    args: serverArgs,
    cwd: root,
    env: {
        ...process.env,
        LEARNINGOPS_STATE_DIR: state,
    },
    stderr: 'pipe',
})
const client = new Client({ name: 'learningops-smoke', version: '0.1.0' })

await client.connect(transport)
try {
    const tools = await client.listTools()
    const toolNames = tools.tools.map((tool) => tool.name)
    if (toolNames.includes('build_learning_proposal')) {
        throw new Error('read-only MCP exposed workflow tool build_learning_proposal')
    }
    if (!toolNames.includes('list_learning_clusters')) {
        throw new Error('read-only MCP did not expose list_learning_clusters')
    }
    process.stdout.write(`${JSON.stringify({ toolNames })}\n`)
} finally {
    await client.close()
}
