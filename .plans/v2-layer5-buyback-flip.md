# Layer 5 — Buy Back, Flip, Close, and Reconnect

**MasterGuide Items**: 17-20, 34, 59-60, 63-64, 66, 69-70
**Depends on**: Layer 1 (Core Engine), Layer 2 (Tag State), Layer 3 (TP Engine), Layer 4 (Balancer)
**Depended on by**: Layer 6 (Interface shows BB/pending orders)

---

## Goal

Implement the complex multi-step order flows: Buy Back (sell then buy back), Flip (close + reverse), advanced close commands (CB/CS), and WebSocket reconnection with state reconciliation.

---

## New Files

```
server/engine/
  buyBack.js          — BB two-step sell→buy-back logic
  flipHandler.js      — FLF/FSF full reset + reverse entry
  closeHandler.js     — CLF/CSF/CB/CS close logic (TP sequence or BB)
  reconciler.js       — WebSocket reconnect + state recovery
```

---

## Tasks

### 5.1 — Buy Back System (`buyBack.js`) (Items 17-20, 66)

BB is a two-step trade: sell at `p`, then buy back at `p2` after the sell fills.

#### BB Alert Detection

In the alert router (Layer 1), when `alert.type === 'BB'`:
- Route to `buyBack.execute()` instead of the normal close handler
- Required fields: `p` (sell price), `p2` (buy back price), `q` (quantity)

#### BB Step-by-Step (MasterGuide Section 5.2)

```js
async function executeBuyBack(exchange, tag, alert) {
  const currentPrice = (await exchange.fetchTicker(tag.symbol)).last

  // Step 1: Resolve sell price from p
  const sellPrice = await resolvePrice(exchange, tag.symbol, alert.p)

  // Step 2: Resolve quantity
  const bbQty = resolveQuantity(exchange, tag.symbol, alert.q, currentPrice, tag.multiplier, tag)

  // Step 3: Place SELL limit at p
  const side = (tag.direction === 'LF' || tag.direction === 'B') ? 'sell' : 'buy'
  const sellOrder = await exchange.createLimitOrder(tag.symbol, side, bbQty, sellPrice)

  // Step 4: Subtract bbQty from tag total
  tagManager.reducePosition(tag, 'main', bbQty)

  // Step 5: Store BB state
  tag.activeBBOrders.push({
    sellOrderId: sellOrder.id,
    buyOrderId: null,
    bbQty: bbQty,
    sellPrice: sellPrice,
    p2: alert.p2,
    status: 'sell_pending'
  })
  await tag.save()

  // Steps 6-12 handled by BB fill monitor (see 5.2)
}
```

#### BB Fill Monitor (Steps 7-12)

When the sell order fills (detected via WebSocket):

```js
async function onBBSellFilled(exchange, tag, bbOrder, sellFillPrice) {
  // Step 8: Resolve p2 using sell fill price as reference
  const buyBackPrice = applyPOffset(sellFillPrice, bbOrder.p2)
  const finalPrice = parseFloat(exchange.priceToPrecision(tag.symbol, buyBackPrice))

  // Step 9: Place BUY limit for SAME bbQty — NOT recalculated from USD
  const side = (tag.direction === 'LF' || tag.direction === 'B') ? 'buy' : 'sell'
  const buyOrder = await exchange.createLimitOrder(tag.symbol, side, bbOrder.bbQty, finalPrice)

  // Step 10: Update BB state
  bbOrder.buyOrderId = buyOrder.id
  bbOrder.status = 'buy_pending'
  await tag.save()
}

async function onBBBuyFilled(exchange, tag, bbOrder) {
  // Step 12: Buy back filled — add bbQty back to tag total
  tagManager.updateAvgEntry(tag, 'main', fillPrice, bbOrder.bbQty)
  tagManager.recordFee(tag, fillPrice, bbOrder.bbQty)

  // Remove from active BB orders
  tag.activeBBOrders = tag.activeBBOrders.filter(
    bb => bb.sellOrderId !== bbOrder.sellOrderId
  )
  await tag.save()
}
```

#### BB Cancellation Rules

- **FLF/FSF arrives while BB active (futures)**: cancel ALL pending BB orders immediately (Item 19)
- **CB/CS fully closes position while BB active (spot)**: cancel ALL pending BB orders
- Both legs visible in Pending Orders Panel (Item 18)

#### Spot BB (Item 66)

Same logic, quantities in coins not contracts. Buy back restores exact same coin quantity.
Uses `CB` or `CS` command with `type: "BB"`.

### 5.2 — Flip Handler (`flipHandler.js`) (Item 34, 59)

FLF (Flip to Long) and FSF (Flip to Short) — futures only.

#### Flip Rejection on Spot (Item 70)

