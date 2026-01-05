# Vercel Deployment Setup Guide

## Required Environment Variables

You **MUST** set these environment variables in your Vercel project settings:

### 1. GraphQL/Hasura Configuration

```
NEXT_PUBLIC_HASURA_GQL_ENDPOINT=https://your-hasura-instance.com/v1/graphql
```

**OR** (if the above doesn't work):

```
HASURA_GQL_ENDPOINT=https://your-hasura-instance.com/v1/graphql
```

⚠️ **Important**: Replace `https://your-hasura-instance.com/v1/graphql` with your actual Hasura GraphQL endpoint URL. 
**DO NOT use `http://localhost:8080/v1/graphql`** - that only works on your local machine!

### 2. Hasura Admin Secret (if required)

```
HASURA_ADMIN_SECRET=your-hasura-admin-secret-here
```

### 3. Slack Webhook URL

```
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

To get a Slack webhook URL:
1. Go to https://api.slack.com/apps
2. Create a new app or select existing one
3. Go to "Incoming Webhooks"
4. Activate Incoming Webhooks
5. Click "Add New Webhook to Workspace"
6. Select the channel
7. Copy the webhook URL

### 4. BSC RPC (Optional - defaults to public RPC)

```
NEXT_PUBLIC_RPC_URL=https://bsc-dataseed.binance.org/
```

## How to Set Environment Variables in Vercel

1. Go to your Vercel Dashboard
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Add each variable:
   - **Key**: The variable name (e.g., `NEXT_PUBLIC_HASURA_GQL_ENDPOINT`)
   - **Value**: The variable value (e.g., `https://your-hasura.com/v1/graphql`)
   - **Environment**: Select "Production", "Preview", and/or "Development" as needed
5. Click **Save**
6. **Redeploy** your project for changes to take effect

## After Setting Environment Variables

1. Go to **Deployments** tab
2. Click the **three dots** (⋯) on your latest deployment
3. Click **Redeploy**

Or push a new commit to trigger a new deployment.

## Troubleshooting

### Error: `connect ECONNREFUSED 127.0.0.1:8080`

This means your GraphQL endpoint is not configured. Set `NEXT_PUBLIC_HASURA_GQL_ENDPOINT` environment variable.

### No Slack messages

1. Check that `SLACK_WEBHOOK_URL` is set in Vercel
2. Test the endpoint: `POST /api/slack/test`
3. Check Vercel logs for errors

### Test Endpoints

After deployment, test these endpoints:

```bash
# Check environment configuration
curl https://your-vercel-url.vercel.app/api/debug/env

# Test Slack connection
curl -X POST https://your-vercel-url.vercel.app/api/slack/test

# Manually trigger wallet check
curl -X POST https://your-vercel-url.vercel.app/api/wallet/check
```
