import type { Stats } from 'node:fs'
import { lstat, readdir, realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'

import { toRuleText } from '../clustering/normalize.js'
import { normalizeLearningDate } from '../domain/dates.js'
import { contentId, fileHash } from '../domain/ids.js'
import type { Evidence, Learning, LearningOpsConfig } from '../domain/schemas.js'
import { assertInsideRepository, readVerifiedRepositoryFile } from '../policies/repository-file.js'

export interface ImportResult {
    learnings: Learning[]
    evidence: Evidence[]
    scannedCount: number
    skippedCount: number
    duplicateCount: number
    warningCount: number
    skippedFiles: ImportSkippedFile[]
    diagnostics: string[]
}

export interface ImportSkippedFile {
    sourcePath: string
    warnings: string[]
}

export async function importLearningMarkdown(
    repositoryRoot: string,
    config: LearningOpsConfig,
    options: { since?: string; skill?: string; now?: string } = {},
): Promise<ImportResult> {
    const now = options.now ?? new Date().toISOString()
    const resolvedFiles = await resolveLearningFiles(repositoryRoot, config.learningGlobs)
    const files = resolvedFiles.files
    const learnings: Learning[] = []
    const evidence: Evidence[] = []
    const skippedFiles: ImportSkippedFile[] = []
    const seenLearningIds = new Set<string>()
    let duplicateCount = 0

    for (const { sourcePath, rawText } of files) {
        const parsed = parseLearningFile(rawText)

        if (parsed.candidateRules.length === 0) {
            skippedFiles.push({ sourcePath, warnings: parsed.warnings })
            continue
        }

        const sourceHash = fileHash(rawText)
        const contentHash = fileHash(parsed.candidateRules.join('\n'))
        const learningId = contentId('learning', {
            repositoryId: config.repositoryId,
            sourcePath,
            contentHash,
            sourceHash,
        })

        if (options.skill && parsed.skill !== options.skill) {
            continue
        }

        if (options.since && parsed.date && normalizeLearningDate(parsed.date) < normalizeLearningDate(options.since)) {
            continue
        }

        if (seenLearningIds.has(learningId)) {
            duplicateCount += 1
            continue
        }
        seenLearningIds.add(learningId)

        const learning: Learning = {
            schemaVersion: 1,
            id: learningId,
            repositoryId: config.repositoryId,
            sourcePath,
            sourceHash,
            contentHash,
            skill: parsed.skill,
            ticket: parsed.ticket,
            date: parsed.date,
            rawText,
            candidateRules: parsed.candidateRules,
            warnings: parsed.warnings,
            importedAt: now,
        }

        learnings.push(learning)

        for (const [index, rawFragment] of parsed.candidateRules.entries()) {
            evidence.push({
                id: contentId('evidence', {
                    repositoryId: config.repositoryId,
                    learningId,
                    sourcePath,
                    index,
                    rawFragment,
                    sourceHash,
                }),
                learningId,
                repositoryId: config.repositoryId,
                sourcePath,
                sourceHash,
                canonicalLineageId: contentId('lineage', { repositoryId: config.repositoryId, sourcePath }),
                skill: parsed.skill,
                ticket: parsed.ticket,
                date: parsed.date,
                rawFragment,
            })
        }
    }

    return {
        learnings,
        evidence,
        scannedCount: files.length,
        skippedCount: skippedFiles.length,
        duplicateCount,
        warningCount:
            learnings.reduce((sum, learning) => sum + learning.warnings.length, 0) +
            skippedFiles.reduce((sum, file) => sum + file.warnings.length, 0),
        skippedFiles,
        diagnostics: resolvedFiles.diagnostics,
    }
}

export function parseLearningFile(rawText: string): {
    skill?: string
    ticket?: string
    date?: string
    candidateRules: string[]
    warnings: string[]
} {
    const warnings: string[] = []
    const metadataBlock = rawText.slice(0, 1200)
    const skill = firstMatch(metadataBlock, [/^Skill:\s*(.+)$/im, /^-?\s*skill:\s*(.+)$/im])
    const ticket = firstMatch(metadataBlock, [/^Ticket:\s*(.+)$/im, /^-?\s*ticket:\s*(.+)$/im, /\b(SAPP-\d+)\b/i])
    const date = firstMatch(metadataBlock, [/^Date:\s*(\d{4}-\d{2}-\d{2}(?:T[^\s]+)?)/im, /(\d{8}T\d{6})/])

    if (!skill) {
        warnings.push('missing_skill_metadata')
    }

    if (!date) {
        warnings.push('missing_date_metadata')
    }

    const candidateRules = rawText
        .split('\n')
        .map((line) => line.trim())
        .map(extractCandidateRuleLine)
        .filter((line): line is string => Boolean(line))
        .map(toRuleText)
        .filter((line, index, lines) => line.length > 8 && lines.indexOf(line) === index)

    if (candidateRules.length === 0) {
        const fallback = rawText
            .split('\n')
            .map((line) => line.trim())
            .find((line) => line.length > 20 && !line.startsWith('#'))
        if (fallback) {
            candidateRules.push(toRuleText(fallback))
            warnings.push('used_fallback_fragment')
        } else {
            warnings.push('no_candidate_rules')
        }
    }

    return {
        ...(skill ? { skill } : {}),
        ...(ticket ? { ticket } : {}),
        ...(date ? { date } : {}),
        candidateRules,
        warnings,
    }
}

function extractCandidateRuleLine(line: string): string | undefined {
    const bullet = /^[-*]\s+\S/.test(line)
    let text = stripMarkdownEmphasis(line.replace(/^[-*]\s+/, '').trim())
    const labelledRule = /^(rule|convention):\s+\S/i.test(text)

    if (!bullet && !labelledRule) {
        return undefined
    }

    if (/^(skill|ticket|date|files?|commands?|rationale|scope|evidence|reference|source|issue|gap):/i.test(text)) {
        return undefined
    }

    text = text.replace(/^(rule|convention|team consensus):\s*/i, '')
    text = text
        .replace(/\s+(?:Rationale|Scope|Evidence|Reference):.*$/i, '')
        .replace(/\s+\/\s+(?:Rationale|Scope|Evidence|Reference):.*$/i, '')
        .trim()

    return text || undefined
}

function stripMarkdownEmphasis(value: string): string {
    return value.replace(/\*\*/g, '').replace(/__+/g, '')
}

interface ResolvedLearningFile {
    sourcePath: string
    rawText: string
}

async function resolveLearningFiles(
    repositoryRoot: string,
    globs: string[],
): Promise<{ files: ResolvedLearningFile[]; diagnostics: string[] }> {
    const files = new Map<string, string>()
    const diagnostics: string[] = []
    const root = await realpath(repositoryRoot)

    for (const glob of globs) {
        assertSupportedLearningGlob(glob)
        const directory = dirname(glob)
        const directoryPath = resolve(repositoryRoot, directory)
        const directoryStat = await statOptionalDirectory(directoryPath)

        if (!directoryStat) {
            diagnostics.push(`missing_learning_directory:${directory}`)
            continue
        }

        if (directoryStat.isSymbolicLink()) {
            throw new Error(`Symlink learning directories are rejected: ${directory}`)
        }

        if (!directoryStat.isDirectory()) {
            throw new Error(`Learning glob directory is not a directory: ${directory}`)
        }

        const realDirectory = await realpath(directoryPath)
        assertInsideRepository(root, realDirectory, `Learning glob directory escapes repository root: ${directory}`)

        const entries = await readdir(realDirectory)
        for (const entry of entries) {
            if (!entry.endsWith('.md')) {
                continue
            }

            if (directory.includes('proposals') || entry.includes('proposal') || entry.includes('promoted')) {
                continue
            }

            const relativePath = join(directory, basename(entry))
            const entryPath = resolve(repositoryRoot, relativePath)
            const entryStat = await lstat(entryPath)
            if (entryStat.isSymbolicLink()) {
                throw new Error(`Symlink learning files are rejected: ${relativePath}`)
            }

            const realEntryPath = await realpath(entryPath)
            assertInsideRepository(root, realEntryPath, `Learning file escapes repository root: ${relativePath}`)
            if (entryStat.isFile()) {
                files.set(relativePath, (await readVerifiedRepositoryFile(repositoryRoot, relativePath)).content)
            }
        }
    }

    return {
        files: [...files.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([sourcePath, rawText]) => ({ sourcePath, rawText })),
        diagnostics,
    }
}

async function statOptionalDirectory(directoryPath: string): Promise<Stats | undefined> {
    try {
        return await lstat(directoryPath)
    } catch (error) {
        if (isMissingPathError(error)) {
            return undefined
        }

        throw error
    }
}

function isMissingPathError(error: unknown): boolean {
    return (
        error instanceof Error &&
        'code' in error &&
        (error.code === 'ENOENT' || error.code === 'ENOTDIR')
    )
}

function assertSupportedLearningGlob(glob: string): void {
    if (isAbsolute(glob) || glob.includes('..') || glob.includes('\\')) {
        throw new Error(`Unsafe learning glob: ${glob}`)
    }

    if (/[|;&$<>{}[\]!?]/.test(glob)) {
        throw new Error(`Unsafe learning glob: ${glob}`)
    }

    if (!/^(?:[A-Za-z0-9._-]+\/)+\*\.md$/.test(glob)) {
        throw new Error(`Unsupported learning glob: ${glob}`)
    }
}

function firstMatch(text: string, patterns: RegExp[]): string | undefined {
    for (const pattern of patterns) {
        const match = text.match(pattern)
        const value = match?.[1]?.trim()
        if (value) {
            return value
        }
    }

    return undefined
}
