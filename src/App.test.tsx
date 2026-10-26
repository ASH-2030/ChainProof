import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

describe('App', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the evidence-led overview and opens the add finding form', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { name: /evidence before attack paths/i }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: /add finding/i })[0])

    expect(screen.getByRole('dialog', { name: /add finding/i })).toBeInTheDocument()
  })

  it('validates required fields before saving a finding', () => {
    render(<App />)

    fireEvent.click(screen.getAllByRole('button', { name: /add finding/i })[0])
    fireEvent.click(screen.getByRole('button', { name: /^save finding$/i }))

    expect(screen.getByText(/title is required/i)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /severity/i })).toHaveAttribute('aria-invalid', 'true')
  })

  it('adds a new finding to the findings list', () => {
    render(<App />)

    fireEvent.click(screen.getAllByRole('button', { name: /add finding/i })[0])
    fireEvent.change(screen.getByLabelText(/title/i), {
      target: { value: 'DOM XSS in search' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: /severity/i }), {
      target: { value: 'High' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: /affected asset \/ url/i }), {
      target: { value: 'https://app.example.com/search' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: /description/i }), {
      target: { value: 'Reflected payload in the query string supplied by the user.' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: /^evidence$/i }), {
      target: { value: 'Captured request demonstrates a reflected parameter in the rendered page.' },
    })

    fireEvent.click(screen.getByRole('button', { name: /^save finding$/i }))

    expect(screen.getByRole('heading', { name: /dom xss in search/i })).toBeInTheDocument()
    expect(
      screen.getByText(/captured request demonstrates a reflected parameter in the rendered page\./i),
    ).toBeInTheDocument()
  })

  it('rejects unsupported or invalid ZAP JSON imports', async () => {
    render(<App />)

    const fileInput = screen.getByLabelText(/import zap json/i)
    const file = new File(['{not: valid'], 'report.json', { type: 'application/json' })

    fireEvent.change(fileInput, { target: { files: [file] } })

    expect(
      await screen.findByText(/unsupported or invalid zap report/i),
    ).toBeInTheDocument()
  })

  it('exports the current findings as a JSON file', () => {
    render(<App />)

    const createObjectURLSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:chainproof-test')
    const anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)

    fireEvent.click(screen.getAllByRole('button', { name: /export json/i })[0])

    expect(createObjectURLSpy).toHaveBeenCalledTimes(1)
    expect(anchorClickSpy).toHaveBeenCalledTimes(1)
  })

  it('requests Gemini analysis for the selected finding set', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          summary: 'Candidate relationships reviewed.',
          relationships: [
            {
              title: 'Session teardown to callback persistence',
              source: 'evidence-supported',
              confidence: 'medium',
              evidence: ['Captured request sequence'],
              missingPrerequisites: ['Session cleanup verification'],
              reasoning: 'The issue follows a redirect timing window.',
              safeValidation: ['Review in a staging session'],
            },
          ],
          uncertainties: ['Requires confirmation in a lab.'],
          safeValidationSteps: ['Run staged verification'],
          generatedAt: '2026-10-26T00:00:00.000Z',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /chain analysis/i }))
    fireEvent.click(screen.getByRole('button', { name: /analyze with gemini/i }))

    await screen.findByText(/candidate relationships reviewed/i)
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/analyze-gemini',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    )
  })

  it('retries on transient Gemini busy responses and succeeds', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'The Gemini AI service is temporarily busy. Please retry shortly.' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            summary: 'Candidate relationships reviewed after retry.',
            relationships: [
              {
                title: 'Session teardown to callback persistence',
                source: 'evidence-supported',
                confidence: 'medium',
                evidence: ['Captured request sequence'],
                missingPrerequisites: ['Session cleanup verification'],
                reasoning: 'The issue follows a redirect timing window.',
                safeValidation: ['Review in a staging session'],
              },
            ],
            uncertainties: ['Requires confirmation in a lab.'],
            safeValidationSteps: ['Run staged verification'],
            generatedAt: '2026-10-26T00:00:00.000Z',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /chain analysis/i }))
    fireEvent.click(screen.getByRole('button', { name: /analyze with gemini/i }))

    await screen.findByText(/candidate relationships reviewed after retry/i, {}, { timeout: 5000 })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('shows a clear temporary busy message when Gemini remains unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'The Gemini AI service is temporarily busy. Please retry shortly.' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /chain analysis/i }))
    fireEvent.click(screen.getByRole('button', { name: /analyze with gemini/i }))

    expect(await screen.findByText(/the gemini ai service is temporarily busy\./i)).toBeInTheDocument()
  })
})
