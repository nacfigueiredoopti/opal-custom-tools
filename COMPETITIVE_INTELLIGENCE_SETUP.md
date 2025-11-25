# Competitive Intelligence Monitor - Setup Guide

## Overview

The Competitive Intelligence Monitor is an automated agent that monitors competitor websites, detects changes, analyzes their strategic implications, and sends actionable intelligence reports to your team via Slack.

## What It Does

1. **Daily Website Monitoring**: Automatically scrapes configured competitor websites
2. **Change Detection**: Identifies new features, pricing changes, UI updates, and messaging shifts
3. **Strategic Analysis**: Compares competitor moves with your Optimizely experiments
4. **Actionable Insights**: Generates prioritized recommendations for product, pricing, and GTM teams
5. **Automated Reporting**: Sends formatted intelligence reports to Slack

## Architecture

```
┌─────────────────────┐
│  Agent Scheduler    │ (Runs daily at midnight)
└──────────┬──────────┘
           │
           v
┌─────────────────────┐
│ competitor-scraper  │ Scrapes competitor websites
└──────────┬──────────┘
           │
           v
┌─────────────────────┐
│ feature-diff-       │ Analyzes changes (features, pricing, UI)
│ analyzer            │
└──────────┬──────────┘
           │
           v
┌─────────────────────┐
│ oa_find_events      │ Fetches your Optimizely experiments
└──────────┬──────────┘
           │
           v
┌─────────────────────┐
│ insight-generator   │ Generates strategic insights & recommendations
└──────────┬──────────┘
           │
           v
┌─────────────────────┐
│ slack-notifier      │ Sends report to Slack
└─────────────────────┘
```

## Files Created

- `opal-agent-competitive-intelligence.json` - Agent configuration
- `competitor-scraper.ts` - Website scraping tool
- `feature-diff-analyzer.ts` - Change analysis tool
- `insight-generator.ts` - Strategic insight generation tool
- `slack-notifier.ts` - Slack notification tool

## Setup Instructions

### 1. Configure Competitors

Edit [opal-agent-competitive-intelligence.json](opal-agent-competitive-intelligence.json) and update the `competitors` section:

```json
"competitors": [
  {
    "name": "Competitor A",
    "url": "https://www.competitor-a.com",
    "pages_to_monitor": [
      "/",
      "/pricing",
      "/features",
      "/product"
    ]
  },
  {
    "name": "Competitor B",
    "url": "https://www.competitor-b.com",
    "pages_to_monitor": [
      "/",
      "/pricing",
      "/features"
    ]
  }
]
```

**Tips:**
- Add 3-5 key competitors
- Monitor homepage, pricing, features, and product pages
- Include pages where they announce new features

### 2. Set Up Slack Webhook

1. Go to your Slack workspace settings
2. Create a new Incoming Webhook for the channel you want to receive alerts
3. Copy the webhook URL
4. Update the `slack-notifier` tool parameters in the agent config:

```json
{
  "step": 5,
  "action": "send_report",
  "tool": "slack-notifier",
  "parameters": {
    "channel": "#competitive-intelligence",
    "webhookUrl": "YOUR_SLACK_WEBHOOK_URL_HERE"
  }
}
```

### 3. Configure Optimizely Analytics

Update the agent config with your Optimizely project details:

```json
"metadata": {
  "project_id": "YOUR_OPTIMIZELY_PROJECT_ID"
}
```

The agent will automatically use the Optimizely Analytics tools (`oa_find_events`, `oa_find_entities`) to fetch your experiments.

### 4. Adjust Schedule

The default schedule runs daily at midnight:

```json
"trigger": {
  "type": "scheduled",
  "schedule": "0 0 * * *"
}
```

Cron format: `minute hour day month weekday`

Examples:
- `0 0 * * *` - Daily at midnight
- `0 */12 * * *` - Every 12 hours
- `0 9 * * 1` - Every Monday at 9am
- `0 0 * * 1,4` - Monday and Thursday at midnight

### 5. Deploy Tools

The tools need to be deployed to your Opal Tools server. Based on your existing setup, they should be deployed to:

```
https://famous-kitsune-040201.netlify.app/.netlify/functions/server/tools/
```

Each tool file (`competitor-scraper.ts`, etc.) needs to be:
1. Compiled to JavaScript
2. Deployed to the tools endpoint
3. Configured with proper authentication

### 6. Test the Agent

Before running on schedule, test manually:

```bash
# Test competitor scraping
curl -X POST https://famous-kitsune-040201.netlify.app/.netlify/functions/server/tools/competitor-scraper \
  -u admin:password \
  -H "Content-Type: application/json" \
  -d '{
    "competitors": [...],
    "screenshotEnabled": false
  }'

# Test the full agent workflow
opal-agent run @competitive-intelligence
```

## Understanding the Output

### Priority Levels

- **CRITICAL**: Major feature launches or pricing changes that require immediate attention
- **HIGH**: Significant updates that should be reviewed within 24 hours
- **MEDIUM**: Notable changes worth monitoring
- **LOW**: Minor updates or no significant changes

