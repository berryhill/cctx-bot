# Plan: Clean Tag Command

## Goal
Add a `CLEAN` command to purge all tag data from the database when positions are closed manually on BitMEX.

## Data to Clean (5 collections + 1 in-memory array)

| Collection | Model | What to Delete |
|------------|-------|----------------|
| `trades_opened` | `Trades_Opened` | All trades for the tag |
| `positions_open` | `Positions_Open` | Position summary for the tag |
| `trigger_orders` | `Trigger_Orders` | Pending take-profit triggers |
| `trigger_orders_processed` | `TO_Processed` | Processed trigger orders |
| `trades_closed` | `Trades_Closed` | Historical closed trades |
| In-memory | `tpOrders` array | Pending limit orders |

---

## Implementation Steps

### 1. Add `CLEAN` to Command Schema
**File**: [server/validation/postSchema.js](server/validation/postSchema.js#L16)

```javascript
// Change:
enum: ['B','S','CB','CS','LF','SF','CLF','CSF','FLF','FSF']
// To:
enum: ['B','S','CB','CS','LF','SF','CLF','CSF','FLF','FSF','CLEAN']
```

### 2. Create `cleanTag()` Function
**File**: [server/index.js](server/index.js) (near `closeTagTrades` ~line 2696)

```javascript
async function cleanTag(tag, account) {
    console.log(`\n🧹 CLEAN command: Purging all data for tag "${tag}", account "${account}"`)

    const results = {
        trades_opened: 0,
        positions_open: 0,
        trigger_orders: 0,
        to_processed: 0,
        trades_closed: 0,
        tp_orders_cleared: false
    }

    try {
        // 1. Delete from Trades_Opened
        const r1 = await Trades_Opened.deleteMany({ tag, account })
        results.trades_opened = r1.deletedCount

        // 2. Delete from Positions_Open
        const r2 = await Positions_Open.deleteMany({ tag, account })
        results.positions_open = r2.deletedCount

        // 3. Delete from Trigger_Orders
        const r3 = await Trigger_Orders.deleteMany({ tag, account })
        results.trigger_orders = r3.deletedCount

        // 4. Delete from TO_Processed
        const r4 = await TO_Processed.deleteMany({ tag, account })
        results.to_processed = r4.deletedCount

        // 5. Delete from Trades_Closed (optional - historical data)
        const r5 = await Trades_Closed.deleteMany({ tag, account })
        results.trades_closed = r5.deletedCount

        // 6. Clear from in-memory tpOrders array
        const before = tpOrders.length
        tpOrders = tpOrders.filter(obj => !(obj.tag === tag))
        results.tp_orders_cleared = tpOrders.length < before

        console.log(`✅ CLEAN complete:`, results)
        return { success: true, results }

    } catch (error) {
        console.error(`❌ CLEAN failed:`, error.message)
        return { success: false, error: error.message }
    }
}
```

### 3. Handle CLEAN Command in Webhook
**File**: [server/index.js](server/index.js) (in `createTrade()`, before the main switch statement ~line 862)

```javascript
// Handle CLEAN command - purge all tag data
if (command === 'CLEAN') {
    const result = await cleanTag(orderTag, input.a)
    if (result.success) {
        return sendJSON(res, 200, `Tag "${orderTag}" cleaned successfully`, result.results, null)
    } else {
        return sendJSON(res, 500, `Failed to clean tag "${orderTag}"`, {}, result.error)
    }
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| [server/validation/postSchema.js](server/validation/postSchema.js) | Add `'CLEAN'` to command enum |
| [server/index.js](server/index.js) | Add `cleanTag()` function + handle in webhook |

---

## Webhook Usage

```bash
curl -X POST http://localhost:3000/ccxt -H "Content-Type: application/json" -d '{
  "s": "BTC/USDT",
  "c": "CLEAN",
  "t": "M",
  "q": "0",
  "tag": "strategy1",
  "a": "danny",
  "code": "13131"
}'
```

**Note**: `s`, `t`, `q` are required by schema but ignored for CLEAN command.

---

## Verification

1. Create a test position with a tag
2. Send CLEAN webhook for that tag
3. Verify all collections are empty for that tag:
```bash
mongo ccxt-bot --eval "db.trades_openeds.find({tag:'test'}).count()"
mongo ccxt-bot --eval "db.positions_opens.find({tag:'test'}).count()"
```
4. Check UI at `/positions.html` - tag should be gone
