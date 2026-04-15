# Layer 2 — Tag State & Position Tracking

**MasterGuide Items**: 7-8, 12-14, 40-41, 46-48, 62, 65, 73
**Depends on**: Layer 1 (Core Engine)
**Depended on by**: Layers 3, 4, 5, 6

---

## Goal

Implement the tag as a rich, persistent stateful object with 3 independent position layers (Main, Set, Super Set). This is the data model that every other system reads and writes.

---

## New Files

```
server/engine/
  tagManager.js       — CRUD, state transitions, weighted avg recalculation
server/database/
  models/
    Tag.js            — Mongoose schema for v2 tag state
    AlertLog.js       — per-tag alert history
```

---

## Tasks

### 2.1 — Tag Schema (`Tag.js`)

A single MongoDB document per tag+account combination. This replaces the simpler `Trades_Opened` and `Positions_Open` models for v2 tags.

```js
const TagSchema = new mongoose.Schema({
  tag:       { type: String, required: true, index: true },
  account:   { type: String, required: true, index: true },
  symbol:    { type: String, required: true },
  marketType:{ type: String, enum: ['futures', 'spot'], required: true },

  // Direction — neutral when no position
  direction: { type: String, enum: ['LF', 'SF', 'B', 'S', null], default: null },

  // --- Main Tag Layer ---
  avgEntry:     { type: Number, default: 0 },
  totalQty:     { type: Number, default: 0 },

  // --- Set Layer ---
  setAvgEntry:  { type: Number, default: 0 },
  setQty:       { type: Number, default: 0 },

  // --- Super Set Layer ---
  superSetAvgEntry: { type: Number, default: 0 },
  superSetQty:      { type: Number, default: 0 },

  // --- Counters ---
  normalOrderCount: { type: Number, default: 0 },
  normalOrderList:  [{ type: mongoose.Schema.Types.Mixed }],
  setCount:         { type: Number, default: 0 },
  setList:          [{ type: mongoose.Schema.Types.Mixed }],

  // --- Fee Tracking ---
  currentPositionFees: { type: Number, default: 0 },  // resets on full close
  totalFeesPaid:       { type: Number, default: 0 },  // NEVER resets
  totalFundingPaid:    { type: Number, default: 0 },  // NEVER resets (futures only)

  // --- PnL ---
  realizedPnL: { type: Number, default: 0 },

  // --- TP Order IDs (active on exchange) ---
  activeTpOrders: {
    mainTag:  [{ id: String, level: Number, filled: Boolean, price: Number, qty: Number }],
    set:      [{ id: String, level: Number, filled: Boolean, price: Number, qty: Number }],
    superSet: [{ id: String, level: Number, filled: Boolean, price: Number, qty: Number }]
  },

  // --- TP Configuration (from interface, NOT from alerts) ---
  tpConfig: {
    mainTag: {
      levels: [{
        triggerPct: { type: Number },  // e.g. 3 = 3%
        sellPct:    { type: Number }   // e.g. 20 = 20%
      }],
      // Integer minutes, 0-999999. 0 = OFF. No fixed enum — user can type any value.
      timerMinutes: { type: Number, min: 0, max: 999999, default: 30 }
    },
    set: {
      levels: [{ triggerPct: Number, sellPct: Number }],
      timerMinutes: { type: Number, min: 0, max: 999999, default: 15 }
    },
    superSet: {
      levels: [{ triggerPct: Number, sellPct: Number }],
      timerMinutes: { type: Number, min: 0, max: 999999, default: 60 }
    }
  },

  // --- Balancer / Set Settings ---
  balancerEnabled:     { type: Boolean, default: false },
  multiplier:          { type: Number, default: 1, min: 1 },
  setCounterThreshold: { type: Number, default: 13 },
  superSetThreshold:   { type: Number, default: 12 },
  setPLongBuy:         { type: String, default: '-1%' },
  setPShortSell:       { type: String, default: '+1%' },
  superSetP:           { type: String, default: '-3%' },

  // --- BB State ---
  activeBBOrders: [{
    sellOrderId: String,
    buyOrderId:  String,
    bbQty:       Number,
    sellPrice:   Number,
    p2:          String,
    status:      { type: String, enum: ['sell_pending', 'sell_filled', 'buy_pending', 'buy_filled'] }
  }],

  // --- Timestamps ---
  firstOpened: { type: Date },
  lastUpdated: { type: Date, default: Date.now },
  tradeCount:  { type: Number, default: 0 }
})

TagSchema.index({ tag: 1, account: 1 }, { unique: true })
```

