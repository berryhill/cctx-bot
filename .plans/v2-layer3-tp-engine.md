# Layer 3 — Take Profit Engine

**MasterGuide Items**: 15-16, 21-33, 44-45, 71
**Depends on**: Layer 1 (Core Engine), Layer 2 (Tag State)
**Depended on by**: Layer 5 (Flip resets TPs), Layer 6 (Interface configures TPs)

---

## Goal

Build the automated TP system: 3 independent layers x 5 levels each, placed on the exchange as limit orders, with configurable recalculation timers. TPs are never sent in alerts — they come from per-tag interface configuration.

---

## New Files

```
server/engine/
  tpEngine.js         — TP placement, recalculation, timer management
```

---

## Tasks

### 3.1 — TP Architecture Overview

Each tag can have up to **15 active TP limit orders** on the exchange simultaneously:
- 5 Main Tag TPs (entry = weighted avg of all 3 layers, qty = total across all 3 layers)
- 5 Set TPs (entry = `setAvgEntry`, qty = `setQty`)
- 5 Super Set TPs (entry = `superSetAvgEntry`, qty = `superSetQty`)

TP configuration is stored in `tag.tpConfig` (Layer 2 schema). Active order IDs stored in `tag.activeTpOrders`.

### 3.2 — Sell % Calculation (Item 23)

**Critical**: sell % is from REMAINING unfired qty, not original total.

```js
function calculateTpQuantities(totalQty, levels) {
  // levels = [{ triggerPct, sellPct }, ...] — 5 entries
  const result = []
  let remaining = totalQty

  for (const level of levels) {
    const qty = remaining * (level.sellPct / 100)
    result.push({
      triggerPct: level.triggerPct,
      sellPct: level.sellPct,
      qty: qty
    })
    remaining -= qty
  }
  return result
}
```

Example verification (Item 24 — self-test):
- 1000 total → TP1: 20% of 1000 = 200, remain 800
- TP2: 25% of 800 = 200, remain 600
- TP3: 33% of 600 = 198, remain 402
- TP4: 50% of 402 = 201, remain 201
- TP5: 100% of 201 = 201, remain 0

### 3.3 — TP Placement (`placeTpOrders`) (Items 15, 25)

**When to place**: a layer has zero active TPs AND a new fill arrives for that layer.

```js
async function placeTpOrders(exchange, tag, layer) {
  // Determine which config and state to use
  const config = tag.tpConfig[layer]  // 'mainTag', 'set', 'superSet'
  let avgEntry, totalQty

  if (layer === 'mainTag') {
    avgEntry = getWeightedAvgEntry(tag)          // weighted avg of ALL 3 layers
    totalQty = getTotalQty(tag)                   // sum of all 3 layers
  } else if (layer === 'set') {
    avgEntry = tag.setAvgEntry
    totalQty = tag.setQty
  } else if (layer === 'superSet') {
    avgEntry = tag.superSetAvgEntry
    totalQty = tag.superSetQty
  }

  if (totalQty === 0 || !config.levels.length) return

  const tpQuantities = calculateTpQuantities(totalQty, config.levels)
  const orders = []

  for (const tp of tpQuantities) {
    // Calculate TP price
    const tpPrice = tag.direction === 'LF' || tag.direction === 'B'
      ? avgEntry * (1 + tp.triggerPct / 100)    // long: price above entry
      : avgEntry * (1 - tp.triggerPct / 100)    // short: price below entry

    const price = parseFloat(exchange.priceToPrecision(tag.symbol, tpPrice))
    const qty = parseFloat(exchange.amountToPrecision(tag.symbol, tp.qty))

    if (qty <= 0) continue

    // Place limit order — opposite side of position
    const side = (tag.direction === 'LF' || tag.direction === 'B') ? 'sell' : 'buy'
    const order = await exchange.createLimitOrder(tag.symbol, side, qty, price)

    orders.push({
      id: order.id,
      level: tp.triggerPct,
      filled: false,
      price: price,
      qty: qty
    })
  }

  tag.activeTpOrders[layer] = orders
  await tag.save()
}
```

