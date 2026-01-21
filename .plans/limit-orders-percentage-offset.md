# Plan: Limit Orders with Percentage Offset (All Assets)

## Goal
Add ability to send limit orders with percentage-based price offset on **all assets** (spot and futures).

## Current State

**What exists:**
- `createLimitOrder()` function at line 2454 supports percentage offset via `p: "1%"`
- Works for legacy inverse perpetuals only (XBTUSD, ETHUSD, XRPUSD, LTCUSD, BCHUSD)
- Uses `stream.latest.instruments[symbol]` for price (only has legacy symbols)

**What's missing:**
- No support for USDT spot pairs (BTC/USDT, ETH/USDT, etc.)
- No support for USDT futures (BTC/USDT:USDT, ETH/USDT:USDT, etc.)
- Futures commands (LF, SF) route to `createLimitOrder` but it only handles B/S

## Percentage Logic (Already Correct)

```javascript
// For BUY/LONG: Price BELOW market (to get filled on dip)
offsetPrice = currentPrice * (1 - (percentage / 100))

// For SELL/SHORT: Price ABOVE market (to get filled on bounce)
offsetPrice = currentPrice * (1 + (percentage / 100))
```

---

## Implementation Plan

### 1. Update `createLimitOrder()` to Support All Symbols
**File**: [server/index.js](server/index.js#L2454)

**Changes needed:**

```javascript
async function createLimitOrder(symbol, input) {
    const command = input.c
    const tag = input.tag

    // Parse percentage offset from p parameter
    const priceOffset = input.p.includes('%') ? +input.p.split('%')[0] : 0

    // Get current market price (support all symbol types)
    let currentPrice
    if (stream.latest.instruments[symbol]) {
        // Legacy inverse perpetuals (XBTUSD, etc.)
        currentPrice = stream.latest.instruments[symbol].lastPrice
    } else {
        // USDT spot/futures - fetch via CCXT ticker
        const ticker = await trade.ticker(symbol)
        currentPrice = ticker.last
    }

    // Determine if buy or sell side
    const isBuySide = ['B', 'LF'].includes(command)

    // Calculate offset price
    let offsetPrice
    if (isBuySide) {
        // BUY/LONG: Below market
        offsetPrice = resolveDecimals(currentPrice * (1 - (priceOffset / 100)), symbol)
    } else {
        // SELL/SHORT: Above market
        offsetPrice = resolveDecimals(currentPrice * (1 + (priceOffset / 100)), symbol)
    }

    // ... rest of order logic
}
```

### 2. Handle Quantity Conversion for All Asset Types
The function needs to handle:
- Legacy XBT quantities (`10XBT`)
- USDT amounts (`100USDT`)
- Futures USD amounts
- Plain contract counts

Use similar logic to `createMarketOrder()` which already handles all these cases.

### 3. Support LF/SF Commands
Currently `createLimitOrder` only checks for `B` and `S`. Add `LF` and `SF`:

```javascript
const isBuySide = ['B', 'LF'].includes(command)
const isSellSide = ['S', 'SF'].includes(command)

if (isBuySide) {
    // ... buy/long logic
    trade.limitBuyOrder(symbol, quantity, offsetPrice)
} else if (isSellSide) {
    // ... sell/short logic
    trade.limitSellOrder(symbol, quantity, offsetPrice)
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| [server/index.js](server/index.js) | Update `createLimitOrder()` to support all symbols and commands |

---

## Webhook Usage

**Spot limit buy 1% below market:**
```json
{
  "s": "BTC/USDT",
  "c": "B",
  "t": "L",
  "p": "1%",
  "q": "100USDT",
  "tag": "dip-buy",
  "a": "danny",
  "code": "13131"
}
```

**Futures limit short 2% above market:**
```json
{
  "s": "BTC/USDT:USDT",
  "c": "SF",
  "t": "L",
  "p": "2%",
  "q": "50",
  "tag": "bounce-short",
  "a": "danny",
  "code": "13131"
}
```

**Legacy inverse perpetual (already works):**
```json
{
  "s": "XBTUSD",
  "c": "B",
  "t": "L",
  "p": "1.5%",
  "q": "10XBT",
  "tag": "btc-dip",
  "a": "danny",
  "code": "13131"
}
```

---

## Verification

1. Test legacy symbol (XBTUSD) - should still work
2. Test USDT spot (BTC/USDT) with `p: "1%"` - new functionality
3. Test USDT futures (BTC/USDT:USDT) with `p: "2%"` - new functionality
4. Verify offset direction:
   - Buy/Long: price should be BELOW current market
   - Sell/Short: price should be ABOVE current market
5. Check server logs for calculated offset price
