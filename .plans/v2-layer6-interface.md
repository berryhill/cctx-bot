# Layer 6 — Interface

**MasterGuide Items**: 49-54, 42-43
**Depends on**: All previous layers (Layers 1-5)
**Depended on by**: Nothing — this is the top layer

---

## Goal

Build the React frontend that displays all tag data, allows per-tag configuration of TP levels/timers/balancer settings, shows pending orders with edit/cancel, and provides fee/funding/alert-log tabs per tag.

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
    TagManagement/
      AddTagForm.js         — create tag with defaults
      EditTagForm.js        — rename, change symbol
      DeleteTagDialog.js    — confirmation + order cancellation flow
server/
  routes/
    tagRoutes.js            — v2 API endpoints for tag CRUD, settings, logs
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

---

## Integration Points

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
