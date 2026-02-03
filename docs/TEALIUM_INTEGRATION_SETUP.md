# Tealium CDP Integration for Optimizely Opal

This guide explains how to add Tealium tools to your `opal-custom-tools` service, enabling real-time visitor profile retrieval, audience discovery, and event tracking from within Opal.

## What This Integration Provides

| Tool | API | Description |
|------|-----|-------------|
| `tealium_get_profile_definition` | Profile Definition API | Get all audiences & badges defined in your profile |
| `tealium_get_visitor_profile` | Moments API | Get visitor data by anonymous ID |
| `tealium_get_enriched_visitor` | Moments + Profile Definition | Get visitor with human-readable audience/badge names |
| `tealium_get_visitor_by_attribute` | Moments API | Get visitor by email/customer ID |
| `tealium_check_audiences` | Moments API | Quick audience membership check |
| `tealium_send_event` | HTTP Collect API | Send tracking events to Tealium |
| `tealium_get_visitor_dle` | Data Layer Enrichment API | Alternative visitor lookup (includes current visit) |

## Prerequisites

1. **Tealium Account** with:
   - AudienceStream CDP enabled
   - At least one Moments API engine configured
   - Your domain added to the engine's allowed domains list

2. **opal-custom-tools repository** cloned and working:
   ```bash
   git clone https://github.com/nacfigueiredoopti/opal-custom-tools.git
   cd opal-custom-tools
   yarn install
   ```

## Installation

### Step 1: Add the Tealium Tool File

Copy `tealium.ts` to your project's tools directory:

```bash
cp tealium.ts src/tools/tealium.ts
```

### Step 2: Register the Tools

Edit `src/main.ts` to import the Tealium tools:

```typescript
// Add this import with the other tool imports
import './tools/tealium';
```

### Step 3: Configure Environment Variables

Add these to your `.env` file:

```env
# Required: Your Tealium account details
TEALIUM_ACCOUNT=your_account_name
TEALIUM_PROFILE=main
TEALIUM_ENGINE_ID=your_engine_id
TEALIUM_REGION=us-west-2

# Required: Domain that's allowed in your Moments API engine
TEALIUM_ALLOWED_DOMAIN=https://your-allowed-domain.com
```

### Step 4: Build and Test Locally

```bash
# Build the project
yarn build

# Run locally
yarn dev

# Test the discovery endpoint
curl http://localhost:3000/discovery
```

You should see all 7 Tealium tools listed in the discovery response.

## Finding Your Tealium Configuration Values

### Account & Profile
- Found in the Tealium URL when logged in: `https://my.tealiumiq.com/account/[ACCOUNT]/profile/[PROFILE]`
- Sean van der Vliet shared example: `https://visitor-service.tealiumiq.com/datacloudprofiledefinitions/ing-trial/main`

### Engine ID
1. Go to **AudienceStream** → **Moments API**
2. Select your engine
3. The Engine ID is shown in the endpoint URL

### Region
Your region is based on where your Tealium data is hosted:
- `us-west-2` - US West
- `us-east-1` - US East
- `eu-west-1` - EU (Ireland)
- `ap-southeast-2` - Asia Pacific (Sydney)

### Allowed Domain
1. Go to **Moments API** → **Engines** → Select your engine
2. Under **Domain Allow List**, add the domain your Opal tools service will run on
3. Use this same domain in `TEALIUM_ALLOWED_DOMAIN`

## API Reference

### Profile Definition API (Public - No Auth Required)

```
GET https://visitor-service.tealiumiq.com/datacloudprofiledefinitions/{ACCOUNT}/{PROFILE}
```

Returns all audience and badge definitions:
```json
{
  "audiences": [
    { "id": "account_profile_101", "name": "VIP Customer" }
  ],
  "badges": [
    { "id": 5113, "name": "Cart abandoner" }
  ]
}
```

### Moments API

```
GET https://personalization-api.{REGION}.prod.tealiumapis.com/personalization/accounts/{ACCOUNT}/profiles/{PROFILE}/engines/{ENGINE_ID}/visitors/{VISITOR_ID}
```

Requires domain to be in engine's allow list. Returns real-time visitor profile.

### Data Layer Enrichment API

```
GET https://visitor-service-{REGION}.tealiumiq.com/{ACCOUNT}/{PROFILE}/{VISITOR_ID}
```

Returns visitor profile with numeric attribute IDs. Only returns data for visitors with active sessions.

### HTTP Collect API

```
POST https://collect-{REGION}.tealiumiq.com/event
```

Sends tracking events. Payload includes `tealium_account`, `tealium_profile`, `tealium_event`.

## Deployment

### Netlify (Recommended)

1. Connect your repo to Netlify
2. Add environment variables in Netlify dashboard:
   - Site settings → Environment variables → Add variable
3. Deploy

The discovery URL will be: `https://your-site.netlify.app/.netlify/functions/api/discovery`

### Important: Domain Allow List

After deployment, add your Netlify domain to the Tealium Moments API engine's Domain Allow List, otherwise you'll get 403 errors.

## Usage Examples in Opal

Once deployed and registered in Opal, you can use natural language:

**Discover Available Segments:**
> "What audiences are defined in our Tealium profile?"
> "Show me all badges available in Tealium"

**Get Visitor Profile:**
> "Get the Tealium profile for visitor ID abc123def456"
> "Get an enriched view of visitor xyz with readable audience names"

**Check Audience Membership:**
> "Is visitor abc123 in the VIP or High-Value-Customer audience?"

**Find Visitor by Email:**
> "Find the Tealium visitor with email john@example.com"

**Send Tracking Event:**
> "Send a purchase event to Tealium for visitor xyz with order_total 99.99"

## Creating a Specialized Agent

Import the provided `opal-agent-tealium-intelligence.json` into Opal to create a specialized Customer Intelligence agent that uses all Tealium tools effectively.

## Troubleshooting

### "Visitor not found" Error
- The visitor may not have any tracked sessions in the Moments API engine yet
- Check that your engine is enabled and has recent traffic
- Verify the visitor ID is correct (check browser cookies for `utag_main_v_id`)

### 403 Forbidden Error
- Your `TEALIUM_ALLOWED_DOMAIN` doesn't match what's configured in the Moments API engine
- Add your deployment domain to the engine's Domain Allow List

### Empty Audiences/Badges from Moments API
- The Moments API engine only returns data for attributes/audiences configured in the engine
- Go to Moments API → Engines → Edit your engine → Add the audiences and attributes you need

### DLE API Returns Empty Response
- Data Layer Enrichment API only returns data for visitors with **active** sessions
- If the visitor has no active visit, it returns an empty JSON object

### Connection Timeout
- Check your `TEALIUM_REGION` matches where your account is hosted
- Verify network connectivity to Tealium APIs

## File Structure After Installation

```
src/
  tools/
    tealium.ts          # ← Add this file
    greeting.ts
    todays-date.ts
    api-call.ts
    ... (other existing tools)
  main.ts               # ← Add import here
```

## Additional Resources

- [Tealium Moments API Documentation](https://docs.tealium.com/server-side/moments-api/)
- [Tealium Profile Definition API](https://docs.tealium.com/server-side/attributes/data-layer-enrichment/data-layer-enrichment-api/get-profile-definition-api/)
- [Tealium Data Layer Enrichment API](https://docs.tealium.com/server-side/attributes/data-layer-enrichment/)
- [Tealium HTTP Collect API](https://docs.tealium.com/platforms/http-api/)
- [Optimizely Opal Tools SDK](https://www.npmjs.com/package/@optimizely-opal/opal-tools-sdk)
