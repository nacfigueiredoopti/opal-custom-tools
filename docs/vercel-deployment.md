# Deploying to Vercel

This guide walks you through deploying your Opal custom tools service to Vercel using the included configuration.

## One-Click Deploy

Deploy this project to Vercel with a single click:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fkunalshetye%2Fopal-custom-tools&project-name=opal-custom-tools&repository-name=opal-custom-tools)

## Prerequisites

- [Vercel CLI](https://vercel.com/cli) installed globally (`npm i -g vercel`)
- A Vercel account
- Dependencies installed (`yarn install`)
- Node.js 18+ for local development

## Quick Deployment

This project is pre-configured for Vercel deployment with the included `vercel.json` file and `vercel/index.ts` entry point.

### 1. Install Vercel CLI

```bash
npm i -g vercel
```

### 2. Login to Vercel

```bash
vercel login
```

### 3. Build and Deploy

```bash
yarn build
vercel
```

Follow the prompts to configure your project. For subsequent deployments:

```bash
vercel --prod
```

## Configuration Details

The project includes:

- **`vercel.json`** - Pre-configured with rewrites to route all requests to the Vercel function
- **`vercel/index.ts`** - Vercel serverless function entry point
- **Automatic build detection** - Vercel will use the `yarn build` command

## Environment Variables

Set environment variables in the Vercel dashboard or via CLI:

```bash
vercel env add PORT
vercel env add YOUR_CUSTOM_ENV_VAR
```

## Custom Domain

You can add a custom domain in the Vercel dashboard under your project settings.

## Considerations

- Vercel functions have a 10-second timeout limit for Hobby plans
- Cold starts may affect initial response times
- SQLite database will be read-only in serverless environment
- Static files from `public/` are served via Vercel's CDN