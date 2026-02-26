# Netlify Platform Starter – Next.js

A modern starter template for building and deploying Next.js applications on Netlify. Includes examples of platform primitives like edge functions, blobs, image CDN, and more.

## Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/mattdiodato0708/next-platform-starter-1add4.git
   cd next-platform-starter-1add4
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

## Features

- **Next.js App Router** with server and client components
- **Netlify Blobs** for persistent storage with a blob shape generator
- **Image CDN** examples with automatic optimization
- **Edge Functions** with geolocation-aware rendering
- **Middleware** with security headers and request routing
- **ISR & Revalidation** with on-demand and time-based strategies
- **Redirects & Rewrites** configured in `next.config.js`

## Environment Variables

This project uses the following environment variables. Copy `.env.example` to `.env.local` for local development (`.env.local` is already git-ignored so secrets stay off of version control):

```bash
cp .env.example .env.local
```

| Variable | Required | Description |
|---|---|---|
| `CONTEXT` | No | Netlify deployment context (`production`, `deploy-preview`, `branch-deploy`, `dev`). Set automatically by Netlify; override locally if needed. |
| `NETLIFY_DEV` | No | Set to `true` automatically by the `netlify dev` CLI. Do not set manually. |
| `NEXT_PUBLIC_DISABLE_UPLOADS` | No | Set to `true` to disable the blob upload feature in the UI. |
| `TRADE_EXECUTOR_URL` | No | Base URL of the external trade-executor service (e.g. `https://trade-executer--mdobby070811.replit.app`). |

### Setting variables on Netlify

1. Go to your site in the [Netlify dashboard](https://app.netlify.com).
2. Navigate to **Site Settings → Environment variables**.
3. Click **Add a variable** and enter the key and value for each secret.
4. Redeploy the site for the changes to take effect.

> ⚠️ **Never commit real secret values to source code.** Use `.env.local` locally (it is git-ignored) and the Netlify dashboard for production secrets.

## Deployment

Deploy directly to Netlify. The `netlify.toml` file is pre-configured with the correct build settings.

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/mattdiodato0708/next-platform-starter-1add4)

### Deploy to Replit

1. Click **Import from GitHub** on [Replit](https://replit.com)
2. Paste the repo URL
3. It auto-detects the `.replit` config
4. Add your exchange API keys as Replit Secrets (environment variables)
5. Hit **Run**

### Deploy to Railway

1. Connect your GitHub repo at [railway.app](https://railway.app)
2. Railway auto-detects `railway.toml`
3. Add environment variables in the Railway dashboard
4. Deploys automatically on every push to `main`

### Deploy to Render

1. Create a new **Background Worker** on [render.com](https://render.com)
2. Connect the GitHub repo
3. Render uses `render.yaml` for config
4. Add secrets in the Render dashboard

### Deploy with Docker

```bash
docker build -t crypto-arb-bot .
docker run -d --name arb-bot \
  -e CONFIG_PATH=config.json \
  crypto-arb-bot
```

### GitHub Actions

- CI runs automatically on every push and pull request
- Validates that the config loads correctly
- Compiles all Python files
- Builds the Docker image on the `main` branch
