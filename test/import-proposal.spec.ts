import {
    clusterLearnings,
    createLearningOpsApp,
    importMarkdown,
    previewPatch,
    proposeLearnings,
    recordProposalDecision,
} from '../src/app.js'
import { importLearningMarkdown } from '../src/importers/learning-markdown.js'
import { readVerifiedRepositoryFile } from '../src/policies/repository-file.js'
import { readTargetContent } from '../src/policies/target-registry.js'
import { createFixtureRepo } from './helpers/tmp.js'
import { mkdir, mkdtemp, readFile, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('LearningOps application flow', () => {
    it('imports, clusters, proposes, decides, and previews without mutating the target', async () => {
        const root = await createFixtureRepo()
        process.env.LEARNINGOPS_STATE_DIR = join(root, '.state')
        const app = await createLearningOpsApp(root)
        const targetPath = join(
            root,
            '.agents',
            'skills',
            'local-promote-learnings',
            'references',
            'learned-standards.md',
        )
        const before = await readFile(targetPath, 'utf8')

        try {
            const imported = await importMarkdown(app)
            expect(imported.learnings).toHaveLength(2)
            expect(imported.evidence).toHaveLength(2)

            const clusters = await clusterLearnings(app)
            expect(clusters.clusters).toHaveLength(1)

            const proposal = await proposeLearnings(app)
            expect(proposal.items).toHaveLength(1)
            expect(proposal.items[0]?.classification).toBe('PROMOTE')
            expect(proposal.items[0]?.targetBaseHash).toMatch(/^[a-f0-9]{64}$/)

            await recordProposalDecision(app, {
                proposalId: proposal.id,
                itemId: proposal.items[0]?.id ?? '',
                decision: 'approve',
                actor: 'test',
                rationale: 'fixture approval',
            })
            const patch = await previewPatch(app, { proposalId: proposal.id, targetId: 'skill-local-standards' })

            expect(patch.unifiedDiff).toContain('Verify target hashes before patch preview')
            expect(await readFile(targetPath, 'utf8')).toBe(before)
        } finally {
            await app.close()
            delete process.env.LEARNINGOPS_STATE_DIR
        }
    })

    it('blocks patch preview when a target changed after approval', async () => {
        const root = await createFixtureRepo()
        process.env.LEARNINGOPS_STATE_DIR = join(root, '.state-stale')
        const app = await createLearningOpsApp(root)
        const targetPath = join(
            root,
            '.agents',
            'skills',
            'local-promote-learnings',
            'references',
            'learned-standards.md',
        )

        try {
            await importMarkdown(app)
            await clusterLearnings(app)
            const proposal = await proposeLearnings(app)
            await recordProposalDecision(app, {
                proposalId: proposal.id,
                itemId: proposal.items[0]?.id ?? '',
                decision: 'approve',
                actor: 'test',
                rationale: 'fixture approval',
            })

            await writeFile(targetPath, '# Learned standards\n\nManual update before preview.\n')

            await expect(
                previewPatch(app, { proposalId: proposal.id, targetId: 'skill-local-standards' }),
            ).rejects.toThrow(/Stale approval.*re-approve/)
        } finally {
            await app.close()
            delete process.env.LEARNINGOPS_STATE_DIR
        }
    })

    it('generates target-specific proposal items and previews only the approved second target', async () => {
        const root = await createFixtureRepo()
        process.env.LEARNINGOPS_STATE_DIR = join(root, '.state-multi-target')
        const firstTargetPath = join(
            root,
            '.agents',
            'skills',
            'local-promote-learnings',
            'references',
            'learned-standards.md',
        )
        const secondTargetPath = join(root, '.agents', 'skills', 'local-promote-learnings', 'references', 'team-standards.md')
        await writeFile(secondTargetPath, '# Team standards\n')
        await writeFile(
            join(root, 'agent-learningops.config.json'),
            JSON.stringify(
                {
                    schemaVersion: 1,
                    repositoryId: 'fixture',
                    learningGlobs: ['.ms-artifacts/learnings/*.md'],
                    proposalGlobs: ['.ms-artifacts/learnings/proposals/*-proposals.md'],
                    receiptGlobs: ['.ms-artifacts/learnings/proposals/*-promoted.md'],
                    targets: [
                        {
                            id: 'skill-local-standards',
                            adapter: 'skill-reference',
                            path: '.agents/skills/local-promote-learnings/references/learned-standards.md',
                            validators: [],
                        },
                        {
                            id: 'team-standards',
                            adapter: 'skill-reference',
                            path: '.agents/skills/local-promote-learnings/references/team-standards.md',
                            validators: [],
                        },
                    ],
                },
                null,
                4,
            ),
        )
        const app = await createLearningOpsApp(root)
        const firstBefore = await readFile(firstTargetPath, 'utf8')
        const secondBefore = await readFile(secondTargetPath, 'utf8')

        try {
            await importMarkdown(app)
            await clusterLearnings(app)
            const proposal = await proposeLearnings(app)
            expect(proposal.items).toHaveLength(2)

            const firstItem = proposal.items.find((item) => item.targetId === 'skill-local-standards')
            const secondItem = proposal.items.find((item) => item.targetId === 'team-standards')
            expect(firstItem?.id).toBeDefined()
            expect(secondItem?.id).toBeDefined()
            expect(firstItem?.id).not.toBe(secondItem?.id)
            expect(firstItem?.classification).toBe(secondItem?.classification)
            expect(firstItem?.evidenceIds).toEqual(secondItem?.evidenceIds)
            expect(firstItem?.targetBaseHash).toMatch(/^[a-f0-9]{64}$/)
            expect(secondItem?.targetBaseHash).toMatch(/^[a-f0-9]{64}$/)

            await recordProposalDecision(app, {
                proposalId: proposal.id,
                itemId: secondItem?.id ?? '',
                decision: 'approve',
                actor: 'test',
                rationale: 'fixture approval for target two',
            })

            const patch = await previewPatch(app, { proposalId: proposal.id, targetId: 'team-standards' })
            expect(patch.targetId).toBe('team-standards')
            expect(patch.itemIds).toEqual([secondItem?.id])
            expect(patch.itemIds).not.toContain(firstItem?.id)
            expect(patch.unifiedDiff).toContain('Verify target hashes before patch preview')
            expect(await readFile(firstTargetPath, 'utf8')).toBe(firstBefore)
            expect(await readFile(secondTargetPath, 'utf8')).toBe(secondBefore)
        } finally {
            await app.close()
            delete process.env.LEARNINGOPS_STATE_DIR
        }
    })
})

describe('learning markdown importer boundaries', () => {
    it('rejects unsafe learning globs before reading files', async () => {
        const root = await createMinimalLearningRepo()
        await expect(
            importLearningMarkdown(root, {
                schemaVersion: 1,
                repositoryId: 'fixture',
                learningGlobs: ['../outside/*.md'],
                proposalGlobs: [],
                receiptGlobs: [],
                targets: [],
            }),
        ).rejects.toThrow(/Unsafe learning glob/)

        await expect(
            importLearningMarkdown(root, {
                schemaVersion: 1,
                repositoryId: 'fixture',
                learningGlobs: [resolve(root, 'learning-artifacts/*.md')],
                proposalGlobs: [],
                receiptGlobs: [],
                targets: [],
            }),
        ).rejects.toThrow(/Unsafe learning glob/)

        await expect(
            importLearningMarkdown(root, {
                schemaVersion: 1,
                repositoryId: 'fixture',
                learningGlobs: ['learning-artifacts/*.md;echo'],
                proposalGlobs: [],
                receiptGlobs: [],
                targets: [],
            }),
        ).rejects.toThrow(/Unsafe learning glob/)
    })

    it('rejects symlinked learning directory escapes', async () => {
        const root = await createMinimalLearningRepo()
        const outside = await mkdtemp(join(tmpdir(), 'learningops-outside-'))
        await mkdir(join(root, 'links'), { recursive: true })
        await symlink(outside, join(root, 'links', 'escape'))

        await expect(
            importLearningMarkdown(root, {
                schemaVersion: 1,
                repositoryId: 'fixture',
                learningGlobs: ['links/escape/*.md'],
                proposalGlobs: [],
                receiptGlobs: [],
                targets: [],
            }),
        ).rejects.toThrow(/Symlink learning directories/)
    })

    it('rejects symlinked learning files', async () => {
        const root = await createMinimalLearningRepo()
        const outside = await mkdtemp(join(tmpdir(), 'learningops-file-outside-'))
        await writeFile(join(outside, 'external.md'), '- External file must not be imported.')
        await symlink(join(outside, 'external.md'), join(root, 'learning-artifacts', 'nested', 'external.md'))

        await expect(
            importLearningMarkdown(root, {
                schemaVersion: 1,
                repositoryId: 'fixture',
                learningGlobs: ['learning-artifacts/nested/*.md'],
                proposalGlobs: [],
                receiptGlobs: [],
                targets: [],
            }),
        ).rejects.toThrow(/Symlink learning files/)
    })

    it('fails closed when a learning file identity changes during verified read', async () => {
        const root = await createMinimalLearningRepo()
        const realStats = await stat(join(root, 'learning-artifacts', 'nested', 'valid.md'), { bigint: true })

        await expect(
            readVerifiedRepositoryFile(root, 'learning-artifacts/nested/valid.md', {
                statFile: async () => Object.assign(Object.create(Object.getPrototypeOf(realStats)), realStats, { ino: realStats.ino + 1n }),
            }),
        ).rejects.toThrow(/changed while being opened/)
    })

    it('imports valid nested relative learning globs', async () => {
        const root = await createMinimalLearningRepo()
        const result = await importLearningMarkdown(root, {
            schemaVersion: 1,
            repositoryId: 'fixture',
            learningGlobs: ['learning-artifacts/nested/*.md'],
            proposalGlobs: [],
            receiptGlobs: [],
            targets: [],
        })

        expect(result.learnings).toHaveLength(1)
        expect(result.learnings[0]?.sourcePath).toBe('learning-artifacts/nested/valid.md')
        expect(result.evidence[0]?.rawFragment).toBe('Verify target hashes before patch preview')
    })
})

describe('policy target file safety', () => {
    it('fails closed when a configured target is missing or unreadable as a regular file', async () => {
        const root = await createMinimalLearningRepo()

        await expect(
            readTargetContent(root, {
                id: 'missing',
                adapter: 'skill-reference',
                path: 'standards/missing.md',
                validators: [],
            }),
        ).rejects.toThrow(/does not exist|ENOENT/)

        await mkdir(join(root, 'standards'), { recursive: true })
        await expect(
            readTargetContent(root, {
                id: 'directory',
                adapter: 'skill-reference',
                path: 'standards',
                validators: [],
            }),
        ).rejects.toThrow(/not a regular file|EISDIR/)
    })

    it('rejects symlink policy targets before reading', async () => {
        const root = await createMinimalLearningRepo()
        const outside = await mkdtemp(join(tmpdir(), 'learningops-target-outside-'))
        await writeFile(join(outside, 'target.md'), '# Outside\n')
        await symlink(join(outside, 'target.md'), join(root, 'target-link.md'))

        await expect(
            readTargetContent(root, {
                id: 'target-link',
                adapter: 'skill-reference',
                path: 'target-link.md',
                validators: [],
            }),
        ).rejects.toThrow(/Symlink policy targets|ELOOP/)
    })
})

async function createMinimalLearningRepo(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'learningops-importer-'))
    await mkdir(join(root, 'learning-artifacts', 'nested'), { recursive: true })
    await writeFile(
        join(root, 'learning-artifacts', 'nested', 'valid.md'),
        [
            '# Valid',
            '',
            'Skill: local-plan',
            'Date: 2026-08-03',
            '',
            '- Verify target hashes before patch preview.',
        ].join('\n'),
    )
    return root
}
