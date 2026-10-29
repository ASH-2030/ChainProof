import type { VercelRequest, VercelResponse } from '@vercel/node'
import { analyzeFindingsWithGemini } from '../src/server/geminiAnalysis.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Only POST requests are supported.' })
    return
  }

  try {
    const result = await analyzeFindingsWithGemini(req.body ?? {})
    res.status(200).json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gemini analysis failed.'
    const statusCode = /missing|invalid|too large|malformed|unavailable|empty/i.test(message) ? 400 : 502
    res.status(statusCode).json({ error: message })
  }
}
