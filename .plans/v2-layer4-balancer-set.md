# Layer 4 — Balancer / Set / Super Set System

**MasterGuide Items**: 35-39, 67-68, 72
**Depends on**: Layer 1 (Core Engine), Layer 2 (Tag State), Layer 3 (TP Engine)
**Depended on by**: Layer 5 (Flip keeps Set/SuperSet orders), Layer 6 (Interface configures settings)

---

## Goal

Implement the order consolidation system: accumulate small orders, and at a configurable threshold consolidate them into a single Set order. Accumulate Sets into Super Sets. Two modes: Balancer OFF (Cleaner) and Balancer ON (Full Set).

---

## New Files

```
server/engine/
  balancer.js         — counter tracking, Set/SuperSet consolidation logic
```

---

## Tasks

### 4.1 — Architecture Overview

The Balancer system tracks incoming fill orders on a tag and consolidates them:

```
Alert 1 → counter++ → (below threshold, do nothing)
Alert 2 → counter++ → (below threshold, do nothing)
...
Alert N → counter++ → THRESHOLD REACHED:
  Balancer OFF → cancel pending limits, place ONE unified order
  Balancer ON  → calculate avg entry, place ONE Set limit order
```

Sets follow the same pattern → consolidate into Super Sets at a separate threshold.

### 4.2 — Counter Tracking

On every LF/SF (futures) or B/S (spot) alert that fills:

```js
function incrementCounter(tag) {
  tag.normalOrderCount += 1
  tag.normalOrderList.push({
    price: fillPrice,
    qty: resolvedQty,
    time: new Date()
  })
}
```

Check threshold after increment:
```js
if (tag.normalOrderCount >= tag.setCounterThreshold) {
  if (tag.balancerEnabled) {
    await createSetOrder(exchange, tag)
  } else {
    await cleanerConsolidate(exchange, tag)
  }
}
```

### 4.3 — Balancer OFF — Cleaner Mode (Item 35)

When threshold reached with Balancer OFF:

1. Cancel all pending limit orders in the current batch (`tag.normalOrderList`)
2. Calculate average price of the cancelled orders
3. Apply the appropriate Set `p` offset from interface settings:
   - Direction LF or B → use `tag.setPLongBuy` (default `-1%`)
   - Direction SF or S → use `tag.setPShortSell` (default `+1%`)
4. Place ONE unified limit order at that offset price for the combined total quantity
5. Direction matches tag direction: LF/B = buy limit, SF/S = sell limit (Item 72)
6. Reset counter and list

```js
async function cleanerConsolidate(exchange, tag) {
  // Cancel pending limits from this batch
  for (const order of tag.normalOrderList) {
    if (order.orderId) {
      try { await exchange.cancelOrder(order.orderId, tag.symbol) } catch(e) {}
    }
  }

  // Calculate avg price and total qty
  let totalValue = 0, totalQty = 0
  for (const order of tag.normalOrderList) {
    totalValue += order.price * order.qty
    totalQty += order.qty
  }
  const avgPrice = totalValue / totalQty

  // Apply p offset
  const pOffset = (tag.direction === 'LF' || tag.direction === 'B')
    ? tag.setPLongBuy    // e.g. "-1%"
    : tag.setPShortSell  // e.g. "+1%"
  const price = applyPOffset(avgPrice, pOffset)
  const finalPrice = parseFloat(exchange.priceToPrecision(tag.symbol, price))
  const finalQty = parseFloat(exchange.amountToPrecision(tag.symbol, totalQty))

  // Place unified order — same direction as tag
  const side = (tag.direction === 'LF' || tag.direction === 'B') ? 'buy' : 'sell'
  const order = await exchange.createLimitOrder(tag.symbol, side, finalQty, finalPrice)

  // Reset counter
  tag.normalOrderCount = 0
  tag.normalOrderList = []
  await tag.save()
}
```

### 4.4 — Balancer ON — Full Set Mode (Items 36, 39)

When threshold reached with Balancer ON:

1. Calculate average entry of the accumulated orders
2. Apply Set `p` offset
3. Place ONE Set limit order at that price for combined quantity
4. Reset normal counter to 0
5. Increment Set counter

```js
async function createSetOrder(exchange, tag) {
  // Calculate avg entry and total qty from normalOrderList
  let totalValue = 0, totalQty = 0
  for (const order of tag.normalOrderList) {
    totalValue += order.price * order.qty
    totalQty += order.qty
  }
  const avgPrice = totalValue / totalQty

  // Apply Set p offset
  const pOffset = (tag.direction === 'LF' || tag.direction === 'B')
    ? tag.setPLongBuy
    : tag.setPShortSell
  const price = applyPOffset(avgPrice, pOffset)
  const finalPrice = parseFloat(exchange.priceToPrecision(tag.symbol, price))
  const finalQty = parseFloat(exchange.amountToPrecision(tag.symbol, totalQty))

  // Place Set limit order
  const side = (tag.direction === 'LF' || tag.direction === 'B') ? 'buy' : 'sell'
  const order = await exchange.createLimitOrder(tag.symbol, side, finalQty, finalPrice)

  // Track Set order
  tag.setCount += 1
  tag.setList.push({
    orderId: order.id,
    price: finalPrice,
    qty: finalQty,
    time: new Date()
  })

  // Reset normal counter
  tag.normalOrderCount = 0
  tag.normalOrderList = []

  // Check Super Set threshold
  if (tag.setCount >= tag.superSetThreshold) {
    await createSuperSetOrder(exchange, tag)
  }

  await tag.save()
}
```