**Market orders** (Item 15): place TPs after fill confirmed via `order.average`.
**Limit orders** (Item 16): wait for `order.status = 'closed'` THEN check if layer has zero TPs.

### 3.4 — TP Recalculation (`recalculateTpOrders`) (Items 26-30)

Only cancel and re-place **unfired** TPs:

```js
async function recalculateTpOrders(exchange, tag, layer) {
  const activeTps = tag.activeTpOrders[layer] || []
  const unfired = activeTps.filter(tp => !tp.filled)

  // Cancel unfired orders on exchange
  for (const tp of unfired) {
    try {
      await exchange.cancelOrder(tp.id, tag.symbol)
    } catch (e) {
      logError('TP Cancel', e)
    }
  }

  // Keep the filled TPs in the list, remove unfired
  tag.activeTpOrders[layer] = activeTps.filter(tp => tp.filled)

  // Re-place with updated prices and quantities
  // Uses current avgEntry and remaining qty after fired TPs
  await placeTpOrders(exchange, tag, layer)
}
```

### 3.5 — Recalculation Triggers (Item 27)

| Trigger | What Recalculates | Timer Resets? |
|---------|-------------------|---------------|
| Set order fills | Main Tag TPs | YES — Main Tag timer |
| Super Set order fills | Main Tag TPs | YES — Main Tag timer |
| SF reduces LF (partial close) | Main Tag TPs (new qty) | YES — Main Tag timer |
| LF reduces SF (partial close) | Main Tag TPs (new qty) | YES — Main Tag timer |
| S reduces B (spot) | Main Tag TPs (new qty) | YES — Main Tag timer |
| B reduces S (spot) | Main Tag TPs (new qty) | YES — Main Tag timer |
| Main Tag timer fires | Main Tag TPs | YES — restarts |
| Set TP timer fires | Set TPs | YES — restarts |
| Super Set TP timer fires | Super Set TPs | YES — restarts |
| FLF or FSF | ALL TPs all layers cancelled | YES — all timers reset |

Wire these triggers into the appropriate places in `alertRouter.js` and `tagManager.js`.

### 3.6 — TP Recalculation Timers (Item 28)

Each layer has an independent timer per tag. Configurable: 15min / 30min / 1hr / 4hr / OFF.

```js
// In-memory timer registry — keyed by `${tag.tag}-${tag.account}-${layer}`
const tpTimers = new Map()

function startTpTimer(tag, layer) {
  const key = `${tag.tag}-${tag.account}-${layer}`
  const config = tag.tpConfig[layer]

  // Clear existing timer
  if (tpTimers.has(key)) {
    clearInterval(tpTimers.get(key))
  }

  if (config.timer === 'OFF') return

  const ms = {
    '15min': 15 * 60 * 1000,
    '30min': 30 * 60 * 1000,
    '1hr':   60 * 60 * 1000,
    '4hr':   4 * 60 * 60 * 1000
  }[config.timer]

  const timerId = setInterval(async () => {
    await recalculateTpOrders(exchange, tag, layer)
  }, ms)

  tpTimers.set(key, timerId)
}

function stopTpTimer(tag, layer) {
  const key = `${tag.tag}-${tag.account}-${layer}`
  if (tpTimers.has(key)) {
    clearInterval(tpTimers.get(key))
    tpTimers.delete(key)
  }
}

function stopAllTpTimers(tag) {
  for (const layer of ['mainTag', 'set', 'superSet']) {
    stopTpTimer(tag, layer)
  }
}
```

On server restart: iterate all active tags with positions and restart their timers.

### 3.7 — CLF/CSF TP Sequence (Item 31)

When CLF or CSF arrives (without BB):
- If Main Tag TPs are already active on exchange → let them execute naturally
- If Main Tag TPs are NOT active → place all 5 immediately
- Sets and Super Sets and their TPs keep running — NOT affected unless TP5 fires

### 3.8 — TP5 Nuclear Close (Item 32)