**Default TP levels** (pre-filled on tag creation):
```js
const DEFAULT_TP_LEVELS = [
  { triggerPct: 3,  sellPct: 20 },
  { triggerPct: 6,  sellPct: 25 },
  { triggerPct: 9,  sellPct: 33 },
  { triggerPct: 12, sellPct: 50 },
  { triggerPct: 18, sellPct: 100 }
]
```

### 2.2 — Alert Log Schema (`AlertLog.js`)

Permanent record per alert. Never deleted (except by CLEAN).

```js
const AlertLogSchema = new mongoose.Schema({
  tag:       { type: String, required: true, index: true },
  account:   { type: String, required: true, index: true },
  time:      { type: Date, default: Date.now },
  command:   String,  // LF, SF, FLF, etc.
  type:      String,  // M or L
  p:         String,  // p value from alert
  q:         String,  // q value from alert
  fillPrice: Number,  // actual fill price
  status:    { type: String, enum: ['Filled', 'Pending', 'Failed', 'Cancelled'], default: 'Pending' }
})
```

### 2.3 — Tag Manager (`tagManager.js`)

Central module for all tag state operations. All other layers call into this — they never modify tag documents directly.

#### Core Functions

**`getOrCreateTag(tag, account, symbol)`**
- Find existing tag document by `{tag, account}`
- If not found, create with defaults (detect marketType from symbol)
- Return the tag document

**`updateAvgEntry(tag, layer, fillPrice, newQty)`** (Items 12-14)
- Implements weighted average recalculation per MasterGuide Section 3.2
- `layer` is one of: `'main'`, `'set'`, `'superSet'`
- Zero guard on first fill per layer

```js
function updateAvgEntry(tag, layer, fillPrice, newQty) {
  if (layer === 'main') {
    if (tag.totalQty === 0) {
      tag.avgEntry = fillPrice
    } else {
      tag.avgEntry = (tag.totalQty * tag.avgEntry + newQty * fillPrice) / (tag.totalQty + newQty)
    }
    tag.totalQty += newQty
  } else if (layer === 'set') {
    if (tag.setQty === 0) {
      tag.setAvgEntry = fillPrice
    } else {
      tag.setAvgEntry = (tag.setQty * tag.setAvgEntry + newQty * fillPrice) / (tag.setQty + newQty)
    }
    tag.setQty += newQty
  } else if (layer === 'superSet') {
    if (tag.superSetQty === 0) {
      tag.superSetAvgEntry = fillPrice
    } else {
      tag.superSetAvgEntry = (tag.superSetQty * tag.superSetAvgEntry + newQty * fillPrice) / (tag.superSetQty + newQty)
    }
    tag.superSetQty += newQty
  }
}
```

**`recordFee(tag, fillPrice, qty)`** (Items 40-41)
```js
function recordFee(tag, fillPrice, qty) {
  const fee = fillPrice * qty * 0.0005
  tag.totalFeesPaid += fee          // NEVER resets
  tag.currentPositionFees += fee    // resets on full close
}
```

**`recordRealizedPnL(tag, layer, fillPrice, qtyClosed)`** (Item 73 — block scoping)
- Uses correct layer avgEntry (main, set, or superSet)
- Accounts for direction (LF/B vs SF)
- Deducts fee from realized PnL

**`reducePosition(tag, layer, qtyClosed)`** (Items 7-8)
- Subtract qty from the correct layer
- Direction does NOT change
- avgEntry does NOT change — only qty changed
- If all layers reach zero: reset `currentPositionFees`, direction becomes null

