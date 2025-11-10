# Exchange Integration Guide

This document details the CCXT integration architecture for BitMEX and provides guidance for implementing the same functionality with Hyperliquid.

## Table of Contents
- [Current Implementation: BitMEX via CCXT](#current-implementation-bitmex-via-ccxt)
- [CCXT Client Architecture](#ccxt-client-architecture)
- [Trading Flow](#trading-flow)
- [Hyperliquid Migration Guide](#hyperliquid-migration-guide)
- [Comparison: BitMEX vs Hyperliquid](#comparison-bitmex-vs-hyperliquid)

---

## Current Implementation: BitMEX via CCXT

### Overview
The bot uses the [CCXT library](https://github.com/ccxt/ccxt) to interface with BitMEX exchange. CCXT provides a unified API across 100+ cryptocurrency exchanges.

### Dependencies
```json
{
  "ccxt": "^1.36.1"
}
```

---

## CCXT Client Architecture

### File: `server/CreateCCXT.js`

The CCXT wrapper is implemented as a constructor function that creates exchange-specific instances for each user.

#### Constructor Signature
```javascript
function CreateCCXT(apiKey, apiSecret, name)
```

**Parameters:**
- `apiKey` (string): User's BitMEX API key
- `apiSecret` (string): User's BitMEX API secret
- `name` (string): User identifier for logging

#### Instance Methods

##### 1. **init()** - Initialize Exchange Connection
```javascript
this.init = function()
```
- Creates new CCXT BitMEX instance
- Enables rate limiting
- Auto-switches to testnet if available
- Loads market data
- **Returns:** Promise<'success' | 'failed'>

**Example:**
```javascript
const userCCXT = new CreateCCXT(apiKey, apiSecret, 'username')
await userCCXT.init()
```

##### 2. **Market Orders**

**Market Buy:**
```javascript
this.marketBuyOrder = function(symbol, amount, params)
```
- `symbol`: Trading pair (e.g., 'BTC/USD')
- `amount`: Quantity in contracts
- `params`: Additional order parameters
- **Returns:** Promise<OrderResponse>

**Market Sell:**
```javascript
this.marketSellOrder = function(symbol, amount, params)
```
- Same signature as marketBuyOrder

##### 3. **Limit Orders**

**Limit Buy:**
```javascript
this.limitBuyOrder = function(symbol, amount, price, params)
```
- `symbol`: Trading pair
- `amount`: Quantity in contracts
- `price`: Limit price
- `params`: Additional parameters
- **Returns:** Promise<OrderResponse>

**Limit Sell:**
```javascript
this.limitSellOrder = function(symbol, amount, price, params)
```
- Same signature as limitBuyOrder

##### 4. **Order Management**

**Cancel Order:**
```javascript
this.cancelOrder = function(id)
```
- `id`: Order ID to cancel
- **Returns:** Promise<CancelResponse>

**Get Open Orders:**
```javascript
this.openOrders = function(symbol, since, limit, params)
```
- `symbol`: Trading pair (optional, null for all)
- `since`: Timestamp in ms
- `limit`: Max number of orders
- `params`: Additional parameters
- **Returns:** Promise<Order[]>

**Get Closed Orders:**
```javascript
this.closedOrders = function(symbol, since, limit, params)
```
- Same signature as openOrders

**Get Trade History:**
```javascript
this.myTrades = function(symbol, since, limit, params)
```
- Same signature as openOrders

##### 5. **Account & Market Data**

**Get Balance:**
```javascript
this.balance = function()
```
- **Returns:** Promise<BalanceResponse>
- Contains: free, used, total balances per currency

**Get Ticker:**
```javascript
this.ticker = function(symbol, params)
```
- `symbol`: Trading pair
- `params`: Additional parameters
- **Returns:** Promise<TickerResponse>
- Contains: bid, ask, last, volume, etc.

---

## Trading Flow

### Symbol Resolution
TradingView symbols are converted to CCXT format:

| TradingView | CCXT Format |
|-------------|-------------|
| XBTUSD      | BTC/USD     |
| ETHUSD      | ETH/USD     |
| XRPUSD      | XRP/USD     |
| LTCUSD      | LTC/USD     |
| BCHUSD      | BCH/USD     |

**Location:** `server/index.js:83-98`

### Price Precision (BitMEX-specific)

Each symbol has specific decimal precision requirements:

```javascript
// BTC/USD: Round up to nearest integer (0.5 USD increment)
BTC/USD: Math.ceil(price)

// XRP/USD: 4 decimals (0.0001 USD increment)
XRP/USD: price.toFixed(4)

// ETH/USD: 1 decimal (0.05 USD increment)
ETH/USD: round(price, 1)

// LTC/USD: 2 decimals (0.01 USD increment)
LTC/USD: round(price, 2)

// BCH/USD: 1 decimal (0.05 USD increment)
BCH/USD: round(price, 1)
```

**Location:** `server/index.js:102-138`

### Contract Calculation (BitMEX-specific)

BitMEX uses inverse contracts (quoted in BTC):

```javascript
// BTC/USD: 1 USD per contract
contracts = xbtValue * currentPrice

// XRP/USD: 0.0002 XBT per 1 USD
contracts = xbtValue / (0.0002 * currentPrice)

// ETH/USD: 0.000001 XBT per 1 USD
contracts = xbtValue / (0.000001 * currentPrice)

// LTC/USD: 0.000002 XBT per 1 USD
contracts = xbtValue / (0.000002 * currentPrice)

// BCH/USD: 0.000001 XBT per 1 USD
contracts = xbtValue / (0.000001 * currentPrice)
```

**Location:** `server/index.js:141-174`

### Auto-Sizing Logic

Position sizes scale with account balance:

```javascript
function getLevel(amountBTC) {
    let level = Math.floor(Math.log2(8 * amountBTC))
    return level < 1 ? 1 : level
}

function calcMultiplier(accLevel) {
    return 1 // Currently disabled: +(1.25 ^ (accLevel-1))
}

function getAutoQnty(defaultSize) {
    let marginBalance = marginBalanceInBTC
    let multiplier = calcMultiplier(getLevel(marginBalance))
    return multiplier * defaultSize
}
```

**Location:** `server/index.js:60-186`

---

## WebSocket Streams

### 1. Public Market Data Stream
**File:** `server/wss/wss_stream.js`

```javascript
const ws = new WebSocket('wss://ws.testnet.bitmex.com/realtime')

// Subscribe to instruments
ws.send(JSON.stringify({
    "op": "subscribe",
    "args": [
        "instrument:XBTUSD",
        "instrument:ETHUSD",
        "instrument:XRPUSD",
        "instrument:LTCUSD",
        "instrument:BCHUSD"
    ]
}))
```

**Data Received:**
- `partial`: Initial snapshot
- `update`: Real-time updates
- Contains: lastPrice, volume, timestamp, etc.

### 2. Private User Data Stream (Multiplexed)
**File:** `server/wss/wss_auth_md.js`

```javascript
const wss = new WebSocket('wss://ws.testnet.bitmex.com/realtimemd')

// For each user with API keys:
loginAndSubscribe(user, [
    "execution",  // Trade fills
    "order",      // Order updates
    "margin",     // Account margin
    "position",   // Open positions
    "wallet"      // Wallet balance
])
```

**Authentication:**
- Uses HMAC-SHA256 signature
- Multiplexed: multiple users on single connection
- Each user has unique stream ID (MD5 hash of API key)

---

## Hyperliquid Migration Guide

### Overview

Hyperliquid is a decentralized perpetual futures DEX built on an L1 blockchain. Unlike BitMEX (centralized CEX), Hyperliquid uses on-chain transactions but provides CEX-like performance.

### Key Differences

| Feature | BitMEX (CCXT) | Hyperliquid |
|---------|---------------|-------------|
| **Architecture** | Centralized Exchange | Decentralized L1 |
| **Authentication** | API Key/Secret | Wallet Private Key |
| **Order Types** | Market, Limit, Stop | Market, Limit, TWAP, Scale |
| **WebSocket** | Centralized WS | Decentralized WS Relay |
| **Contract Type** | Inverse (BTC-quoted) | Linear (USDC-quoted) |
| **CCXT Support** | ✅ Yes | ❌ No (custom SDK) |

### Hyperliquid SDK

**Installation:**
```bash
npm install --save @nktkas/hyperliquid
```

**Documentation:**
- SDK: https://github.com/nktkas/hyperliquid
- API Docs: https://hyperliquid.gitbook.io/hyperliquid-docs/

### Implementation Strategy

#### Step 1: Create Hyperliquid Client Wrapper

Create `server/CreateHyperliquid.js`:

```javascript
const { Hyperliquid } = require('@nktkas/hyperliquid');
const Logger = require('./utils/logger');

module.exports = function CreateHyperliquid(privateKey, name) {
    this.privateKey = privateKey;
    this.name = name;

    const log = new Logger(`Hyperliquid <${name}>`, '\x1b[34m');

    this.init = async function() {
        log.print('Loading', 'Creating new Hyperliquid Instance');

        this.client = new Hyperliquid({
            privateKey: this.privateKey,
            testnet: true // Set false for mainnet
        });

        // Test connection
        try {
            await this.client.info.user.state(this.client.wallet.address);
            return 'success';
        } catch (e) {
            log.print('Error', `Failed to connect: ${e.message}`);
            return 'failed';
        }
    };

    // Market Buy Order
    this.marketBuyOrder = async function(symbol, amount, params = {}) {
        log.print('Trade', 'Sending Market Buy Order to Hyperliquid');

        return await this.client.exchange.placeOrder({
            coin: symbol,
            is_buy: true,
            sz: amount,
            limit_px: null, // Market order
            order_type: { limit: { tif: 'Ioc' } }, // Immediate or Cancel
            reduce_only: false,
            ...params
        });
    };

    // Market Sell Order
    this.marketSellOrder = async function(symbol, amount, params = {}) {
        log.print('Trade', 'Sending Market Sell Order to Hyperliquid');

        return await this.client.exchange.placeOrder({
            coin: symbol,
            is_buy: false,
            sz: amount,
            limit_px: null,
            order_type: { limit: { tif: 'Ioc' } },
            reduce_only: false,
            ...params
        });
    };

    // Limit Buy Order
    this.limitBuyOrder = async function(symbol, amount, price, params = {}) {
        log.print('Trade', 'Sending Limit Buy Order to Hyperliquid');

        return await this.client.exchange.placeOrder({
            coin: symbol,
            is_buy: true,
            sz: amount,
            limit_px: price,
            order_type: { limit: { tif: 'Gtc' } }, // Good til Cancel
            reduce_only: false,
            ...params
        });
    };

    // Limit Sell Order
    this.limitSellOrder = async function(symbol, amount, price, params = {}) {
        log.print('Trade', 'Sending Limit Sell Order to Hyperliquid');

        return await this.client.exchange.placeOrder({
            coin: symbol,
            is_buy: false,
            sz: amount,
            limit_px: price,
            order_type: { limit: { tif: 'Gtc' } },
            reduce_only: false,
            ...params
        });
    };

    // Cancel Order
    this.cancelOrder = async function(orderId, symbol) {
        log.print('Trade', 'Sending Cancel Order to Hyperliquid');

        return await this.client.exchange.cancelOrder({
            coin: symbol,
            oid: orderId
        });
    };

    // Get Balance
    this.balance = async function() {
        log.print('Status', 'Getting user balance');

        const state = await this.client.info.user.state(this.client.wallet.address);
        return {
            free: state.withdrawable,
            used: state.marginUsed,
            total: state.marginUsed + state.withdrawable,
            positions: state.assetPositions
        };
    };

    // Get Open Orders
    this.openOrders = async function(symbol = null) {
        log.print('Status', 'Getting open Orders');

        const orders = await this.client.info.user.openOrders(
            this.client.wallet.address
        );

        if (symbol) {
            return orders.filter(o => o.coin === symbol);
        }
        return orders;
    };

    // Get Trade History
    this.myTrades = async function(symbol = null) {
        log.print('Status', 'Getting my Trades');

        const fills = await this.client.info.user.fills(
            this.client.wallet.address
        );

        if (symbol) {
            return fills.filter(f => f.coin === symbol);
        }
        return fills;
    };

    // Get Ticker
    this.ticker = async function(symbol) {
        log.print('Trade', 'Getting Ticker');

        const meta = await this.client.info.meta();
        const allMids = await this.client.info.allMids();

        const assetInfo = meta.universe.find(u => u.name === symbol);
        const midPrice = allMids[symbol];

        return {
            symbol: symbol,
            last: parseFloat(midPrice),
            bid: null, // Would need L2 book for this
            ask: null,
            szDecimals: assetInfo.szDecimals
        };
    };
};
```

#### Step 2: Symbol Resolution (Hyperliquid)

Hyperliquid uses different symbol naming:

```javascript
function resolveSymbol(tvSymbol) {
    switch(tvSymbol) {
        case 'XBTUSD':
        case 'BTCUSD':
            return 'BTC'; // Hyperliquid uses asset names
        case 'ETHUSD':
            return 'ETH';
        case 'XRPUSD':
            return 'XRP';
        case 'LTCUSD':
            return 'LTC';
        case 'BCHUSD':
            return 'BCH';
        default:
            return 'BTC';
    }
}
```

#### Step 3: Price & Size Precision (Hyperliquid)

Hyperliquid has dynamic precision based on asset metadata:

```javascript
async function resolveDecimals(price, symbol, hyperliquid) {
    // Get asset metadata
    const meta = await hyperliquid.client.info.meta();
    const assetInfo = meta.universe.find(u => u.name === symbol);

    // Use szDecimals from metadata
    const decimals = assetInfo.szDecimals;
    return parseFloat(price.toFixed(decimals));
}

async function resolveSize(size, symbol, hyperliquid) {
    const meta = await hyperliquid.client.info.meta();
    const assetInfo = meta.universe.find(u => u.name === symbol);

    const szDecimals = assetInfo.szDecimals;
    return parseFloat(size.toFixed(szDecimals));
}
```

#### Step 4: WebSocket Integration

Create `server/wss/hyperliquid_stream.js`:

```javascript
const { Hyperliquid } = require('@nktkas/hyperliquid');
const Logger = require('./../utils/logger');

module.exports = function HyperliquidWS(testnet = true) {
    const log = new Logger('Hyperliquid-WS');

    this.latest = {
        startTime: new Date(),
        instruments: {},
        isLoaded: false
    };

    this.subscriptions = ['BTC', 'ETH', 'SOL', 'ARB'];

    this.init = async function() {
        const client = new Hyperliquid({ testnet });

        // Subscribe to all mid prices
        const ws = await client.ws.subscriptions.allMids((data) => {
            log.print('UPDATE', `Received ${Object.keys(data.data.mids).length} mid prices`);

            // Update latest prices
            Object.entries(data.data.mids).forEach(([symbol, price]) => {
                if (!this.latest.instruments[symbol]) {
                    this.latest.instruments[symbol] = {};
                }
                this.latest.instruments[symbol].lastPrice = parseFloat(price);
                this.latest.instruments[symbol].timestamp = Date.now();
            });

            if (!this.latest.isLoaded) {
                this.latest.isLoaded = true;
                log.print('LOADED', 'Initial market data received');
            }
        });

        return new Promise((resolve) => {
            setTimeout(() => {
                if (this.latest.isLoaded) {
                    resolve('success');
                } else {
                    resolve('timeout');
                }
            }, 5000);
        });
    };
};
```

Create `server/wss/hyperliquid_user.js` for user data:

```javascript
const { Hyperliquid } = require('@nktkas/hyperliquid');
const Logger = require('./../utils/logger');

async function startHyperliquidUserWS(privateKey, address) {
    const log = new Logger('Hyperliquid-User-WS');
    const client = new Hyperliquid({ privateKey, testnet: true });

    const latest = {
        fills: [],
        orders: [],
        positions: {}
    };

    // Subscribe to user fills
    await client.ws.subscriptions.userFills(address, (data) => {
        log.print('FILL', `New fill: ${data.data.coin} ${data.data.side}`);
        latest.fills.push(data.data);
    });

    // Subscribe to user non-funding ledger updates
    await client.ws.subscriptions.userNonFundingLedgerUpdates(address, (data) => {
        log.print('LEDGER', `Account update: ${JSON.stringify(data.data)}`);
    });

    return latest;
}

module.exports = { startHyperliquidUserWS };
```

#### Step 5: Database Schema Updates

Update user model to support both exchanges:

```javascript
// server/database/MongoDB.js
const userSchema = new Schema({
    created: { type: Date, default: Date.now },
    email: { type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },

    // Exchange configuration
    exchange: {
        type: String,
        enum: ['bitmex', 'hyperliquid'],
        default: 'bitmex'
    },

    // BitMEX credentials (existing)
    bitmex: {
        apiKey: { type: String },
        apiSecret: { type: String }
    },

    // Hyperliquid credentials (new)
    hyperliquid: {
        privateKey: { type: String }, // Encrypted!
        address: { type: String }
    },

    telegram: { type: Object, required: false },
    phone: { type: String, required: false },
    config: { type: Object, required: false }
});
```

#### Step 6: Modify Trade Execution Logic

Update `server/index.js` to support both exchanges:

```javascript
async function initExchangeUsers() {
    return new Promise((resolve, reject) => {
        User.find({}, async (err, dbUsers) => {
            if (err) return reject(err);

            for (const user of dbUsers) {
                if (user.exchange === 'bitmex' && user.bitmex.apiKey) {
                    // Initialize BitMEX
                    const ccxt = new CreateCCXT(
                        user.bitmex.apiKey,
                        user.bitmex.apiSecret,
                        user.username
                    );
                    await ccxt.init();
                    users[user.username] = { exchange: 'bitmex', client: ccxt };

                } else if (user.exchange === 'hyperliquid' && user.hyperliquid.privateKey) {
                    // Initialize Hyperliquid
                    const hl = new CreateHyperliquid(
                        user.hyperliquid.privateKey,
                        user.username
                    );
                    await hl.init();
                    users[user.username] = { exchange: 'hyperliquid', client: hl };
                }
            }

            resolve('Exchanges initialized');
        });
    });
}
```

---

## Migration Checklist

### Phase 1: Preparation
- [ ] Install Hyperliquid SDK
- [ ] Create `CreateHyperliquid.js` wrapper
- [ ] Create Hyperliquid WebSocket handlers
- [ ] Update database schema
- [ ] Create test wallet on Hyperliquid testnet

### Phase 2: Implementation
- [ ] Implement all CCXT-equivalent methods
- [ ] Update symbol resolution
- [ ] Update precision/size calculations
- [ ] Add exchange selection logic
- [ ] Update frontend for exchange selection

### Phase 3: Testing
- [ ] Test market orders on testnet
- [ ] Test limit orders on testnet
- [ ] Test order cancellation
- [ ] Test WebSocket data streams
- [ ] Test position management

### Phase 4: Production
- [ ] Switch to mainnet configuration
- [ ] Monitor live trades
- [ ] Set up alerts for failures
- [ ] Document troubleshooting steps

---

## Security Considerations

### BitMEX (API Keys)
- Store in encrypted database
- Use read-only keys for monitoring
- Rotate keys regularly
- Enable IP whitelist on BitMEX

### Hyperliquid (Private Keys)
- **CRITICAL**: Encrypt private keys at rest
- Use environment variables for encryption keys
- Never commit private keys to git
- Consider hardware wallet integration for production
- Use separate wallets for testnet/mainnet

---

## Performance Comparison

| Metric | BitMEX | Hyperliquid |
|--------|--------|-------------|
| **Order Latency** | 50-200ms | 1-3 seconds (on-chain) |
| **WebSocket Latency** | <50ms | 100-500ms |
| **Rate Limits** | 300 req/5min | No hard limit (gas costs) |
| **Uptime** | 99.9% | 99.99% (decentralized) |
| **Max Leverage** | 100x | 50x |

---

## References

### BitMEX/CCXT
- CCXT Documentation: https://docs.ccxt.com/
- BitMEX API Docs: https://www.bitmex.com/api/explorer/
- BitMEX WebSocket Docs: https://www.bitmex.com/app/wsAPI

### Hyperliquid
- Hyperliquid SDK: https://github.com/nktkas/hyperliquid
- API Documentation: https://hyperliquid.gitbook.io/hyperliquid-docs/
- WebSocket Subscriptions: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket
- Testnet: https://app.hyperliquid-testnet.xyz/

---

## Support

For questions or issues:
- BitMEX: https://www.bitmex.com/app/support
- Hyperliquid: https://discord.gg/hyperliquid
- CCXT: https://github.com/ccxt/ccxt/issues
