# Plan: UI Fixes - Dollar Amount, Average Price, Trades Reset

## Issues Identified

### 1. Trades Counter Never Resets to Zero (CRITICAL)
**Root Cause**: The `closeTagTrades()` function exists (line 2676) but is **never called** anywhere in the code.

When positions are closed:
- `Positions_Open.deleteOne()` is called ✅
- `Trades_Opened` records are **NOT deleted** ❌
- `trade_count` accumulates indefinitely

**Locations where `Positions_Open.deleteOne()` is called but `closeTagTrades()` is missing**:
- Line 943 (spot close)
- Line 1132 (spot close)
- Line 1236 (spot close)
- Line 1347 (futures close)
- Line 1461 (futures close)
- Line 1597 (futures close)
- Line 1788 (futures close)

### 2. Dollar Amount Calculation Wrong
**Root Cause**: `dollar_amount` is only calculated for **futures commands** (LF, SF, etc.), not spot commands (B, S).

From [server/index.js:808-816](server/index.js#L808-L816):
```javascript
let dollarAmount = null // Default
if (isFuturesCommand) {
    const conversion = await convertFuturesUSDToContracts(...)
    dollarAmount = conversion.actualDollarAmount
}
```

Spot trades always have `dollarAmount = null`, so the UI shows `-` for all spot positions.

### 3. Average Price Calculation
**Finding**: The average price calculation is **mathematically correct** (weighted average formula at lines 603-606).

However, the UI displays raw numbers that may need formatting for readability.

---

## Implementation Plan

### Step 1: Call `closeTagTrades()` When Positions Close
**Location**: After each `Positions_Open.deleteOne()` call

Add this line after each position deletion:
```javascript
await Positions_Open.deleteOne({ tag: orderTag, account: input.a, market_type: 'spot' })
await closeTagTrades(orderTag, side)  // ADD THIS LINE
```

**Files to modify**: [server/index.js](server/index.js)
- Line ~943 (after spot close)
- Line ~1132 (after spot close)
- Line ~1236 (after spot close)
- Line ~1347 (after futures close)
- Line ~1461 (after futures close)
- Line ~1597 (after futures close)
- Line ~1788 (after futures close)

### Step 2: Fix Dollar Amount for Spot (ties into previous spot-usd-sizing plan)
Once `convertSpotUSDToContracts()` is implemented (from the spot USD sizing plan), the `dollarAmount` variable will be populated for spot trades automatically.

The existing code at lines 620-624 already handles adding dollar amounts:
```javascript
if (dollarAmount !== null) {
    updateFields.dollar_amount = existingDollarAmount + dollarAmount
}
```

**No additional changes needed** - this will be fixed by the spot USD sizing implementation.

---

## Files to Modify

| File | Changes |
|------|---------|
| [server/index.js](server/index.js) | Add `closeTagTrades()` calls after position deletions (~7 locations) |

---

## Testing

1. **Trades Reset Test**:
   - Open a position (creates Trades_Opened + Positions_Open records)
   - Close the position
   - Verify both `Positions_Open` AND `Trades_Opened` records are deleted
   - UI should show 0 trades for that tag

2. **Dollar Amount Test** (after spot USD sizing is implemented):
   - Send spot buy with `q: "100USDT"`
   - Check UI shows `$100.00` (or rounded amount) in Dollar Amount column

## Verification

```bash
# Check Trades_Opened collection before/after close
mongo ccxt-bot --eval "db.trades_openeds.find({tag: 'test-tag'}).count()"

# After implementing fix, this should return 0 after position close
```

Open [http://localhost:3000/positions.html](http://localhost:3000/positions.html) and verify:
- Trades column shows correct count
- Trades reset to 0 when position fully closes
- Dollar Amount shows values (not `-`) for spot trades
