# Workspace

## Overview

pnpm workspace monorepo using TypeScript. This project is an AI API proxy gateway that proxies requests to OpenAI and Anthropic models via Replit AI Integrations.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **AI Integrations**: OpenAI + Anthropic via Replit AI Integrations

## Artifacts

- **api-server**: Backend Express API server
  - Serves health check at `/api/healthz`
  - Proxy routes at `/v1/models`, `/v1/chat/completions`, `/v1/messages`
  - Uses `PROXY_API_KEY` for authentication
  - Uses `AI_INTEGRATIONS_OPENAI_BASE_URL/API_KEY` and `AI_INTEGRATIONS_ANTHROPIC_BASE_URL/API_KEY` for AI access
- **api-portal**: Frontend React+Vite web app (preview at `/`)
  - Shows available models, endpoints, and setup guide
  - CherryStudio setup instructions

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/api-portal run dev` — run frontend locally

## Environment Variables

- `PROXY_API_KEY` (production): Auto-generated random 64-char hex key for API authentication
- `AI_INTEGRATIONS_OPENAI_BASE_URL/API_KEY`: Auto-provisioned by Replit AI Integrations
- `AI_INTEGRATIONS_ANTHROPIC_BASE_URL/API_KEY`: Auto-provisioned by Replit AI Integrations

## Security

- The `PROXY_API_KEY` is set in the production environment only
- All proxy routes require Bearer token or x-api-key header authentication
- Keys are validated against the `PROXY_API_KEY` environment variable

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
