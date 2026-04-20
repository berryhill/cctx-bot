# Plan: Trades Reset on Position Close

## Goal
When a position is fully closed, delete the associated trades from `Trades_Opened` collection so the trades counter resets to zero.

## Problem
The `closeTagTrades()` function exists (line 2676) but is **never called**. When positions close:
- `Positions_Open.deleteOne()` is called ✅
- `Trades_Opened` records are **NOT deleted** ❌
- Trades accumulate indefinitely in the database

## Implementation

### 1. Update `closeTagTrades()` to Support All Sides
The function currently only handles 'B'/'S' but futures use 'LF'/'SF'.

**Location**: [server/index.js:2676](server/index.js#L2676)

```javascript
async function closeTagTrades(tag, side) {
    // Support both spot (B/S) and futures (LF/SF) sides
    let sideCode
    if (side === 'sell') sideCode = 'S'
    else if (side === 'buy') sideCode = 'B'
    else sideCode = side // Use directly if already B/S/LF/SF
    // ... rest unchanged
}
```

### 2. Add `closeTagTrades()` After Each Position Deletion

| Line | Context | Side to Close |
|------|---------|---------------|
| ~943 | Spot: Selling to close long | `'B'` |
| ~1132 | Spot: CB (close buy/long) | `'B'` |
| ~1236 | Spot: CS (close sell/short) | `'S'` |
| ~1347 | Futures: CLF (close long) | `'LF'` |
| ~1461 | Futures: CSF (close short) | `'SF'` |
| ~1597 | Futures: Selling to close long | `'LF'` |
| ~1788 | Futures: Buying to close short | `'SF'` |

**Pattern:**
```javascript
await Positions_Open.deleteOne({ tag: orderTag, account: input.a, market_type: 'spot' })
await closeTagTrades(orderTag, 'B')  // ADD THIS LINE
```

---

## Files to Modify

| File | Changes |
|------|---------|
| [server/index.js](server/index.js) | Update `closeTagTrades()` + add 7 calls after position deletions |

---

## Verification

1. Open a position with a tag
2. Close the position fully
3. Check database: `db.trades_openeds.find({tag:'test'}).count()` should be 0
4. UI at `/positions.html` should no longer show the closed position
