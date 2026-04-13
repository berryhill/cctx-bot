# Layer 1 — Core Engine (Foundation)

**MasterGuide Items**: 1-6, 9-11, 55-58, 61
**Depends on**: Nothing — this is the foundation
**Depended on by**: All other layers

---

## Goal

Replace the monolithic webhook handler and routing logic with a modular alert processing pipeline. This layer receives alerts, validates them, resolves prices/quantities, routes to the correct handler, and provides the shared utilities every other layer builds on.

---

## New Files

```
server/engine/
  alertRouter.js      — POST handler, dedup, validation, t-c switch dispatch
  alertValidator.js    — Joi/Zod schema matching MasterGuide 2.1 spec
  priceResolver.js     — resolvePrice() using fetchTicker + p field parsing
  quantityResolver.js  — resolveQuantity() with USD, %, multiplier, min order
  symbolResolver.js    — spot vs futures detection, precision, min order sizes
  deduplicator.js      — isDuplicate() with Map + 60s cleanup interval
  errors.js            — standardized error logging (error.message + error.stack)
```

---

## Tasks

### 1.1 — Alert Validation Schema (`alertValidator.js`)

Rewrite `postSchema.js` to match MasterGuide Section 2.1 exactly:

| Field  | Type   | Required | Rules |
|--------|--------|----------|-------|
| `s`    | string | yes      | symbol — e.g. `SOL/USDT:USDT`, `BMEX/USDT` |
| `c`    | string | yes      | enum: `LF`, `SF`, `FLF`, `FSF`, `CLF`, `CSF`, `B`, `S`, `CB`, `CS`, `CLEAN` |
| `t`    | string | yes      | enum: `M`, `L` |
| `p`    | string | no       | regex: `/^[+-]?[0-9]{1,5}(\.[0-9]{1,3})?%$|^[+-]?[0-9]{1,5}(\.[0-9]{1,3})?$/` |
| `p2`   | string | no       | same regex as `p` — BB only |
| `q`    | string | yes      | USD amount or `N%` of position |
| `a`    | string | yes      | min 3 chars, account alias |
| `code` | string | yes      | must equal `13131` |
| `tag`  | string | yes      | trade grouping tag (was optional, now required for v2) |
| `type` | string | no       | enum: `BB` — Buy Back only |

Key changes from current `postSchema.js`:
- **Remove `tp` field entirely** — TP is never in an alert
- **Add `p2` field** for Buy Back
- **Add `type` field** for BB detection
- **Make `tag` required** — every v2 trade needs a tag
- **Expand `c` enum** to full command set (remove old `BT`, `ST`)
- Support both single alert objects and arrays (multi-command)

### 1.2 — Symbol Resolution (`symbolResolver.js`)

Auto-detect spot vs futures from symbol format (MasterGuide Section 9, Item 61):

```js
function getMarketType(symbol) {
  // symbol contains ':USDT' suffix → futures
  // no ':USDT' suffix → spot
  return symbol.includes(':') ? 'futures' : 'spot'
}
```

Also provide:
- `getExchangePrecision(exchange, symbol)` — price and amount precision from `exchange.markets[symbol]`
- `getMinOrderSize(exchange, symbol)` — `exchange.markets[symbol].limits.amount.min`
- Remove hardcoded `resolveDecimals()` switch statements — use CCXT's `priceToPrecision()` and `amountToPrecision()` instead

### 1.3 — Price Resolution (`priceResolver.js`)

Implement MasterGuide Section 3.1:

```js
async function resolvePrice(exchange, symbol, p) {
  const ticker = await exchange.fetchTicker(symbol)
  const currentPrice = ticker.last
  if (!p || p === '0') return currentPrice
  if (typeof p === 'string' && p.endsWith('%')) {
    const pct = parseFloat(p.replace('%', '')) / 100
    return parseFloat(exchange.priceToPrecision(symbol, currentPrice * (1 + pct)))
  }
  return parseFloat(exchange.priceToPrecision(symbol, parseFloat(p)))
}
```

- Handles `0`, `+N%`, `-N%`, `N%`, and absolute values
- Always applies `priceToPrecision` before returning

### 1.4 — Quantity Resolution (`quantityResolver.js`)

Implement MasterGuide Section 2.5:

```js
function resolveQuantity(exchange, symbol, q, currentPrice, multiplier, tag) {
  let usdAmount
  if (typeof q === 'string' && q.endsWith('%')) {
    const totalQty = tag.totalQty + tag.setQty + tag.superSetQty
    const positionValue = totalQty * currentPrice
    usdAmount = positionValue * (parseFloat(q) / 100)
  } else {
    usdAmount = parseFloat(q)
  }
  usdAmount = usdAmount * (multiplier || 1)
  const contracts = usdAmount / currentPrice

  // Min order size guard (Item 11) — scale UP, never abort
  const minQty = exchange.markets[symbol].limits.amount.min
  const finalQty = Math.max(contracts, minQty)
  return parseFloat(exchange.amountToPrecision(symbol, finalQty))
}
```

