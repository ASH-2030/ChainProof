import { describe, expect, it } from 'vitest'
import {
  assertChainAnalysisResponse,
  validateAnalysisRequest,
} from './analysisValidation'

describe('analysis validation', () => {
  it('accepts a valid request body with selected findings', () => {
    const result = validateAnalysisRequest({
      findings: [
        {
          id: 'demo-1',
          title: 'Weak session teardown',
          severity: 'High',
          asset: 'https://app.example.com/auth',
          description: 'Session state survives redirect window.',
          evidence: 'Observed in the callback sequence.',
          source: 'manual',
          createdAt: 'Apr 18',
        },
      ],
    })

    expect(result).toEqual({
      findings: [
        {
          id: 'demo-1',
          title: 'Weak session teardown',
          severity: 'High',
          asset: 'https://app.example.com/auth',
          description: 'Session state survives redirect window.',
          evidence: 'Observed in the callback sequence.',
          source: 'manual',
          createdAt: 'Apr 18',
        },
      ],
    })
  })

  it('rejects requests without any selected findings', () => {
    expect(() => validateAnalysisRequest({ findings: [] })).toThrow(/at least one selected finding/i)
  })

  it('rejects malformed model output', () => {
    expect(() =>
      assertChainAnalysisResponse({
        summary: 'Candidate relationships reviewed.',
        relationships: [
          {
            title: 'Broken relationship',
            source: 'evidence-supported',
            evidence: 'Missing required evidence array',
          },
        ],
      }),
    ).toThrow(/missing required fields/i)
  })
})
