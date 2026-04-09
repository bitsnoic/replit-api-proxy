# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

This project is an AI API proxy server that exposes OpenAI-compatible endpoints and routes to either OpenAI or Anthropic behind the scenes. It uses Replit AI Integrations (no personal API keys required).

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
- **AI SDKs**: openai, @anthropic-ai/sdk (via Replit AI Integrations)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Proxy Endpoints

All proxy endpoints are mounted at `/v1` and require a `Bearer <PROXY_API_KEY>` or `x-api-key: <PROXY_API_KEY>` header.

| Method | Path | Description |
|--------|------|-------------|
| GET    | /v1/models | List all available models |
| POST   | /v1/chat/completions | OpenAI-compatible chat completions (supports OpenAI + Anthropic models) |
| POST   | /v1/messages | Anthropic-native messages endpoint |

### Supported Models

**OpenAI:** `gpt-5.2`, `gpt-5-mini`, `gpt-5-nano`, `o4-mini`, `o3`

**Anthropic:** `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5`

## Required Environment Variables / Secrets

| Variable | Description |
|----------|-------------|
| `PROXY_API_KEY` | Secret key clients must send to authenticate |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | Auto-set by Replit AI Integrations |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | Auto-set by Replit AI Integrations |
| `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` | Auto-set by Replit AI Integrations |
| `AI_INTEGRATIONS_ANTHROPIC_API_KEY` | Auto-set by Replit AI Integrations |

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