**`getWeightedAvgEntry(tag)`**
- Weighted average across all 3 layers (for Main Tag TP calculation)
```js
function getWeightedAvgEntry(tag) {
  const totalQty = tag.totalQty + tag.setQty + tag.superSetQty
  if (totalQty === 0) return 0
  const totalValue = (tag.totalQty * tag.avgEntry) +
                     (tag.setQty * tag.setAvgEntry) +
                     (tag.superSetQty * tag.superSetAvgEntry)
  return totalValue / totalQty
}
```

**`getTotalQty(tag)`**
- Returns `tag.totalQty + tag.setQty + tag.superSetQty`

**`isFullyClosed(tag)`**
- Returns `getTotalQty(tag) === 0`
- When true, caller should reset `currentPositionFees` to 0 and set `direction` to null

**`logAlert(tag, account, alertData, fillPrice, status)`**
- Creates an AlertLog document

**`cleanTag(tag, account)`**
- Existing CLEAN implementation — deletes all data for a tag
- Also deletes AlertLog entries

### 2.4 — Partial Close Logic (Items 7-8)

When SF arrives while holding LF (or LF while holding SF, or S while B, or B while S):

1. Execute the opposite-direction order for the resolved quantity
2. Call `reducePosition(tag, 'main', qtyClosed)`
3. Call `recordRealizedPnL(tag, 'main', fillPrice, qtyClosed)`
4. Call `recordFee(tag, fillPrice, qtyClosed)`
5. Direction stays unchanged
6. avgEntry stays unchanged
7. Signal Layer 3 to cancel and re-place unfired Main Tag TPs with new qty

This logic lives in `alertRouter.js` (Layer 1) but calls `tagManager` functions. The tag manager doesn't know about order execution — it only manages state.

### 2.5 — Display Formatting Rules

These are rules for API responses, not stored values:
- **Futures contracts**: divide by 100 for display only (Item 46). Internal value unchanged.
- **Spot quantities**: raw coin quantity, do NOT divide by 100 (Items 47, 65)
- **Dollar Amount**: futures = `(contracts / 100) * avgPrice`, spot = `coins * avgPrice`
- Tags at zero position remain visible permanently (Item 48)

Provide a `formatTagForDisplay(tag)` utility that applies these rules before sending to frontend.

### 2.6 — Migration from v1 Models

The existing `Trades_Opened`, `Positions_Open`, `Trigger_Orders`, `TO_Processed`, `Trades_Closed` collections are used by v1. For the transition:

- v2 tags use the new `Tag` collection exclusively
- v1 collections remain untouched — v1 endpoints still work
- No data migration needed — v2 tags start fresh
- Once v2 is stable, v1 collections can be archived

---

## Integration Points

- **Layer 1** calls `tagManager.getOrCreateTag()` on every alert, passes tag state to resolvers
- **Layer 3** reads `tag.tpConfig`, writes `tag.activeTpOrders`
- **Layer 4** reads/writes counters, lists, Set/SuperSet state
- **Layer 5** reads/writes `tag.activeBBOrders`, calls `reducePosition` for flips
- **Layer 6** reads everything, writes `tpConfig` and settings

---

## Validation Criteria

- [ ] Tag created on first alert for a new tag+account combo
- [ ] Weighted avg recalculation correct for all 3 layers independently
- [ ] Partial close: qty reduced, direction unchanged, avgEntry unchanged
- [ ] Fee recorded on every fill to both `currentPositionFees` and `totalFeesPaid`
- [ ] `currentPositionFees` resets to 0 when all layers reach zero qty
- [ ] `totalFeesPaid` and `totalFundingPaid` never reset
- [ ] `realizedPnL` uses correct layer avgEntry (not always main)
- [ ] Tag persists at zero position — never auto-deleted
- [ ] Futures display divides contracts by 100, spot shows raw coins
- [ ] Alert log records every alert with correct status
- [ ] Unique index on `{tag, account}` prevents duplicates
