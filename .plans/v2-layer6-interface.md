# Layer 6 — Interface

**MasterGuide Items**: 49-54, 42-43
**Depends on**: All previous layers (Layers 1-5)
**Depended on by**: Nothing — this is the top layer

---

## Goal

Build the React frontend that displays all tag data, allows per-tag configuration of TP levels/timers/balancer settings, shows pending orders with edit/cancel, and provides fee/funding/alert-log tabs per tag.

**Also: expose and reconcile the real exchange position vs. the system's tracked position.** Over months of flips and partial closes, small contract residuals (rounding, partial fills, cancelled-but-partially-filled orders, ghost contract leftovers on flips/closes) accumulate. The bot can end up thinking the account holds 1000 LF total across all tags while BitMEX actually holds 1003 LF. The interface must surface this delta per symbol, and a **Position Balancer** must be able to close the residual so the system and the exchange stay in sync.

---

## Modified / New Files

```
client/src/
  components/
    TagTable/
      TagTable.js           — main table with all columns from Section 8.1
      TagRow.js             — single row, clickable to expand
      ExpandableSettings.js — inline settings panel (Section 8.2)
      TpConfigTable.js      — 5-row TP config editor per layer
    Tabs/
      FeesTab.js            — current + lifetime fees (Section 8.3)
      FundingTab.js         — lifetime funding + live rate (Section 8.3)
      AlertLogTab.js        — per-tag alert history table (Section 8.4)
    PendingOrders/
      PendingOrdersPanel.js — Set/SuperSet/BB orders with Edit/Clean (Section 8.5)
    PositionBalancer/
      PositionBalancerPanel.js — real exchange vs system position, delta, balance action (Section 6.9)
    TagManagement/
      AddTagForm.js         — create tag with defaults
      EditTagForm.js        — rename, change symbol
      DeleteTagDialog.js    — confirmation + order cancellation flow
server/
  routes/
    tagRoutes.js            — v2 API endpoints for tag CRUD, settings, logs
  engine/
    positionBalancer.js     — aggregate system position, compare to exchange, place delta-closing market order
```

---

## Tasks

### 6.1 — Backend API Endpoints (`tagRoutes.js`)

