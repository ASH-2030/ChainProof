export type SeverityValue = 'Critical' | 'High' | 'Medium' | 'Low'

export type AnalysisFinding = {
  id: string
  title: string
  severity: SeverityValue | string
  asset: string
  description: string
  evidence: string
  source: 'manual' | 'imported' | string
  createdAt: string
  importedFrom?: string
}

export type AnalysisRequest = {
  findings: AnalysisFinding[]
}

export type RelationshipSource = 'evidence-supported' | 'hypothesis' | 'unverified'
export type RelationshipConfidence = 'low' | 'medium' | 'high'

export type AnalysisRelationship = {
  title: string
  source: RelationshipSource
  confidence: RelationshipConfidence
  evidence: string[]
  missingPrerequisites: string[]
  reasoning: string
  safeValidation: string[]
}

export type ChainAnalysisResponse = {
  summary: string
  relationships: AnalysisRelationship[]
  uncertainties: string[]
  safeValidationSteps: string[]
  generatedAt: string
}

const MAX_FINDINGS = 10
const MAX_REQUEST_BYTES = 120000

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function ensureArrayOfStrings(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Malformed model output: ${label} must be an array of strings.`)
  }

  return value.map((item, index) => {
    if (typeof item !== 'string') {
      throw new Error(`Malformed model output: ${label}[${index}] must be a string.`)
    }
    return item
  })
}

export function validateAnalysisRequest(body: unknown): AnalysisRequest {
  if (typeof body !== 'object' || body === null) {
    throw new Error('Invalid request: expected a JSON object.')
  }

  if (JSON.stringify(body).length > MAX_REQUEST_BYTES) {
    throw new Error('Request too large: analysis payload exceeds the supported size limit.')
  }

  const request = body as Record<string, unknown>
  const findings = request.findings

  if (!Array.isArray(findings)) {
    throw new Error('Invalid request: expected a findings array.')
  }

  if (findings.length === 0) {
    throw new Error('Invalid request: analysis requires at least one selected finding.')
  }

  if (findings.length > MAX_FINDINGS) {
    throw new Error(`Invalid request: maximum ${MAX_FINDINGS} findings per analysis request.`)
  }

  const normalizedFindings: AnalysisFinding[] = findings.map((finding, index) => {
    if (typeof finding !== 'object' || finding === null) {
      throw new Error(`Invalid request: finding at index ${index} must be a JSON object.`)
    }

    const entry = finding as Record<string, unknown>

    return {
      id: isString(entry.id) ? entry.id : `finding-${index}`,
      title: isString(entry.title) ? entry.title : `Finding ${index + 1}`,
      severity: isString(entry.severity) ? entry.severity : 'Medium',
      asset: isString(entry.asset) ? entry.asset : 'Unknown asset',
      description: isString(entry.description) ? entry.description : 'No description provided.',
      evidence: isString(entry.evidence) ? entry.evidence : 'No evidence provided.',
      source: isString(entry.source) ? entry.source : 'manual',
      createdAt: isString(entry.createdAt) ? entry.createdAt : new Date().toISOString(),
      importedFrom: typeof entry.importedFrom === 'string' ? entry.importedFrom : undefined,
    }
  })

  return { findings: normalizedFindings }
}

export function assertChainAnalysisResponse(value: unknown): ChainAnalysisResponse {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Malformed model output: expected a JSON object.')
  }

  const result = value as Record<string, unknown>

  if (!isString(result.summary)) {
    throw new Error('Malformed model output: missing required fields in summary.')
  }

  if (!Array.isArray(result.relationships)) {
    throw new Error('Malformed model output: missing required fields in relationships.')
  }

  const relationships: AnalysisRelationship[] = result.relationships.map((item, index) => {
    if (typeof item !== 'object' || item === null) {
      throw new Error(`Malformed model output: relationship at index ${index} must be an object.`)
    }

    const relationship = item as Record<string, unknown>

    if (!isString(relationship.title)) {
      throw new Error(`Malformed model output: relationship ${index} is missing a title.`)
    }

    const source = relationship.source
    if (source !== 'evidence-supported' && source !== 'hypothesis' && source !== 'unverified') {
      throw new Error(`Malformed model output: missing required fields in relationship ${index}.`)
    }

    const confidence = relationship.confidence
    if (confidence !== 'low' && confidence !== 'medium' && confidence !== 'high') {
      throw new Error(`Malformed model output: missing required fields in relationship ${index}.`)
    }

    const evidence = ensureArrayOfStrings(relationship.evidence, `relationship.${index}.evidence`)
    const missingPrerequisites = ensureArrayOfStrings(
      relationship.missingPrerequisites,
      `relationship.${index}.missingPrerequisites`,
    )
    const safeValidation = ensureArrayOfStrings(
      relationship.safeValidation,
      `relationship.${index}.safeValidation`,
    )

    if (!isString(relationship.reasoning)) {
      throw new Error(`Malformed model output: relationship ${index} is missing reasoning.`)
    }

    return {
      title: relationship.title,
      source,
      confidence,
      evidence,
      missingPrerequisites,
      reasoning: relationship.reasoning,
      safeValidation,
    }
  })

  const uncertainties = ensureArrayOfStrings(result.uncertainties, 'uncertainties')
  const safeValidationSteps = ensureArrayOfStrings(result.safeValidationSteps, 'safeValidationSteps')

  if (!isString(result.generatedAt)) {
    throw new Error('Malformed model output: missing generatedAt timestamp.')
  }

  return {
    summary: result.summary,
    relationships,
    uncertainties,
    safeValidationSteps,
    generatedAt: result.generatedAt,
  }
}
