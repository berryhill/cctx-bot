**Final Master System Guide**

Version 4 — Definitive Reference

**Agent must use this document above all others — all previous guides are superseded**

# **Section 1 — Core Architecture**

**Every tag is a fully isolated trading unit. No state, counter, setting, or order is ever shared BETWEEN tags. A flip or close on Tag A never affects Tag B. All logic is routed by the tag field in the alert.**

**Within a single tag there are 3 layers: Main Tag, Set, and Super Set. These layers share the same tag name, symbol, and direction. Main Tag OVERRULES all layers — when Main Tag TP5 fires it closes everything inside that tag including all Set and Super Set positions. This is not a conflict with the isolation rule — it is the hierarchy within one tag.**

Each tag owns independently:

* Direction — futures: LF or SF. Spot: B or S.  
* Main tag avgEntry and totalQty — weighted average, recalculated on every fill  
* Set avgEntry and setQty — independent from main tag  
* Super Set avgEntry and superSetQty — independent from main tag and Set  
* Normal order counter and list — configurable threshold per tag  
* Set counter and list — configurable threshold per tag  
* All pending limit orders: Sets, Super Sets, BB orders  
* All 3 TP layer configs, independent recalculation timers, and active TP order IDs  
* Realized PnL — accumulated on every partial or full close  
* Unrealized PnL — live, calculated against current price  
* currentPositionFees — resets when position fully closes  
* totalFeesPaid — permanent, never resets  
* totalFundingPaid — FUTURES ONLY. Permanent, never resets, pulled from BitMEX API. Hidden for spot tags.  
* Alert log history — permanent record of every alert received  
* Balancer toggle, Multiplier, Set p (LF/B), Set p (SF/S), Super Set p  
* Set counter threshold, Super Set counter threshold

**Tags are NEVER deleted from the interface even when position is zero. The tag stays visible permanently so all history — fees, funding, PnL, alert log — is never lost.**

# **Section 2 — Alert Syntax**

## **2.1 — Standard Alert Structure**

{  
  "s":    "SOL/USDT:USDT",   // symbol  
  "c":    "LF",              // command — see Section 2.2  
  "t":    "M",              // M \= market, L \= limit  
  "p":    "0",              // price offset for entry — see Section 2.4  
  "q":    "500",            // quantity — USD amount OR % of position  
  "a":    "tester",         // account name  
  "code": "13131",          // auth code for deduplication  
  "tag":  "3MSOL",          // tag name  
  "type": "BB",             // optional — Buy Back only  
  "p2":   "-2%"             // optional — Buy Back only  
}

**TP is NEVER a field in any alert. Remove all code that reads tp or TP from the alert. Remove TP from the switch key. The switch key is ONLY t-c.**

## **2.2 — Valid c Commands**

| Command | Full Name | Market | What It Does |
| :---- | :---- | :---- | :---- |
| LF | Long Fill | Futures | Add to long position. If holding SF, reduces short — direction stays SF, TPs recalculate. |
| SF | Short Fill | Futures | Add to short position. If holding LF, reduces long — direction stays LF, TPs recalculate. |
| FLF | Flip to Long | Futures | Cancel all TPs and BB. Reset all counters. Close full position. Keep Set/SuperSet orders. Open long. Fresh TPs after fill. |
| FSF | Flip to Short | Futures | Cancel all TPs and BB. Reset all counters. Close full position. Keep Set/SuperSet orders. Open short. Fresh TPs after fill. |
| CLF | Close Long | Futures | If type=BB: sell at p then buy back at p2. Otherwise: fire Main Tag TP sequence. Sets/SuperSets unaffected unless TP5 fires. |
| CSF | Close Short | Futures | Same as CLF but for short positions. |
| B | Buy | Spot | Buy coins on spot. Add to position. |
| S | Sell | Spot | Sell coins on spot. Reduce or close position. |
| CB | Close Buy | Spot | Same as CLF but for spot buy positions. BB supported. TP sequence supported. |
| CS | Close Sell | Spot | Same as CSF but for spot sell positions. BB supported. TP sequence supported. |

## **2.3 — Partial Direction Command While Holding Opposite (Futures and Spot)**

**This is NOT a flip. It is a partial close of the current position.**

Example: Tag holds 1000 LF contracts at avgEntry $130. SF alert arrives with q=500.

1. Sell 500 contracts at current price  
2. Subtract 500 from tag.totalQty — now 500 LF contracts  
3. Calculate realized PnL on the 500 sold: (fillPrice \- avgEntry) \* 500  
4. Calculate fee: fillPrice \* 500 \* 0.0005 — add to BOTH tag.totalFeesPaid AND tag.currentPositionFees  
5. Direction stays LF — do NOT flip  
6. avgEntry stays the same — only qty changed  
7. Cancel all unfired Main Tag TPs  
8. Re-place unfired TPs based on new qty of 500 and same avgEntry  
9. Reset Main Tag TP recalculation timer

Same logic in reverse: tag holds SF, LF alert arrives — buys back, reduces short, direction stays SF, TPs recalculate.

## **2.4 — p and p2 Field Rules**

| Format | Example | Meaning |
| :---- | :---- | :---- |
| 0 | "p": "0" | Current market price |
| \-% | "p": "-1.3%" | 1.3% BELOW current price |
| \+% | "p": "+2%" | 2% ABOVE current price |
| plain% | "p": "1.5%" | 1.5% above current price |

Validation regex — applies to BOTH p and p2:

/^\[+-\]?\[0-9\]{1,5}(\\.\[0-9\]{1,3})?%$|^\[+-\]?\[0-9\]{1,5}(\\.\[0-9\]{1,3})?$/

## **2.5 — q Field Rules**

| Format | Example | How System Calculates |
| :---- | :---- | :---- |
| USD amount | "q": "500" | contracts \= 500 / currentPrice |
| % of position | "q": "1%" | positionValue \= totalQty \* currentPriceusdAmount \= positionValue \* 0.01contracts \= usdAmount / currentPrice |