When Main Tag TP5 fires (100% sell):
1. Close 100% of everything — main + Set + Super Set positions
2. Cancel all remaining unfired TPs across ALL 3 layers
3. Cancel all pending BB orders
4. Reset `currentPositionFees` to 0
5. Direction becomes `null`
6. Stop all 3 TP timers

After TP5 — next entry command (Item 33):
- Treat as fresh entry
- Place fresh 5 Main Tag TPs after fill
- Set and Super Set TPs placed fresh when their orders fill

### 3.9 — Unrealized PnL (Items 44, 71)

Live calculation, not stored — computed on request:

```js
function calculateUnrealizedPnL(tag, currentPrice) {
  const totalQty = tag.totalQty + tag.setQty + tag.superSetQty
  if (totalQty === 0) return 0

  const totalValue = (tag.totalQty * tag.avgEntry) +
                     (tag.setQty * tag.setAvgEntry) +
                     (tag.superSetQty * tag.superSetAvgEntry)
  const weightedAvgEntry = totalValue / totalQty

  if (tag.direction === 'LF' || tag.direction === 'B') {
    return (currentPrice - weightedAvgEntry) * totalQty - tag.currentPositionFees
  } else {
    // SF only (spot cannot short)
    return (weightedAvgEntry - currentPrice) * totalQty - tag.currentPositionFees
  }
}
```

### 3.10 — Realized PnL (Item 45)

Always use the correct layer avgEntry. Block-scoped to avoid `const` redeclaration (Item 73):

```js
function calculateRealizedPnL(tag, layer, fillPrice, qtyClosed) {
  let avgEntry
  if (layer === 'main')    avgEntry = tag.avgEntry
  if (layer === 'set')     avgEntry = tag.setAvgEntry
  if (layer === 'superSet') avgEntry = tag.superSetAvgEntry

  const fee = fillPrice * qtyClosed * 0.0005

  if (tag.direction === 'LF' || tag.direction === 'B') {
    return (fillPrice - avgEntry) * qtyClosed - fee
  } else {
    return (avgEntry - fillPrice) * qtyClosed - fee
  }
}
```

### 3.11 — TP Fill Detection

Need to detect when TP limit orders fill on the exchange. Two approaches:

**Option A — WebSocket (preferred)**:
- Private WS stream already receives `execution` and `order` updates
- Match incoming order fills against `tag.activeTpOrders` IDs
- Mark matched TPs as `filled: true`
- If TP5 filled → trigger nuclear close

**Option B — Polling fallback**:
- On the TP timer interval, also check order status via `exchange.fetchOrder(id)`
- Less responsive but works if WS misses events

Wire TP fill detection into the existing private WebSocket stream handler.

---

## Integration Points

- **Layer 1**: after order execution, calls `tpEngine.placeTpOrders()` if layer has zero active TPs
- **Layer 2**: `tagManager` provides state reads/writes; `tpEngine` reads `tag.tpConfig`, writes `tag.activeTpOrders`
- **Layer 4**: Set/SuperSet fills trigger Main Tag TP recalculation
- **Layer 5**: FLF/FSF calls `tpEngine.cancelAllTps()` + `stopAllTpTimers()`; BB close interacts with TP sequence
- **Layer 6**: Interface writes `tag.tpConfig` and timer settings

---

## Validation Criteria

- [ ] TP sell % calculated from remaining unfired qty — verified with 1000-unit example
- [ ] TPs placed only when layer has zero active TPs + new fill arrives
- [ ] Subsequent fills on same layer do NOT replace TPs
- [ ] Recalculation cancels only unfired TPs, re-places with updated prices/qty
- [ ] Each of the 10 recalculation triggers works correctly
- [ ] 3 independent timers per tag, configurable intervals
- [ ] CLF/CSF fires TP sequence (places if none active, lets run if active)
- [ ] TP5 closes everything, cancels all TPs/BB, resets fees, direction null
- [ ] Next entry after TP5 places fresh TPs
- [ ] Unrealized PnL correct for LF, SF, B directions with fee deduction
- [ ] Realized PnL uses correct layer avgEntry
- [ ] TP fills detected via WebSocket and tag state updated
- [ ] Up to 15 simultaneous TP orders supported (5 per layer)
