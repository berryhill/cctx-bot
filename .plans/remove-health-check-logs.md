# Plan: Remove Health Check Logs

## Goal
Stop health check messages from spamming the server logs.

## Problem
Health check endpoints log every request, which floods the logs when Kubernetes probes or load balancers hit them every 10-30 seconds.

## Logging Statements to Remove

| Line | File | Log Message |
|------|------|-------------|
| 3183 | [server/index.js](server/index.js#L3183) | `expressLog.print('Request','/ health check')` |
| 3273 | [server/index.js](server/index.js#L3273) | `expressLog.print('Request','/health check - OK')` |
| 3282 | [server/index.js](server/index.js#L3282) | `expressLog.print('Request','/health check - FAILED')` |

## Implementation

Remove (or comment out) these 3 lines in [server/index.js](server/index.js):

```javascript
// Line 3183 - DELETE THIS LINE:
expressLog.print('Request','/ health check')

// Line 3273 - DELETE THIS LINE:
expressLog.print('Request','/health check - OK')

// Line 3282 - DELETE THIS LINE:
expressLog.print('Request','/health check - FAILED')
```

The endpoints remain functional for monitoring - only the log spam is removed.

## Files to Modify

| File | Changes |
|------|---------|
| [server/index.js](server/index.js) | Remove 3 `expressLog.print()` calls |

## Verification

1. Start the server: `cd server && npm run dev`
2. Hit health endpoints: `curl http://localhost:3000/health`
3. Verify no log output for health checks
4. Verify other logs still appear (e.g., trade webhooks)
