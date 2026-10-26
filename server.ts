import 'dotenv/config'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { analyzeFindingsWithGemini } from './src/server/geminiAnalysis'

const port = Number(process.env.API_PORT ?? 3001)
const maxBodyBytes = 120000

function sendJson(res: ServerResponse, statusCode: number, payload: Record<string, unknown>) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  })
  res.end(JSON.stringify(payload))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0

    req.on('data', (chunk) => {
      size += chunk.length
      if (size > maxBodyBytes) {
        reject(new Error('Request too large: analysis payload exceeds the supported size limit.'))
        req.destroy()
        return
      }
      chunks.push(Buffer.from(chunk))
    })

    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

const server = createServer(async (req, res) => {
  if (!req.url) {
    sendJson(res, 404, { error: 'Not found.' })
    return
  }

  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, { status: 'ok' })
    return
  }

  if (req.method !== 'POST' || req.url !== '/api/analyze-gemini') {
    sendJson(res, 404, { error: 'Route not found.' })
    return
  }

  try {
    const rawBody = await readBody(req)
    const body = rawBody.trim() ? JSON.parse(rawBody) : {}
    const result = await analyzeFindingsWithGemini(body)
    sendJson(res, 200, { ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gemini analysis failed.'
    const statusCode = /429|rate limit|too many requests|503|unavailable|busy|temporarily/i.test(message)
      ? 503
      : /missing|invalid|too large|malformed|empty/i.test(message)
        ? 400
        : 502

    sendJson(res, statusCode, {
      error: message,
    })
  }
})

server.listen(port, () => {
  console.log(`ChainProof API server listening on http://localhost:${port}`)
})
