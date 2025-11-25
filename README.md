# opal-custom-tools

A custom tools service for Optimizely Opal that exposes tools via HTTP endpoints using the `@optimizely-opal/opal-tools-sdk`.

## Featured Agents

### Competitive Intelligence Monitor
An automated agent that monitors competitor websites, detects strategic changes, and generates actionable intelligence reports. See [COMPETITIVE_INTELLIGENCE_SETUP.md](COMPETITIVE_INTELLIGENCE_SETUP.md) for setup instructions.

**What it does:**
- Automatically scrapes competitor websites daily
- Detects new features, pricing changes, UI updates, and messaging shifts
- Compares competitor moves with your Optimizely experiments
- Generates prioritized strategic insights and recommendations
- Sends formatted reports to Slack

### SRM Monitor
An automated monitoring agent that detects Sample Ratio Mismatch (SRM) issues in Optimizely experiments. See [SRM_MONITOR_SETUP.md](SRM_MONITOR_SETUP.md) for setup instructions.

## Getting Started

### Prerequisites
- Node.js 18+
- Yarn 4.3.1

### Installation
```bash
yarn install
```

### Development
```bash
# Run in development mode with hot reload
yarn dev

# Build the project
yarn build

# Run the compiled application
yarn start
```

The server will start on port 3000 (or the PORT environment variable) and expose:
- Tools endpoints for each registered tool
- Discovery endpoint at `/discovery`

## Available Tools

### greeting
Greets a person in a random language (English, Spanish, French).

**Parameters:**
- `name` (required): Name of the person to greet
- `language` (optional): Language for greeting (defaults to random)

### todays-date
Returns today's date in the specified format.

**Parameters:**
- `format` (optional): Date format (defaults to ISO format)

### api_call
HTTP client wrapper supporting various HTTP methods with custom headers.

**Parameters:**
- `url` (required): The URL to make the request to
- `method` (optional): HTTP method (GET, POST, PUT, PATCH, DELETE). Defaults to GET
- `headers` (optional): Custom headers as JSON string
- `body` (optional): Request body (for POST, PUT, PATCH methods)

### rick-roll
Returns a Rick Roll GIF URL for fun interactions.

**Parameters:**
- No parameters required

### experiment-duration-estimator
Estimates how long an A/B test experiment needs to run based on traffic, conversion rates, and desired statistical parameters.

**Parameters:**
- `dailyTraffic` (required): Average daily traffic (total visitors/users per day)
- `baselineConversionRate` (required): Baseline conversion rate as decimal (e.g., 0.05 for 5%)
- `minimumDetectableEffect` (required): Minimum detectable effect (relative lift) as decimal (e.g., 0.1 for 10% relative improvement)
- `statisticalPower` (optional): Statistical power (1 - β) as decimal. Defaults to 0.8 (80%)
- `significanceLevel` (optional): Significance level (α) as decimal. Defaults to 0.05 (5%)
- `numberOfVariants` (optional): Total number of variants including control. Defaults to 2

### metric-variance-analyzer
Analyzes metric variance and stability over time to determine if a metric is suitable for A/B testing. Calculates statistical measures, detects outliers, and provides stability scoring.

**Parameters:**
- `metricValues` (required): JSON array of metric values collected over time (e.g., "[10.2, 11.5, 10.8]")
- `metricName` (optional): Name of the metric being analyzed (e.g., "Conversion Rate")
- `expectedMean` (optional): Expected mean value for comparison
- `confidenceLevel` (optional): Confidence level for analysis (0-1). Defaults to 0.95

### experiment-overlap-checker
Analyzes potential conflicts and audience overlap when running multiple experiments simultaneously. Detects metric conflicts, page conflicts, targeting overlaps, and provides risk assessment.

**Parameters:**
- `experiments` (required): JSON array of experiment definitions with id, name, audienceSize, trafficAllocation, and optional fields (primaryMetric, affectedPages, targetingRules)
- `totalAudienceSize` (optional): Total available audience size for utilization calculation
- `overlapTolerance` (optional): Acceptable overlap percentage (0-100). Defaults to 20

### experiment-lookup
Looks up detailed information about a specific experiment by ID. Returns configuration, status, metrics, targeting rules, and variations.

**Parameters:**
- `experimentId` (required): The unique experiment ID (e.g., "exp-123" or "checkout-button-test")
- `optimizelyApiKey` (optional): Optimizely API key for fetching live data

### experiment-catalog
Provides a comprehensive overview of all experiments with filtering, grouping, and conflict detection. Get a bird's-eye view of your entire experimentation program.

**Parameters:**
- `status` (optional): Filter by status - "live"/"running", "paused", "draft", "archived", or "all" (default)
- `metric` (optional): Filter by primary metric (e.g., "conversion")
- `page` (optional): Filter by affected page (e.g., "checkout")
- `targetingRule` (optional): Filter by targeting rule (e.g., "Mobile users")
- `optimizelyApiKey` (optional): Optimizely API key for fetching live data

### sqlite-query
Executes SQL queries against a SQLite database.

**Parameters:**
- `query` (required): SQL query to execute
- `params` (optional): Query parameters for prepared statements

### srm-detector
Detects Sample Ratio Mismatch (SRM) issues in Optimizely experiments by analyzing traffic distribution across variations. Uses chi-squared statistical test to identify significant imbalances.

**Parameters:**
- `projectId` (required): The Optimizely project ID to check for SRM issues
- `optimizelyApiToken` (required): Optimizely API token with read access to experiments and stats
- `experimentIds` (optional): Comma-separated list of experiment IDs, or "all" to check all running experiments (default: "all")

