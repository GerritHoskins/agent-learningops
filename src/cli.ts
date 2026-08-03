#!/usr/bin/env node
import {
    clusterLearnings,
    createLearningOpsApp,
    doctor,
    exportMarkdown,
    importMarkdown,
    initApp,
    previewPatch,
    proposeLearnings,
    recordProposalDecision,
} from './app.js'
import type { DecisionKind } from './domain/schemas.js'
import { runMcpServer } from './server.js'

interface ParsedArgs {
    command: string[]
    flags: Map<string, string | boolean>
}

type App = Awaited<ReturnType<typeof createLearningOpsApp>>
type CommandHandler = (app: App, parsed: ParsedArgs) => Promise<unknown> | unknown

export async function main(argv = process.argv.slice(2)): Promise<void> {
    const parsed = parseArgs(argv)
    const app = await createLearningOpsApp(process.cwd())

    try {
        const output = await runCommand(app, parsed)
        if (output !== undefined) {
            printOutput(output, parsed.flags.get('json') === true)
        }
    } finally {
        await app.close()
    }
}

const commandHandlers: Record<string, CommandHandler> = {
    init: (app) => initApp(app),
    'import-markdown': async (app, parsed) =>
        summarizeImport(await importMarkdown(app, optionalImportOptions(parsed))),
    cluster: async (app) => {
        const result = await clusterLearnings(app)
        return { clusterCount: result.clusters.length, clusters: result.clusters }
    },
    propose: (app) => proposeLearnings(app),
    'decision record': (app, parsed) =>
        recordProposalDecision(app, {
            proposalId: requiredFlag(parsed, 'proposal'),
            itemId: requiredFlag(parsed, 'item'),
            decision: decisionFlag(requiredFlag(parsed, 'decision')),
            actor: requiredFlag(parsed, 'actor'),
            rationale: requiredFlag(parsed, 'reason'),
        }),
    'patch preview': (app, parsed) =>
        previewPatch(app, {
            proposalId: requiredFlag(parsed, 'proposal'),
            targetId: requiredFlag(parsed, 'target'),
        }),
    'export-markdown': (app, parsed) =>
        exportMarkdown(app, {
            proposalId: requiredFlag(parsed, 'proposal'),
            kind: exportKind(requiredFlag(parsed, 'kind')),
            output: requiredFlag(parsed, 'output'),
        }),
    doctor: (app) => doctor(app),
    mcp: async (app, parsed) => {
        await app.close()
        await runMcpServer({
            repositoryRoot: process.cwd(),
            capabilities: parseCapabilities(stringFlag(parsed, 'capabilities') ?? 'read'),
        })
        return undefined
    },
}

function optionalImportOptions(parsed: ParsedArgs): { since?: string; skill?: string } {
    return Object.fromEntries(
        [
            ['since', stringFlag(parsed, 'since')],
            ['skill', stringFlag(parsed, 'skill')],
        ].filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    )
}

async function runCommand(app: App, parsed: ParsedArgs): Promise<unknown> {
    const [command, subcommand] = parsed.command
    if (!command || command === 'help' || command === '--help') {
        return usage()
    }

    const handler = commandHandlers[[command, subcommand].filter(Boolean).join(' ')] ?? commandHandlers[command]
    if (!handler) {
        throw new Error(`Unknown command: ${[command, subcommand].filter(Boolean).join(' ')}`)
    }

    return handler(app, parsed)
}

function parseArgs(argv: string[]): ParsedArgs {
    const command: string[] = []
    const flags = new Map<string, string | boolean>()

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index]
        if (!token) {
            continue
        }

        if (token.startsWith('--')) {
            const key = token.slice(2)
            const next = argv[index + 1]
            if (!next || next.startsWith('--')) {
                flags.set(key, true)
            } else {
                flags.set(key, next)
                index += 1
            }
        } else {
            command.push(token)
        }
    }

    return { command, flags }
}

function requiredFlag(parsed: ParsedArgs, name: string): string {
    const value = stringFlag(parsed, name)
    if (!value) {
        throw new Error(`Missing required --${name}`)
    }

    return value
}

function stringFlag(parsed: ParsedArgs, name: string): string | undefined {
    const value = parsed.flags.get(name)
    return typeof value === 'string' ? value : undefined
}

function decisionFlag(value: string): DecisionKind {
    if (value === 'approve' || value === 'reject' || value === 'defer') {
        return value
    }

    throw new Error(`Unsupported decision: ${value}`)
}

function exportKind(value: string): 'proposal' | 'receipt' {
    if (value === 'proposal' || value === 'receipt') {
        return value
    }

    throw new Error(`Unsupported export kind: ${value}`)
}

function parseCapabilities(value: string): Array<'read' | 'workflow' | 'capture' | 'decision'> {
    return value
        .split(',')
        .map((capability) => capability.trim())
        .filter((capability): capability is 'read' | 'workflow' | 'capture' | 'decision' =>
            ['read', 'workflow', 'capture', 'decision'].includes(capability),
        )
}

function summarizeImport(result: Awaited<ReturnType<typeof importMarkdown>>) {
    return {
        learningCount: result.learnings.length,
        evidenceCount: result.evidence.length,
        warningCount: result.warningCount,
    }
}

function printOutput(value: unknown, json: boolean): void {
    if (json || typeof value !== 'string') {
        process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
    } else {
        process.stdout.write(`${value}\n`)
    }
}

function usage(): string {
    return [
        'learningops <command>',
        '',
        'Commands: init, import-markdown, cluster, propose, decision record, patch preview, export-markdown, doctor, mcp',
    ].join('\n')
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((error: unknown) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
        process.exitCode = 1
    })
}
