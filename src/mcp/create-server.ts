import {
    type LearningOpsApp,
    clusterLearnings,
    createLearningOpsApp,
    importMarkdown,
    previewPatch,
    proposeLearnings,
    recordProposalDecision,
} from '../app.js'
import { contentId } from '../domain/ids.js'
import type { Capability } from '../domain/schemas.js'
import { readLearningOpsResource } from './resources.js'
import {
    decisionInputSchema,
    emptyInputSchema,
    patchPreviewInputSchema,
    proposalInputSchema,
    submitLearningInputSchema,
} from './tool-schemas.js'
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'

export interface LearningOpsMcpOptions {
    repositoryRoot: string
    capabilities: Capability[]
}

export async function createLearningOpsMcpServer(
    options: LearningOpsMcpOptions,
): Promise<{ server: McpServer; app: LearningOpsApp }> {
    const app = await createLearningOpsApp(options.repositoryRoot)
    const capabilitySet = new Set<Capability>(['read', ...options.capabilities])
    const server = new McpServer(
        {
            name: 'agent-learningops',
            version: '0.1.0',
        },
        {
            instructions:
                'Agent LearningOps is local-first. Read tools are safe by default. Workflow, capture, and decision tools write only private product state. No tool applies policy patches, commits, pushes, opens pull requests, or posts externally.',
        },
    )

    server.registerResource(
        'proposal',
        new ResourceTemplate('learningops://repositories/{repositoryId}/proposals/{proposalId}', { list: undefined }),
        { title: 'LearningOps proposal', mimeType: 'application/json' },
        async (uri) => ({
            contents: [{ uri: uri.href, text: await readLearningOpsResource(app, uri) }],
        }),
    )

    server.registerResource(
        'patch',
        new ResourceTemplate('learningops://repositories/{repositoryId}/patches/{patchId}', { list: undefined }),
        { title: 'LearningOps patch preview', mimeType: 'application/json' },
        async (uri) => ({
            contents: [{ uri: uri.href, text: await readLearningOpsResource(app, uri) }],
        }),
    )

    server.registerTool(
        'list_learning_clusters',
        { title: 'List learning clusters', inputSchema: emptyInputSchema },
        async () => jsonToolResult(await app.store.listClusters(app.config.repositoryId)),
    )

    server.registerTool(
        'explain_learning_cluster',
        { title: 'Explain learning cluster', inputSchema: { clusterId: proposalInputSchema.proposalId } },
        async ({ clusterId }) => {
            const clusters = await app.store.listClusters(app.config.repositoryId)
            return jsonToolResult(
                clusters.find((cluster) => cluster.id === clusterId) ?? { error: 'not_found' },
                !clusters.some((cluster) => cluster.id === clusterId),
            )
        },
    )

    server.registerTool(
        'list_learning_proposals',
        { title: 'List learning proposals', inputSchema: emptyInputSchema },
        async () => jsonToolResult(await app.store.listProposals(app.config.repositoryId)),
    )

    server.registerTool(
        'get_learning_proposal',
        { title: 'Get learning proposal', inputSchema: proposalInputSchema },
        async ({ proposalId }) => jsonToolResult((await app.store.getProposal(proposalId)) ?? { error: 'not_found' }),
    )

    server.registerTool(
        'validate_policy_bundle',
        { title: 'Validate policy bundle metadata', inputSchema: emptyInputSchema },
        async () =>
            jsonToolResult({
                targetCount: app.config.targets.length,
                targets: app.config.targets.map((target) => target.id),
            }),
    )

    if (capabilitySet.has('workflow')) {
        server.registerTool(
            'build_learning_proposal',
            { title: 'Build learning proposal', inputSchema: emptyInputSchema },
            async () => {
                await importMarkdown(app)
                await clusterLearnings(app)
                return jsonToolResult(await proposeLearnings(app))
            },
        )

        server.registerTool(
            'preview_policy_patch',
            { title: 'Preview policy patch', inputSchema: patchPreviewInputSchema },
            async ({ proposalId, targetId }) => jsonToolResult(await previewPatch(app, { proposalId, targetId })),
        )
    }

    if (capabilitySet.has('decision')) {
        server.registerTool(
            'record_proposal_item_decision',
            { title: 'Record proposal item decision', inputSchema: decisionInputSchema },
            async ({ proposalId, itemId, decision, actor, reason }) =>
                jsonToolResult(
                    await recordProposalDecision(app, {
                        proposalId,
                        itemId,
                        decision,
                        actor,
                        rationale: reason,
                    }),
                ),
        )
    }

    if (capabilitySet.has('capture')) {
        server.registerTool(
            'submit_learning',
            { title: 'Submit learning', inputSchema: submitLearningInputSchema },
            async ({ text, skill, ticket }) =>
                jsonToolResult({
                    id: contentId('submitted', { text, skill, ticket }),
                    status: 'captured_in_private_state_pending_import_adapter',
                }),
        )
    }

    return { server, app }
}

function jsonToolResult(value: unknown, isError = false) {
    return {
        isError,
        content: [
            {
                type: 'text' as const,
                text: JSON.stringify(value, null, 2),
            },
        ],
        structuredContent: value as Record<string, unknown>,
    }
}
