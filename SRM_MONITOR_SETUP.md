# SRM Monitor Agent Setup Guide

## Overview

This guide will help you set up an automated Optimizely Opal agent that monitors your experiments for Sample Ratio Mismatch (SRM) issues and sends email alerts when traffic imbalances are detected.

### What is Sample Ratio Mismatch (SRM)?

SRM occurs when the actual traffic distribution across experiment variations differs significantly from the expected distribution. This can indicate:
- Implementation bugs in experiment code
- Bot traffic or data quality issues
- Sampling bias that invalidates experiment results
- Technical problems with the experimentation platform

Optimizely's automatic SRM detection uses sequential Bayesian multinomial testing to identify these issues early, before they compromise your experiment data.

## Project Information

- **Optimizely Project ID**: 5268668553101312
- **API Token**: 2:pzagrkVVbeQJk1vxgAUWuahBtLlnvrjIq4qDixz-3MhyNC6rSJtk
- **Alert Recipient**: nuno.figueiredo@optimizely.com
- **Tools Hosted On**: Netlify (https://famous-kitsune-040201.netlify.app)

## New Tools Created

### 1. SRM Detector (`srm-detector`)

**Location**: `src/tools/srm-detector.ts`

**Purpose**: Detects Sample Ratio Mismatch issues by analyzing traffic distribution across experiment variations.

**Features**:
- Fetches all running experiments or specific experiment IDs
- Calculates chi-squared statistical test for traffic balance
- Returns health status: `good`, `warning`, `critical`, or `unknown`
- Provides detailed variation-level traffic data
- Identifies experiments needing attention with p-value < 0.05

**Parameters**:
- `projectId` (required): Your Optimizely project ID
- `optimizelyApiToken` (required): API token with read access
- `experimentIds` (optional): Comma-separated experiment IDs or "all" (default)

**Example Response**:
```json
{
  "projectId": "5268668553101312",
  "timestamp": "2025-10-29T10:30:00Z",
  "experimentsChecked": 5,
  "experimentsWithIssues": 2,
  "summary": "⚠️ Found 2 experiment(s) with traffic imbalance issues",
  "experiments": [
    {
      "experimentId": "12345",
      "experimentName": "Homepage Hero Test",
      "status": "running",
      "healthStatus": "critical",
      "hasSRM": true,
      "chiSquaredPValue": 0.008,
      "message": "Critical traffic imbalance detected (p-value: 0.0080)",
      "variations": [
        {
          "id": "control",
          "name": "Original",
          "visitorCount": 5500,
          "expectedAllocation": 50,
          "actualAllocation": 55.2
        },
        {
          "id": "variant",
          "name": "New Design",
          "visitorCount": 4500,
          "expectedAllocation": 50,
          "actualAllocation": 44.8
        }
      ]
    }
  ]
}
```

### 2. Email Alert (`email-alert`)

**Location**: `src/tools/email-alert.ts`

**Purpose**: Sends formatted email alerts for critical experiment issues.

**Features**:
- Beautiful HTML email formatting with gradients and styling
- Multiple provider support: SendGrid, Mailgun, Resend, or custom webhook
- Automatic timestamp inclusion
- Error handling and validation

**Parameters**:
- `to` (required): Recipient email address
- `subject` (required): Email subject line
- `message` (required): Email body (plain text, auto-formatted to HTML)
- `emailService` (optional): Provider type - "sendgrid", "mailgun", "resend", or "webhook" (default)
- `apiKey` (optional): API key for email provider
- `webhookUrl` (optional): Webhook URL for custom email handling

## Deployment Steps

### Step 1: Update Your Repository

Copy the new tools to your repository:

```bash
# Navigate to your repository
cd ~/opal-custom-tools

# Copy the new tool files
cp /path/to/src/tools/srm-detector.ts src/tools/
cp /path/to/src/tools/email-alert.ts src/tools/

# Update main.ts to import the new tools (already done in this setup)

# Commit the changes
git add .
git commit -m "Add SRM detector and email alert tools for automated monitoring"
git push origin main
```

### Step 2: Deploy to Netlify

Your tools are hosted on Netlify, which will automatically deploy when you push to main:

1. Push your changes to GitHub (done in Step 1)
2. Netlify will auto-deploy from the main branch
3. Wait for the deployment to complete (~2-3 minutes)
4. Verify at: https://famous-kitsune-040201.netlify.app

**Verify the tools are available**:
```bash
# Check the discovery endpoint
curl https://famous-kitsune-040201.netlify.app/.netlify/functions/server/discovery \
  -u admin:password
```

You should see both `srm-detector` and `email-alert` in the tools list.

### Step 3: Set Up Email Service

Choose one of the following email delivery methods:

#### Option A: Webhook (Recommended for testing)

Create a simple webhook receiver (e.g., using Zapier, Make.com, or n8n):

1. Create a webhook endpoint that receives POST requests
2. Configure it to send emails via your email service
3. Use the webhook URL in the agent configuration

**Example webhook payload**:
```json
{
  "to": "nuno.figueiredo@optimizely.com",
  "subject": "🚨 SRM Alert",
  "message": "Plain text message",
  "html": "<html>Formatted HTML</html>",
  "timestamp": "2025-10-29T10:30:00Z"
}
```

#### Option B: SendGrid

1. Sign up at https://sendgrid.com
2. Create an API key with "Mail Send" permissions
3. Update the agent configuration with your API key
4. Verify sender email address in SendGrid

#### Option C: Resend (Modern alternative)

1. Sign up at https://resend.com
2. Create an API key
3. Update the agent configuration
4. Configure sender domain

#### Option D: Mailgun

1. Sign up at https://mailgun.com
2. Get API key and configure domain
3. Set `MAILGUN_DOMAIN` environment variable
4. Update agent with API key

### Step 4: Create the Opal Agent

1. **Log into Optimizely Opal**:
   - Go to https://home.optimizely.com
   - Select your organization
   - Navigate to Opal → Agents

2. **Create New Agent**:
   - Click "Add Agent" → "Specialized Agent"
   - Name: "SRM Monitor"
   - ID: "@srm-monitor"
   - Click "Import from JSON"

3. **Paste Agent Configuration**:

Use the JSON from `opal-agent-srm-monitor.json`, but update these fields:

```json
{
  "workflow": {
    "steps": [
      {
        "step": 3,
        "parameters": {
          "webhookUrl": "YOUR_ACTUAL_WEBHOOK_URL"
        }
      }
    ]
  }
}
```

**Important**: Replace `YOUR_WEBHOOK_URL_HERE` with your actual webhook endpoint URL.

4. **Configure Tools**:
   - Verify both tools are registered
   - Endpoint: `https://famous-kitsune-040201.netlify.app/.netlify/functions/server/tools/{tool-name}`
   - Authentication: Basic Auth (username: `admin`, password: `password`)

5. **Set Schedule**:
   - Trigger Type: Scheduled
   - Schedule: `0 */6 * * *` (every 6 hours)
   - Or customize to your preferred frequency

### Step 5: Test the Agent

**Manual Test**:

1. In Opal, click on your SRM Monitor agent
2. Click "Run Now" or "Test"
3. Monitor the execution log
4. Verify that:
   - SRM detector runs successfully
   - Experiments are checked
   - Email is sent if issues are found

**Test the Tools Directly**:

```bash
# Test SRM Detector
curl -X POST https://famous-kitsune-040201.netlify.app/.netlify/functions/server/tools/srm-detector \
  -u admin:password \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "5268668553101312",
    "optimizelyApiToken": "2:pzagrkVVbeQJk1vxgAUWuahBtLlnvrjIq4qDixz-3MhyNC6rSJtk",
    "experimentIds": "all"
  }'

# Test Email Alert
curl -X POST https://famous-kitsune-040201.netlify.app/.netlify/functions/server/tools/email-alert \
  -u admin:password \
  -H "Content-Type: application/json" \
  -d '{
    "to": "nuno.figueiredo@optimizely.com",
    "subject": "Test Alert",
    "message": "This is a test alert from the SRM monitoring system",
    "emailService": "webhook",
    "webhookUrl": "YOUR_WEBHOOK_URL"
  }'
```

## Agent Behavior

The SRM Monitor agent will:

1. **Every 6 hours** (or your configured schedule):
   - Check all running experiments in project 5268668553101312
   - Analyze traffic distribution using chi-squared test
   - Identify experiments with p-value < 0.05

2. **When issues are detected**:
   - Compose detailed email with:
     - Experiment names and IDs
     - Health status (warning/critical)
     - Actual vs expected traffic splits
     - Statistical significance (p-value)
     - Recommended actions
   - Send alert to nuno.figueiredo@optimizely.com

3. **When all experiments are healthy**:
   - No email sent (silent monitoring)
   - Logs results for audit trail

## Monitoring and Maintenance

### View Agent Logs

1. Go to Opal → Agents → SRM Monitor
2. Click "Execution History"
3. Review recent runs and any errors

### Update Agent Configuration

To modify the agent:

1. Export current configuration as JSON
2. Make your changes
3. Re-import the updated JSON

### Common Adjustments

**Change monitoring frequency**:
```json
{
  "trigger": {
    "schedule": "0 */3 * * *"  // Every 3 hours
  }
}
```

**Monitor specific experiments only**:
```json
{
  "workflow": {
    "steps": [
      {
        "parameters": {
          "experimentIds": "12345,67890,11111"
        }
      }
    ]
  }
}
```

**Add additional recipients**:
Modify the email-alert tool call to send to multiple addresses (requires webhook that handles multiple recipients, or call the tool multiple times).

## Troubleshooting

### Tool Not Found

**Issue**: Agent can't find the srm-detector or email-alert tools

**Solution**:
1. Verify Netlify deployment succeeded
2. Check the discovery endpoint
3. Ensure tool endpoints are correct in agent config

### Authentication Errors

**Issue**: 401 Unauthorized when calling tools

**Solution**:
- Verify Basic Auth credentials (admin:password)
- Check that auth is configured in agent tool definitions

### No Emails Being Sent

**Issue**: Agent runs but emails don't arrive

**Solution**:
1. Check webhook URL is correct and accessible
2. Verify webhook receiver is working
3. Test email-alert tool directly with curl
4. Check spam folder

### API Token Issues

**Issue**: Can't fetch experiments from Optimizely

**Solution**:
1. Verify API token has correct permissions
2. Check token hasn't expired
3. Ensure project ID is correct

### SRM False Positives

**Issue**: Too many SRM alerts for experiments that seem fine

**Solution**:
1. Adjust p-value threshold in srm-detector.ts
2. Increase minimum visitor threshold (currently 1000)
3. Add filters for specific experiment types

## Security Considerations

1. **API Token Storage**: Your Optimizely API token is stored in the agent configuration. Consider using Opal's secret management features if available.

2. **Basic Auth**: The tools use basic authentication (admin:password). For production, consider:
   - Changing the default password in `src/main.ts`
   - Using environment variables for credentials
   - Implementing token-based auth

3. **Email Webhook**: If using a webhook for email, ensure it:
   - Uses HTTPS
   - Validates incoming requests
   - Has rate limiting

## Advanced Configuration

### Custom SRM Thresholds

Edit `src/tools/srm-detector.ts` to adjust sensitivity:

```typescript
// Change these values in the calculateChiSquared function
if (chiSquaredPValue < 0.01) {
  healthStatus = "critical";  // Change from 0.01 to 0.005 for stricter detection
} else if (chiSquaredPValue < 0.05) {
  healthStatus = "warning";  // Change from 0.05 to 0.1 for more sensitive warnings
}
```

### Email Template Customization

Edit `src/tools/email-alert.ts` in the `formatEmailHTML` function to customize the email design, colors, and layout.

### Multiple Projects

To monitor multiple Optimizely projects:

1. Duplicate the agent configuration
2. Change the project ID and token
3. Create separate agents for each project
4. Or modify the tool to accept multiple projects in one call

## Support and Resources

- **Optimizely SRM Documentation**: https://support.optimizely.com/hc/en-us/articles/13409080412173
- **Opal Documentation**: https://support.optimizely.com/hc/en-us/articles/36354416686477
- **GitHub Repository**: https://github.com/nacfigueiredoopti/opal-custom-tools
- **Netlify Dashboard**: https://app.netlify.com/projects/famous-kitsune-040201

## Next Steps

1. ✅ Deploy the new tools to Netlify
2. ✅ Set up your email delivery method
3. ✅ Create the Opal agent
4. ✅ Run a test to verify everything works
5. ✅ Monitor for the first few runs
6. 🎉 Enjoy automated SRM monitoring!

---

**Questions?** Contact Nuno Figueiredo at nuno.figueiredo@optimizely.com
