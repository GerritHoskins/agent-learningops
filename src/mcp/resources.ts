import type { LearningOpsApp } from '../app.js'

export async function readLearningOpsResource(app: LearningOpsApp, uri: URL): Promise<string> {
    const parts = uri.pathname.split('/').filter(Boolean)
    const resourceKind = parts.at(-2)
    const id = parts.at(-1)

    if (resourceKind === 'proposals' && id) {
        const proposal = await app.store.getProposal(id)
        return JSON.stringify(proposal ?? { error: 'not_found' }, null, 2)
    }

    if (resourceKind === 'patches' && id) {
        const patch = await app.store.getPatch(id)
        return JSON.stringify(patch ?? { error: 'not_found' }, null, 2)
    }

    return JSON.stringify({ error: 'unsupported_resource', uri: uri.href }, null, 2)
}
