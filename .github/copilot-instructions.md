# Copilot Instructions

This is a Next.js 15 application deployed on Netlify. It demonstrates Netlify platform primitives including Edge Functions, Blobs storage, Image CDN, middleware, ISR/revalidation, and routing. Please follow these guidelines when contributing:

## Tech Stack

- **Framework**: Next.js 15 (App Router) with React 19
- **Deployment**: Netlify
- **Styling**: Tailwind CSS v4
- **Storage**: Netlify Blobs (`@netlify/blobs`)
- **Language**: JavaScript (ESM, `.jsx` for React components)

## Development Flow

- **Install**: `npm install`
- **Dev server**: `npm run dev`
- **Build**: `npm run build`
- **Lint**: `npx eslint .`

There are no automated tests in this repository. Validate changes by running the dev server and manually exercising the relevant feature.

## Repository Structure

- `app/` – Next.js App Router pages and layouts
  - `app/api/` – API Route Handlers
  - `app/blobs/` – Netlify Blobs demo
  - `app/edge/` – Edge Function demo
  - `app/image-cdn/` – Image CDN demo
  - `app/middleware/` – Middleware demo
  - `app/revalidation/` – ISR/revalidation demo
  - `app/routing/` – Redirects & rewrites demo
- `components/` – Shared React components
- `data/` – Static data files
- `lib/` – Utility/helper modules
- `netlify/` – Netlify-specific configuration (edge functions, etc.)
- `public/` – Static assets
- `styles/` – Global CSS

## Key Guidelines

1. Use the **Next.js App Router** patterns: server components by default, `"use client"` only when necessary.
2. Follow existing **ESM** conventions (`import`/`export`, no `require()`).
3. Use **Tailwind CSS** utility classes for styling; avoid inline styles.
4. Keep environment variables documented in `.env.example` and in the README's environment-variables table; never commit real secret values.
5. When adding new Netlify Blobs usage, import from `@netlify/blobs` and handle both local dev (using `netlify dev`) and deployed contexts.
6. Run `npx eslint .` before finishing to ensure there are no lint errors.
7. When modifying `app/` routes, verify the build succeeds with `npm run build`.
