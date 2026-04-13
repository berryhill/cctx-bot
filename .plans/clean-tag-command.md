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

## UI Integration (Positions Table)

### 4. Add "Actions" Column to Table Header
**File**: [server/public/positions.html](server/public/positions.html#L189-L202)

Add a new column header after "Last Updated":
```html
<thead>
    <tr>
        <th>Tag</th>
        <!-- ... existing columns ... -->
        <th>Last Updated</th>
        <th>Actions</th>  <!-- NEW -->
    </tr>
</thead>
```

Update the `colspan` in "No open positions" and "Loading..." rows from `11` to `12`.

### 5. Add Button Styles
**File**: [server/public/positions.html](server/public/positions.html#L7) (in `<style>` section)

```css
.clean-btn {
    background-color: #dc3545;
    color: white;
    border: none;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    font-family: monospace;
}
.clean-btn:hover {
    background-color: #c82333;
}
.clean-btn:disabled {
    background-color: #666;
    cursor: not-allowed;
}
```

### 6. Update `renderPositions()` to Include Clean Button
**File**: [server/public/positions.html](server/public/positions.html#L283-L310)

Add button in each row:
```javascript
function renderPositions(positions) {
    if (positions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" class="no-data">No open positions</td></tr>';
        return;
    }

    tbody.innerHTML = positions.map(pos => {
        const sideClass = pos.side === 'B' || pos.side === 'LF' ? 'long' : 'short';
        const marketClass = pos.market_type === 'spot' ? 'spot' : 'futures';
        const dollarAmount = pos.dollar_amount ? `$${pos.dollar_amount.toFixed(2)}` : '-';

        return `
            <tr>
                <td>${pos.tag}</td>
                <td>${pos.account}</td>
                <td>${pos.symbol}</td>
                <td class="${sideClass}">${pos.side}</td>
                <td class="${marketClass}">${pos.market_type}</td>
                <td>${pos.total_contracts.toFixed(4)}</td>
                <td>${pos.average_price.toFixed(4)}</td>
                <td>${dollarAmount}</td>
                <td>${pos.trade_count}</td>
                <td>${new Date(pos.first_opened).toLocaleString()}</td>
                <td>${new Date(pos.last_updated).toLocaleString()}</td>
                <td><button class="clean-btn" onclick="cleanTag('${pos.tag}', '${pos.account}', '${pos.symbol}')">Clean</button></td>
            </tr>
        `;
    }).join('');
}
```

### 7. Add `cleanTag()` JavaScript Function
**File**: [server/public/positions.html](server/public/positions.html#L225) (in `<script>` section)

```javascript
async function cleanTag(tag, account, symbol) {
    if (!confirm(`Clean all data for tag "${tag}" on account "${account}"?\n\nThis will remove:\n- Open trades\n- Position records\n- Trigger orders\n- Historical trades`)) {
        return;
    }

    const btn = event.target;
    btn.disabled = true;
    btn.textContent = 'Cleaning...';

    try {
        const response = await fetch('/ccxt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                s: symbol,
                c: 'CLEAN',
                t: 'M',
                q: '0',
                tag: tag,
                a: account,
                code: '13131'
            })
        });

        const result = await response.json();

        if (response.ok) {
            alert(`Tag "${tag}" cleaned successfully!\n\nDeleted:\n- ${result.data.trades_opened} trades opened\n- ${result.data.positions_open} positions\n- ${result.data.trigger_orders} trigger orders`);
            // Row will disappear on next WebSocket update
        } else {
            alert(`Failed to clean tag: ${result.message || 'Unknown error'}`);
            btn.disabled = false;
            btn.textContent = 'Clean';
        }
    } catch (error) {
        alert(`Error: ${error.message}`);
        btn.disabled = false;
        btn.textContent = 'Clean';
    }
}
```

---

## Files to Modify (Updated)

| File | Changes |
|------|---------|
| [server/validation/postSchema.js](server/validation/postSchema.js) | Add `'CLEAN'` to command enum |
| [server/index.js](server/index.js) | Add `cleanTag()` function + handle in webhook |
| [server/public/positions.html](server/public/positions.html) | Add Actions column, Clean button, cleanTag() JS function |

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

### Backend (Webhook)
1. Create a test position with a tag
2. Send CLEAN webhook for that tag
3. Verify all collections are empty for that tag:
```bash
mongo ccxt-bot --eval "db.trades_openeds.find({tag:'test'}).count()"
mongo ccxt-bot --eval "db.positions_opens.find({tag:'test'}).count()"
```

### Frontend (UI)
1. Open [http://localhost:3000/positions.html](http://localhost:3000/positions.html)
2. Verify "Actions" column appears in table header
3. Verify each position row has a red "Clean" button
4. Click "Clean" button on a test position
5. Confirm dialog should appear with warning message
6. After confirming, verify:
   - Button shows "Cleaning..." while processing
   - Success alert shows deletion counts
   - Position row disappears from table (via WebSocket update)