```js
if (tag.marketType === 'spot') {
  logError('FLIP', new Error(`FLF/FSF rejected on spot tag ${tag.tag}`))
  return { error: 'Flip commands not supported on spot' }
}
```

#### Flip Sequence (MasterGuide Section 4.7)

```js
async function executeFlip(exchange, tag, newDirection) {
  // Step 1: Cancel ALL unfired TPs across all 3 layers (Item 29)
  await tpEngine.cancelAllTps(exchange, tag)

  // Step 2: Cancel ALL pending BB orders (Item 19)
  for (const bb of tag.activeBBOrders) {
    if (bb.sellOrderId && bb.status === 'sell_pending') {
      try { await exchange.cancelOrder(bb.sellOrderId, tag.symbol) } catch(e) {}
    }
    if (bb.buyOrderId && bb.status === 'buy_pending') {
      try { await exchange.cancelOrder(bb.buyOrderId, tag.symbol) } catch(e) {}
    }
  }
  tag.activeBBOrders = []

  // Step 3: Reset ALL counters and lists
  tag.normalOrderCount = 0
  tag.normalOrderList = []
  tag.setCount = 0
  tag.setList = []

  // Step 4: Reset ALL avgEntry and qty values
  tag.avgEntry = 0;         tag.totalQty = 0
  tag.setAvgEntry = 0;      tag.setQty = 0
  tag.superSetAvgEntry = 0; tag.superSetQty = 0

  // Step 5: Reset ALL 3 TP recalculation timers
  tpEngine.stopAllTpTimers(tag)

  // Step 6: Reset currentPositionFees (NOT totalFeesPaid or totalFundingPaid)
  tag.currentPositionFees = 0

  // Step 7: Close full main position (market order)
  const closeSide = (tag.direction === 'LF') ? 'sell' : 'buy'
  const totalQty = tag.totalQty + tag.setQty + tag.superSetQty
  if (totalQty > 0) {
    await exchange.createMarketOrder(tag.symbol, closeSide, totalQty)
  }

  // Step 8: Keep existing Set and Super Set limit orders on exchange
  // (Do NOT cancel them — they stay live)

  // Step 9: Open new position in flipped direction — ALWAYS market order
  tag.direction = newDirection  // 'LF' or 'SF'
  const entrySide = (newDirection === 'LF') ? 'buy' : 'sell'
  const entryQty = resolveQuantity(exchange, tag.symbol, alert.q, currentPrice, tag.multiplier, tag)
  const order = await exchange.createMarketOrder(tag.symbol, entrySide, entryQty)

  // Step 10: After fill — update state and place fresh Main Tag TPs
  const fillPrice = order.average || order.price
  tagManager.updateAvgEntry(tag, 'main', fillPrice, entryQty)
  tagManager.recordFee(tag, fillPrice, entryQty)
  tag.tradeCount += 1
  tag.lastUpdated = new Date()
  await tag.save()

  // Place fresh 5 Main Tag TPs
  await tpEngine.placeTpOrders(exchange, tag, 'mainTag')
  tpEngine.startTpTimer(tag, 'mainTag')
}
```

### 5.3 — Close Handler (`closeHandler.js`) (Items 63-64)

CLF/CSF (futures) and CB/CS (spot) — two modes: normal close (TP sequence) or BB.

#### Normal Close (no BB)

Delegates to Layer 3 TP sequence:
```js
async function executeClose(exchange, tag, alert) {
  if (alert.type === 'BB') {
    return buyBack.executeBuyBack(exchange, tag, alert)
  }

  // Fire Main Tag TP sequence (MasterGuide Section 4.6)
  const mainTps = tag.activeTpOrders.mainTag || []
  const hasActiveTps = mainTps.some(tp => !tp.filled)

  if (hasActiveTps) {
    // TPs already active — let them execute naturally
    return { status: 'TPs already active, running' }
  } else {
    // No active TPs — place all 5 immediately
    await tpEngine.placeTpOrders(exchange, tag, 'mainTag')
    tpEngine.startTpTimer(tag, 'mainTag')
    return { status: 'TP sequence initiated' }
  }
}
```

#### CB/CS Close by % or Fixed Amount (Item 63)

CB and CS support both modes — detected from `q` field:
- `q` ends with `%` → close that % of current position
- `q` is a number → close that USD amount worth

```js
// In resolveQuantity (Layer 1), the % logic already handles this:
// q = "50%" → sells 50% of totalQty + setQty + superSetQty
// q = "500" → sells $500 worth at current price
```

### 5.4 — WebSocket Reconnect + Reconciliation (`reconciler.js`) (Item 60)

#### Reconnect with Exponential Backoff

