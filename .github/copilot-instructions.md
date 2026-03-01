# Copilot Instructions

This is a Next.js application deployed on Netlify, demonstrating platform primitives such as edge functions, blobs, image CDN, middleware, ISR/revalidation, and routing. Follow these guidelines when contributing.

## Tech Stack

- **Framework**: Next.js (App Router) with React Server Components and Client Components
- **Deployment**: Netlify (configured via `netlify.toml`)
- **Styling**: Tailwind CSS v4 (via PostCSS)
- **Storage**: Netlify Blobs (`@netlify/blobs`)
- **Language**: JavaScript (ESM, `"type": "module"`)

## Development Flow

- Install dependencies: `npm install`
- Start dev server: `npm run dev`
- Build: `npm run build`
- Lint: `npx next lint` (uses `eslint-config-next` / `next/core-web-vitals`)

There is no automated test suite in this repository. Validate changes by running the dev server (`npm run dev`) and exercising the relevant routes in a browser.

## Repository Structure

- `app/` – Next.js App Router pages and route handlers
  - `api/` – API route handlers
  - `blobs/` – Netlify Blobs demo pages
  - `classics/` – ISR/revalidation demo
  - `edge/` – Edge function / geolocation demo
  - `image-cdn/` – Image CDN demo
  - `middleware/` – Middleware demo
  - `quotes/` – Dynamic quote pages
  - `routing/` – Redirects & rewrites demo
  - `sniper/` – Trade-executor integration
- `components/` – Shared React components
- `lib/` – Shared utility modules
- `public/` – Static assets
- `styles/` – Global CSS
- `netlify/` – Netlify-specific configuration (e.g. edge function definitions)

## Code Standards

1. Use **ES Modules** syntax (`import`/`export`); avoid `require()`.
2. Follow **Next.js App Router** conventions: use `page.jsx`, `layout.jsx`, `route.js`, `loading.jsx`, and `error.jsx` file conventions.
3. Keep **server components** as the default; only add `"use client"` when interactivity or browser APIs are required.
4. Style with **Tailwind CSS** utility classes; avoid inline styles and separate CSS files unless extending `styles/globals.css`.
5. Format code consistently – the project uses Prettier (see `.prettierrc`).
6. Never commit secrets or real environment variable values. Use `.env.local` locally and the Netlify dashboard for production. Document any new variables in `.env.example` and in the `README.md` table.
7. Keep changes minimal and focused; prefer editing existing files over creating new ones.

## Environment Variables

Copy `.env.example` to `.env.local` for local development. See `README.md` for the full list of supported variables.
