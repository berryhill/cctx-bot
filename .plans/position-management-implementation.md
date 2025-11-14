# Position Management System - Implementation Plan

**Created:** 2025-11-10
**Status:** Planning Phase
**Goal:** Implement three-schema architecture for position tracking with partial close support

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Schema Definitions](#schema-definitions)
3. [Phased Implementation](#phased-implementation)
4. [Workflow Examples](#workflow-examples)
5. [Open Questions](#open-questions)
6. [Edge Cases & Error Handling](#edge-cases--error-handling)

---

## Architecture Overview

### Current State
- ✅ `open_trades`: Individual trade executions stored in MongoDB
- ❌ No aggregated position tracking
- ❌ No close history tracking
- ❌ Close commands (CB/CS) incomplete and buggy

### Target State: Three-Schema System

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│  open_trades    │      │ open_positions   │      │ closed_trades   │
├─────────────────┤      ├──────────────────┤      ├─────────────────┤
│ Individual      │  ──> │ Aggregated view  │ <──  │ Close actions   │
│ order fills     │      │ per tag          │      │ audit trail     │
│ (never deleted) │      │ (upsert/update)  │      │ (insert only)   │
└─────────────────┘      └──────────────────┘      └─────────────────┘
```

### Data Flow

**Opening Positions:**
```
Webhook (B/S/BT/ST)
  → Place order via CCXT
  → On fill:
     1. INSERT into open_trades (order record)
     2. UPSERT into open_positions (aggregate position)
```

**Closing Positions:**
```
Webhook (CL/CS with percentage)
  → READ open_positions (get current position)
  → Calculate contracts to close
  → Place close order via CCXT
  → On fill:
     1. UPDATE open_positions (reduce contracts or delete if 100%)
     2. INSERT into closed_trades (close record)
     3. KEEP open_trades unchanged (historical record)
```

---

## Schema Definitions

### 1. `open_trades` (Existing - Minor Updates)

**Purpose:** Immutable record of every order execution that opened a position

**Current Schema:**
```javascript
{
  tag: String (required, indexed),
  account: String (required, indexed),
  symbol: String (required),
  side: String (required, match: /^B$|^S$/),
  alias: String (required),
  order_id: String (optional),
  price: Number (required),
  contracts: Number (required),
  metadata: Object (optional),  // Original webhook payload
  opened: Date (default: now),
  created: Date (default: now)
}
```

**Updates Needed:**
- ✅ Already correct, no changes
- Consider adding: `status: String (default: "open")` for future use?

**Operations:**
- INSERT on every order fill (B, S, BT, ST commands)
- NEVER UPDATE or DELETE (permanent audit trail)
- QUERY for historical analysis

---

### 2. `open_positions` (NEW)

**Purpose:** Real-time aggregated position state per tag

**Schema:**
```javascript
{
  tag: String (required, indexed),
  account: String (required, indexed),
  symbol: String (required),
  side: String (required, match: /^B$|^S$/),  // Current position direction
  total_contracts: Number (required, min: 0),  // Current open contracts
  average_price: Number (required),            // Weighted average entry price
  trade_count: Number (required, default: 0),  // Number of trades that built this position
  trade_ids: [String],                         // Array of order_id from open_trades
  first_opened: Date (required),               // When position first opened
  last_updated: Date (required),               // Last modification timestamp
  metadata: Object (optional)                  // Latest webhook payload or custom data
}
```

**Indexes:**
- Unique compound index: `(tag, account)`
- Index on: `account`, `symbol`

**Operations:**
- UPSERT when opening trades (B, S, BT, ST)
- UPDATE when closing trades (CL, CS)
- DELETE when position fully closed (100% close)
- QUERY to get current position state

**Calculation Rules:**
- `average_price`: Weighted average = Σ(price × contracts) / Σ(contracts)
- `total_contracts`: Sum of all open trade contracts for this tag
- `trade_count`: Number of open_trades documents with this tag

---

### 3. `closed_trades` (NEW)

**Purpose:** Audit trail of all position close actions

**Schema:**
```javascript
{
  tag: String (required, indexed),
  account: String (required, indexed),
  symbol: String (required),
  side: String (required, match: /^B$|^S$/),   // Direction of CLOSE order (S to close longs, B to close shorts)
  contracts_closed: Number (required),          // Contracts closed in this action
  close_price: Number (required),               // Fill price of close order
  percentage: Number (required),                // Percentage closed (0-100)
  order_id: String (optional),                  // Close order ID from exchange

  // Position state snapshots
  position_before: Number (required),           // total_contracts before close
  position_after: Number (required),            // total_contracts after close
  average_entry_price: Number (required),       // From open_positions at time of close

  // P&L tracking
  pnl: Number (optional),                       // Realized P&L for this close
  pnl_percentage: Number (optional),            // P&L as percentage of entry

  metadata: Object (optional),                  // Original webhook payload
  closed_at: Date (required, default: now),
  created: Date (required, default: now)
}
```

**Indexes:**
- Index on: `tag`, `account`, `symbol`, `closed_at`

**Operations:**
- INSERT on every close action (CL, CS)
- NEVER UPDATE or DELETE (permanent audit trail)
- QUERY for P&L analysis and reporting

**P&L Calculation:**
```javascript
// For closing longs (CL)
pnl = (close_price - average_entry_price) * contracts_closed

// For closing shorts (CS)
pnl = (average_entry_price - close_price) * contracts_closed

// Percentage
pnl_percentage = (pnl / (average_entry_price * contracts_closed)) * 100
```

---

## Phased Implementation

### Phase 1: Schema Setup & Database Migration
**Goal:** Create new collections, no behavior changes yet

**Tasks:**
1. Add `open_positions` schema to `server/database/MongoDB.js`
2. Add `closed_trades` schema to `server/database/MongoDB.js`
3. Export new models in MongoDB.js
4. Create indexes for performance
5. Test database connection and schema validation

**Files Modified:**
- `server/database/MongoDB.js`

**Validation:**
- Can insert test documents into both new collections
- Indexes created successfully
- No impact on existing functionality

---

### Phase 2: Backfill `open_positions` from Existing `open_trades`
**Goal:** Populate `open_positions` with current state

**Tasks:**
1. Create migration script to:
   - Query all existing `open_trades`
   - Group by `(tag, account)`
   - Calculate aggregates (total_contracts, average_price, etc.)
   - Insert into `open_positions`
2. Run migration script
3. Verify data integrity

**Files Created:**
- `server/migrations/backfill-open-positions.js`

**Validation:**
- Count of unique tags in `open_trades` matches count in `open_positions`
- Sum of contracts matches for each tag
- Average prices calculated correctly

---

### Phase 3: Update Opening Logic (B, S, BT, ST)
**Goal:** Maintain `open_positions` when opening trades

**Tasks:**
1. Modify `pushTagTrades()` function to:
   - Continue inserting into `open_trades` (unchanged)
   - UPSERT into `open_positions` after successful insert
   - Handle first trade (create position) vs additional trades (update position)
   - Calculate weighted average price
2. Add error handling: rollback if position upsert fails
3. Add logging for position updates

**Files Modified:**
- `server/index.js` (pushTagTrades function, ~line 283)

**Logic:**
```javascript
async function pushTagTrades(tag, data, input) {
  // 1. Create trade record (existing code)
  const newTrade = new Open_Trades({ ... })
  await newTrade.save()

  // 2. Update or create position (NEW)
  const existingPosition = await Open_Positions.findOne({
    tag: tag,
    account: input.a
  })

  if (existingPosition) {
    // Update existing position
    const newTotalContracts = existingPosition.total_contracts + contracts
    const newAvgPrice = (
      (existingPosition.average_price * existingPosition.total_contracts) +
      (price * contracts)
    ) / newTotalContracts

    await Open_Positions.updateOne(
      { tag: tag, account: input.a },
      {
        $set: {
          total_contracts: newTotalContracts,
          average_price: newAvgPrice,
          last_updated: new Date()
        },
        $inc: { trade_count: 1 },
        $push: { trade_ids: newTrade.order_id }
      }
    )
  } else {
    // Create new position
    await Open_Positions.create({
      tag: tag,
      account: input.a,
      symbol: input.s,
      side: side,
      total_contracts: contracts,
      average_price: price,
      trade_count: 1,
      trade_ids: [newTrade.order_id],
      first_opened: new Date(),
      last_updated: new Date()
    })
  }
}
```

**Validation:**
- Open new position → creates record in `open_positions`
- Add to existing position → updates contracts and average price
- Average price calculation verified with manual calculation
- Position persists across server restarts

---

### Phase 4: Implement CL (Close Long) Command
**Goal:** Support partial/full closing of long positions

**Tasks:**
1. Update `postSchema.js` to support percentage in `q` field
2. Create `parsePercentage(q)` helper function
3. Implement CL logic in `createMarketOrder()`:
   - Parse percentage from `q` field
   - Query `open_positions` for tag
   - Calculate contracts to close
   - Place market sell order
   - Update `open_positions` (reduce contracts or delete)
   - Insert into `closed_trades`
4. Handle edge cases (see below)

**Files Modified:**
- `server/index.js` (createMarketOrder function, replace CB logic at ~line 554)
- `server/postSchema.js` (update validation)

**Logic:**
```javascript
// In createMarketOrder(), case 'CL':
async function handleCloseCommand(command, input) {
  const tag = input.tag
  const percentage = parsePercentage(input.q)  // "10%" → 10

  // 1. Get current position
  const position = await Open_Positions.findOne({
    tag: tag,
    account: input.a
  })

  if (!position) {
    return { code: 404, message: 'No open position found for tag' }
  }

  if (position.side !== 'B') {
    return { code: 400, message: 'Cannot CL (close long) on short position' }
  }

  // 2. Calculate contracts to close
  const contractsToClose = Math.floor(position.total_contracts * (percentage / 100))

  if (contractsToClose === 0) {
    return { code: 400, message: 'Percentage too small, 0 contracts to close' }
  }

  // 3. Place market sell order to close longs
  const closeOrder = await ccxt.marketSellOrder(symbol, contractsToClose)
  const fillPrice = closeOrder.avgPx || closeOrder.price

  // 4. Calculate P&L
  const pnl = (fillPrice - position.average_price) * contractsToClose
  const pnlPercentage = (pnl / (position.average_price * contractsToClose)) * 100

  // 5. Update position
  const remainingContracts = position.total_contracts - contractsToClose

  if (remainingContracts === 0 || percentage >= 100) {
    // Full close - delete position
    await Open_Positions.deleteOne({ tag: tag, account: input.a })
  } else {
    // Partial close - update position
    await Open_Positions.updateOne(
      { tag: tag, account: input.a },
      {
        $set: {
          total_contracts: remainingContracts,
          last_updated: new Date()
        }
        // Note: Keep average_price unchanged (represents entry of remaining position)
      }
    )
  }

  // 6. Record close action
  await Closed_Trades.create({
    tag: tag,
    account: input.a,
    symbol: input.s,
    side: 'S',  // Sold to close longs
    contracts_closed: contractsToClose,
    close_price: fillPrice,
    percentage: percentage,
    order_id: closeOrder.orderID || closeOrder.id,
    position_before: position.total_contracts,
    position_after: remainingContracts,
    average_entry_price: position.average_price,
    pnl: pnl,
    pnl_percentage: pnlPercentage,
    metadata: input,
    closed_at: new Date()
  })

  return { code: 200, message: 'Success closing long position' }
}
```

**Validation:**
- Close 100% → position deleted from `open_positions`
- Close 50% → position contracts reduced by half
- Close 10% → correct contract calculation
- P&L calculated correctly
- `closed_trades` record created with all fields

---

### Phase 5: Implement CS (Close Short) Command
**Goal:** Support partial/full closing of short positions

**Tasks:**
1. Implement CS logic (mirror of CL but opposite direction)
2. Place market buy order to close shorts
3. P&L calculation adjusted for shorts
4. Same position update and closed_trades insert logic

**Files Modified:**
- `server/index.js` (createMarketOrder function)

**Logic:**
- Same as Phase 4 but:
  - Check `position.side === 'S'`
  - Place `marketBuyOrder` instead of sell
  - P&L: `(average_entry_price - fillPrice) * contractsToClose`
  - `closed_trades.side = 'B'` (bought to close shorts)

**Validation:**
- Same validation as Phase 4 for short positions

---

### Phase 6: API Endpoints & Frontend Integration
**Goal:** Expose position data via REST API

**Tasks:**
1. Create GET `/api/positions` - list all open positions
2. Create GET `/api/positions/:tag` - get specific position
3. Create GET `/api/closedTrades` - history of closes
4. Update existing GET `/api/tagTrades` if needed
5. Add error handling and validation

**Files Modified:**
- `server/index.js` (add routes)

**Endpoints:**
```javascript
// GET /api/positions
// Returns all open positions for user
app.get('/api/positions', async (req, res) => {
  const positions = await Open_Positions.find({})
    .sort({ last_updated: -1 })
  res.json(positions)
})

// GET /api/positions/:tag
// Returns specific position by tag
app.get('/api/positions/:tag', async (req, res) => {
  const position = await Open_Positions.findOne({ tag: req.params.tag })
  if (!position) {
    return res.status(404).json({ error: 'Position not found' })
  }
  res.json(position)
})

// GET /api/closedTrades
// Returns close history
app.get('/api/closedTrades', async (req, res) => {
  const closes = await Closed_Trades.find({})
    .sort({ closed_at: -1 })
    .limit(100)
  res.json(closes)
})

// GET /api/pnl/:tag
// Calculate total P&L for a tag
app.get('/api/pnl/:tag', async (req, res) => {
  const closes = await Closed_Trades.find({ tag: req.params.tag })
  const totalPnl = closes.reduce((sum, close) => sum + (close.pnl || 0), 0)
  res.json({ tag: req.params.tag, total_pnl: totalPnl, close_count: closes.length })
})
```

**Validation:**
- Endpoints return correct data
- Filtering works
- Performance acceptable with indexes

---

### Phase 7: Remove Legacy CB Command
**Goal:** Clean up deprecated code

**Tasks:**
1. Remove old CB logic from `createMarketOrder()` (lines 554-599)
2. Update command routing to use CL instead of CB
3. Update documentation/comments
4. Test that CL fully replaces CB functionality

**Files Modified:**
- `server/index.js`

**Validation:**
- No references to CB remain
- All tests pass with CL

---

## Workflow Examples

### Example 1: Open Position Twice, Close 50%

**Step 1: First Long Trade**
```json
Webhook: {"s": "BMEXUSDT", "c": "B", "t": "M", "q": "1", "a": "tester", "tag": "9hr"}
```

**Result:**
```javascript
// open_trades (1 document)
{ tag: "9hr", side: "B", contracts: 100, price: 0.1764, order_id: "abc123" }

// open_positions (1 document)
{
  tag: "9hr",
  total_contracts: 100,
  average_price: 0.1764,
  trade_count: 1,
  trade_ids: ["abc123"]
}
```

---

**Step 2: Second Long Trade**
```json
Webhook: {"s": "BMEXUSDT", "c": "B", "t": "M", "q": "1", "a": "tester", "tag": "9hr"}
```

**Result:**
```javascript
// open_trades (2 documents)
{ tag: "9hr", side: "B", contracts: 100, price: 0.1764, order_id: "abc123" }
{ tag: "9hr", side: "B", contracts: 50, price: 0.1780, order_id: "def456" }

// open_positions (1 document, updated)
{
  tag: "9hr",
  total_contracts: 150,  // 100 + 50
  average_price: 0.1770, // (100*0.1764 + 50*0.1780) / 150
  trade_count: 2,
  trade_ids: ["abc123", "def456"]
}
```

---

**Step 3: Close 50%**
```json
Webhook: {"s": "BMEXUSDT", "c": "CL", "t": "M", "q": "50%", "a": "tester", "tag": "9hr"}
```

**Actions:**
1. Read position: `total_contracts = 150`
2. Calculate: `150 * 0.50 = 75 contracts to close`
3. Place market sell: 75 contracts filled at 0.1800
4. Calculate P&L: `(0.1800 - 0.1770) * 75 = 2.25 profit`

**Result:**
```javascript
// open_trades (unchanged - 2 documents)
{ tag: "9hr", side: "B", contracts: 100, price: 0.1764, order_id: "abc123" }
{ tag: "9hr", side: "B", contracts: 50, price: 0.1780, order_id: "def456" }

// open_positions (1 document, updated)
{
  tag: "9hr",
  total_contracts: 75,   // 150 - 75
  average_price: 0.1770, // unchanged (still average entry of remaining)
  trade_count: 2,        // unchanged
  trade_ids: ["abc123", "def456"]
}

// closed_trades (1 document, inserted)
{
  tag: "9hr",
  side: "S",
  contracts_closed: 75,
  close_price: 0.1800,
  percentage: 50,
  position_before: 150,
  position_after: 75,
  average_entry_price: 0.1770,
  pnl: 2.25,
  pnl_percentage: 1.70,
  order_id: "ghi789"
}
```

---

### Example 2: Full Close (100%)

**Current State:**
```javascript
// open_positions
{ tag: "9hr", total_contracts: 75, average_price: 0.1770 }
```

**Webhook:**
```json
{"s": "BMEXUSDT", "c": "CL", "t": "M", "q": "100%", "a": "tester", "tag": "9hr"}
```

**Actions:**
1. Read position: `total_contracts = 75`
2. Calculate: `75 * 1.0 = 75 contracts to close`
3. Place market sell: 75 contracts filled at 0.1850
4. Calculate P&L: `(0.1850 - 0.1770) * 75 = 6.0 profit`

**Result:**
```javascript
// open_trades (unchanged)
{ tag: "9hr", side: "B", contracts: 100, price: 0.1764 }
{ tag: "9hr", side: "B", contracts: 50, price: 0.1780 }

// open_positions (DELETED - position fully closed)
// (no document)

// closed_trades (new document)
{
  tag: "9hr",
  side: "S",
  contracts_closed: 75,
  close_price: 0.1850,
  percentage: 100,
  position_before: 75,
  position_after: 0,
  average_entry_price: 0.1770,
  pnl: 6.0,
  pnl_percentage: 4.52,
  order_id: "jkl012"
}
```

---

## Open Questions

### Schema Design

**Q1:** Should `open_positions.average_price` be updated when partially closing?
- **Option A:** Keep unchanged (represents average entry of remaining position) ✅ RECOMMENDED
- **Option B:** Recalculate somehow (but how? we're closing, not opening)

**Q2:** Should `open_trades` have a `status` field?
- **Option A:** No, keep it simple - all trades in collection are from opened positions
- **Option B:** Yes, add `status: "open" | "closed"` for clarity

**Q3:** Should we track `unrealized_pnl` in `open_positions`?
- Requires current market price (from WebSocket stream)
- Adds complexity but useful for UI
- Calculate on-demand in API instead?

**Q4:** Should `trade_ids` array in `open_positions` be maintained?
- Pros: Can trace back to individual orders
- Cons: Array grows, not super useful if we never delete open_trades
- Alternative: Just use `trade_count` number

---

### Logic & Behavior

**Q5:** What happens if user tries to close more than 100%?
- Treat as 100% close?
- Return error?

**Q6:** What if percentage rounds to 0 contracts?
- Example: 5 contracts open, close 1% = 0.05 contracts
- Return error "percentage too small"?
- Close minimum 1 contract?

**Q7:** Symbol validation on close commands?
- Current position is BTCUSD, close command sends ETHUSD
- Ignore symbol in close commands and use position's symbol?
- Validate and return error if mismatch?

**Q8:** What if position direction changes mid-strategy?
- Tag "9hr" has long position, new signal comes to open short
- Keep them separate (allow both long and short for same tag)?
- Auto-close existing before opening opposite?
- Error/reject opposite direction?

**Q9:** Error handling - order placement fails:
- Don't update `open_positions`
- Don't create `closed_trades` record
- Return error to webhook
- Retry logic?

**Q10:** Rounding of contracts:
- `q: "33%"` of 100 contracts = 33.333... contracts
- Use `Math.floor()` (33 contracts)?
- Use `Math.round()` (33 contracts)?
- Use `Math.ceil()` (34 contracts)?

---

### Migration & Backwards Compatibility

**Q11:** What to do with existing `open_trades` after backfill?
- Keep them as-is (historical record)
- Add migration date field?
- Mark them somehow?

**Q12:** Old CB command still in use?
- Remove immediately in Phase 7?
- Support both CB and CL temporarily?
- Add deprecation warning?

**Q13:** GET `/api/tagTrades` endpoint:
- Keep it and have it query `open_positions` instead?
- Deprecate it in favor of `/api/positions`?
- Keep both for backwards compatibility?

---

## Edge Cases & Error Handling

### Edge Case 1: Concurrent Requests
**Scenario:** Two webhooks arrive simultaneously for same tag

**Example:**
- Request 1: Close 50% of 100 contracts
- Request 2: Close 50% of 100 contracts
- Both read position at same time: 100 contracts
- Both try to close 50 contracts

**Solution:**
- Use MongoDB transactions or atomic operations
- Lock position during close operation
- Optimistic locking with version field
- Return error if position changed during operation

---

### Edge Case 2: WebSocket vs Database Inconsistency
**Scenario:** Position in database doesn't match actual exchange position

**Causes:**
- Manual trades outside bot
- Order fills not recorded (crash/error)
- Database corruption

**Solution:**
- Periodic reconciliation job
- Fetch actual positions from exchange API
- Alert on mismatches
- Provide admin endpoint to force sync

---

### Edge Case 3: Partial Fill on Close Order
**Scenario:** Request to close 100 contracts, only 80 filled

**Problem:**
- Database shows position reduced by 100
- Actually only reduced by 80
- 20 contract discrepancy

**Solution:**
- Wait for full order fill before updating database
- Use actual filled quantity from order response
- Handle partial fills: update based on `cumQty` or `filled` field

---

### Edge Case 4: Order Rejected by Exchange
**Scenario:** Close order rejected (insufficient margin, max position, etc.)

**Solution:**
- Catch error from CCXT
- Don't update `open_positions`
- Don't create `closed_trades`
- Return error response to webhook
- Log error for investigation

---

### Edge Case 5: Database Write Failure
**Scenario:** Order executes successfully but database update fails

**Problem:**
- Position closed on exchange
- Database still shows open position
- Future closes will fail (position doesn't exist)

**Solution:**
- Wrap in try/catch
- Attempt rollback (how? can't undo exchange order)
- Log to error collection for manual reconciliation
- Alert operator
- Have reconciliation job fix it

---

### Edge Case 6: Very Small Percentages
**Scenario:** Close 0.5% of 10 contracts = 0.05 contracts

**Solution:**
- Check if `contractsToClose < 1`
- Return error: "Percentage too small, minimum 1 contract"
- OR: Close minimum 1 contract regardless

---

### Edge Case 7: Position Already Closed
**Scenario:** Webhook arrives to close position that doesn't exist

**Causes:**
- Duplicate webhook
- Already closed by another signal
- Manual close outside bot

**Solution:**
- Query `open_positions`, if not found return 404
- Don't place order
- Return clear error message
- Log for investigation

---

### Edge Case 8: Multiple Tags on Same Symbol
**Scenario:**
- Tag "9hr" has 100 contracts long BTCUSD
- Tag "1d" has 50 contracts long BTCUSD
- Total exchange position: 150 contracts long

**Close tag "9hr" only:**
- Should close 100 contracts
- Remaining exchange position: 50 contracts (tag "1d")
- Both positions tracked separately in `open_positions`

**Solution:**
- Already handled by tag-based filtering
- Each tag is independent
- No issues expected

---

## Testing Checklist

### Unit Tests
- [ ] `parsePercentage()` function
- [ ] Weighted average price calculation
- [ ] P&L calculation (long and short)
- [ ] Contract rounding logic

### Integration Tests
- [ ] Open position → verify `open_positions` created
- [ ] Add to position → verify aggregation correct
- [ ] Close 50% → verify position reduced
- [ ] Close 100% → verify position deleted
- [ ] Close short position → verify P&L calculation
- [ ] Multiple tags on same symbol → verify isolation

### Error Handling Tests
- [ ] Close non-existent position → 404 error
- [ ] Close wrong direction (CL on short) → 400 error
- [ ] Percentage < 1 contract → error
- [ ] Percentage > 100% → treated as 100%
- [ ] Order rejection → no database update
- [ ] Database failure → error logged

### Performance Tests
- [ ] 1000 positions in database → query speed
- [ ] Concurrent close requests → no race condition
- [ ] Large percentage calculations → accuracy

---

## Success Metrics

### Functional
- ✅ Open positions tracked accurately in real-time
- ✅ Partial closes work with any percentage 1-100%
- ✅ P&L calculated correctly on all closes
- ✅ Historical data preserved in all three collections
- ✅ No data loss on errors

### Performance
- ✅ Position queries < 100ms
- ✅ Close operations complete < 2 seconds
- ✅ No race conditions with concurrent requests
- ✅ Database size manageable (old trades archived if needed)

### Reliability
- ✅ Server restart doesn't lose position state
- ✅ Errors don't corrupt database
- ✅ Exchange position matches database position
- ✅ Audit trail complete and queryable

---

## Future Enhancements (Post-MVP)

1. **Position Flipping**: CB/CS commands that flip position to opposite side
2. **Take Profit Levels**: Integration with existing `tpOrders` system
3. **Trailing Stops**: Dynamic close percentages based on price movement
4. **Multi-Account**: Aggregate positions across multiple accounts
5. **P&L Reporting**: Dashboard with charts and statistics
6. **Risk Management**: Max position size, drawdown limits
7. **Auto-Reconciliation**: Periodic sync with exchange positions
8. **Position History**: Archive old `open_trades` to separate collection
9. **WebSocket Updates**: Real-time position updates to frontend
10. **Advanced Orders**: Stop-loss, trailing-stop integrated with positions

---

## Implementation Timeline (Estimate)

- **Phase 1:** 2-3 hours (schema setup)
- **Phase 2:** 2-3 hours (backfill migration)
- **Phase 3:** 4-6 hours (update opening logic)
- **Phase 4:** 6-8 hours (CL implementation + testing)
- **Phase 5:** 4-6 hours (CS implementation + testing)
- **Phase 6:** 3-4 hours (API endpoints)
- **Phase 7:** 1-2 hours (cleanup)

**Total:** ~25-35 hours of development + testing

---

## Notes & Decisions Log

### Decision 1: Keep `open_trades` Immutable
**Rationale:** Historical audit trail is critical for debugging, compliance, and analysis. Never delete or modify trade records.

### Decision 2: One Position Per Tag
**Rationale:** Tags represent independent strategies. Each tag gets its own position tracking, even if same symbol.

### Decision 3: Delete Position on 100% Close
**Rationale:** Clean database, clear state. Historical data preserved in `open_trades` and `closed_trades`.

### Decision 4: Calculate P&L on Close
**Rationale:** Realized P&L only calculated when position closed. Unrealized P&L can be computed on-demand.

### Decision 5: Average Price Unchanged on Partial Close
**Rationale:** Average entry price represents cost basis of remaining position. Doesn't change when closing partial.

---

**END OF PLAN**
