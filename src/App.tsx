import { type ChangeEvent, type FormEvent, useMemo, useRef, useState } from 'react'
import './App.css'
import { ChainProofLogo } from './components/ChainProofLogo'

type Severity = 'Critical' | 'High' | 'Medium' | 'Low'
type ViewKey = 'overview' | 'findings' | 'chain' | 'reports'

type Finding = {
  id: string
  title: string
  severity: Severity
  asset: string
  description: string
  evidence: string
  source: 'manual' | 'imported'
  importedFrom?: string
  createdAt: string
}

type FormState = {
  title: string
  severity: Severity | ''
  asset: string
  description: string
  evidence: string
}

type FormErrors = Partial<Record<keyof FormState, string>>

type ImportStatus = {
  tone: 'success' | 'error' | 'info'
  message: string
} | null

type GeminiRelationship = {
  title: string
  source: 'evidence-supported' | 'hypothesis' | 'unverified'
  confidence: 'low' | 'medium' | 'high'
  evidence: string[]
  missingPrerequisites: string[]
  reasoning: string
  safeValidation: string[]
}

type GeminiAnalysisResult = {
  summary: string
  relationships: GeminiRelationship[]
  uncertainties: string[]
  safeValidationSteps: string[]
  generatedAt: string
}

const CHANNEL_SERVICE_BUSY_MESSAGE = 'The Gemini AI service is temporarily busy. Please retry shortly.'
const GEMINI_RETRY_LIMIT = 2
const GEMINI_RETRY_DELAY_MS = 250

function isGeminiAnalysisResponse(value: unknown): value is GeminiAnalysisResult {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.summary === 'string' &&
    Array.isArray(value.relationships) &&
    Array.isArray(value.uncertainties) &&
    Array.isArray(value.safeValidationSteps) &&
    typeof value.generatedAt === 'string'
  )
}

const navItems: Array<{ key: ViewKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'findings', label: 'Findings' },
  { key: 'chain', label: 'Chain Analysis' },
  { key: 'reports', label: 'Reports' },
]

const demoFindings: Finding[] = [
  {
    id: 'demo-1',
    title: 'Weak session teardown on auth callback',
    severity: 'High',
    asset: 'https://app.example.com/auth/callback',
    description:
      'The callback endpoint leaves authentication state available to downstream pages during a refresh window.',
    evidence:
      'Captured request sequence shows session state persisting after redirect and before a complete cleanup step.',
    source: 'manual',
    createdAt: 'Apr 18',
  },
  {
    id: 'demo-2',
    title: 'Request parameter reflected in error response',
    severity: 'Medium',
    asset: 'https://app.example.com/search',
    description:
      'The application mirrors an unsafe query string value in an error page without sufficient neutralization.',
    evidence:
      'Manual validation confirms a reflected parameter appears in the rendered response body for invalid requests.',
    source: 'manual',
    createdAt: 'Apr 12',
  },
]

const emptyForm: FormState = {
  title: '',
  severity: '',
  asset: '',
  description: '',
  evidence: '',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function riskCodeToSeverity(value: unknown): Severity {
  const numericValue = Number(value ?? 0)

  if (numericValue >= 3) {
    return 'Critical'
  }

  if (numericValue === 2) {
    return 'High'
  }

  if (numericValue === 1) {
    return 'Medium'
  }

  return 'Low'
}

function parseZapperReport(reportText: string): Finding[] {
  let parsed: unknown

  try {
    parsed = JSON.parse(reportText)
  } catch {
    throw new Error('Unsupported or invalid ZAP report: the file is not valid JSON.')
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.site) || parsed.site.length === 0) {
    throw new Error('Unsupported or invalid ZAP report: expected an OWASP ZAP Traditional JSON report.')
  }

  const findings: Finding[] = []

  for (const site of parsed.site) {
    if (!isRecord(site) || !Array.isArray(site.alerts)) {
      continue
    }

    for (const alert of site.alerts) {
      if (!isRecord(alert)) {
        continue
      }

      const title = typeof alert.name === 'string' ? alert.name : 'Imported ZAP finding'
      const asset = typeof alert.url === 'string' ? alert.url : 'Unknown asset'
      const description = typeof alert.desc === 'string' ? alert.desc : 'No description supplied by the report.'
      const riskText = typeof alert.riskdesc === 'string' ? alert.riskdesc : 'Risk classified by report.'

      const evidenceParts: string[] = []
      if (Array.isArray(alert.instances)) {
        for (const entry of alert.instances) {
          if (isRecord(entry) && typeof entry.uri === 'string') {
            evidenceParts.push(entry.uri)
          }
        }
      }

      const evidence =
        evidenceParts.length > 0
          ? evidenceParts.join(' • ')
          : `${riskText} Evidence captured in the imported ZAP report.`

      findings.push({
        id: `zap-${Date.now()}-${findings.length}`,
        title,
        severity: riskCodeToSeverity(alert.riskcode),
        asset,
        description,
        evidence,
        source: 'imported',
        importedFrom: 'OWASP ZAP',
        createdAt: formatDate(new Date()),
      })
    }
  }

  if (findings.length === 0) {
    throw new Error('Unsupported or invalid ZAP report: no alert entries were found in the report.')
  }

  return findings
}

