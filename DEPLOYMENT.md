# 🚀 Deployment Guide for Optimizely Custom Tools

This guide covers deploying your custom tools to Netlify with automatic flag creation enabled.

## 📋 Prerequisites

- ✅ Netlify account
- ✅ Optimizely Feature Experimentation account
- ✅ Optimizely Personal Access Token (API key)
- ✅ Optimizely Project ID

---

## 🔑 Step 1: Get Your Optimizely Credentials

### Get Your API Key (Personal Access Token)

1. Log into Optimizely
2. Go to **Settings** → **Personal Access Tokens**
3. Click **"Generate New Token"**
4. Give it a name (e.g., "Opal Custom Tools")
5. Set permissions: **Read** and **Write** for Feature Flags
6. Click **"Generate Token"**
7. **Copy the token** (you won't see it again!)

### Get Your Project ID

1. Open your project in Optimizely
2. Look at the URL: `https://app.optimizely.com/v2/projects/[PROJECT_ID]/...`
3. Copy the `PROJECT_ID` number

---

## 🌐 Step 2: Deploy to Netlify

### Option A: Deploy from GitHub

1. **Push your code to GitHub:**
   ```bash
   git add .
   git commit -m "Add Optimizely custom tools with auto flag creation"
   git push origin main
   ```

2. **Connect to Netlify:**
   - Go to [Netlify](https://app.netlify.com)
   - Click **"Add new site"** → **"Import an existing project"**
   - Choose **GitHub** and select your repository
   - Click **"Deploy site"**

### Option B: Deploy with Netlify CLI

1. **Install Netlify CLI:**
   ```bash
   npm install -g netlify-cli
   ```

2. **Login to Netlify:**
   ```bash
   netlify login
   ```

3. **Build and deploy:**
   ```bash
   npm run build
   netlify deploy --prod
   ```

---

## 🔐 Step 3: Set Environment Variables

This is the **KEY step** to enable automatic flag creation!

### Via Netlify Dashboard (Recommended)

1. Go to your site in Netlify
2. Navigate to **Site settings** → **Environment variables**
3. Click **"Add a variable"**
4. Add these two variables:

   **Variable 1:**
   - **Key**: `OPTIMIZELY_API_KEY`
   - **Value**: Your Personal Access Token from Step 1
   - **Scopes**: All scopes (Production, Deploy Previews, Branch Deploys)

   **Variable 2:**
   - **Key**: `OPTIMIZELY_PROJECT_ID`
   - **Value**: Your Project ID from Step 1
   - **Scopes**: All scopes

5. Click **"Save"**

### Via Netlify CLI

```bash
# Set the API key
netlify env:set OPTIMIZELY_API_KEY "your_actual_token_here"

# Set the project ID
netlify env:set OPTIMIZELY_PROJECT_ID "123456"

# Verify they're set
netlify env:list
```

---

## ♻️ Step 4: Trigger a Redeploy

After setting environment variables, you need to redeploy:

### Via Netlify Dashboard

1. Go to **Deploys** tab
2. Click **"Trigger deploy"** → **"Clear cache and deploy site"**

### Via Netlify CLI

```bash
netlify deploy --prod
```

---

## ✅ Step 5: Verify It Works

### Test the Endpoint

```bash
# Get your Netlify URL (e.g., https://your-site.netlify.app)
NETLIFY_URL="https://your-site.netlify.app"

# Test flag creation (should now create in Optimizely!)
curl -u admin:password -X POST \
  $NETLIFY_URL/tools/flag-creator \
  -H "Content-Type: application/json" \
  -d '{
    "flagName": "Test Auto Creation"
  }'
```

### Expected Response

If environment variables are set correctly:

```json
{
  "success": true,
  "message": "✅ Flag 'Test Auto Creation' created successfully in Optimizely! (Using credentials from environment variables)",
  "flagId": "...",
  "apiUrl": "https://app.optimizely.com/v2/projects/123456/flags/..."
}
```

If environment variables are NOT set:

```json
{
  "success": true,
  "message": "✅ Flag configuration validated successfully! (No API credentials found - flag not created)",
  "nextSteps": [
    "To auto-create flags: Set OPTIMIZELY_API_KEY and OPTIMIZELY_PROJECT_ID environment variables in Netlify"
  ]
}
```

---

## 🎯 Step 6: Register in Optimizely Opal

1. Go to Optimizely Opal dashboard
2. Navigate to **Settings** → **Custom Tools** (or **Integrations**)
3. Click **"Add Custom Tools Service"**
4. Fill in:
   - **Name**: "Experimentation Tools"
   - **Base URL**: `https://your-site.netlify.app`
   - **Authentication**: Basic Auth
     - Username: `admin`
     - Password: `password`
   - **Discovery Endpoint**: `/discovery`
5. Click **"Test Connection"**
6. Click **"Save"**

Your tools are now available in Opal! 🎉

---

## 🔧 Step 7: Create Your Agents

Now you can create agents in Opal that use your tools:

### Flag Creation Wizard Agent

- **Tools**: `flag-naming-validator`, `flag-creator`
- **Variables**: `flag_name`, `description`, `flag_type`
- **Result**: Automatically creates flags in Optimizely!

### Experimentation Dashboard Agent

- **Tools**: `experiment-catalog`
- **Variables**: `status_filter`, `page_filter`, `metric_filter`
- **Result**: Shows overview of all experiments

---

## 🛠️ Troubleshooting

### Problem: Flags not being created automatically

**Check:**
1. Environment variables are set correctly:
   ```bash
   netlify env:list
   ```
2. You redeployed after setting environment variables
3. API token has correct permissions (Read + Write for Feature Flags)
4. Project ID is correct (check URL in Optimizely)

**Test manually:**
```bash
# This should work if env vars are set:
curl -u admin:password -X POST \
  https://your-site.netlify.app/tools/flag-creator \
  -H "Content-Type: application/json" \
  -d '{"flagName": "Debug Test"}'
```

### Problem: 401 Unauthorized from Optimizely API

**Solution:**
- Your API token is invalid or expired
- Generate a new Personal Access Token in Optimizely
- Update the `OPTIMIZELY_API_KEY` environment variable
- Redeploy

### Problem: 404 Not Found for project

**Solution:**
- Your Project ID is incorrect
- Verify the Project ID in your Optimizely URL
- Update `OPTIMIZELY_PROJECT_ID` environment variable
- Redeploy

### Problem: Tools not showing in Opal

**Check:**
1. Base URL is correct (should end in `.netlify.app`)
2. Authentication credentials are `admin` / `password`
3. Discovery endpoint works:
   ```bash
   curl -u admin:password https://your-site.netlify.app/discovery
   ```
4. CORS is enabled (already configured in code)

---

## 🔒 Security Best Practices

### Change Default Password

The default basic auth is `admin` / `password`. Change it before production:

**In `src/main.ts`:**
```typescript
app.use(basicAuth({
  users: {
    'admin': process.env.ADMIN_PASSWORD || 'password'
  },
  challenge: true,
}));
```

**Set in Netlify:**
```bash
netlify env:set ADMIN_PASSWORD "your-secure-password"
```

### Rotate API Keys Regularly

- Generate new Optimizely tokens every 90 days
- Update environment variables when rotating
- Revoke old tokens in Optimizely

### Use Separate Environments

Create different deployments for dev/staging/production:

```bash
# Development
netlify env:set OPTIMIZELY_PROJECT_ID "dev-project-123" --context development

# Production
netlify env:set OPTIMIZELY_PROJECT_ID "prod-project-456" --context production
```

---

## 📊 Monitoring

### Check Deployment Logs

```bash
netlify logs
```

### Monitor Flag Creation

Check in Optimizely:
- Go to **Feature Flags** → **All Flags**
- Look for flags created by the API
- Created by: Your API token name

---

## 🎉 You're Done!

Your tools are now deployed and ready to use! Your agents can:

✅ Automatically create feature flags in Optimizely
✅ Validate flag names against standards
✅ Analyze experiment overlap
✅ Calculate experiment duration
✅ Monitor metric stability
✅ Catalog all experiments

---

## 🆘 Need Help?

- **Netlify Docs**: https://docs.netlify.com
- **Optimizely API Docs**: https://docs.developers.optimizely.com/feature-experimentation/reference
- **Opal Docs**: https://docs.optimizely.com/opal

---

## 📝 Quick Reference

**Your Netlify URL:** `https://your-site.netlify.app`

**Discovery Endpoint:** `https://your-site.netlify.app/discovery`

**Tools Available:**
- `experiment-duration-estimator`
- `metric-variance-analyzer`
- `experiment-overlap-checker`
- `experiment-lookup`
- `experiment-catalog`
- `flag-naming-validator`
- `flag-creator` ⭐ (with auto-creation!)

**Environment Variables:**
- `OPTIMIZELY_API_KEY` - Your Personal Access Token
- `OPTIMIZELY_PROJECT_ID` - Your project ID
- `ADMIN_PASSWORD` - (Optional) Custom basic auth password
