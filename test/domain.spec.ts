import { classifyRule, validateRuleText } from '../src/domain/classification.js'
import { canonicalJson, contentId } from '../src/domain/ids.js'
import { configSchema } from '../src/domain/schemas.js'
import { assertLegalTransition, canTransition } from '../src/domain/state-machine.js'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('domain contracts', () => {
    it('canonicalizes object keys before hashing', () => {
        expect(canonicalJson({ b: 2, a: 1 })).toBe(canonicalJson({ a: 1, b: 2 }))
        expect(contentId('x', { b: 2, a: 1 })).toBe(contentId('x', { a: 1, b: 2 }))
    })

    it('enforces legal state transitions', () => {
        expect(canTransition('PROPOSED', 'APPROVED')).toBe(true)
        expect(canTransition('CAPTURED', 'APPROVED')).toBe(false)
        expect(() => assertLegalTransition('CAPTURED', 'APPROVED')).toThrow(/Illegal/)
    })

    it('classifies strong and weak evidence separately', () => {
        expect(
            classifyRule({
                distinctEvidenceCount: 2,
                skillCount: 1,
                ruleText: 'Verify target hashes before patch preview',
                warnings: [],
            }).classification,
        ).toBe('PROMOTE')
        expect(
            classifyRule({
                distinctEvidenceCount: 1,
                skillCount: 1,
                ruleText: 'Verify target hashes before patch preview',
                warnings: [],
            }).classification,
        ).toBe('NEEDS_VERIFICATION')
    })

    it('rejects non-actionable rule text', () => {
        expect(validateRuleText('maybe check it later').valid).toBe(false)
    })

    it('keeps runtime config defaults in parity with the published JSON schema', async () => {
        const parsed = configSchema.parse({ schemaVersion: 1, repositoryId: 'fixture' })
        const schema = JSON.parse(await readFile(join(process.cwd(), 'config.schema.json'), 'utf8')) as {
            properties: { learningGlobs: { default: string[] } }
        }

        expect(parsed.learningGlobs).toEqual(['learning-artifacts/*.md'])
        expect(schema.properties.learningGlobs.default).toEqual(parsed.learningGlobs)
    })

    it('rejects unknown runtime config and target keys', () => {
        expect(() =>
            configSchema.parse({
                schemaVersion: 1,
                repositoryId: 'fixture',
                unknown: true,
            }),
        ).toThrow()

        expect(() =>
            configSchema.parse({
                schemaVersion: 1,
                repositoryId: 'fixture',
                targets: [
                    {
                        id: 'target',
                        adapter: 'skill-reference',
                        path: 'standards.md',
                        validators: [{ command: 'node', args: [], extra: true }],
                    },
                ],
            }),
        ).toThrow()
    })

    it('rejects blank runtime config values that the published JSON schema marks non-empty', () => {
        expect(() => configSchema.parse({ schemaVersion: 1, repositoryId: '   ' })).toThrow()

        expect(() =>
            configSchema.parse({
                schemaVersion: 1,
                repositoryId: 'fixture',
                learningGlobs: ['   '],
            }),
        ).toThrow()

        expect(() =>
            configSchema.parse({
                schemaVersion: 1,
                repositoryId: 'fixture',
                proposalGlobs: ['   '],
            }),
        ).toThrow()

        expect(() =>
            configSchema.parse({
                schemaVersion: 1,
                repositoryId: 'fixture',
                receiptGlobs: ['   '],
            }),
        ).toThrow()

        expect(() =>
            configSchema.parse({
                schemaVersion: 1,
                repositoryId: 'fixture',
                targets: [
                    {
                        id: '   ',
                        adapter: 'skill-reference',
                        path: 'standards.md',
                    },
                ],
            }),
        ).toThrow()

        expect(() =>
            configSchema.parse({
                schemaVersion: 1,
                repositoryId: 'fixture',
                targets: [
                    {
                        id: 'target',
                        adapter: 'skill-reference',
                        path: '   ',
                    },
                ],
            }),
        ).toThrow()

        expect(() =>
            configSchema.parse({
                schemaVersion: 1,
                repositoryId: 'fixture',
                targets: [
                    {
                        id: 'target',
                        adapter: 'skill-reference',
                        path: 'standards.md',
                        validators: [{ command: '   ', args: [] }],
                    },
                ],
            }),
        ).toThrow()
    })

    it('marks whitespace-only runtime config values invalid in the published JSON schema', async () => {
        const schema = JSON.parse(await readFile(join(process.cwd(), 'config.schema.json'), 'utf8')) as {
            properties: {
                repositoryId: { pattern: string }
                learningGlobs: { items: { pattern: string } }
                proposalGlobs: { items: { pattern: string } }
                receiptGlobs: { items: { pattern: string } }
                targets: {
                    items: {
                        properties: {
                            id: { pattern: string }
                            path: { pattern: string }
                            validators: { items: { properties: { command: { pattern: string } } } }
                        }
                    }
                }
            }
        }

        const nonBlankPattern = '\\S'
        expect(schema.properties.repositoryId.pattern).toBe(nonBlankPattern)
        expect(schema.properties.learningGlobs.items.pattern).toBe(nonBlankPattern)
        expect(schema.properties.proposalGlobs.items.pattern).toBe(nonBlankPattern)
        expect(schema.properties.receiptGlobs.items.pattern).toBe(nonBlankPattern)
        expect(schema.properties.targets.items.properties.id.pattern).toBe(nonBlankPattern)
        expect(schema.properties.targets.items.properties.path.pattern).toBe(nonBlankPattern)
        expect(schema.properties.targets.items.properties.validators.items.properties.command.pattern).toBe(nonBlankPattern)
    })
})