New REST endpoints for v2 tag management. Mount under `/api/v2/`:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v2/tags` | GET | All tags for account, formatted for display |
| `/api/v2/tags/:tag` | GET | Single tag with full state |
| `/api/v2/tags` | POST | Create new tag (name, symbol, account) |
| `/api/v2/tags/:tag` | PUT | Update tag name or symbol |
| `/api/v2/tags/:tag` | DELETE | Delete tag (with order cancellation flow) |
| `/api/v2/tags/:tag/settings` | PUT | Save all settings (balancer, multiplier, thresholds, TP configs, timers) |
| `/api/v2/tags/:tag/alerts` | GET | Alert log for tag (paginated) |
| `/api/v2/tags/:tag/pending` | GET | Pending orders (Sets, SuperSets, BB) |
| `/api/v2/tags/:tag/pending/:orderId` | PUT | Edit pending order (price/qty) |
| `/api/v2/tags/:tag/pending/:orderId` | DELETE | Cancel pending order on exchange + remove |
| `/api/v2/tags/:tag/pnl` | GET | Unrealized + Realized PnL (needs current price) |
| `/api/v2/funding/rate` | GET | Current live funding rate from BitMEX |
| `/api/v2/position-balancer/:account` | GET | Per-symbol: system total qty (summed across tags) vs exchange actual qty vs delta |
| `/api/v2/position-balancer/:account/:symbol/balance` | POST | Place a market order to close the delta for one symbol |

**GET `/api/v2/tags`** response shape (per tag):
```json
{
  "tag": "3MSOL",
  "account": "tester",
  "symbol": "SOL/USDT:USDT",
  "marketType": "futures",
  "direction": "LF",
  "contracts": 10.0,
  "avgPrice": 123.57,
  "dollarAmount": 1235.70,
  "unrealizedPnL": 45.23,
  "realizedPnL": 120.50,
  "tradeCount": 27,
  "firstOpened": "2026-03-01T...",
  "lastUpdated": "2026-04-13T...",
  "currentPositionFees": 1.23,
  "totalFeesPaid": 15.67,
  "totalFundingPaid": 3.45
}
```

Apply display formatting:
- Futures contracts: internal value / 100
- Spot: raw coin quantity
- Dollar amount: futures `(contracts/100) * avgPrice`, spot `coins * avgPrice`

### 6.2 — Main Table (Section 8.1)

Columns:

| Column | Source | Notes |
|--------|--------|-------|
| Tag | `tag.tag` | Clickable — expands settings panel inline |
| Account | `tag.account` | |
| Symbol | `tag.symbol` | |
| Side | `tag.direction` | LF/SF for futures, B/S for spot |
| Market | `tag.marketType` | `futures` or `spot` |
| Contracts | formatted | Futures ÷ 100, Spot raw |
| Avg Price | weighted avg | All 3 layers weighted |
| Dollar Amount | calculated | |
| Unrealized PnL | live | Green positive, red negative |
| Realized PnL | `tag.realizedPnL` | Accumulated |
| Trades | `tag.tradeCount` | |
| First Opened | `tag.firstOpened` | |
| Last Updated | `tag.lastUpdated` | |

**Polling**: fetch `/api/v2/tags` every 5-10 seconds for live updates. Unrealized PnL needs current price — either pass from public WS stream or compute server-side.

### 6.3 — Expandable Row (Section 8.2)

Click a tag name to expand an inline settings panel below the row.

#### Settings Controls

| Element | Type | Default | Field |
|---------|------|---------|-------|
| Balancer | Toggle | OFF | `balancerEnabled` |
| Multiplier | Number input | 1 | `multiplier` (min 1) |
| Set counter threshold | Number input | 13 | `setCounterThreshold` |
| Super Set threshold | Number input | 12 | `superSetThreshold` |
| Set p (LF / B) | Text input | -1% | `setPLongBuy` |
| Set p (SF / S) | Text input | +1% | `setPShortSell` |
| Super Set p | Text input | -3% | `superSetP` |

#### TP Configuration Tables (3 per tag)

Each layer gets a 5-row editable table:

| TP Level | Trigger % | Sell % |
|----------|-----------|--------|
| TP1 | [3] | [20] |
| TP2 | [6] | [25] |
| TP3 | [9] | [33] |
| TP4 | [12] | [50] |
| TP5 | [18] | [100] |

Plus a timer dropdown per layer:
- Main Tag TP timer: 15min / 30min / 1hr / 4hr / OFF (default 30min)
- Set TP timer: default 15min
- Super Set TP timer: default 1hr

**Save button**: saves all settings for this tag only → `PUT /api/v2/tags/:tag/settings`

### 6.4 — Per-Tag Tabs (Section 8.3)

Three tabs within the expanded row:

#### Fees Tab
- **Current position fees**: `tag.currentPositionFees` — resets on full close
- **Total fees paid**: `tag.totalFeesPaid` — never clears
- Show for ALL tags (spot and futures)

#### Funding Tab
- **Total funding paid**: `tag.totalFundingPaid` — never clears
- **Live current funding rate**: fetched from `/api/v2/funding/rate`
- **Hide for spot tags** (Item 69) — `if (tag.marketType === 'spot') return null`

#### Alert Log Tab (Section 8.4)

Table with columns:

| Column | Source |
|--------|--------|
| Time | `alertLog.time` |
| Command | `alertLog.command` |
| Type | `alertLog.type` (M/L) |
| Price (p) | `alertLog.p` |
| Qty (q) | `alertLog.q` |
| Fill Price | `alertLog.fillPrice` |
| Status | `alertLog.status` (Filled/Pending/Failed/Cancelled) |

Fetched from `/api/v2/tags/:tag/alerts`. Paginated for tags with large history. Never clears.

### 6.5 — Pending Orders Panel (Section 8.5)

A panel (below or beside the tag table) showing all pending limit orders across all tags:

| Column | Description |
|--------|-------------|
| Tag | Which tag |
| Type | Set / Super Set / BB Sell / BB Buy Back |
| Symbol | Trading pair |
| Side | Buy or Sell |
| Qty | Futures ÷ 100, Spot raw |
| Price | Limit price |
| Edit | Button → opens inline edit for price/qty |
| Clean | Button → cancels on exchange and removes |

**Edit flow**:
1. User changes price or qty
2. Cancel original order on exchange
3. Place new order with updated values
4. Update tag state with new order ID

**Clean flow**:
1. Cancel order on exchange via `DELETE /api/v2/tags/:tag/pending/:orderId`
2. Remove from tag state
3. Remove from panel

### 6.6 — Tag Management (Section 8.6)

#### Add Tag
Form fields: name, symbol, account. Pre-fills default TP values (3/6/9/12/18% triggers, 20/25/33/50/100% sells).

POST `/api/v2/tags` → creates tag document with defaults.

#### Edit Tag
Change name or symbol. PUT `/api/v2/tags/:tag`.

#### Delete Tag (Section 8.6 rules — Items 46-51)

This is a multi-step process with strict ordering:

```
1. Show confirmation dialog listing all active orders for this tag
2. Cancel ALL active TP orders on exchange
3. Cancel ALL pending BB orders on exchange
4. Cancel ALL pending Set and Super Set limit orders on exchange
5. Only after ALL cancels succeed → remove tag from interface
6. Do NOT close any open positions on BitMEX
```

**If any cancel fails (network error): abort deletion, show error.** Never delete a tag while it still has unconfirmed active orders on the exchange.

Backend: `DELETE /api/v2/tags/:tag` performs steps 2-5 atomically.

### 6.7 — Funding Rate Integration (Items 42-43)

#### Funding Rate Fetch

BitMEX charges/pays funding every 8 hours on perpetual contracts.

```js
// Poll or listen for funding settlement
async function fetchFundingPayments(exchange) {
  // Use BitMEX API to get recent funding history
  const funding = await exchange.fetchFundingHistory(symbol)
  return funding
}
```

#### Per-Tag Attribution

When funding settles:
1. Get total funding payment from BitMEX API
2. For each active futures tag, calculate tag's share:
   ```
   tagTotalQty = tag.totalQty + tag.setQty + tag.superSetQty
   tagFundingShare = fundingPayment * (tagTotalQty / totalAccountPosition)
   ```
3. Add to `tag.totalFundingPaid` — NEVER resets
4. Display live current funding rate next to funding tab

### 6.8 — Real-Time Updates

The frontend needs live data. Options:

**Option A — Server-Sent Events (SSE)**:
- Server pushes tag updates when state changes (fill, TP fire, etc.)
- Lower overhead than WebSocket for one-way data

**Option B — WebSocket to Frontend** (existing pattern):
- Current system already has `wss_stream` broadcasting to frontend
- Extend to push v2 tag state updates

**Option C — Polling** (simplest, existing pattern):
- Current frontend polls every 10s
- Good enough for initial implementation
- Upgrade to SSE/WS later for responsiveness

Recommend: **start with polling** (matches current architecture), add SSE/WS in a follow-up.

### 6.9 — Position Balancer (Exchange Reality Check)

Over time, the bot's tracked position and the actual exchange position drift apart. Causes observed in production:
- Ghost contract leftovers from flips and closes (small residual not fully closed)
- Rounding between `amountToPrecision` and exchange fill behavior
- Cancelled-but-partially-filled orders
- Manual trades placed outside the bot
- Missed fills during WebSocket outages before reconciliation kicked in

Even a tiny per-trade residual compounds over months into a large delta (the reported real case: system thinks 1000 LF, exchange holds 1003 LF).

#### Scope

The Position Balancer operates **per account, per symbol, across all tags** — it is NOT per-tag. The bot's "system position" for a symbol is the sum of `totalQty + setQty + superSetQty` across every tag on that account with that symbol, signed by direction (LF/B positive, SF/S negative for futures).

#### Backend — `positionBalancer.js`

```js
async function getPositionComparison(exchange, account) {
  // 1. Aggregate system position per symbol across all tags on this account
  const tags = await Tag.find({ account })
  const systemBySymbol = new Map()  // symbol -> signed qty

  for (const tag of tags) {
    const qty = tag.totalQty + tag.setQty + tag.superSetQty
    if (qty === 0) continue
    const signed = (tag.direction === 'LF' || tag.direction === 'B') ? qty : -qty
    systemBySymbol.set(tag.symbol, (systemBySymbol.get(tag.symbol) || 0) + signed)
  }

  // 2. Fetch actual exchange positions
  const positions = await exchange.fetchPositions()
  const exchangeBySymbol = new Map()
  for (const pos of positions) {
    if (pos.contracts && pos.contracts !== 0) {
      const signed = pos.side === 'long' ? pos.contracts : -pos.contracts
      exchangeBySymbol.set(pos.symbol, signed)
    }
  }

  // 3. Build comparison — union of both key sets
  const symbols = new Set([...systemBySymbol.keys(), ...exchangeBySymbol.keys()])
  const result = []
  for (const symbol of symbols) {
    const systemQty = systemBySymbol.get(symbol) || 0
    const exchangeQty = exchangeBySymbol.get(symbol) || 0
    result.push({
      symbol,
      systemQty,
      exchangeQty,
      delta: exchangeQty - systemQty,  // positive = exchange holds more than system thinks
      inSync: Math.abs(exchangeQty - systemQty) < 0.0000001
    })
  }
  return result
}