**Limit order alerts** (Item 39): for `t=L` alerts, count toward threshold but do NOT place a Set on every alert. Only place when the counter reaches threshold.

### 4.5 — Set to Super Set (Item 38)

When Set counter reaches `tag.superSetThreshold`:

1. Cancel all pending Set limit orders on the exchange
2. Calculate average entry and total qty of those Sets
3. Apply Super Set `p` offset (`tag.superSetP`, default `-3%`)
4. Place ONE Super Set limit order
5. Reset Set counter to 0

```js
async function createSuperSetOrder(exchange, tag) {
  // Cancel all pending Set orders
  for (const setOrder of tag.setList) {
    if (setOrder.orderId) {
      try { await exchange.cancelOrder(setOrder.orderId, tag.symbol) } catch(e) {}
    }
  }

  // Calculate avg and total from Set list
  let totalValue = 0, totalQty = 0
  for (const setOrder of tag.setList) {
    totalValue += setOrder.price * setOrder.qty
    totalQty += setOrder.qty
  }
  const avgPrice = totalValue / totalQty

  // Apply Super Set p offset
  const price = applyPOffset(avgPrice, tag.superSetP)
  const finalPrice = parseFloat(exchange.priceToPrecision(tag.symbol, price))
  const finalQty = parseFloat(exchange.amountToPrecision(tag.symbol, totalQty))

  // Place Super Set limit order
  const side = (tag.direction === 'LF' || tag.direction === 'B') ? 'buy' : 'sell'
  const order = await exchange.createLimitOrder(tag.symbol, side, finalQty, finalPrice)

  // Reset Set counter and list
  tag.setCount = 0
  tag.setList = []
  await tag.save()
}
```

### 4.6 — Set Fill Handling

When a Set limit order fills (detected via WebSocket or polling):

1. Call `tagManager.updateAvgEntry(tag, 'set', fillPrice, filledQty)`
2. Call `tagManager.recordFee(tag, fillPrice, filledQty)`
3. Trigger Main Tag TP recalculation (Layer 3 integration)
4. Reset Main Tag TP timer

When a Super Set limit order fills:
1. Call `tagManager.updateAvgEntry(tag, 'superSet', fillPrice, filledQty)`
2. Call `tagManager.recordFee(tag, fillPrice, filledQty)`
3. Trigger Main Tag TP recalculation
4. Reset Main Tag TP timer
5. If Super Set layer had zero active TPs → place 5 Super Set TPs

### 4.7 — Per-Tag Settings (Item 37)

All configurable from the interface (Layer 6). Stored in the Tag document:

| Setting | Field | Default |
|---------|-------|---------|
| Balancer toggle | `balancerEnabled` | `false` (OFF = Cleaner) |
| Multiplier | `multiplier` | `1` |
| Set counter threshold | `setCounterThreshold` | `13` |
| Super Set threshold | `superSetThreshold` | `12` |
| Set p (LF / B) | `setPLongBuy` | `-1%` |
| Set p (SF / S) | `setPShortSell` | `+1%` |
| Super Set p | `superSetP` | `-3%` |

### 4.8 — Shared Utility: `applyPOffset`

```js
function applyPOffset(basePrice, pOffset) {
  if (!pOffset || pOffset === '0') return basePrice
  if (typeof pOffset === 'string' && pOffset.endsWith('%')) {
    const pct = parseFloat(pOffset.replace('%', '')) / 100
    return basePrice * (1 + pct)
  }
  return basePrice + parseFloat(pOffset)
}
```

This can live in `priceResolver.js` (Layer 1) since it's a general utility.

### 4.9 — Spot Support (Items 67-68)

The entire Balancer/Set/Super Set system works identically on spot tags:
- Same counter logic, same threshold triggers
- Quantities are in coins (not contracts)
- Direction is always B (spot cannot short via Sets)
- 3 TP layers work on spot (Item 68)

No special spot branching needed in this layer — it's direction-agnostic.

---

## Integration Points

- **Layer 1**: after each fill, calls `balancer.incrementCounter()` and checks threshold
- **Layer 2**: `tagManager` stores counters, lists, settings; `balancer` reads/writes them
- **Layer 3**: Set/SuperSet fills trigger `tpEngine.recalculateTpOrders(tag, 'mainTag')` and reset Main Tag timer
- **Layer 5**: FLF/FSF resets counters and lists but KEEPS existing Set/SuperSet limit orders on exchange
- **Layer 6**: writes `balancerEnabled`, thresholds, `p` offsets to tag document

---

## Validation Criteria

- [ ] Counter increments on every LF/SF/B/S fill
- [ ] Cleaner mode: cancels pending, unifies at avg price + offset, resets counter
- [ ] Set mode: consolidates at threshold, places Set limit with offset
- [ ] Super Set: promotes at threshold, cancels Sets, places one Super Set
- [ ] Set fill triggers Main Tag TP recalculation + timer reset
- [ ] Super Set fill triggers Main Tag TP recalculation + timer reset
- [ ] Limit alerts (`t=L`) count toward threshold, don't trigger Set on every alert
- [ ] Unified order direction matches tag direction (Item 72)
- [ ] All per-tag settings are configurable and persisted
- [ ] Works identically on spot tags (Items 67-68)
