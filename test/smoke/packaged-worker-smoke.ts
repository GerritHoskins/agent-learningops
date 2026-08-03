import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

interface WorkerService {
    openRepository(input: { repositoryRoot: string }): Promise<unknown>
    importMarkdown(input?: { since?: string; skill?: string }): Promise<unknown>
    getSnapshot(): Promise<{ overview: { counts: { learnings: number } }; repository: { repositoryId: string } }>
    shutdown(): Promise<void>
}

interface WorkerClientModule {
    createLearningOpsWorkerClient(options: { workerPath: string }): WorkerService
}

const root = process.cwd()
const appResources = join(root, 'release/mac-arm64/Agent LearningOps.app/Contents/Resources/app')
const workerClientModule = (await import(
    pathToFileURL(join(appResources, 'dist/electron/worker-client.js')).href
)) as WorkerClientModule

const repositoryRoot = await mkdtemp(join(tmpdir(), 'learningops-packaged-worker-repo-'))
const stateRoot = await mkdtemp(join(tmpdir(), 'learningops-packaged-worker-state-'))
process.env.LEARNINGOPS_STATE_DIR = stateRoot

await mkdir(join(repositoryRoot, 'learning-artifacts'), { recursive: true })
await mkdir(join(repositoryRoot, 'standards'), { recursive: true })
await writeFile(
    join(repositoryRoot, 'agent-learningops.config.json'),
    JSON.stringify(
        {
            schemaVersion: 1,
            repositoryId: 'packaged-worker-fixture',
            learningGlobs: ['learning-artifacts/*.md'],
            targets: [{ id: 'local-standards', adapter: 'skill-reference', path: 'standards/learned-standards.md' }],
        },
        null,
        4,
    ),
)
await writeFile(
    join(repositoryRoot, 'learning-artifacts/learning.md'),
    [
        'Skill: local-dashboard',
        'Date: 2026-08-03',
        '',
        '- Prefer a standalone desktop dashboard for repeated LearningOps review work.',
    ].join('\n'),
)
await writeFile(join(repositoryRoot, 'standards/learned-standards.md'), '# Learned standards\n')

const client = workerClientModule.createLearningOpsWorkerClient({
    workerPath: join(appResources, 'dist/electron/worker.js'),
})

try {
    await client.openRepository({ repositoryRoot })
    await client.importMarkdown({})
    const snapshot = await client.getSnapshot()
    assert(snapshot.repository.repositoryId === 'packaged-worker-fixture', 'packaged worker opened the wrong repository')
    assert(snapshot.overview.counts.learnings === 1, 'packaged worker did not import the fixture learning')
} finally {
    await client.shutdown()
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(message)
    }
}