function resolveQuantity(q, currentPrice, multiplier, tag) {  
  let usdAmount  
  if (typeof q \=== 'string' && q.endsWith('%')) {  
    const totalQty \= tag.totalQty \+ tag.setQty \+ tag.superSetQty  
    const positionValue \= totalQty \* currentPrice  
    usdAmount \= positionValue \* (parseFloat(q) / 100\)  
  } else {  
    usdAmount \= parseFloat(q)  
  }  
  usdAmount \= usdAmount \* (multiplier || 1\)  
  const contracts \= usdAmount / currentPrice  
  // If contracts below exchange minimum order size, scale UP to minimum  
  const minQty \= exchange.markets\[symbol\].limits.amount.min  
  const finalQty \= Math.max(contracts, minQty)  
  return parseFloat(exchange.amountToPrecision(symbol, finalQty))  
}

## **2.6 — Switch Routing**

const tradeKey \= \`${t}-${c}\`   // NEVER include tp in this key

| Case | Market | Description |
| :---- | :---- | :---- |
| M-LF | Futures | Market buy — long fill or reduce short |
| L-LF | Futures | Limit buy — long fill or reduce short |
| M-SF | Futures | Market sell — short fill or reduce long |
| L-SF | Futures | Limit sell — short fill or reduce long |
| M-FLF | Futures | Market flip to long |
| L-FLF | Futures | Limit flip to long |
| M-FSF | Futures | Market flip to short |
| L-FSF | Futures | Limit flip to short |
| M-CLF | Futures | Market close long or BB |
| L-CLF | Futures | Limit close long or BB |
| M-CSF | Futures | Market close short or BB |
| L-CSF | Futures | Limit close short or BB |
| M-B | Spot | Market buy spot |
| L-B | Spot | Limit buy spot |
| M-S | Spot | Market sell spot |
| L-S | Spot | Limit sell spot |
| M-CB | Spot | Market close buy spot or BB |
| L-CB | Spot | Limit close buy spot or BB |
| M-CS | Spot | Market close sell spot or BB |
| L-CS | Spot | Limit close sell spot or BB |

## **2.7 — Multi-Command Alert**

\[  
  { "s": "XRP/USDT:USDT", "c": "LF", "t": "L", "p": "-1%", "q": "500", "a": "tester", "code": "13131", "tag": "3MXRP" },  
  { "s": "XRP/USDT:USDT", "c": "LF", "t": "M", "p": "0",   "q": "500", "a": "tester", "code": "13131", "tag": "3MXRP" }  
\]

# **Section 3 — Order Flow**

## **3.1 — Price Resolution**

async function resolvePrice(exchange, symbol, p) {  
  const ticker \= await exchange.fetchTicker(symbol)  
  const currentPrice \= ticker.last  
  if (\!p || p \=== '0') return currentPrice  
  if (typeof p \=== 'string' && p.endsWith('%')) {  
    const pct \= parseFloat(p.replace('%', '')) / 100  
    return parseFloat(exchange.priceToPrecision(symbol, currentPrice \* (1 \+ pct)))  
  }  
  return parseFloat(exchange.priceToPrecision(symbol, parseFloat(p)))  
}

## **3.2 — Average Entry Recalculation**

**Never replace avgEntry with the new fill price. Always recalculate as a weighted average.**

// After a new fill:  
// Guard against division by zero on first ever fill for this layer  
if (tag.totalQty \=== 0\) {  
  tag.avgEntry \= fillPrice  
} else {  
  tag.avgEntry \= (tag.totalQty \* tag.avgEntry \+ newQty \* fillPrice) / (tag.totalQty \+ newQty)  
}  
tag.totalQty \+= newQty

Same zero guard applies to Set and Super Set:

// Set fill:  
if (tag.setQty \=== 0\) {  
  tag.setAvgEntry \= fillPrice  
} else {  
  tag.setAvgEntry \= (tag.setQty \* tag.setAvgEntry \+ newQty \* fillPrice) / (tag.setQty \+ newQty)  
}  
tag.setQty \+= newQty

// Super Set fill:  
if (tag.superSetQty \=== 0\) {  
  tag.superSetAvgEntry \= fillPrice  
} else {  
  tag.superSetAvgEntry \= (tag.superSetQty \* tag.superSetAvgEntry \+ newQty \* fillPrice) / (tag.superSetQty \+ newQty)  
}  
tag.superSetQty \+= newQty

**Main Tag TP uses weighted average of ALL three: main \+ set \+ superSet. Set TP uses setAvgEntry only. Super Set TP uses superSetAvgEntry only. Main Tag OVERRULES all — when Main TP5 fires, everything closes.**

Example of independent avgEntry per layer:

* Normal LF fills 100 SOL at $130 → main avgEntry \= $130  
* Set fills 50 SOL at $125 → setAvgEntry \= $125 — completely independent, does NOT change main avgEntry  
* Super Set fills 200 SOL at $120 → superSetAvgEntry \= $120 — independent from both main and Set

Now each layer calculates TPs from its own entry price:

* Main Tag TPs: weighted avg of all \= (100\*130 \+ 50\*125 \+ 200\*120) / 350 \= $123.57  
* Set TPs: from $125 only  
* Super Set TPs: from $120 only

## **3.3 — After Every Fill**

10. Read fillPrice from order.average  
11. Recalculate avgEntry for the correct layer (main, set, or superSet)  
12. Update totalQty for that layer  
13. Calculate fee: fillPrice \* qty \* 0.0005 — add to tag.totalFeesPaid and tag.currentPositionFees  
14. Log the alert and fill details to tag.alertHistory  
15. Check if this layer has zero active TP orders — if yes, place all 5 TP limit orders for this layer  
16. If this layer already has active TPs — do NOT place new TPs, wait for next recalculation trigger

## **3.4 — Partial Close (SF while LF / LF while SF / S while B / B while S)**

17. Sell or buy the resolved quantity  
18. Subtract qty from the correct layer: tag.totalQty for main position closes, tag.setQty for Set TP closes, tag.superSetQty for Super Set TP closes  
19. Calculate realized PnL on closed qty using the correct layer avgEntry  
20. Calculate fee: fillPrice \* qtyClosed \* 0.0005 — add to BOTH tag.totalFeesPaid AND tag.currentPositionFees  
21. Direction does NOT change  
22. avgEntry does NOT change — only qty changed  
23. Cancel all unfired Main Tag TPs  
24. Re-place unfired Main Tag TPs with updated qty and same avgEntry  
25. Reset Main Tag TP recalculation timer

# **Section 4 — Take Profit System**

**TP is NEVER sent in an alert. All TP values come from the interface configuration saved per tag. The system manages all TP orders fully automatically.**

## **4.1 — The 3 TP Layers**

| Layer | Entry Price Used | Qty Used | Overruled By |
| :---- | :---- | :---- | :---- |
| Main Tag TPs | Weighted avg of main \+ set \+ superSet | Total of main \+ set \+ superSet | Nothing — Main TP5 closes everything |
| Set TPs | tag.setAvgEntry only | tag.setQty only | Main Tag TP5 |
| Super Set TPs | tag.superSetAvgEntry only | tag.superSetQty only | Main Tag TP5 |

## **4.2 — TP Sell % Calculation**

**Sell % is always calculated from the REMAINING unfired quantity at the time each TP fires — not from the original total.**

Example: layer starts with 1000 contracts total:

* TP1 fires → sell 20% of 1000 \= 200 contracts. Remaining \= 800  
* TP2 fires → sell 25% of 800 \= 200 contracts. Remaining \= 600  
* TP3 fires → sell 33% of 600 \= 198 contracts. Remaining \= 402  
* TP4 fires → sell 50% of 402 \= 201 contracts. Remaining \= 201  
* TP5 fires → sell 100% of 201 \= 201 contracts. Remaining \= 0

Each TP sells from whatever is LEFT at that moment — not from the original 1000\. Agent must verify this math is correct in the code before deployment.

## **4.3 — TP Placement — When and How**

**TPs are placed ONCE per layer when that layer has zero active TPs and a new fill comes in. They are NOT replaced on every single fill — that would spam the exchange.**

Rules:

* Layer has zero active TPs and new fill arrives → place all 5 TP limit orders for that layer immediately  
* Subsequent fills on same layer while TPs are already active → do NOT replace TPs, wait for a recalculation trigger  
* Recalculation trigger fires → cancel only unfired TPs, re-place with updated prices and quantities

Example — SOL entry fills at $130 for 1000 contracts, Main Tag TP config 3%/6%/9%/12%/18%:

* Place sell limit 200 contracts at $133.90 — TP1 \+3%  
* Place sell limit 200 contracts at $137.80 — TP2 \+6%  
* Place sell limit 198 contracts at $141.70 — TP3 \+9%  
* Place sell limit 201 contracts at $145.60 — TP4 \+12%  
* Place sell limit 201 contracts at $153.40 — TP5 \+18%

All 5 sit live on BitMEX simultaneously. They only move when a recalculation trigger fires.

At any time there can be up to 15 active TP orders on the exchange: 5 Main Tag \+ 5 Set \+ 5 Super Set — all independent.

Apply priceToPrecision and amountToPrecision before every TP order. Store all active TP order IDs in tag state per layer.

## **4.4 — TP Recalculation Triggers**

| Trigger | What Recalculates | Timer Resets? |
| :---- | :---- | :---- |
| Set order fills | Cancel \+ re-place unfired Main Tag TPs | YES — Main Tag timer |
| Super Set order fills | Cancel \+ re-place unfired Main Tag TPs | YES — Main Tag timer |
| SF reduces LF (futures) | Cancel \+ re-place unfired Main Tag TPs with new qty | YES — Main Tag timer |
| LF reduces SF (futures) | Cancel \+ re-place unfired Main Tag TPs with new qty | YES — Main Tag timer |
| S reduces B position (spot) | Cancel \+ re-place unfired Main Tag TPs with new qty | YES — Main Tag timer |
| B reduces S position (spot) | Cancel \+ re-place unfired Main Tag TPs with new qty | YES — Main Tag timer |
| Main Tag timer fires | Cancel \+ re-place unfired Main Tag TPs | YES — restarts |
| Set TP timer fires | Cancel \+ re-place unfired Set TPs | YES — restarts |
| Super Set TP timer fires | Cancel \+ re-place unfired Super Set TPs | YES — restarts |
| FLF or FSF arrives (futures only) | Cancel ALL TPs all layers. Fresh TPs after new fill. | YES — all timers reset |

Each layer has its own independent recalculation timer per tag:

* Main Tag TP timer — configurable: 15min / 30min / 1hr / 4hr / OFF  
* Set TP timer — configurable independently  
* Super Set TP timer — configurable independently

## **4.5 — Only Move Unfired TPs**

When recalculating, only cancel and re-place TP levels that have NOT fired yet:

const unfiredTPs \= tag.activeTpOrders\[layer\].filter(tp \=\> \!tp.filled)  
for (const tp of unfiredTPs) {  
  await exchange.cancelOrder(tp.id, tag.symbol)  
}  
// Re-place only unfired levels with updated prices and quantities

## **4.6 — CLF and CSF — Fire TP Sequence**

* If Main Tag TPs are already active on the exchange — they execute naturally as price hits each level. CLF/CSF does not need to place new ones.  
* If Main Tag TPs are NOT active — place all 5 Main Tag TP limit orders immediately  
* Sets and Super Sets and their own TPs keep running — NOT affected unless TP5 fires  
* TP5 at 100% is the nuclear button

**When Main Tag TP5 fires: close 100% of everything — main position \+ all Set positions \+ all Super Set positions. Cancel all remaining unfired TPs across ALL 3 layers. Cancel all pending BB orders. Reset currentPositionFees. Direction becomes neutral until next entry command arrives (LF/SF for futures, B/S for spot).**

After TP5 fires — when next entry command arrives for this tag (LF/SF for futures, B/S for spot):

* Treat as fresh entry  
* Place entry order  
* After fill: place fresh 5 TPs for Main Tag layer  
* Set and Super Set TPs placed fresh when their orders fill

## **4.7 — FLF and FSF**

26. Cancel ALL unfired TPs across all 3 layers using stored order IDs  
27. Cancel ALL pending BB orders using stored order IDs  
28. Reset ALL counters and lists: normalOrderCount, normalOrderList, setCount, setList  
29. Reset ALL avgEntry and qty values: avgEntry=0, totalQty=0, setAvgEntry=0, setQty=0, superSetAvgEntry=0, superSetQty=0  
30. Reset ALL 3 TP recalculation timers  
31. Reset currentPositionFees to 0 — do NOT reset totalFeesPaid or totalFundingPaid  
32. Close full main position (market order)  
33. Keep existing Set and Super Set limit orders on exchange  
34. Open new position in flipped direction using a MARKET ORDER — FLF and FSF always use market for the new entry  
35. After fill: place fresh 5 Main Tag TPs based on new entry price

# **Section 5 — Buy Back (BB)**

## **5.1 — BB Alert Syntax**

{  
  "s":    "SOL/USDT:USDT",  
  "c":    "CLF",  
  "t":    "L",  
  "p":    "0%",             // sell price  
  "p2":   "-2%",            // buy back price after sell fills  
  "q":    "500",            // USD amount OR % of position  
  "a":    "tester",  
  "code": "13131",  
  "tag":  "3MSOL",  
  "type": "BB"  
}

## **5.2 — BB Step by Step**

| Step | Action |
| :---- | :---- |
| 1 | Detect type \= BB |
| 2 | Resolve p \-\> sell limit price |
| 3 | Resolve q \-\> quantity (futures: contracts, spot: coins) — USD or % of position converted at current price |
| 4 | Store resolved contract quantity as bbQty — this is the fixed amount for both legs |
| 5 | Place SELL limit at p price for bbQty contracts. Subtract bbQty from tag total. |
| 6 | Store sell order ID in tag BB state. Show in Pending Orders Panel. |
| 7 | Wait for sell to fill... |
| 8 | Sell fills \-\> resolve p2 using sell fill price as reference |
| 9 | Place BUY limit at p2 price for SAME bbQty contracts — NOT recalculated from USD. Same exact contract count as the sell. |
| 10 | Store buy order ID in tag BB state. Show in Pending Orders Panel. |
| 11 | Wait for buy to fill... |
| 12 | Buy fills \-\> add bbQty back to tag total. Remove from Pending Orders Panel. |

* Futures — FLF or FSF arrives while BB active: cancel ALL pending BB orders immediately  
* Spot — if a CB or CS alert arrives that would fully close the position while BB is active: cancel ALL pending BB orders immediately  
* System crash after sell fills but before buy back placed: on reconnect detect this and auto-place buy back at p2 using the original sell fill price as reference

# **Section 6 — Balancer and Set System**

## **6.1 — Balancer OFF — Cleaner Mode**

Counter runs. When configurable threshold is reached:

36. Cancel all pending limit orders in this batch  
37. Calculate average price of cancelled orders  
38. Apply Set p offset from interface  
39. Place ONE unified limit order at that price for combined total quantity — direction matches tag direction: LF/B \= buy limit, SF/S \= sell limit

This cleans up multiple small pending orders into one. Threshold and p offset configurable per tag.

## **6.2 — Balancer ON — Full Set Mode**

* Every LF or SF alert (futures) OR every B or S alert (spot) adds 1 to counter  
* At threshold: calculate average entry, place one Set limit at Set p offset  
* Reset counter to 0  
* For t=L alerts: count to threshold, then place one Set. Do not place on every alert.

## **6.3 — Set to Super Set**

* At Super Set threshold: cancel all pending Set orders  
* Calculate average entry and total qty of those Sets  
* Place one Super Set limit at Super Set p offset  
* Reset Set counter to 0

## **6.4 — Per-Tag Settings**

| Setting | Default | Notes |
| :---- | :---- | :---- |
| Balancer toggle | OFF | ON \= Set mode, OFF \= Cleaner mode |
| Multiplier | 1x | Applied to q before any quantity calculation |
| Set counter threshold | 13 | Configurable per tag |
| Super Set threshold | 12 | Configurable per tag |
| Set p (LF / B) | \-1% | Offset for Set in long/buy direction |
| Set p (SF / S) | \+1% | Offset for Set in short/sell direction |
| Super Set p | \-3% | Offset for Super Set order |

# **Section 7 — Fees, Funding, and PnL**

## **7.1 — Trading Fees**

const fee \= fillPrice \* quantity \* 0.0005  // 0.05% per fill  
tag.totalFeesPaid \+= fee        // NEVER reset  
tag.currentPositionFees \+= fee  // resets when position fully closes

## **7.2 — Funding Rate Tracking**

**Funding is charged or paid every 8 hours on BitMEX perpetual contracts. Pull actual funding payments from BitMEX API and attribute them per tag based on position size held at funding time.**

Implementation:

40. Listen for BitMEX funding settlement events via WebSocket or poll every 8 hours  
41. When funding settles, fetch the funding payment amount from BitMEX API  
42. For each active tag, calculate total tag qty across all layers: tag.totalQty \+ tag.setQty \+ tag.superSetQty  
43. Calculate tag's funding share: fundingPayment \* (tagTotalQty / totalAccountPosition)  
44. Add to tag.totalFundingPaid — this value NEVER resets  
45. Display live current funding rate from BitMEX next to the funding tab

**totalFundingPaid is permanent and never cleared even when position is zero or tag appears inactive.**

## **7.3 — Unrealized PnL**

Unrealized PnL covers the total position across all 3 layers — main, Set, and Super Set:

const totalQty \= tag.totalQty \+ tag.setQty \+ tag.superSetQty  
if (totalQty \=== 0\) {  
  unrealizedPnL \= 0  
} else {  
  const totalValue \= (tag.totalQty \* tag.avgEntry) \+ (tag.setQty \* tag.setAvgEntry) \+ (tag.superSetQty \* tag.superSetAvgEntry)  
  const weightedAvgEntry \= totalValue / totalQty  
  if (tag.direction \=== 'LF' || tag.direction \=== 'B') {  
    // LF (futures) or B (spot) — profit when price rises  
    unrealizedPnL \= (currentPrice \- weightedAvgEntry) \* totalQty \- tag.currentPositionFees  
  } else {  
    // SF (futures only) — profit when price falls  
    unrealizedPnL \= (weightedAvgEntry \- currentPrice) \* totalQty \- tag.currentPositionFees  
  }  
}

Display green if positive, red if negative. Updates live.

## **7.4 — Realized PnL**

Always use the avgEntry of the LAYER being closed, not always tag.avgEntry:

// Main tag close (LF / spot B):  
{ const realized \= (fillPrice \- tag.avgEntry) \* qtyClosed  
  const fee \= fillPrice \* qtyClosed \* 0.0005  
  tag.realizedPnL \+= realized \- fee }

// Main tag close (SF):  
{ const realized \= (tag.avgEntry \- fillPrice) \* qtyClosed  
  const fee \= fillPrice \* qtyClosed \* 0.0005  
  tag.realizedPnL \+= realized \- fee }

// Set TP close (LF / spot B direction):  
{ const realized \= (fillPrice \- tag.setAvgEntry) \* qtyClosed  
  const fee \= fillPrice \* qtyClosed \* 0.0005  
  tag.realizedPnL \+= realized \- fee }

// Set TP close (SF direction):  
{ const realized \= (tag.setAvgEntry \- fillPrice) \* qtyClosed  
  const fee \= fillPrice \* qtyClosed \* 0.0005  
  tag.realizedPnL \+= realized \- fee }

// Super Set TP close (LF / spot B direction):  
{ const realized \= (fillPrice \- tag.superSetAvgEntry) \* qtyClosed  
  const fee \= fillPrice \* qtyClosed \* 0.0005  
  tag.realizedPnL \+= realized \- fee }

// Super Set TP close (SF direction):  
{ const realized \= (tag.superSetAvgEntry \- fillPrice) \* qtyClosed  
  const fee \= fillPrice \* qtyClosed \* 0.0005  
  tag.realizedPnL \+= realized \- fee }

**Use the correct layer avgEntry for each close. Using tag.avgEntry for Set or Super Set TP closes will produce wrong realized PnL numbers.**

# **Section 8 — Interface Requirements**

## **8.1 — Main Table Columns**

| Column | Notes |
| :---- | :---- |
| Tag | Clickable — expands settings panel inline |
| Account | From alert.a |
| Symbol | Trading pair |
| Side | Futures: LF or SF. Spot: B or S. |
| Market | futures or spot — detected automatically from symbol format |
| Contracts | Futures: raw value divided by 100 for display only. Spot: raw coin quantity — do NOT divide by 100\. |
| Avg Price | Weighted average entry price across all 3 layers — updates on every new fill |
| Dollar Amount | Futures: (contracts ÷ 100\) x avgPrice. Spot: coins x avgPrice. Both show $ prefix, 2 decimal places. |
| Unrealized PnL | Live. Green positive, red negative. Includes 0.05% fee deduction. |
| Realized PnL | Accumulated on every partial or full close |
| Trades | Total order count on this tag |
| First Opened | Timestamp of first ever order |
| Last Updated | Timestamp of most recent activity |

## **8.2 — Expandable Row (click tag to open)**

| Element | Type | Default | Notes |
| :---- | :---- | :---- | :---- |
| Balancer | Toggle | OFF | ON \= Set mode, OFF \= Cleaner mode |
| Multiplier | Number | 1 | Min \= 1 |
| Set counter threshold | Number | 13 | Per tag |
| Super Set threshold | Number | 12 | Per tag |
| Set p (LF / B) | Text | \-1% | Offset for Set in long/buy direction |
| Set p (SF / S) | Text | \+1% | Offset for Set in short/sell direction |
| Super Set p | Text | \-3% |  |
| Main Tag TP table | 5 row table |  | Trigger % \+ Sell % both editable |
| Main Tag TP timer | Dropdown | 30min | 15min/30min/1hr/4hr/OFF |
| Set TP table | 5 row table |  | Trigger % \+ Sell % both editable |
| Set TP timer | Dropdown | 15min | 15min/30min/1hr/4hr/OFF |
| Super Set TP table | 5 row table |  | Trigger % \+ Sell % both editable |
| Super Set TP timer | Dropdown | 1hr | 15min/30min/1hr/4hr/OFF |
| Save button | Button |  | Saves all settings for this tag only |

## **8.3 — Per-Tag Tabs**

| Tab | Content | Clears? | Spot? |
| :---- | :---- | :---- | :---- |
| Fees | Current position fees \+ Total fees paid since tag created | Current resets on full close. Total never clears. | YES — show for all tags |
| Funding | Total funding paid since tag created \+ live current funding rate | Never clears. Always live. | NO — hide for spot tags |
| Alert Log | Clean table of every alert received on this tag | Never clears. | YES — show for all tags |

## **8.4 — Alert Log Table (per tag)**

Clean, easy to read table. One row per alert received. Columns:

| Column | Description |
| :---- | :---- |
| Time | Timestamp of alert |
| Command | Futures: LF / SF / FLF / FSF / CLF / CSF. Spot: B / S / CB / CS |
| Type | M or L |
| Price (p) | p value from alert |
| Qty (q) | q value from alert |
| Fill Price | Actual price filled at |
| Status | Filled / Pending / Failed / Cancelled |

## **8.5 — Pending Orders Panel**

| Column | Description |
| :---- | :---- |
| Tag | Which tag |
| Type | Set / Super Set / BB Sell / BB Buy Back |
| Symbol | Trading pair |
| Side | Buy or Sell |
| Qty | Futures: quantity divided by 100 for display. Spot: raw coin quantity — do NOT divide by 100\. |
| Price | Limit price |
| Edit | Change price or qty and resubmit to exchange |
| Clean | Cancel on exchange and remove — only this specific order |

## **8.6 — Tag Management**

* Add Tag — form: name, symbol, account. Pre-fills default TP values.  
* Edit Tag — change name or symbol  
* Delete Tag — confirmation required. See rules below.  
* Tags with zero contracts stay visible permanently — never auto-removed

**DELETE TAG RULES — the agent must follow all of these before removing a tag from the interface:**

46. Show a confirmation dialog listing all active orders for this tag: open Sets, Super Sets, TPs, BB orders  
47. Cancel ALL active TP orders for this tag on the exchange  
48. Cancel ALL pending BB orders for this tag on the exchange  
49. Cancel ALL pending Set and Super Set limit orders for this tag on the exchange  
50. Only after all orders are cancelled — remove the tag from the interface  
51. Do NOT close any open positions on BitMEX — the position stays open, the user manages it manually

**If the system cannot cancel an order on the exchange during tag deletion (e.g. network error), abort the deletion and show an error. Never delete a tag while it still has unconfirmed active orders on the exchange.**

# **Section 9 — Spot Trading**

**DO NOT modify or break any existing spot logic. The existing B and S commands already work. This section adds new features to spot — it does not replace anything.**

**The system detects spot vs futures automatically from the symbol format. Symbols without :USDT suffix (e.g. BMEX/USDT) are spot. Symbols with :USDT suffix (e.g. SOL/USDT:USDT) are futures. All routing logic branches on this detection.**

## **9.1 — Spot Commands (Full List)**

| Command | Full Name | What It Does |
| :---- | :---- | :---- |
| B | Buy | Buy coins on spot. Add to position. |
| S | Sell | Sell coins on spot. Reduce or close position. |
| CB | Close Buy | Close a buy position. Can close by % of position OR by fixed amount. See Section 9.3. |
| CS | Close Sell | Close a sell position. Can close by % of position OR by fixed amount. See Section 9.3. |

**Spot has NO flip commands. FLF and FSF do not apply to spot. Spot cannot short — there is no short position to flip to. If a flip command arrives for a spot tag, log an error and ignore it.**

## **9.2 — Spot Switch Cases**

Spot uses the same t-c routing key as futures. All spot cases must exist in the switch:

| Case | Description |
| :---- | :---- |
| M-B | Market buy spot |
| L-B | Limit buy spot |
| M-S | Market sell spot |
| L-S | Limit sell spot |
| M-CB | Market close buy spot or BB |
| L-CB | Limit close buy spot or BB |
| M-CS | Market close sell spot or BB |
| L-CS | Limit close sell spot or BB |

## **9.3 — CB and CS — Close Logic**

**CB and CS can close by percentage OR by fixed amount. The system detects which based on the q field — same detection logic as futures.**

| q format | Example | What it closes |
| :---- | :---- | :---- |
| % of position | "q": "50%" | Sell 50% of the current spot position quantity |
| Fixed amount | "q": "500" | Sell $500 worth of the current spot coin at current price |

CB/CS without BB: same rule as CLF/CSF on futures — if Main Tag TPs are already active on the exchange let them run. If no TPs are active, place all 5 Main Tag TP limit orders immediately.

CB/CS with BB: same BB two-step logic — sell at p, buy back at p2, same coin quantity.

## **9.4 — Spot Quantity Units**

**Spot uses COIN quantities, not contracts. The contracts column in the interface shows coin units for spot tags. Do NOT divide spot quantities by 100 — that is futures only.**

// Spot quantity resolution:  
// q \= USD amount \-\> coins \= parseFloat(q) / currentPrice  
// q \= % of position \-\> totalSpotQty \= tag.totalQty \+ tag.setQty \+ tag.superSetQty  
//                      coins \= (totalSpotQty \* parseFloat(q) / 100\)  
// Apply exchange.amountToPrecision(symbol, coins) before every order  
// Zero guard: if tag.totalQty \=== 0 on first fill, set avgEntry \= fillPrice directly

## **9.5 — Features That Apply to Spot**

| Feature | Applies to Spot? | Notes |
| :---- | :---- | :---- |
| B / S commands | YES | Already working — do not change |
| CB / CS commands | YES | Already working — do not change |
| Limit orders (t=L) | YES | Same p field and price resolution as futures |
| BB (type=BB) | YES | Same two-step logic — sell at p, buy back at p2, same coin qty |
| Set system | YES | Balancer, Set, Super Set all work on spot |
| TP layers | YES | 3 TP layers, 5 levels each, same recalculation rules |
| Fees tab | YES | 0.05% per fill, same tracking rules |
| Alert log | YES | Same permanent log per tag |
| Funding tab | NO | Spot has no funding rate — hide this tab for spot tags |
| Unrealized PnL | YES | Formula: (currentPrice \- avgEntry) \* totalQty \- currentPositionFees. No short, so direction is always current minus entry. Result can still be negative. |
| Realized PnL | YES | Same formula for closes |
| Contracts ÷ 100 | NO | Spot shows raw coin quantity — do NOT divide by 100 |
| FLF / FSF | NO | Spot has no flip — ignore these commands if received on spot tag |
| Deduplication | YES | Same isDuplicate() check applies |
| Multi-account | YES | Same exchangeInstances routing by alert.a |

## **9.6 — Spot BB Syntax**

{  
  "s":    "BMEX/USDT",  
  "c":    "CB",            // CB for buy position, CS for sell position  
  "t":    "L",  
  "p":    "0%",            // sell price  
  "p2":   "-2%",           // buy back price after sell fills  
  "q":    "500",           // USD amount OR % of spot position  
  "a":    "tester",  
  "code": "13131",  
  "tag":  "26MB",  
  "type": "BB"  
}

BB on spot follows the exact same logic as futures BB. The only difference is quantities are in coins not contracts, and the buy back restores the exact same coin quantity that was sold.

## **9.7 — What NOT to Change**

**The existing spot B and S command logic is working correctly. Do NOT refactor, rewrite, or restructure it. Only ADD the new features alongside the existing logic. If the existing spot flow breaks as a result of this update, roll back and fix before continuing.**

* Do not change how B and S orders are placed  
* Do not change how spot position tracking works  
* Do not change the spot symbol detection logic  
* Do not change the spot account routing  
* Add BB, Set, TP, and CB/CS close-by-% logic as addons to the existing spot flow

# **Section 10 — Error Prevention**

## **10.1 — Error Logging**

**Raw Error objects always print as {}. Every single catch block must log error.message and error.stack.**

} catch (error) {  
  console.log('ERROR Message:', error.message)  
  console.log('ERROR Stack  :', error.stack)  
  if (error.response) console.log('Exchange response:', JSON.stringify(error.response.data))  
}

## **10.2 — Minimum Order Size**

Before placing ANY order, verify the resolved quantity meets BitMEX minimum order size for that symbol. If the quantity is below the minimum, scale UP to the minimum — never abort the order.

const minQty \= exchange.markets\[symbol\].limits.amount.min  
if (resolvedQty \< minQty) {  
  console.log('WARNING: qty', resolvedQty, 'below minimum', minQty, '— scaling up to minimum')  
  resolvedQty \= minQty  
}

## **10.3 — Deduplication**

const recentAlerts \= new Map()  
const DEDUP\_MS \= 5000  
function isDuplicate(alert) {  
  const key \= \`${alert.code}-${alert.tag}-${alert.c}\`  
  const now \= Date.now()  
  const last \= recentAlerts.get(key)  
  if (last && (now \- last) \< DEDUP\_MS) return true  
  recentAlerts.set(key, now)  
  return false  
}  
// Call isDuplicate(alert) as the FIRST line of the alert handler

// Cleanup — run this every 60 seconds to prevent memory growth:  
setInterval(() \=\> {  
  const now \= Date.now()  
  for (const \[key, ts\] of recentAlerts.entries()) {  
    if (now \- ts \> DEDUP\_MS) recentAlerts.delete(key)  
  }  
}, 60000\)

## **10.4 — Multi-Account Routing**

const exchangeInstances \= {  
  'tester': new ccxt.bitmex({ apiKey: process.env.KEY\_TESTER, secret: process.env.SECRET\_TESTER }),  
}  
const exchange \= exchangeInstances\[alert.a\]  
if (\!exchange) { console.log('No instance for account:', alert.a); return }

## **10.5 — Flip Reset Function**

async function resetTagOnFlip(tag, exchange) {  
  // Cancel all TP orders stored in tag state  
  for (const layer of \['mainTag', 'set', 'superSet'\]) {  
    for (const tp of tag.activeTpOrders\[layer\] || \[\]) {  
      try { await exchange.cancelOrder(tp.id, tag.symbol) } catch(e) {}  
    }  
  }  
  // Cancel all BB orders stored in tag state  
  for (const bbOrder of tag.activeBBOrders || \[\]) {  
    try { await exchange.cancelOrder(bbOrder.id, tag.symbol) } catch(e) {}  
  }  
  tag.normalOrderCount \= 0;   tag.normalOrderList \= \[\]  
  tag.setCount \= 0;           tag.setList \= \[\]  
  tag.pendingEntryOrder \= null  
  tag.activeTpOrders \= { mainTag: \[\], set: \[\], superSet: \[\] }  
  tag.mainTpTimer \= null;     tag.setTpTimer \= null;    tag.superSetTpTimer \= null  
  tag.avgEntry \= 0;           tag.totalQty \= 0  
  tag.setAvgEntry \= 0;        tag.setQty \= 0  
  tag.superSetAvgEntry \= 0;   tag.superSetQty \= 0  
  tag.currentPositionFees \= 0  
  // Do NOT reset totalFeesPaid or totalFundingPaid — those are permanent  
}  
// Call at START of every FLF and FSF handler — futures only, never call for spot tags

## **10.6 — WebSocket Reconnect**

async function reconnectWithBackoff(connectFn) {  
  let delay \= 1000  
  while (true) {  
    try { await connectFn(); await reconcileState(); break }  
    catch (err) {  
      await new Promise(r \=\> setTimeout(r, delay))  
      delay \= Math.min(delay \* 2, 30000\)  
    }  
  }  
}

reconcileState() must:

* Fetch all open orders from BitMEX per active tag  
* For any expected order now filled — trigger post-fill logic (update avg, place TPs)  
* Detect orphaned BB: sell filled but no buy back exists — place buy back at p2  
* Log any unknown orders on exchange

# **Section 11 — Master Implementation Checklist**

| \# | Task | Done? |
| :---- | :---- | :---- |
| 1 | p and p2 regex allows \+/- percentages | \[ \] |
| 2 | q handles USD amount AND % of position with correct detection logic | \[ \] |
| 3 | All futures c commands handled: LF SF FLF FSF CLF CSF. All spot c commands handled: B S CB CS | \[ \] |
| 4 | Switch key is ONLY t-c — tp removed from key and from all alert parsing | \[ \] |
| 5 | All 20 switch cases implemented: 12 futures \+ 8 spot | \[ \] |
| 6 | Multi-command array alerts processed sequentially | \[ \] |
| 7 | SF while holding LF: sells, reduces qty, direction stays LF, TPs recalculate | \[ \] |
| 8 | LF while holding SF: buys back, reduces qty, direction stays SF, TPs recalculate | \[ \] |
| 9 | resolvePrice() — fetchTicker \+ % parse \+ priceToPrecision | \[ \] |
| 10 | resolveQuantity() — USD or % of position \+ multiplier \+ amountToPrecision | \[ \] |
| 11 | Minimum order size check before every order — scale UP to minimum if below, never abort | \[ \] |
| 12 | Weighted avgEntry recalculation after every fill | \[ \] |
| 13 | Set avgEntry and setQty independent from main tag avgEntry | \[ \] |
| 14 | Super Set avgEntry and superSetQty independent from main and Set | \[ \] |
| 15 | Market orders: TPs placed after fill confirmed via order.average if layer has zero active TPs | \[ \] |
| 16 | Limit orders: wait for order.status \= closed THEN check if layer has zero TPs before placing | \[ \] |
| 17 | BB: sell at p, buy back at p2 only after sell fills | \[ \] |
| 18 | BB: both orders visible in Pending Orders Panel | \[ \] |
| 19 | BB: all BB orders cancelled on flip | \[ \] |
| 20 | BB: orphaned sell detected on reconnect — auto-place buy back | \[ \] |
| 21 | 3 TP layers — Main Tag, Set, Super Set — all independent | \[ \] |
| 22 | 5 TP levels per layer — trigger % and sell % configurable in interface | \[ \] |
| 23 | Sell % calculated from REMAINING unfired qty not original total | \[ \] |
| 24 | Self-test: verify TP sell % math is correct with example values | \[ \] |
| 25 | TPs placed when layer has zero active TPs and new fill arrives — NOT on every fill | \[ \] |
| 26 | Only unfired TPs cancelled and re-placed on recalculation | \[ \] |
| 27 | Recalculation triggers: Set fill, SuperSet fill, partial close, each layer timer | \[ \] |
| 28 | Each layer has independent recalculation timer per tag | \[ \] |
| 29 | All 3 TP timers reset on FLF and FSF | \[ \] |
| 30 | Main Tag TP timer resets on SF-reduces-LF, LF-reduces-SF, S-reduces-B, B-reduces-S | \[ \] |
| 31 | CLF/CSF: fire Main Tag TP sequence. Sets and Super Sets unaffected UNLESS Main TP5 fires. | \[ \] |
| 32 | Main TP5: close everything across all 3 layers, cancel all remaining TPs | \[ \] |
| 33 | After TP5: fresh TPs placed on next entry | \[ \] |
| 34 | FLF/FSF: cancel all TPs and BB, reset all counters and timers, keep Set/SuperSet orders | \[ \] |
| 35 | Balancer OFF cleaner mode: unify pending orders at threshold with p offset | \[ \] |
| 36 | Balancer ON Set mode: consolidate at threshold | \[ \] |
| 37 | Set counter threshold configurable per tag | \[ \] |
| 38 | Super Set threshold configurable per tag | \[ \] |
| 39 | t=L alerts: count to threshold before placing Set — not on every alert | \[ \] |
| 40 | 0.05% fee on every fill — added to totalFeesPaid and currentPositionFees | \[ \] |
| 41 | currentPositionFees resets on full close. totalFeesPaid never resets. | \[ \] |
| 42 | Funding payments pulled from BitMEX API and attributed per tag | \[ \] |
| 43 | totalFundingPaid never resets — permanent per tag | \[ \] |
| 44 | Unrealized PnL: correct sign for LF/SF (futures) and B (spot), includes fee deduction, live update | \[ \] |
| 45 | Realized PnL: accumulated on every partial or full close with fee deducted | \[ \] |
| 46 | Futures contracts column: divided by 100 for display only — internal value unchanged | \[ \] |
| 47 | Spot contracts column: raw coin quantity — do NOT divide by 100 | \[ \] |
| 48 | Tags never removed from interface at zero position | \[ \] |
| 49 | Expandable row: all settings including 3 TP tables with timers | \[ \] |
| 50 | Fees tab: current position fees \+ lifetime total fees | \[ \] |
| 51 | Funding tab: lifetime total funding paid \+ live current funding rate | \[ \] |
| 52 | Alert log tab: clean table — time, command, type, p, q, fill price, status | \[ \] |
| 53 | Pending orders panel with Edit and Clean per order | \[ \] |
| 54 | Add / Edit / Delete tag management | \[ \] |
| 55 | ALL catch blocks log error.message and error.stack | \[ \] |
| 56 | isDuplicate() check — first line of every alert handler | \[ \] |
| 57 | Deduplication map cleaned every 60 seconds via setInterval | \[ \] |
| 58 | exchangeInstances map — route by alert.a | \[ \] |
| 59 | resetTagOnFlip() called at start of every FLF and FSF | \[ \] |
| 60 | WebSocket reconnect with exponential backoff \+ reconcileState() | \[ \] |
| 61 | Spot detected automatically from symbol format — no :USDT suffix \= spot | \[ \] |
| 62 | Existing B and S spot commands unchanged — no refactoring | \[ \] |
| 63 | CB and CS commands handle close by % AND close by fixed amount | \[ \] |
| 64 | All 8 spot switch cases implemented: M-B, L-B, M-S, L-S, M-CB, L-CB, M-CS, L-CS | \[ \] |
| 65 | Spot quantities in coins — do NOT divide by 100 for display | \[ \] |
| 66 | BB works on spot: sell at p, buy back at p2, same coin quantity | \[ \] |
| 67 | Set and Super Set system works on spot tags | \[ \] |
| 68 | 3 TP layers work on spot tags | \[ \] |
| 69 | Funding tab hidden for spot tags — spot has no funding | \[ \] |
| 70 | FLF and FSF ignored on spot tags — log error if received | \[ \] |
| 71 | Spot unrealized PnL: (currentPrice \- avgEntry) \* totalQty \- currentPositionFees. Can be negative if price below entry. | \[ \] |
| 72 | Balancer OFF unified order direction matches tag direction: LF/B \= buy limit, SF/S \= sell limit | \[ \] |
| 73 | Realized PnL code uses block scoping to avoid const redeclaration errors | \[ \] |

**When all 73 items are checked the system is complete, correct, and protected against all known failure points. This is the definitive version — do not use any previous guide.**

