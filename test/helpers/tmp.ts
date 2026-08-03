import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export async function createFixtureRepo(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'learningops-fixture-'))
    await mkdir(join(root, '.ms-artifacts', 'learnings', 'proposals'), { recursive: true })
    await mkdir(join(root, '.agents', 'skills', 'local-promote-learnings', 'references'), { recursive: true })
    await mkdir(join(root, '.agents', 'scripts'), { recursive: true })
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
                ],
            },
            null,
            4,
        ),
    )
    await writeFile(
        join(root, '.agents', 'skills', 'local-promote-learnings', 'references', 'learned-standards.md'),
        '# Learned standards\n',
    )
    await writeFile(
        join(root, '.ms-artifacts', 'learnings', 'first.md'),
        [
            '# First',
            '',
            'Skill: local-plan',
            'Ticket: SAPP-1',
            'Date: 2026-08-01',
            '',
            '- Verify target hashes before patch preview.',
        ].join('\n'),
    )
    await writeFile(
        join(root, '.ms-artifacts', 'learnings', 'second.md'),
        [
            '# Second',
            '',
            'Skill: local-review',
            'Ticket: SAPP-2',
            'Date: 2026-08-02',
            '',
            '- Verify target hashes before patch preview.',
        ].join('\n'),
    )
    return root
}