function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [activeView, setActiveView] = useState<ViewKey>('overview')
  const [findings, setFindings] = useState<Finding[]>(demoFindings)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [formData, setFormData] = useState<FormState>(emptyForm)
  const [formErrors, setFormErrors] = useState<FormErrors>({})
  const [importStatus, setImportStatus] = useState<ImportStatus>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<GeminiAnalysisResult | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)

  const summary = useMemo(
    () => ({
      total: findings.length,
      critical: findings.filter((finding) => finding.severity === 'Critical').length,
      imported: findings.filter((finding) => finding.source === 'imported').length,
    }),
    [findings],
  )

  const navigateTo = (view: ViewKey) => {
    setActiveView(view)

    const targetId =
      view === 'overview'
        ? 'overview'
        : view === 'findings'
          ? 'findings'
          : view === 'chain'
            ? 'chain'
            : 'reports'

    const target = document.getElementById(targetId)
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const openAddFinding = () => {
    setFormErrors({})
    setFormData(emptyForm)
    setIsFormOpen(true)
  }

  const closeAddFinding = () => {
    setIsFormOpen(false)
    setFormErrors({})
  }

  const validateForm = (candidate: FormState): FormErrors => {
    const nextErrors: FormErrors = {}

    if (!candidate.title.trim()) {
      nextErrors.title = 'Title is required.'
    }

    if (!candidate.severity) {
      nextErrors.severity = 'Severity is required.'
    }

    if (!candidate.asset.trim()) {
      nextErrors.asset = 'Affected asset / URL is required.'
    }

    if (!candidate.description.trim()) {
      nextErrors.description = 'Description is required.'
    }

    if (!candidate.evidence.trim()) {
      nextErrors.evidence = 'Evidence is required.'
    }

    return nextErrors
  }

  const handleFormChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.target

    setFormData((current) => ({
      ...current,
      [name]: value,
    }))

    setFormErrors((current) => ({
      ...current,
      [name]: undefined,
    }))
  }

  const handleSubmitFinding = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const errors = validateForm(formData)
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }

    const nextFinding: Finding = {
      id: `manual-${Date.now()}`,
      title: formData.title.trim(),
      severity: formData.severity || 'Medium',
      asset: formData.asset.trim(),
      description: formData.description.trim(),
      evidence: formData.evidence.trim(),
      source: 'manual',
      createdAt: formatDate(new Date()),
    }

    setFindings((current) => [nextFinding, ...current])
    setImportStatus({
      tone: 'success',
      message: `Added new finding: ${nextFinding.title}.`,
    })
    setFormData(emptyForm)
    setFormErrors({})
    setIsFormOpen(false)
    setActiveView('findings')
  }

  const handleZAPImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    const name = file.name.toLowerCase()
    const isJsonLike =
      file.type === 'application/json' || file.type === 'text/json' || name.endsWith('.json')

    if (!isJsonLike) {
      setImportStatus({
        tone: 'error',
        message: 'Unsupported or invalid ZAP report: please upload a JSON file exported from OWASP ZAP.',
      })
      event.target.value = ''
      return
    }

    try {
      const text = await file.text()
      const importedFindings = parseZapperReport(text)

      setFindings((current) => [...importedFindings, ...current])
      setImportStatus({
        tone: 'success',
        message: `Imported ${importedFindings.length} evidence item${importedFindings.length > 1 ? 's' : ''} from ${file.name}.`,
      })
      setActiveView('findings')
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unsupported or invalid ZAP report: the file could not be parsed.'
      setImportStatus({
        tone: 'error',
        message,
      })
    } finally {
      event.target.value = ''
    }
  }

  const exportFindings = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      findings,
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')

    anchor.href = url
    anchor.download = `chainproof-findings-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)

    setImportStatus({
      tone: 'success',
      message: `Exported ${findings.length} finding${findings.length === 1 ? '' : 's'} as JSON.`,
    })
    setActiveView('reports')
  }

  const handleAnalyzeWithGemini = async () => {
    if (findings.length === 0) {
      setAnalysisError('Add at least one finding before running a Gemini analysis.')
      setActiveView('findings')
      return
    }

    if (isAnalyzing) {
      return
    }

    setIsAnalyzing(true)
    setAnalysisError(null)
    setActiveView('chain')

    let lastErrorMessage: string | null = null

    try {
      for (let retryAttempt = 0; retryAttempt <= GEMINI_RETRY_LIMIT; retryAttempt += 1) {
        const response = await fetch('/api/analyze-gemini', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ findings }),
        })

        const payload = (await response.json().catch(() => null)) as unknown
        const retryableStatus = response.status === 429 || response.status === 503
        const serverMessage =
          isRecord(payload) && typeof payload.error === 'string'
            ? payload.error
            : isRecord(payload) && typeof payload.message === 'string'
              ? payload.message
              : null

        const isTemporaryBusy =
          retryableStatus ||
          (typeof serverMessage === 'string' && /temporarily busy|retry shortly|429|503|rate limit|too many requests|unavailable|busy/i.test(serverMessage))

        if (!response.ok) {
          lastErrorMessage = serverMessage ?? 'Gemini analysis failed. Please try again in a moment.'
          if (!isTemporaryBusy) {
            throw new Error(lastErrorMessage)
          }
        }

        if (!isTemporaryBusy && isGeminiAnalysisResponse(payload)) {
          setAnalysisResult(payload)
          setImportStatus({
            tone: 'success',
            message: 'Gemini analysis complete. Review the proposed evidence-supported relationships below.',
          })
          return
        }

        if (isTemporaryBusy && retryAttempt < GEMINI_RETRY_LIMIT) {
          await new Promise((resolve) => setTimeout(resolve, GEMINI_RETRY_DELAY_MS * (retryAttempt + 1)))
          continue
        }

        if (isTemporaryBusy) {
          throw new Error(CHANNEL_SERVICE_BUSY_MESSAGE)
        }

        if (!isGeminiAnalysisResponse(payload)) {
          throw new Error('Gemini returned an incomplete response.')
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Gemini analysis failed. Please try again later.'
      setAnalysisError(
        /temporarily busy|retry shortly|rate limit|too many requests|unavailable|busy/i.test(message)
          ? CHANNEL_SERVICE_BUSY_MESSAGE
          : message,
      )
      setAnalysisResult(null)
    } finally {
      setIsAnalyzing(false)
    }
  }

  return (
    <div className="page-shell">
      <div className="page-mesh" aria-hidden="true" />

      <header className="topbar" aria-label="Main navigation">
        <div className="brand-block" aria-label="ChainProof brand">
          <ChainProofLogo size={42} className="brand-mark" />
          <div className="brand-text">
            <span className="brand-name">ChainProof</span>
            <small className="brand-tag">Evidence ledger</small>
          </div>
        </div>

        <nav className="main-nav" aria-label="Primary navigation">
          {navItems.map((navItem) => (
            <button
              key={navItem.key}
              type="button"
              className={activeView === navItem.key ? 'nav-button active' : 'nav-button'}
              onClick={() => navigateTo(navItem.key)}
              aria-pressed={activeView === navItem.key}
              aria-current={activeView === navItem.key ? 'page' : undefined}
            >
              {navItem.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="workspace-shell">
        <section id="overview" className={`view-panel ${activeView === 'overview' ? 'is-active' : ''}`}>
          <div className="hero-grid">
            <div className="lede-block">
              <p className="eyebrow">Evidence intelligence workbench</p>
              <h1>Evidence before attack paths.</h1>
              <p className="intro-copy">
                ChainProof links candidate web findings to supporting evidence, distinguishing
                traceable signals from assumptions before any path is treated as actionable.
              </p>

              <div className="action-row" aria-label="Primary actions">
                <button type="button" className="primary-button" onClick={openAddFinding}>
                  Add finding
                </button>

                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Import ZAP JSON
                </button>

                <button type="button" className="secondary-button subtle" onClick={exportFindings}>
                  Export JSON
                </button>
              </div>

              <input
                ref={fileInputRef}
                className="sr-only"
                type="file"
                accept=".json,application/json"
                aria-label="Import ZAP JSON"
                onChange={handleZAPImport}
              />

              {importStatus ? (
                <p className={`status-banner ${importStatus.tone}`} role="status" aria-live="polite">
                  {importStatus.message}
                </p>
              ) : null}
            </div>

            <aside className="ledger-panel" aria-label="Evidence ledger preview">
              <div className="ledger-header">
                <span className="ledger-label">Demo sample</span>
                <span className="ledger-chip">2 evidence items</span>
              </div>

              <ul className="ledger-list">
                <li>
                  <span className="ledger-dot rust" aria-hidden="true" />
                  <div>
                    <strong>High severity</strong>
                    <small>Session teardown issue</small>
                  </div>
                </li>
                <li>
                  <span className="ledger-dot olive" aria-hidden="true" />
                  <div>
                    <strong>Verified signal</strong>
                    <small>Reflected parameter in search flow</small>
                  </div>
                </li>
              </ul>
            </aside>
          </div>
        </section>

        <section className="summary-strip" aria-label="Evidence summary">
          <div className="summary-pill">
            <span className="summary-label">Sample findings</span>
            <strong>{summary.total}</strong>
          </div>
          <div className="summary-pill">
            <span className="summary-label">Critical</span>
            <strong>{summary.critical}</strong>
          </div>
          <div className="summary-pill">
            <span className="summary-label">Imported</span>
            <strong>{summary.imported}</strong>
          </div>
        </section>

        <section id="findings" className={`view-panel ${activeView === 'findings' ? 'is-active' : ''}`}>
          <div className="panel-header">
            <div>
              <p className="section-kicker">Field notes</p>
              <h2>Findings workspace</h2>
            </div>
            <button type="button" className="secondary-button" onClick={openAddFinding}>
              Add finding
            </button>
          </div>

          {findings.length === 0 ? (
            <div className="empty-state">
              <p>No evidence items yet.</p>
              <span>Add a manual finding or import a ZAP JSON report to begin.</span>
            </div>
          ) : (
            <div className="finding-list">
              {findings.map((finding) => (
                <article key={finding.id} className="finding-card">
                  <div className="finding-header">
                    <span className={`severity-badge ${finding.severity.toLowerCase()}`}>
                      {finding.severity}
                    </span>
                    <span className="source-tag">
                      {finding.source === 'imported' ? 'Imported' : 'Manual'}
                    </span>
                  </div>

                  <h3>{finding.title}</h3>
                  <p className="finding-asset">{finding.asset}</p>
                  <p className="finding-description">{finding.description}</p>

                  <div className="evidence-block">
                    <span>Evidence</span>
                    <p>{finding.evidence}</p>
                  </div>

                  <div className="finding-meta">
                    <span>{finding.source === 'imported' ? finding.importedFrom : 'Analyst note'}</span>
                    <span>{finding.createdAt}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section id="chain" className={`view-panel ${activeView === 'chain' ? 'is-active' : ''}`}>
          <div className="panel-header">
            <div>
              <p className="section-kicker">Sample preview</p>
              <h2>Evidence relationship preview</h2>
            </div>
            <button
              type="button"
              className="primary-button"
              onClick={handleAnalyzeWithGemini}
              disabled={isAnalyzing}
            >
              {isAnalyzing ? 'Analyzing…' : 'Analyze with Gemini'}
            </button>
          </div>

          {analysisError ? (
            <div className="status-banner error" role="alert">
              {analysisError}
              <div className="analysis-actions">
                <button type="button" className="secondary-button subtle" onClick={handleAnalyzeWithGemini}>
                  Retry
                </button>
              </div>
            </div>
          ) : null}

          {!analysisResult && !isAnalyzing ? (
            <div className="empty-state">
              <p>No AI-assisted chain review yet.</p>
              <span>Select findings and run an analysis to review candidate relationships and missing prerequisites.</span>
            </div>
          ) : null}

          {isAnalyzing ? (
            <div className="loading-state" aria-live="polite">
              <p>Reviewing the selected findings with Gemini…</p>
            </div>
          ) : null}

          {analysisResult ? (
            <div className="analysis-result" aria-live="polite">
              <div className="analysis-summary">
                <p className="section-kicker">Gemini review</p>
                <h3>{analysisResult.summary}</h3>
                <small>{new Date(analysisResult.generatedAt).toLocaleString()}</small>
              </div>

              <div className="relationship-preview" aria-label="Chain analysis preview">
                <div className="node node-source">
                  <small>Source</small>
                  <strong>Auth callback</strong>
                </div>
                <div className="node node-link">
                  <small>Evidence</small>
                  <strong>Session persistence</strong>
                </div>
                <div className="node node-link">
                  <small>Assumption</small>
                  <strong>Privilege boundary</strong>
                </div>
                <div className="node node-risk">
                  <small>Risk signal</small>
                  <strong>Potential path</strong>
                </div>
              </div>

              <div className="analysis-relationships">
                {analysisResult.relationships.map((relationship) => (
                  <article key={relationship.title} className="analysis-card">
                    <div className="analysis-card-header">
                      <h4>{relationship.title}</h4>
                      <span className={`source-tag source-${relationship.source}`}>
                        {relationship.source}
                      </span>
                    </div>
                    <div className="confidence-row">
                      <span className="confidence-label">Confidence</span>
                      <span className={`confidence-badge confidence-${relationship.confidence}`}>
                        {relationship.confidence}
                      </span>
                    </div>
                    <p>{relationship.reasoning}</p>

                    <div className="analysis-list-block">
                      <span>Evidence</span>
                      <ul>
                        {relationship.evidence.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="analysis-list-block">
                      <span>Missing prerequisites</span>
                      <ul>
                        {relationship.missingPrerequisites.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="analysis-list-block">
                      <span>Safe validation</span>
                      <ul>
                        {relationship.safeValidation.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </article>
                ))}
              </div>

              {analysisResult.uncertainties.length > 0 ? (
                <div className="analysis-list-block">
                  <span>Uncertainties</span>
                  <ul>
                    {analysisResult.uncertainties.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {analysisResult.safeValidationSteps.length > 0 ? (
                <div className="analysis-list-block">
                  <span>Safe validation steps</span>
                  <ul>
                    {analysisResult.safeValidationSteps.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          <p className="preview-note">
            This preview is a labelling aid only. ChainProof does not claim confirmed attack paths until
            evidence is reviewed and linked with supporting context.
          </p>
        </section>

        <section id="reports" className={`view-panel ${activeView === 'reports' ? 'is-active' : ''}`}>
          <div className="panel-header">
            <div>
              <p className="section-kicker">Reporting</p>
              <h2>Export package</h2>
            </div>
            <button type="button" className="primary-button" onClick={exportFindings}>
              Export JSON
            </button>
          </div>

          <p className="report-copy">
            Export the current evidence set as a structured JSON file for review, archival, or handoff.
          </p>
        </section>
      </main>

      {isFormOpen ? (
        <div className="dialog-backdrop" onClick={closeAddFinding}>
          <dialog
            open
            aria-labelledby="add-finding-title"
            className="finding-dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dialog-header">
              <div>
                <p className="section-kicker">New note</p>
                <h2 id="add-finding-title">Add finding</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={closeAddFinding}
                aria-label="Close add finding form"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmitFinding} className="finding-form">
              <div className="field-row">
                <label>
                  <span>Title</span>
                  <input
                    type="text"
                    name="title"
                    value={formData.title}
                    onChange={handleFormChange}
                    aria-invalid={Boolean(formErrors.title)}
                  />
                  {formErrors.title ? <small>{formErrors.title}</small> : null}
                </label>

                <label>
                  <span>Severity</span>
                  <select
                    name="severity"
                    value={formData.severity}
                    onChange={handleFormChange}
                    aria-invalid={Boolean(formErrors.severity)}
                  >
                    <option value="">Select severity</option>
                    <option value="Critical">Critical</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                  {formErrors.severity ? <small>{formErrors.severity}</small> : null}
                </label>
              </div>

              <label>
                <span>Affected asset / URL</span>
                <input
                  type="text"
                  name="asset"
                  value={formData.asset}
                  onChange={handleFormChange}
                  aria-invalid={Boolean(formErrors.asset)}
                />
                {formErrors.asset ? <small>{formErrors.asset}</small> : null}
              </label>

              <label>
                <span>Description</span>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleFormChange}
                  rows={4}
                  aria-invalid={Boolean(formErrors.description)}
                />
                {formErrors.description ? <small>{formErrors.description}</small> : null}
              </label>

              <label>
                <span>Evidence</span>
                <textarea
                  name="evidence"
                  value={formData.evidence}
                  onChange={handleFormChange}
                  rows={4}
                  aria-invalid={Boolean(formErrors.evidence)}
                />
                {formErrors.evidence ? <small>{formErrors.evidence}</small> : null}
              </label>

              <div className="dialog-actions">
                <button type="button" className="secondary-button subtle" onClick={closeAddFinding}>
                  Cancel
                </button>
                <button type="submit" className="primary-button">
                  Save finding
                </button>
              </div>
            </form>
          </dialog>
        </div>
      ) : null}
    </div>
  )
}

export default App