### email-alert
Sends email alerts for critical experiment issues and monitoring events.

**Parameters:**
- `to` (required): Email address to send the alert to
- `subject` (required): Email subject line
- `message` (required): Email body content
- `emailService` (optional): Email service to use (e.g., "webhook")
- `webhookUrl` (optional): Webhook URL for email delivery

## Competitive Intelligence Tools

### competitor-scraper
Scrapes competitor websites and detects changes from previous snapshots. Captures page content, headings, links, and can optionally compare with previous visits.

**Parameters:**
- `competitors` (required): Array of competitor configurations with name, url, and pages_to_monitor
- `screenshotEnabled` (optional): Whether to capture screenshots of pages. Defaults to false
- `compareWithPrevious` (optional): Whether to compare with previously stored snapshots. Defaults to false
- `storageKey` (optional): Storage key for saving/loading snapshots. Defaults to 'competitor_snapshots'

### feature-diff-analyzer
Analyzes competitor website snapshots to identify and categorize changes including new features, pricing updates, UI/UX changes, and messaging shifts.

**Parameters:**
- `scrapeResults` (required): Results from the competitor-scraper tool
- `changeThreshold` (optional): Sensitivity threshold: 'low', 'medium', or 'high'. Defaults to 'medium'
- `detectFeatures` (optional): Whether to detect new features. Defaults to true
- `detectPricing` (optional): Whether to detect pricing changes. Defaults to true
- `detectUI` (optional): Whether to detect UI/UX changes. Defaults to true
- `detectMessaging` (optional): Whether to detect messaging changes. Defaults to true

### insight-generator
Generates strategic competitive intelligence insights by analyzing competitor changes in context of your Optimizely experiments. Identifies threats, opportunities, market trends, and provides actionable recommendations.

**Parameters:**
- `competitorChanges` (required): Array of competitor analysis results from feature-diff-analyzer
- `ourExperiments` (optional): Array of Optimizely events/experiments representing your product activities
- `analysisDepth` (optional): Analysis depth: 'quick', 'standard', or 'deep'. Defaults to 'standard'
- `includeRecommendations` (optional): Whether to include actionable recommendations. Defaults to true
- `focusAreas` (optional): Array of focus areas to emphasize (e.g., ['pricing', 'features', 'ux'])

### slack-notifier
Sends formatted notifications and reports to Slack channels. Supports rich formatting with Slack blocks, priority indicators, and markdown conversion.

**Parameters:**
- `channel` (required): Slack channel to send the message to (e.g., '#competitive-intelligence')
- `message` (required): Message content (plain text or markdown)
- `webhookUrl` (optional): Slack webhook URL for sending messages
- `priority` (optional): Message priority: 'critical', 'high', 'medium', or 'low'. Defaults to 'medium'
- `attachScreenshots` (optional): Whether to attach screenshots. Defaults to false
- `screenshots` (optional): Array of screenshot URLs or base64 data
- `formatAsBlocks` (optional): Whether to use Slack blocks for rich formatting. Defaults to true

## Architecture

This service uses Express.js with CORS enabled to serve tools. Each tool is implemented as a separate module in the `src/tools/` directory and registered using the `@tool` decorator pattern from the Opal tools SDK.

The application is designed to work in both traditional server environments and serverless platforms (Vercel, Netlify) with automatic environment detection.

### Project Structure
```
src/
  main.ts          # Main application entry point (exports app for serverless)
  tools/           # Individual tool implementations
    greeting.ts
    todays-date.ts
    api-call.ts
    rick-roll.ts
    experiment-duration-estimator.ts
    experiment-lookup.ts
    experiment-overlap-checker.ts
    experiment-catalog.ts
    metric-variance-analyzer.ts
    sqlite-query.ts
    srm-detector.ts
    email-alert.ts
    # Competitive Intelligence Tools
    competitor-scraper.ts
    feature-diff-analyzer.ts
    insight-generator.ts
    slack-notifier.ts
vercel/
  index.ts         # Vercel serverless function entry point
netlify/
  functions/
    api.ts         # Netlify Functions entry point
build/             # Compiled JavaScript output
docs/              # Deployment documentation
opal-agent-competitive-intelligence.json  # Competitive Intelligence agent config
COMPETITIVE_INTELLIGENCE_SETUP.md         # Setup guide for CI agent
```

### Adding New Tools

1. Create a new file in `src/tools/` directory
2. Define TypeScript interfaces for tool parameters
3. Implement async function with typed parameters
4. Register tool using `tool()` decorator with parameter definitions
5. Import the tool file in `src/main.ts`

## Technology Stack

- **Runtime**: Node.js
- **Language**: TypeScript (ES2022, NodeNext modules)
- **Framework**: Express.js
- **Package Manager**: Yarn 4.3.1
- **SDK**: @optimizely-opal/opal-tools-sdk
- **Development**: tsc-watch for hot reload
- **Serverless**: serverless-http wrapper for Netlify Functions
- **Database**: SQLite3 for local data storage

## Deployment

Ready to deploy your custom tools service? Choose your preferred platform:

### Quick Deploy

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/kunalshetye/opal-custom-tools)

### Deployment Guides

- [Deploy to Vercel](docs/vercel-deployment.md) - ⚠️ Currently not working due to Express middleware compatibility issues
- [Deploy to Netlify](docs/netlify-deployment.md) - ✅ Working - JAMstack deployment with edge functions

# GIPHY Reference
```sh
https://giphy.com/gifs/rick-astley-Ju7l5y9osyymQ
```