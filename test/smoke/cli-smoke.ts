import {
    clusterLearnings,
    createLearningOpsApp,
    doctor,
    importMarkdown,
    initApp,
    proposeLearnings,
} from '../../src/app.js'
import { createFixtureRepo } from '../helpers/tmp.js'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = await createFixtureRepo()
const state = await mkdtemp(join(tmpdir(), 'learningops-cli-smoke-'))
process.env.LEARNINGOPS_STATE_DIR = state

const app = await createLearningOpsApp(root)
try {
    const init = await initApp(app)
    const imported = await importMarkdown(app)
    const clusters = await clusterLearnings(app)
    const proposal = await proposeLearnings(app)
    const diagnostics = await doctor(app)
    process.stdout.write(
        `${JSON.stringify({
            repositoryId: init.repositoryId,
            learningCount: imported.learnings.length,
            evidenceCount: imported.evidence.length,
            clusterCount: clusters.clusters.length,
            proposalId: proposal.id,
            node: diagnostics.node,
        })}\n`,
    )
} finally {
    await app.close()
    delete process.env.LEARNINGOPS_STATE_DIR
}