```js
async function reconnectWithBackoff(connectFn) {
  let delay = 1000
  while (true) {
    try {
      await connectFn()
      await reconcileState()
      break
    } catch (err) {
      logError('WS Reconnect', err)
      await new Promise(r => setTimeout(r, delay))
      delay = Math.min(delay * 2, 30000)
    }
  }
}
```

#### State Reconciliation (Item 20)

After reconnecting, must sync local state with what actually happened on the exchange:

```js
async function reconcileState() {
  const tags = await Tag.find({ direction: { $ne: null } })

  for (const tag of tags) {
    const exchange = getExchangeForAccount(tag.account)
    if (!exchange) continue

    // 1. Fetch all open orders from BitMEX for this symbol
    const openOrders = await exchange.fetchOpenOrders(tag.symbol)
    const openOrderIds = new Set(openOrders.map(o => o.id))

    // 2. Check TP orders — mark filled if no longer open
    for (const layer of ['mainTag', 'set', 'superSet']) {
      for (const tp of tag.activeTpOrders[layer]) {
        if (!tp.filled && !openOrderIds.has(tp.id)) {
          // Order gone from exchange = filled or cancelled
          const orderInfo = await exchange.fetchOrder(tp.id, tag.symbol)
          if (orderInfo.status === 'closed') {
            tp.filled = true
            // Trigger post-fill logic: update avg, PnL, etc.
            await handleTpFill(exchange, tag, layer, orderInfo)
          }
        }
      }
    }

    // 3. Check BB orders — detect orphaned sells (Item 20)
    for (const bb of tag.activeBBOrders) {
      if (bb.status === 'sell_pending' && !openOrderIds.has(bb.sellOrderId)) {
        const sellInfo = await exchange.fetchOrder(bb.sellOrderId, tag.symbol)
        if (sellInfo.status === 'closed') {
          // Sell filled while disconnected — auto-place buy back
          bb.status = 'sell_filled'
          await onBBSellFilled(exchange, tag, bb, sellInfo.average)
        }
      }
      if (bb.status === 'buy_pending' && !openOrderIds.has(bb.buyOrderId)) {
        const buyInfo = await exchange.fetchOrder(bb.buyOrderId, tag.symbol)
        if (buyInfo.status === 'closed') {
          await onBBBuyFilled(exchange, tag, bb)
        }
      }
    }

    // 4. Log any unknown orders on exchange for this symbol
    for (const order of openOrders) {
      const isKnown = isOrderTracked(tag, order.id)
      if (!isKnown) {
        console.log(`WARNING: Unknown order on exchange for ${tag.tag}:`, order.id, order.side, order.amount, order.price)
      }
    }

    await tag.save()
  }
}
```

### 5.5 — Funding Tab Hide for Spot (Item 69)

Not a backend logic change — this is a display rule for Layer 6. But the API should include `marketType` in tag responses so the frontend knows to hide the funding tab.

---

## Integration Points

- **Layer 1**: alert router dispatches to `closeHandler`, `flipHandler`, or `buyBack` based on command + type
- **Layer 2**: all handlers call `tagManager` for state updates (avgEntry, qty, fees, PnL)
- **Layer 3**: flip calls `tpEngine.cancelAllTps()` + `stopAllTpTimers()`; close initiates TP sequence; BB interacts with TP state
- **Layer 4**: flip resets counters/lists but keeps Set/SuperSet limit orders live on exchange
- **Layer 6**: BB orders shown in Pending Orders Panel with sell/buy status

---

## Validation Criteria

- [ ] BB: sell placed at p, tracked in activeBBOrders
- [ ] BB: after sell fills, buy back placed at p2 relative to sell fill price
- [ ] BB: buy back uses same bbQty (not recalculated from USD)
- [ ] BB: both legs visible in pending orders
- [ ] BB: all BB cancelled on FLF/FSF
- [ ] BB: orphaned sell detected on reconnect, buy back auto-placed (Item 20)
- [ ] BB: works on spot with coin quantities (Item 66)
- [ ] FLF/FSF: cancels all TPs and BB, resets counters/timers/fees, keeps Set/SuperSet orders
- [ ] FLF/FSF: closes position then opens reverse via market order
- [ ] FLF/FSF: fresh TPs placed after new entry fill
- [ ] FLF/FSF: rejected on spot tags with error log (Item 70)
- [ ] CLF/CSF: fires TP sequence (places if none active, lets run if active)
- [ ] CB/CS: close by % and by fixed amount both work (Item 63)
- [ ] WebSocket reconnect: exponential backoff up to 30s
- [ ] Reconciliation: detects filled TPs, triggers post-fill logic
- [ ] Reconciliation: detects orphaned BB sells, auto-places buy back
- [ ] Reconciliation: logs unknown orders on exchange
