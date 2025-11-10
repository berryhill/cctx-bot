# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a cryptocurrency trading bot built with Node.js that integrates with BitMEX via the CCXT library. It receives webhook signals (primarily from TradingView), validates them, and executes trades automatically. The system has a React frontend for user management and a Node.js backend with WebSocket streaming for real-time market data and private user streams.

## Architecture

### Client-Server Structure

- **Client** (`client/`): React application (React 16.13.1) that provides UI for user account management
- **Server** (`server/`): Node.js backend that handles trading logic, WebSocket connections, and webhook processing

### Server Components

The server (`server/index.js`) orchestrates several subsystems that initialize sequentially on startup:

1. **MongoDB** (`server/database/MongoDB.js`): User accounts, trigger orders, and processed orders
2. **Express Server** (`server/express/express.js`): HTTP server with CORS enabled, serves static React build and POST webhook endpoint
3. **Public Market Stream** (`server/wss/wss_stream.js`): WebSocket connection to `wss://ws.testnet.bitmex.com/realtime` subscribing to instrument data (XBTUSD, ETHUSD, XRPUSD, LTCUSD, BCHUSD)
4. **Private User Streams** (`server/wss/wss_auth_md.js`): Multiplexed WebSocket (`wss://ws.testnet.bitmex.com/realtimemd`) managing authenticated streams for all users, receiving execution, order, margin, position, and wallet updates
5. **CCXT Instances** (`server/CreateCCXT.js`): Per-user CCXT wrappers for BitMEX API calls

### Key Data Flow

1. TradingView sends webhook POST to Express endpoint with trade signal
2. `postSchema.js` validates incoming payload (symbol, command, type, tag, quantity, account, auth code)
3. System looks up user by account alias, retrieves their CCXT instance
4. Trade execution logic in `index.js` creates market/limit orders based on command type:
   - `B`/`S`: Buy/Sell market orders
   - `BT`/`ST`: Buy/Sell with take-profit triggers
   - `CL`/`CS`: Close long/short positions
5. Tag-based trade tracking system maintains open positions grouped by strategy tag
6. Real-time WebSocket streams provide market prices and order execution confirmations

### Trade Management System

The bot implements a sophisticated tag-based position tracking system:

- **tagTrades**: Array storing open trades grouped by strategy tags, with separate arrays for long [0] and short [1] positions
- **tpOrders**: Take-profit trigger orders stored in MongoDB that execute when price targets are hit
- Auto-sizing: Position sizes calculated based on account balance and level system (`getLevel`, `calcMultiplier`)
- Symbol conversion: Maps TradingView symbols (XBTUSD) to CCXT format (BTC/USD)

## Development Commands

### Docker Services

```bash
# Start MongoDB in Docker
docker compose up -d

# Stop services
docker compose down

# View logs
docker compose logs -f mongodb
```

### Server

```bash
cd server
npm start          # Run production server
npm run dev        # Run with nodemon for auto-restart
```

**Note**: Server runs on port 3000 by default. Change port in `server/index.js` line 1493 if needed.

### Client

```bash
cd client
npm start          # Development server on port 3001 (proxies to server on 3000)
npm run build      # Build React app and move to server/build/public
npm test           # Run React tests
```

## Environment Setup

1. **Docker Compose**: MongoDB service configured in `docker-compose.yml` running on port 27017
2. **Server .env**: Already configured at `server/.env` with:
   - `DB_URL=mongodb://localhost:27017/ccxt-bot` (for Docker MongoDB)
3. **BitMEX API credentials**: Stored per-user in MongoDB database

## Important Notes

### BitMEX Testnet Configuration

The system is currently configured for BitMEX testnet:
- WebSocket: `wss://ws.testnet.bitmex.com/realtime`
- WebSocket MD: `wss://ws.testnet.bitmex.com/realtimemd`
- CCXT checks for `urls.test` and switches API endpoint if available

### Webhook Validation

All POST requests must include `code: "13131"` for authentication (hardcoded in `postSchema.js`).

### Symbol Support

Currently supports: XBTUSD, XRPUSD, ETHUSD, LTCUSD, BCHUSD with exchange-specific decimal rounding in `resolveDecimals()` and contract calculation in `resolveContracts()`.

### Sequential Initialization

The main server requires sequential startup of all subsystems. If any component fails (MongoDB, WebSocket streams, CCXT instances), the bot will not start accepting trades. Check logs for initialization status.

### User Management

Users are loaded from MongoDB on startup. Each user with valid `apiKey` and `apiSecret` gets:
- A CCXT instance added to the `users` object
- An authenticated private WebSocket stream in the multiplexed MD connection
- Their account balance and positions tracked in `streamPrivate.latest`

### Logging

Custom logger system (`server/utils/logger.js`) with color-coded output (`server/utils/colors.js`) for different subsystems.
