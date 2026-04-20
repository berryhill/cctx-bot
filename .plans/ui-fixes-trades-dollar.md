# Plan: UI Fixes - Dollar Amount Display

## Issues

### 1. Dollar Amount Shows `-` for Spot Trades
**Root Cause**: `dollar_amount` is only calculated for futures commands (LF, SF), not spot commands (B, S).

```javascript
let dollarAmount = null // Default
if (isFuturesCommand) {
    const conversion = await convertFuturesUSDToContracts(...)
    dollarAmount = conversion.actualDollarAmount
}
```

Spot trades always have `dollarAmount = null`, so the UI shows `-`.

### 2. Average Price Calculation
**Finding**: The calculation is **mathematically correct** (weighted average at lines 603-606). No fix needed.

---

## Implementation

**This will be fixed by implementing the [spot-usd-sizing.md](spot-usd-sizing.md) plan.**

Once `convertSpotUSDToContracts()` is implemented, it will return `actualDollarAmount` just like the futures version does. The existing code already handles storing it:

```javascript
if (dollarAmount !== null) {
    updateFields.dollar_amount = existingDollarAmount + dollarAmount
}
```

**No additional changes needed** - dollar amount display will work automatically after spot USD sizing is implemented.

---

## Dependency

This plan depends on: [spot-usd-sizing.md](spot-usd-sizing.md)

---

## Verification

After spot-usd-sizing is implemented:
1. Send spot buy with `q: "100USDT"`
2. Check UI at `/positions.html`
3. Dollar Amount column should show `$100.00` (or rounded amount) instead of `-`