async function balancePosition(exchange, account, symbol) {
  const comparisons = await getPositionComparison(exchange, account)
  const row = comparisons.find(r => r.symbol === symbol)
  if (!row || row.inSync) return { action: 'noop', reason: 'already in sync' }

  // delta > 0 → exchange holds more than system → sell |delta| (close longs) or buy |delta| (close shorts)
  // delta < 0 → exchange holds less than system → do NOT auto-open a position to cover (that would be risky)
  //                                               surface it as a warning only
  if (row.delta < 0) {
    return { action: 'warn', reason: 'exchange holds LESS than system — manual review required', delta: row.delta }
  }

  // Close the residual. Direction to close = opposite of residual sign.
  // If exchange has +3 extra longs → sell 3
  // If exchange has -3 extra shorts (delta > 0 means exchange > system, can't be -3 short extra here)
  const side = row.exchangeQty > row.systemQty ? 'sell' : 'buy'
  const qty = Math.abs(row.delta)
  const order = await exchange.createMarketOrder(symbol, side, qty, undefined, { reduceOnly: true })
  return { action: 'balanced', orderId: order.id, side, qty }
}
```

**Critical safeguards**:
- Use `reduceOnly: true` so the balance order can never accidentally open a new position.
- If `delta < 0` (exchange holds LESS than system believes), **do NOT auto-trade** — surface a warning for manual investigation. Auto-buying to cover a phantom system position could open real exposure the user doesn't want.
- Balance order bypasses the tag system — it is booked to no tag, logged separately.
- Log every balance action with before/after state to a new `PositionBalanceLog` collection.

#### Optional Scheduled Reconciliation

A configurable daily job (default: disabled, opt-in per account) can call `balancePosition` automatically for every out-of-sync symbol.

- Setting lives on a per-account config doc (or extend user doc): `autoBalance: { enabled: false, hour: 0, minThreshold: 1 }`
- `minThreshold` — do not auto-balance if `|delta| < minThreshold` (avoids churn on tiny rounding drift)
- Log every run; surface last run timestamp in the UI

Manual "Balance Now" button should always be available regardless of the auto-balance setting.

#### Frontend — `PositionBalancerPanel.js`

A new panel (at the top of the page, or as a tab alongside the tag table):

| Symbol | System Qty | Exchange Qty | Delta | Status | Action |
|--------|-----------|--------------|-------|--------|--------|
| SOL/USDT:USDT | +1000 | +1003 | +3 | Out of sync | [Balance] |
| XRP/USDT:USDT | -500 | -500 | 0 | ✓ In sync | — |
| BTC/USDT:USDT | 0 | +2 | +2 | Orphan on exchange | [Balance] |

- Polls `/api/v2/position-balancer/:account` every 30s
- `[Balance]` button → POST to `/api/v2/position-balancer/:account/:symbol/balance`
- Show a confirmation dialog before sending the balance order (qty + side)
- For `delta < 0` rows: show a warning icon instead of a button, with text explaining manual review is required
- Auto-balance toggle + schedule controls live in the panel header

- **All layers**: the interface reads state from every layer and writes configuration back
- **Layer 2**: tag CRUD, settings persistence, alert log reads
- **Layer 3**: TP config writes trigger timer restarts; TP state shown in pending orders
- **Layer 4**: balancer settings saved; Set/SuperSet orders shown in pending panel
- **Layer 5**: BB orders shown in pending panel; delete tag triggers order cancellation

---

## Validation Criteria

- [ ] Main table shows all columns from Section 8.1 with correct formatting
- [ ] Futures contracts divided by 100 for display; spot shows raw coins
- [ ] Unrealized PnL updates live, green/red coloring
- [ ] Tag click expands inline settings panel
- [ ] All settings editable and saveable per tag
- [ ] 3 TP config tables × 5 rows, editable trigger % and sell %
- [ ] 3 timer dropdowns with correct defaults
- [ ] Fees tab: current + lifetime, shown for all tags
- [ ] Funding tab: lifetime + live rate, hidden for spot tags
- [ ] Alert log: clean table with all columns, never clears
- [ ] Pending orders panel: Edit and Clean buttons work
- [ ] Edit: cancels old order, places new, updates state
- [ ] Clean: cancels on exchange, removes from state
- [ ] Add tag: form with defaults, creates document
- [ ] Delete tag: cancels all orders first, aborts on failure
- [ ] Tags at zero position remain visible permanently
- [ ] Funding rate attributed per tag based on position share
- [ ] Position Balancer panel shows system qty, exchange qty, delta per symbol
- [ ] Balance button places a `reduceOnly` market order sized to the delta
- [ ] Balance action is blocked (warn-only) when exchange qty < system qty
- [ ] Every balance action is logged with before/after state
- [ ] Optional auto-balance schedule runs only when enabled and respects `minThreshold`
