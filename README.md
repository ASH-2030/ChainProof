# ChainProof

ChainProof is a security evidence intelligence dashboard for reviewing findings, importing OWASP ZAP JSON reports, exporting structured evidence, and requesting a Gemini-assisted evidence-chain review.

## Project overview

The application keeps the evidence workflow visible and structured:

- Add manual findings with validation
- Import OWASP ZAP Traditional JSON reports
- Review findings in the evidence workspace
- Export findings as JSON
- Request a Gemini-based chain analysis for candidate relationships and missing prerequisites
- Keep all sensitive AI credentials on the server only

## Core features

- Evidence ledger dashboard
- Manual finding creation with required field validation
- ZAP JSON import support
- JSON export for reports and handoff
- Gemini-powered analysis call routed through a server-side API endpoint
- Request/response validation for secure AI usage
- Temporary-service handling for 429 and 503 responses

## Local setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a local `.env` file in the project root using the placeholder template:
   ```env
   GEMINI_API_KEY=your_key_here
   ```
3. Do not commit `.env`.
4. Use the example file as a template only:
   ```bash
   copy .env.example .env
   ```

## Environment variables

- `GEMINI_API_KEY`: required for server-side Gemini requests
- `API_PORT` (optional): local API port, default is `3001`

The API key must remain in `.env` on the server and must never be exposed in browser code or committed to source control.

## Run the app locally

Start the API server:
```bash
npm run api
```

Start the frontend in a separate terminal:
```bash
npm run dev
```

The Vite frontend proxies `/api` requests to the local API server during development.

## Testing and build

Run the project tests:
```bash
npm.cmd test -- --run
```

Run the production build:
```bash
npm.cmd run build
```

## Deployment readiness

This project is structured for Vercel deployment with a serverless API route in `api/analyze-gemini.ts` and a Vite frontend build.

No repo-level deployment config was required for a basic Vercel setup because the project already includes:

- a Vite frontend build script
- a server-side API route under `api/`
- a server runtime for local development with `server.ts`

For deployment, configure the environment variable in the hosting platform:

- `GEMINI_API_KEY`

Then deploy the project using the default Vercel workflow for a Vite app and serverless function route.

Do not deploy with a real key in the frontend or repository. Verify the value is stored only in the hosting environment secret store.

## Safety and limitations

- All imported and user-supplied evidence is treated as untrusted input.
- Gemini output is validated before it is accepted by the UI.
- The AI analysis is a decision-support tool only; it does not confirm an exploitable chain by itself.
- Temporary API overloads (429/503) are handled gracefully with short bounded retries and user-visible messaging.

## Safe use

- Use only in controlled testing or review environments.
- Validate findings manually before treating them as confirmed vulnerabilities.
- Keep evidence chain reviews tied to supporting context and confirmed reproduction steps.

## Architecture overview

The project is a small React + TypeScript frontend built with Vite. The UI handles finding entry, ZAP import, export, navigation, and the chain-analysis result view in the browser. The actual app state and workflow logic live in the frontend code, while the Gemini request is sent to a server-side API for processing.

The server-side AI path is implemented in `server.ts` and in `api/analyze-gemini.ts`. The local backend listens on `localhost:3001` and routes `/api/analyze-gemini` requests to the Gemini analysis function. Request and model output validation are handled in `src/server/analysisValidation.ts`, which checks the incoming findings array, request size, and required JSON fields before accepting a model response.

The test setup uses Vitest with Testing Library and jsdom to exercise the UI and validation behavior. This keeps the documentation aligned with the codebase: frontend behavior is tested in the browser-like environment, while the validation logic is tested directly.

## AI integration

Gemini supports the evidence-chain analysis workflow in this project. The app sends selected findings to the server, where `src/server/geminiAnalysis.ts` builds a prompt containing the evidence summary, titles, severities, assets, descriptions, and raw evidence for each finding.

The prompt explicitly tells the model to:

- use only the supplied evidence
- treat imported or user-provided data as untrusted
- separate evidence-supported findings from hypotheses and unverified assumptions
- return JSON only with a fixed structure for the summary, relationships, uncertainties, missing prerequisites, and safe validation steps
- avoid labeling any relationship as confirmed

The returned JSON is parsed and validated before it is shown to the user. This is important because the UI should only display structured results that match the expected schema. The analysis result should be treated as decision-support guidance, not as a confirmed exploit path. Human review is still required to confirm cause, scope, and real impact.

## Known limitations and future improvements

- The project is a focused capstone workflow, not a full enterprise vulnerability management platform.
- Analysis is limited to the findings currently supplied by the user or imported from OWASP ZAP JSON.
- The model output is constrained by prompt design and schema validation, so it is not a substitute for manual investigation.
- The app currently uses a bounded retry mechanism for temporary AI service overloads; it does not aim to provide a full fault-tolerant distributed queuing system.
- Future improvements could include richer evidence linking, persistent storage, user authentication, and deeper reporting workflows.

## Deployment checklist

### Pre-deployment checks

- Confirm `.env` is not committed and `.env.example` remains the placeholder-only template.
- Set the real `GEMINI_API_KEY` in the hosting provider secret store only.
- Verify the project builds locally with the existing scripts.
- Confirm the API route and frontend proxy are still aligned for the host environment.

### Post-deployment verification

- Verify the app loads successfully after deployment.
- Confirm the frontend can reach the API route for Gemini analysis.
- Test a successful analysis request with a valid key.
- Confirm the UI still shows findings and imported data after an analysis failure or temporary overload.

### Rollback plan

- Revert to the previous deployment if the API route fails or the environment secret is missing.
- Remove or disable the deployment if a production key is exposed or the app cannot handle AI errors safely.
- Keep a known-good build artifact available to restore the previous working version quickly.

Deployment verification is marked as pending until the project is actually deployed and tested in the target environment.

## Testing and coverage

The project currently uses the following test command:

```bash
npm.cmd test -- --run
```

This is the actual test command configured in the project and is the verification command used for the current build/test workflow.

Coverage is not currently configured in the existing project scripts, so no coverage percentage is claimed here. A coverage command is therefore not added unless the repository includes a supported coverage configuration.

## Accessibility / performance audit

### Pending results

The following checks are not yet completed and should be run before final public release claims:

- Lighthouse performance, accessibility, best-practices, and SEO review
- axe accessibility scan
- WAVE review for UI contrast, labels, and structure

No Lighthouse score, WCAG claim, or automated compliance result is claimed here without a real audit run. This section is intentionally marked as pending results.

## Reflection template

Use the prompts below as a short reflection section for the capstone record:

- Hardest challenge: What was the most difficult part of getting the secure AI analysis flow working reliably?
- What I would change next time: What would you simplify or improve in the architecture, validation, or deployment process?
- Surprising lesson: What did you learn that changed the way you think about secure AI integration or evidence handling?

## Project links

- Production URL: https://chain-proof-omega.vercel.app/
- GitHub repository: https://github.com/ASH-2030/ChainProof

These placeholders should be replaced with the final live URL and repository link when they are available.