### Report Structure

1. **Executive Summary**: High-level overview of what was detected
2. **Priority Actions**: Top 3-5 actions to take immediately
3. **Strategic Insights**: Detailed analysis with reasoning and recommendations
4. **Competitive Positioning**: How we compare (ahead/behind/at parity)
5. **Market Trends**: Patterns across multiple competitors

### Insight Categories

- **Competitive Threat**: Competitor launched something we don't have
- **Validation**: Competitor is building what we're already working on
- **Opportunity**: Gap we could exploit
- **Warning**: Pricing or positioning changes
- **Learning**: General observations and patterns

## Example Intelligence Report

```markdown
# 🎯 Competitive Intelligence Report

## Executive Summary
Monitored 2 competitor(s) and detected 5 total change(s).
🚨 1 critical insight(s) requiring immediate attention.
Active competitors: Competitor A

## 🎬 Priority Actions
1. Review competitor's new AI features and assess if we should add similar capabilities
2. Analyze pricing changes impact on our competitive positioning
3. Update competitive battle cards with new information

## 💡 Strategic Insights

### 🚨 Competitor A introduces AI-Powered Analytics
**Category:** competitive_threat | **Urgency:** immediate

Competitor has launched a new feature that we don't currently have.

**Analysis:**
- Competitor A announced: New AI feature for predictive analytics
- We have no related experiments or features in development
- This could be a competitive gap affecting our market position

**Recommended Actions:**
- [ ] Assess customer demand for this capability
- [ ] Evaluate technical feasibility and effort required
- [ ] Determine if this should be added to roadmap
- [ ] Update competitive battle cards
```

## Configuration Options

### Change Detection Sensitivity

In [opal-agent-competitive-intelligence.json](opal-agent-competitive-intelligence.json), adjust the `feature-diff-analyzer` parameters:

```json
{
  "changeThreshold": "medium",  // "low", "medium", or "high"
  "detectFeatures": true,
  "detectPricing": true,
  "detectUI": true,
  "detectMessaging": true
}
```

### Analysis Depth

Adjust the `insight-generator` parameters:

```json
{
  "analysisDepth": "deep",  // "quick", "standard", or "deep"
  "includeRecommendations": true
}
```

## Best Practices

### Competitor Selection
- Monitor 3-5 direct competitors
- Include both larger and similar-sized competitors
- Track the most innovative players in your space

### Page Selection
- Always monitor: homepage, pricing, features
- Optional: blog, product pages, about us, careers
- Avoid: legal pages, support docs (change frequently but not strategically)

### Alert Management
- Create dedicated Slack channel (#competitive-intelligence)
- Include product managers, strategists, and leadership
- Set up Slack threads for discussion on each report

### Response Workflow
1. **Review**: PM or strategy lead reviews report within 24 hours
2. **Prioritize**: Tag insights as "act now", "roadmap", or "monitor"
3. **Act**: Create tickets, update battle cards, brief sales
4. **Track**: Note competitive moves in your product roadmap tool

## Troubleshooting

### Agent Not Running

Check the agent status:
```bash
opal-agent status @competitive-intelligence
```

View logs:
```bash
opal-agent logs @competitive-intelligence
```

### No Changes Detected

This is normal! Most days competitors don't make major changes. The agent will still send a brief "all clear" message.

### Scraping Failures

Some websites block scrapers. Options:
1. Add delay between requests (already implemented)
2. Rotate user agents
3. Use a proxy service
4. For critical competitors, manually review monthly

### False Positives

The analysis uses keyword detection and may flag minor changes. Over time, you can:
1. Increase `changeThreshold` to "high"
2. Customize keyword lists in the tool code
3. Filter by specific page patterns

## Extending the Agent

### Add More Analysis Types

Edit `feature-diff-analyzer.ts` to detect:
- Integration announcements
- Job postings (hiring for specific roles)
- Case study/customer logos
- Technology stack changes

### Integrate with Other Tools

Add workflow steps in the agent config:
- **Jira**: Auto-create tickets for critical insights
- **Confluence**: Update competitive analysis pages
- **CRM**: Alert sales team about pricing changes
- **PagerDuty**: Escalate critical threats

### Custom Scoring

Implement custom competitive threat scoring based on:
- Feature category (core vs. nice-to-have)
- Competitor size and threat level
- Customer feedback and requests
- Strategic importance to roadmap

## Support

- **Questions**: Contact the Product Strategy team
- **Issues**: Create ticket in product backlog
- **Feature Requests**: Suggest improvements in #product-feedback

## Related Documentation

- [SRM Monitor Setup](SRM_MONITOR_SETUP.md)
- [Optimizely Analytics Guide](OPTIMIZELY_SETUP.md)
- [Opal Agent Framework](https://docs.opal.dev)

---

**Created by**: Nuno Figueiredo
**Last Updated**: January 25, 2025
**Version**: 1.0.0
