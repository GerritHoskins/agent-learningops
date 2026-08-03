import type { Capability } from './domain/schemas.js'
import { createLearningOpsMcpServer } from './mcp/create-server.js'
import { logEvent } from './observability/logger.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

export async function runMcpServer(options: { repositoryRoot: string; capabilities: Capability[] }): Promise<void> {
    const { server, app } = await createLearningOpsMcpServer(options)
    const transport = new StdioServerTransport()
    logEvent('mcp_server_start', { capabilities: options.capabilities })
    await server.connect(transport)

    const close = async () => {
        await app.close()
    }

    process.once('beforeExit', () => {
        void close()
    })
}

function parseCapabilities(argv: string[]): Capability[] {
    const index = argv.indexOf('--capabilities')
    const raw = index >= 0 ? argv[index + 1] : 'read'
    return (raw ?? 'read')
        .split(',')
        .map((capability) => capability.trim())
        .filter((capability): capability is Capability =>
            ['read', 'workflow', 'capture', 'decision'].includes(capability),
        )
}

if (import.meta.url === `file://${process.argv[1]}`) {
    runMcpServer({ repositoryRoot: process.cwd(), capabilities: parseCapabilities(process.argv.slice(2)) }).catch(
        (error: unknown) => {
            process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
            process.exitCode = 1
        },
    )
}
