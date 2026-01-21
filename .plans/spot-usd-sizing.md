# Plan: BMEX Spot Order Sizing - USD to Contracts Conversion

## Goal
Fix spot order sizing to use USD amounts (like futures do) instead of contract-based sizing.

## How CCXT Handles BitMEX Spot
**CCXT converts amounts automatically** - pass standard currency units (e.g., 0.01 BTC), not satoshis.
- CCXT's `amount_to_precision()` handles lotSize rounding
- The raw BitMEX API uses minor units, but CCXT abstracts this away

## Current Behavior
- **Futures**: User sends `100` → system converts $100 to proper contract count using BitMEX market data
- **Spot**: User sends `100` → treated as 100 contracts (not $100 USD)

## Target Behavior
Spot orders should work like futures: User specifies USD, system converts to base currency amount (CCXT handles the rest).

---

## Implementation Steps

### 1. Create `convertSpotUSDToContracts()` Function
**Location**: [server/index.js](server/index.js#L358) (after `convertFuturesUSDToContracts`)

```javascript
async function convertSpotUSDToContracts(usdAmount, symbol, trade) {
    const market = trade.bitmex.markets[symbol]
    const ticker = await trade.ticker(symbol)
    const currentPrice = ticker.last
    const lotSize = market.info.lotSize || market.precision.amount

    // USD → base currency (e.g., BTC)
    let baseAmount = usdAmount / currentPrice

    // Round to lotSize (CCXT handles minor unit conversion)
    baseAmount = Math.ceil(baseAmount / lotSize) * lotSize

    // Calculate actual USD after rounding
    const actualDollarAmount = baseAmount * currentPrice

    return { contracts: baseAmount, actualDollarAmount }
}
```

**Note**: CCXT handles the satoshi/minor-unit conversion internally, so we pass base currency amounts (e.g., 0.001 BTC, not 100000 satoshis).

### 2. Add `isSpotCommand` Detection
**Location**: [server/index.js](server/index.js#L803) (near `isFuturesCommand`)

```javascript
const isSpotCommand = ['B', 'S', 'CB', 'CS'].includes(command) && isValidSpotSymbol(symbol)
```

### 3. Update Quantity Parsing Logic
**Location**: [server/index.js](server/index.js#L810-L856)

Change spot order processing to use the new conversion:
```javascript
if (isSpotCommand) {
    // Treat plain numbers as USD (consistent with futures)
    const conversion = await convertSpotUSDToContracts(qntyValue, symbol, trade)
    qntyUSD = conversion.contracts
    dollarAmount = conversion.actualDollarAmount
}
```

**Default behavior**: Plain numbers (`q: "100"`) will be treated as USD for spot, matching futures behavior.

### 4. Pass `dollarAmount` to `pushTagTrades()` for Spot
**Location**: Spot B/S command handlers

Currently `dollarAmount` is only set for futures. Need to pass it for spot orders too so it's stored in the database.

---

## Files to Modify

| File | Change |
|------|--------|
| [server/index.js](server/index.js) | Add `convertSpotUSDToContracts()`, update spot command handling |

---

## Testing

1. Send spot buy with `q: "100USDT"` → verify converts to correct contract count
2. Send spot buy with `q: "100"` (plain number) → verify treats as $100 USD
3. Verify `dollar_amount` is stored in database for spot trades
4. Test edge case: amount below minimum order size → should error with helpful message

## Verification

```bash
# Send test webhook
curl -X POST http://localhost:3000/webhook -H "Content-Type: application/json" -d '{
  "symbol": "BTC/USDT",
  "command": "B",
  "q": "100USDT",
  "tag": "test",
  "account": "<alias>",
  "code": "13131"
}'
```

Check server logs for:
- `convertSpotUSDToContracts() called`
- `USD Amount: 100`
- `Spot conversion: $100 USD -> X contracts`
