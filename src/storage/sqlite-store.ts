import { contentId } from '../domain/ids.js'
import type {
    AuditEvent,
    Decision,
    Evidence,
    Learning,
    LearningCluster,
    PatchManifest,
    Proposal,
} from '../domain/schemas.js'
import {
    auditEventSchema,
    clusterSchema,
    decisionSchema,
    evidenceSchema,
    learningSchema,
    patchManifestSchema,
    proposalSchema,
} from '../domain/schemas.js'
import type { LearningStore, RecordKind } from './learning-store.js'
import { chmod, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

type PersistedRecord = {
    id: string
    kind: RecordKind
    repository_id: string
    json: string
}

export class SqliteLearningStore implements LearningStore {
    private db: DatabaseSync | undefined

    constructor(private readonly databasePath: string) {}

    async initialize(): Promise<void> {
        await mkdir(dirname(this.databasePath), { recursive: true, mode: 0o700 })
        await chmod(dirname(this.databasePath), 0o700).catch(() => undefined)
        this.db = new DatabaseSync(this.databasePath)
        this.db.exec('PRAGMA foreign_keys = ON')
        this.db.exec('PRAGMA busy_timeout = 2500')
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS records (
                kind TEXT NOT NULL,
                id TEXT NOT NULL,
                repository_id TEXT NOT NULL,
                schema_version INTEGER NOT NULL,
                json TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (kind, id)
            );
            CREATE INDEX IF NOT EXISTS records_repository_kind_idx
                ON records(repository_id, kind);
        `)
        await chmod(this.databasePath, 0o600).catch(() => undefined)
    }

    async close(): Promise<void> {
        this.db?.close()
        this.db = undefined
    }

    async putLearning(learning: Learning): Promise<void> {
        learningSchema.parse(learning)
        this.put('learning', learning.id, learning.repositoryId, learning)
    }

    async putEvidence(evidence: Evidence): Promise<void> {
        evidenceSchema.parse(evidence)
        this.put('evidence', evidence.id, evidence.repositoryId, evidence)
    }

    async putCluster(cluster: LearningCluster): Promise<void> {
        clusterSchema.parse(cluster)
        this.put('cluster', cluster.id, cluster.repositoryId, cluster)
    }

    async replaceImportedSnapshot(repositoryId: string, learnings: Learning[], evidence: Evidence[]): Promise<void> {
        for (const learning of learnings) {
            learningSchema.parse(learning)
        }
        for (const item of evidence) {
            evidenceSchema.parse(item)
        }

        this.replaceKinds(repositoryId, [
            { kind: 'learning', values: learnings },
            { kind: 'evidence', values: evidence },
        ])
    }

    async replaceClusters(repositoryId: string, clusters: LearningCluster[]): Promise<void> {
        for (const cluster of clusters) {
            clusterSchema.parse(cluster)
        }

        this.replaceKinds(repositoryId, [{ kind: 'cluster', values: clusters }])
    }

    async putProposal(proposal: Proposal): Promise<void> {
        proposalSchema.parse(proposal)
        this.put('proposal', proposal.id, proposal.repositoryId, proposal)
    }

    async putDecision(decision: Decision): Promise<void> {
        decisionSchema.parse(decision)
        this.put('decision', decision.id, decision.repositoryId, decision)
    }

    async putPatch(patch: PatchManifest): Promise<void> {
        patchManifestSchema.parse(patch)
        this.put('patch', patch.id, patch.repositoryId, patch)
    }

    async appendEvent(event: AuditEvent): Promise<void> {
        auditEventSchema.parse(event)
        this.put('event', event.id || contentId('event', event), event.repositoryId, event)
    }

    async listLearnings(repositoryId: string): Promise<Learning[]> {
        return this.list('learning', repositoryId, learningSchema.parse)
    }

    async listEvidence(repositoryId: string): Promise<Evidence[]> {
        return this.list('evidence', repositoryId, evidenceSchema.parse)
    }

    async listClusters(repositoryId: string): Promise<LearningCluster[]> {
        return this.list('cluster', repositoryId, clusterSchema.parse)
    }

    async listProposals(repositoryId: string): Promise<Proposal[]> {
        return this.list('proposal', repositoryId, proposalSchema.parse)
    }

    async listDecisions(repositoryId: string): Promise<Decision[]> {
        return this.list('decision', repositoryId, decisionSchema.parse)
    }

    async listPatches(repositoryId: string): Promise<PatchManifest[]> {
        return this.list('patch', repositoryId, patchManifestSchema.parse)
    }

    async listEvents(repositoryId: string): Promise<AuditEvent[]> {
        return this.list('event', repositoryId, auditEventSchema.parse)
    }

    async getProposal(id: string): Promise<Proposal | undefined> {
        return this.get('proposal', id, proposalSchema.parse)
    }

    async getPatch(id: string): Promise<PatchManifest | undefined> {
        return this.get('patch', id, patchManifestSchema.parse)
    }

    private put(kind: RecordKind, id: string, repositoryId: string, value: unknown): void {
        const db = this.requireDb()
        this.putWithDb(db, kind, id, repositoryId, value)
    }

    private putWithDb(db: DatabaseSync, kind: RecordKind, id: string, repositoryId: string, value: unknown): void {
        db.prepare(
            `
            INSERT INTO records(kind, id, repository_id, schema_version, json)
            VALUES (?, ?, ?, 1, ?)
            ON CONFLICT(kind, id) DO UPDATE SET
                repository_id = excluded.repository_id,
                json = excluded.json,
            updated_at = CURRENT_TIMESTAMP
        `,
        ).run(kind, id, repositoryId, JSON.stringify(value))
    }

    private replaceKinds(repositoryId: string, replacements: Array<{ kind: RecordKind; values: unknown[] }>): void {
        const db = this.requireDb()
        db.exec('BEGIN IMMEDIATE')
        try {
            const deleteStatement = db.prepare('DELETE FROM records WHERE repository_id = ? AND kind = ?')
            for (const replacement of replacements) {
                deleteStatement.run(repositoryId, replacement.kind)
            }

            for (const replacement of replacements) {
                for (const value of replacement.values) {
                    const id = readRecordId(value)
                    this.putWithDb(db, replacement.kind, id, repositoryId, value)
                }
            }

            db.exec('COMMIT')
        } catch (error) {
            db.exec('ROLLBACK')
            throw error
        }
    }

    private list<T>(kind: RecordKind, repositoryId: string, parse: (value: unknown) => T): T[] {
        const db = this.requireDb()
        const rows = db
            .prepare(
                'SELECT id, kind, repository_id, json FROM records WHERE repository_id = ? AND kind = ? ORDER BY id',
            )
            .all(repositoryId, kind) as PersistedRecord[]
        return rows.map((row) => parse(JSON.parse(row.json)))
    }

    private get<T>(kind: RecordKind, id: string, parse: (value: unknown) => T): T | undefined {
        const db = this.requireDb()
        const row = db
            .prepare('SELECT id, kind, repository_id, json FROM records WHERE kind = ? AND id = ?')
            .get(kind, id) as PersistedRecord | undefined
        return row ? parse(JSON.parse(row.json)) : undefined
    }

    private requireDb(): DatabaseSync {
        if (!this.db) {
            throw new Error('Learning store is not initialized.')
        }

        return this.db
    }
}

function readRecordId(value: unknown): string {
    if (typeof value === 'object' && value !== null && 'id' in value && typeof value.id === 'string') {
        return value.id
    }

    throw new Error('Replacement records must contain a string id.')
}