- USD amount mode and % of position mode
- Multiplier applied before conversion
- Min order size enforcement

### 1.5 — Deduplication (`deduplicator.js`)

Implement MasterGuide Section 10.3:

```js
const recentAlerts = new Map()
const DEDUP_MS = 5000

function isDuplicate(alert) {
  const key = `${alert.code}-${alert.tag}-${alert.c}`
  const now = Date.now()
  const last = recentAlerts.get(key)
  if (last && (now - last) < DEDUP_MS) return true
  recentAlerts.set(key, now)
  return false
}

// Cleanup interval — prevents memory growth
setInterval(() => {
  const now = Date.now()
  for (const [key, ts] of recentAlerts.entries()) {
    if (now - ts > DEDUP_MS) recentAlerts.delete(key)
  }
}, 60000)
```

### 1.6 — Error Logging Standard (`errors.js`)

Implement MasterGuide Section 10.1 — every catch block must use:

```js
function logError(context, error) {
  console.log(`ERROR [${context}] Message:`, error.message)
  console.log(`ERROR [${context}] Stack:`, error.stack)
  if (error.response) {
    console.log(`ERROR [${context}] Exchange response:`, JSON.stringify(error.response.data))
  }
}
```

Provide this as a shared utility. All new code uses `logError()` instead of raw catch logging.

### 1.7 — Alert Router (`alertRouter.js`)

The central dispatch. Replaces the POST `/ccxt` handler in `index.js`.

**Input**: validated alert object (or array of objects)
**Output**: routes to the correct handler function

```js
const tradeKey = `${alert.t}-${alert.c}`  // NEVER include tp

switch (tradeKey) {
  // Futures — 12 cases
  case 'M-LF':  case 'L-LF':   // Long fill
  case 'M-SF':  case 'L-SF':   // Short fill
  case 'M-FLF': case 'L-FLF':  // Flip to long
  case 'M-FSF': case 'L-FSF':  // Flip to short
  case 'M-CLF': case 'L-CLF':  // Close long / BB
  case 'M-CSF': case 'L-CSF':  // Close short / BB

  // Spot — 8 cases
  case 'M-B':   case 'L-B':    // Buy spot
  case 'M-S':   case 'L-S':    // Sell spot
  case 'M-CB':  case 'L-CB':   // Close buy / BB
  case 'M-CS':  case 'L-CS':   // Close sell / BB
}
```

Additional routing:
- `CLEAN` command handled before the switch (no `t` needed)
- If `alert.type === 'BB'`, delegate to Buy Back handler (Layer 5), not the standard close
- Spot tags reject `FLF`/`FSF` with an error log (Item 70)

**Multi-command support** (Item 6):
```js
async function processAlert(input, res) {
  const alerts = Array.isArray(input) ? input : [input]
  const results = []
  for (const alert of alerts) {
    if (isDuplicate(alert)) continue
    const result = await routeAlert(alert)
    results.push(result)
  }
  return results
}
```

Process sequentially — order matters for multi-command alerts.

### 1.8 — Multi-Account Routing (Item 58)

Reuse existing `users` object and CCXT instance lookup. The router must:
1. Look up `exchangeInstances[alert.a]` (or `users[alias]`)
2. If not found, log error and return 400
3. If `alert.a === 'all'`, iterate all users sequentially

### 1.9 — Wire Into Express

- Keep existing Express setup (`server/express/express.js`)
- Replace the POST `/ccxt` handler in `index.js` to call `alertRouter.processAlert()`
- Keep all existing GET endpoints (`/api/tagTrades`, etc.) — they'll be updated in later layers
- The old trade functions remain in `index.js` temporarily — the router calls stubs that will be filled in by Layer 2+

---

## Integration with Existing Code

- `server/index.js` still orchestrates startup (MongoDB, WS, CCXT init)
- The new `engine/` modules are imported and wired in during the `main()` function
- Old POST handler logic is gradually replaced — not deleted until v2 handlers are proven
- Old commands (`BT`, `ST`, `CL`, `CS` with the old meanings) can be kept behind a feature flag or removed if v1 is no longer needed

---

## Validation Criteria

- [ ] Single alert POST processes through validation → dedup → route → response
- [ ] Array alert POST processes each alert sequentially
- [ ] Invalid alerts return descriptive 400 errors
- [ ] Duplicate alerts within 5s window are silently dropped
- [ ] `resolvePrice()` correctly handles `0`, `+2%`, `-1.3%`, `1.5%` formats
- [ ] `resolveQuantity()` handles USD and % modes, applies multiplier, enforces min
- [ ] Spot symbol detected correctly (no `:` suffix)
- [ ] Futures symbol detected correctly (has `:USDT` suffix)
- [ ] FLF/FSF rejected on spot symbols with error log
- [ ] All catch blocks use `logError()` with context + message + stack
- [ ] CLEAN command still works as before
