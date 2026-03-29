# Copilot Instructions

This is a Next.js application deployed on Netlify, demonstrating platform primitives such as edge functions, blobs, image CDN, middleware, and incremental static regeneration.

## Repository Structure

- `app/` – Next.js App Router pages and layouts (server and client components)
  - `api/` – API route handlers
  - `blobs/` – Netlify Blobs storage examples
  - `classics/` – Static content examples
  - `edge/` – Edge function examples with geolocation-aware rendering
  - `image-cdn/` – Image CDN optimization examples
  - `middleware/` – Security headers and request routing
  - `quotes/` – Quote generation examples
  - `revalidation/` – ISR and on-demand revalidation examples
  - `routing/` – Redirect and rewrite examples
  - `sniper/` – Trade executor integration
- `components/` – Shared React components
- `data/` – Static data files
- `lib/` – Feature-specific library modules (e.g. `lib/sniper/` for trade-bot logic)
- `netlify/` – Netlify-specific configuration and edge functions
- `public/` – Static assets
- `styles/` – Global CSS (Tailwind CSS)
- `utils.js` – Shared utility functions

## Development Flow

- **Install dependencies:** `npm install`
- **Start dev server:** `npm run dev`
- **Build for production:** `npm run build`
- **Start production server:** `npm start`
- **Lint:** `npx next lint`

## Code Standards

- Use **Next.js App Router** conventions (server components by default; add `'use client'` only when necessary)
- Style with **Tailwind CSS** utility classes; avoid writing custom CSS unless required
- Format code with **Prettier** (config in `.prettierrc`): `printWidth: 120`, `singleQuote: true`, `trailingComma: none`, `tabWidth: 4`
- Lint with **ESLint** (`next/core-web-vitals` ruleset); run `npx next lint` before committing
- Use **JSX** (`.jsx`) for React component files
- Keep components small and focused; extract generic cross-cutting helpers into `utils.js` and feature-specific modules into `lib/<feature>/`
- Never commit secrets or real environment variable values; use `.env.local` locally (git-ignored) and the Netlify dashboard for production

## Environment Variables

Copy `.env.example` to `.env.local` for local development. Key variables:

| Variable | Description |
|---|---|
| `CONTEXT` | Netlify deployment context (set automatically by Netlify) |
| `NETLIFY_DEV` | Set to `true` by Netlify CLI; do not set manually |
| `NEXT_PUBLIC_DISABLE_UPLOADS` | Set `true` to disable blob upload UI |
| `TRADE_EXECUTOR_URL` | Base URL of the external trade-executor service |

## Key Guidelines

1. Prefer server components over client components to reduce client-side JavaScript
2. Use Netlify Blobs (`@netlify/blobs`) for persistent key-value storage needs
3. Place edge-specific logic under `netlify/` or in `app/edge/` route segments
4. Follow existing file and folder naming conventions (kebab-case for routes, PascalCase for components)
5. Write descriptive commit messages summarizing *what* changed and *why*
