import { z } from 'zod'

export const schemaVersion = 1

export const classificationSchema = z.enum(['PROMOTE', 'NEEDS_VERIFICATION', 'SKIP'])
export type Classification = z.infer<typeof classificationSchema>

export const decisionKindSchema = z.enum(['approve', 'reject', 'defer'])
export type DecisionKind = z.infer<typeof decisionKindSchema>

export const capabilitySchema = z.enum(['read', 'workflow', 'capture', 'decision'])
export type Capability = z.infer<typeof capabilitySchema>

export const evidenceSchema = z.object({
    id: z.string(),
    learningId: z.string(),
    repositoryId: z.string(),
    sourcePath: z.string(),
    sourceHash: z.string(),
    canonicalLineageId: z.string(),
    skill: z.string().optional(),
    ticket: z.string().optional(),
    date: z.string().optional(),
    rawFragment: z.string(),
}).strict()
export type Evidence = z.infer<typeof evidenceSchema>

export const learningSchema = z.object({
    schemaVersion: z.literal(schemaVersion),
    id: z.string(),
    repositoryId: z.string(),
    sourcePath: z.string(),
    sourceHash: z.string(),
    contentHash: z.string(),
    skill: z.string().optional(),
    ticket: z.string().optional(),
    date: z.string().optional(),
    rawText: z.string(),
    candidateRules: z.array(z.string()),
    warnings: z.array(z.string()),
    importedAt: z.string(),
}).strict()
export type Learning = z.infer<typeof learningSchema>

export const clusterMemberSchema = z.object({
    evidenceId: z.string(),
    normalizedText: z.string(),
    score: z.number().min(0).max(1),
}).strict()

export const clusterSchema = z.object({
    schemaVersion: z.literal(schemaVersion),
    id: z.string(),
    repositoryId: z.string(),
    version: z.number().int().positive(),
    fingerprint: z.string(),
    representativeText: z.string(),
    members: z.array(clusterMemberSchema),
    explanation: z.string(),
    needsReview: z.boolean(),
    createdAt: z.string(),
}).strict()
export type LearningCluster = z.infer<typeof clusterSchema>

export const validatorSchema = z.object({
    command: z.string().trim().min(1),
    args: z.array(z.string()),
}).strict()

export const targetSchema = z.object({
    id: z.string().trim().min(1),
    adapter: z.enum(['markdown-section', 'skill-reference']),
    path: z.string().trim().min(1),
    validators: z
        .array(validatorSchema)
        .default([]),
}).strict()
export type PolicyTarget = z.infer<typeof targetSchema>

export const proposalItemSchema = z.object({
    id: z.string(),
    clusterId: z.string(),
    classification: classificationSchema,
    ruleText: z.string(),
    targetId: z.string().optional(),
    evidenceIds: z.array(z.string()),
    distinctEvidenceCount: z.number().int().nonnegative(),
    rationale: z.string(),
    risks: z.array(z.string()),
    classifierVersion: z.string(),
    targetBaseHash: z.string().optional(),
    expectedPatchHash: z.string().optional(),
}).strict()
export type ProposalItem = z.infer<typeof proposalItemSchema>

export const proposalSchema = z.object({
    schemaVersion: z.literal(schemaVersion),
    id: z.string(),
    repositoryId: z.string(),
    version: z.number().int().positive(),
    baselineId: z.string(),
    createdAt: z.string(),
    items: z.array(proposalItemSchema),
    guardrail: z.string(),
}).strict()
export type Proposal = z.infer<typeof proposalSchema>

export const decisionSchema = z.object({
    schemaVersion: z.literal(schemaVersion),
    id: z.string(),
    repositoryId: z.string(),
    proposalId: z.string(),
    proposalVersion: z.number().int().positive(),
    itemId: z.string(),
    decision: decisionKindSchema,
    actor: z.string().min(1),
    rationale: z.string().min(1),
    targetId: z.string().optional(),
    targetBaseHash: z.string().optional(),
    expectedPatchHash: z.string().optional(),
    decidedAt: z.string(),
    stale: z.boolean(),
}).strict()
export type Decision = z.infer<typeof decisionSchema>

export const patchManifestSchema = z.object({
    schemaVersion: z.literal(schemaVersion),
    id: z.string(),
    repositoryId: z.string(),
    proposalId: z.string(),
    targetId: z.string(),
    targetPath: z.string(),
    beforeHash: z.string(),
    afterHash: z.string(),
    patchHash: z.string(),
    unifiedDiff: z.string(),
    itemIds: z.array(z.string()),
    createdAt: z.string(),
}).strict()
export type PatchManifest = z.infer<typeof patchManifestSchema>

export const auditEventSchema = z.object({
    schemaVersion: z.literal(schemaVersion),
    id: z.string(),
    repositoryId: z.string(),
    type: z.string(),
    subjectId: z.string(),
    at: z.string(),
    data: z.record(z.string(), z.unknown()),
}).strict()
export type AuditEvent = z.infer<typeof auditEventSchema>

export const configSchema = z.object({
    $schema: z.string().optional(),
    schemaVersion: z.literal(schemaVersion),
    repositoryId: z.string().trim().min(1),
    learningGlobs: z.array(z.string().trim().min(1)).default(['learning-artifacts/*.md']),
    proposalGlobs: z.array(z.string().trim().min(1)).default([]),
    receiptGlobs: z.array(z.string().trim().min(1)).default([]),
    targets: z.array(targetSchema).default([]),
}).strict()
export type LearningOpsConfig = z.infer<typeof configSchema>
