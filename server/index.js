// MUST be first - intercepts console.log before anything else runs
require('./utils/logBuffer');

require('dotenv').config();

const mongoose = require('mongoose');
const MongoDB = require('./database/MongoDB');
const { User, Trigger_Orders, TO_Processed, Trades_Opened, Positions_Open, Trades_Closed } = require('./database/MongoDB');
const postSchema = require('./validation/postSchema');
const CreateCCXT = require('./CreateCCXT');
const BitmexStream = require('./wss/wss_stream');
const streamPrivate = require('./wss/wss_auth_md');
const ExpressServer = require('./express/express');
const express = new ExpressServer();
const stream = new BitmexStream(false);
const WebSocket = require('ws');

//Loggers and Color
const color = require('./utils/colors')
const Logger = require('./utils/logger');
const readFileLog = new Logger('Read User File',color.pick.bold)
const mainLog = new Logger('Main Program',color.rgbFont(255,194,0))
const expressLog = new Logger('Express',color.pick.magenta)
const ccxtLog = new Logger('CCXT',color.pick.blue)
const validateLog = new Logger('Validation',color.pick.italic)

/*
Supported Values for every key
* s: XBTUSD | XRPUSD | ..   <Type:string>
* c: B | S | CL | CS    <Type:string>
* t: M | L  <Type:string>
* tag: ANY  <Type:string>
* tp: #.###% (Max 3 floating digits, Max 3 integers)    <Type:string>
* q: auto | >0XBT | #.####XBT   <Type:string>
* a: ANY (Min 3 charts, a-z-A-Z-0-9)   <Type:string>
** code: 13131 - Used for Authentication of Post Form! <Type:string>
*/

//Logging Variables
const tradeVerbose = false
const procOrdVerbose = false

//Global Variables
const users = {}
const inactiveList = []
// tagTrades migrated to MongoDB Trades_Opened collection
let tpOrders = []

//Return JSON-response from server (Mainly to Tradingview which POSTS to the Webhook.)
const sendJSON = (res,statusCode, message, payload, error) => {
    return res.json({
        statusCode: statusCode,
        message: message,
        payload: payload,
        error: error
    })
}

// Module-level variables to hold trade functions
let createTrade, clearLimitOrders

//Define Main
async function main(app) {
    //CREATING TRADES
    mainLog.print(`${color.pick.green}COMPLETE${color.pick.end}`,'Sequential startup complete ready to receive and make trades!')

    const getLevel = (amountBTC) => {
        let level = Math.floor(Math.log2(8*amountBTC))
        return level < 1 ? 1 : level
    }
    
    const calcMultiplier = (accLevel) => {
        return 1 //+(1.25 ^ (accLevel-1))
    }

    createTrade = async function(input,alias,ccxt) {
        console.log('\n========== CREATE TRADE START ==========')
        console.log('📥 Input:', JSON.stringify(input, null, 2))
        console.log('👤 Alias:', alias)
        console.log('🔧 CCXT Instance:', ccxt ? 'Available' : 'NULL')
        
        // Validate CCXT instance exists
        if (!ccxt) {
            const errorMsg = `❌ CCXT instance not available for user ${alias}. User may not have valid API keys or CCXT initialization failed.`
            console.log(errorMsg)
            throw new Error(errorMsg)
        }
        
        //CCXT Object from Logged in User
        const trade = ccxt
        //General Variables from Post-Syntax in more readable format.
        // const symbol = resolveSymbol(input.s);
        const symbol = input.s
        const command = input.c //B, S, CB, CS
        const type = input.t //M, L
        const tp = input.tp || '0%' // Default to '0%' if not provided
        const tag = input.tag || 'notag' // Default tag if not provided
        const p = input.p
        
        console.log('📊 Resolved Symbol:', symbol)
        console.log('⚡ Command:', command)
        console.log('📝 Type:', type)
        console.log('🎯 TP:', tp, tp === '0%' ? '(default - no TP)' : '')
        console.log('🏷️  Tag:', tag, tag === 'notag' ? '(default)' : '')
        console.log('💰 Price:', p)

        //<---------------------Conversions and Array Pushes----------------------->
        //Limit Decimals/Rounding for Exchange Opening Trades
        //Tradingview Symbol to CCXT Symbol
        //FOR CCXT USE
        function resolveSymbol(symbol) {
            switch(symbol) {
                // Inverse perpetuals - keep native BitMEX format
                case 'XBTUSD':
                    return 'XBTUSD'
                case 'XRPUSD':
                    return 'XRPUSD'
                case 'ETHUSD':
                    return 'ETHUSD'
                case 'LTCUSD':
                    return 'LTCUSD'
                case 'BCHUSD':
                    return 'BCHUSD'
                // USDT pairs - use CCXT format with slash
                case 'XBTUSDT':
                    return 'BTC/USDT'
                case 'XRPUSDT':
                    return 'XRP/USDT'
                case 'ETHUSDT':
                    return 'ETH/USDT'
                case 'SOLUSDT':
                    return 'SOL/USDT'
                case 'BMEXUSDT':
                    return 'BMEX/USDT'
                default:
                    return 'XBTUSD'
            }
        }

        //Trailing decimals of symbol
        //*************ROUNDING FOR LONG ABOVE BUT FOR SHORT DOWN*************
        function resolveDecimals(price, symbol) {
            let val;
            function round(value, precision) {
                var multiplier = Math.pow(10, precision || 0);
                return Math.round(value * multiplier) / multiplier;
            }

            switch(symbol) {
                case 'XBTUSD':
                    // 11249 XBTUSD Minimum Price Increment	0.5 USD
                    val = parseFloat(Math.ceil(price));
                    console.log('XBTUSD Resolved Order Price: ',val)
                    return val
                case 'XRPUSD':
                    // 0,2314 XRPUSD Minimum Price Increment	0.0001 USD
                    val = parseFloat(price.toFixed(4))
                    console.log('XRPUSD Resolved Order Price: ',val)
                    return val
                case 'ETHUSD':
                    // 1.2314,2 ETHUSD Minimum Price Increment	0.05 USD
                    val = parseFloat(round(price,1))
                    console.log('ETHUSD Resolved Order Price: ',val)
                    return val
                case 'LTCUSD':
                    // 10,23 LTCUSD Minimum Price Increment 0.01 USD
                    val = parseFloat(round(price,2))
                    console.log('LTCUSD Resolved Order Price: ',val)
                    return val
                case 'BCHUSD':
                    // 301,9 BCHUSD Minimum Price Increment	0.05 USD
                    val = parseFloat(round(price,1))
                    console.log('BCHUSD Resolved Order Price: ',val)
                    return val
                // USDT pairs - use appropriate decimal precision
                case 'BTC/USDT':
                case 'BMEX/USDT':
                    // USDT pairs typically use 2-4 decimal places
                    val = parseFloat(price.toFixed(4))
                    console.log('USDT pair Resolved Order Price: ',val)
                    return val
                case 'XRP/USDT':
                case 'ETH/USDT':
                case 'SOL/USDT':
                    // Smaller value coins may need more precision
                    val = parseFloat(price.toFixed(4))
                    console.log('USDT pair Resolved Order Price: ',val)
                    return val
                default:
                    console.log('[WARN]: Unsupported Symbol to resolve decimals:', symbol)
                    console.log('[INFO]: Using 4 decimal places as default')
                    val = parseFloat(price.toFixed(4))
                    return val
            }
        }

        //For limit orders at entry X (*specific price other than market)
        function resolveContracts(xbtValue, symbol, entryPrice) {
            let val;
            let price;
            switch(symbol){
                case 'XBTUSD': //1 USD (Currently 0.00008778 XBT per contract)
                    price = entryPrice ? entryPrice : stream.latest.instruments['XBTUSD'].lastPrice
                    val = Math.ceil(xbtValue * price)
                    console.log('XBTUSD resolvedContracts: ',val,'price: ',price)
                    return val
                case 'XRPUSD': //0.0002 XBT per 1 USD (Currently 0.00005109 XBT per contract)
                    price = entryPrice ? (0.0002 * entryPrice) : (0.0002 * stream.latest.instruments['XRPUSD'].lastPrice)
                    val = Math.ceil(xbtValue / price)
                    console.log('XRPUSD resolvedContracts: ',val,'price: ',price)
                    return val
                case 'ETHUSD': //0.001 mXBT per 1 USD (Currently 0.00037427 XBT per contract)
                    price = entryPrice ? (0.000001 * entryPrice) : ( 0.000001 * stream.latest.instruments['ETHUSD'].lastPrice)
                    val = Math.ceil(xbtValue / price)
                    console.log('ETHUSD resolvedContracts: ',val,'price: ',price)
                    return val
                case 'LTCUSD': //0.002 mXBT per 1 USD (Currently 0.00010027 XBT per contract)
                    price = entryPrice ? (0.000002 * entryPrice) : ( 0.000002 * stream.latest.instruments['LTCUSD'].lastPrice)
                    val = Math.ceil(xbtValue / price)
                    console.log('LTCUSD resolvedContracts: ',val,'price: ',price)
                    return val
                case 'BCHUSD': //0.001 mXBT per 1 USD (Currently 0.00023979 XBT per contract)
                    price = entryPrice ? (0.000001 * entryPrice) : ( 0.000001 * stream.latest.instruments['BCHUSD'].lastPrice)
                    val = Math.ceil(xbtValue / price)
                    console.log('BCHUSD resolvedContracts: ',val,'price: ',price)
                    return val
                // USDT pairs - use value directly as contracts
                case 'BTC/USDT':
                case 'XRP/USDT':
                case 'ETH/USDT':
                case 'SOL/USDT':
                case 'BMEX/USDT':
                    console.log('USDT pair - using value directly as contracts:', xbtValue)
                    return xbtValue
                default:
                    console.log('[ERROR]: Unsupported symbol for resolveContracts:', symbol)
                    console.log('[INFO]: Returning value directly:', xbtValue)
                    return xbtValue // Return the value directly for unknown symbols
            }
        }

        // Convert USD amount to contract count for futures trading
        async function convertFuturesUSDToContracts(usdAmount, symbol, trade) {
            console.log('\n💱 convertFuturesUSDToContracts() called')
            console.log('   USD Amount:', usdAmount)
            console.log('   Symbol:', symbol)

            try {
                // Fetch market data from BitMEX
                const market = trade.bitmex.markets[symbol]

                if (!market || !market.info) {
                    throw new Error(`Market data not found for ${symbol}`)
                }

                const info = market.info
                const lotSize = info.lotSize

                console.log('   Lot Size:', lotSize)

                // Determine contract type and calculate contract size based on BitMEX formulas
                let contractSize
                let minTradeAmount

                // Check contract type based on available fields
                let contracts

                if (info.underlyingToPositionMultiplier) {
                    // LINEAR CONTRACT (USDT perpetuals like XRP/USDT:USDT)
                    // For linear: need current price to convert USD to contracts
                    // Contract Size = 1 / underlyingToPositionMultiplier (underlying asset per contract)
                    // Contracts = USD Amount / (Contract Size × Current Price)

                    const ticker = await trade.ticker(symbol)
                    const currentPrice = ticker.last

                    contractSize = 1 / info.underlyingToPositionMultiplier
                    const usdPerContract = contractSize * currentPrice
                    minTradeAmount = usdPerContract * lotSize

                    console.log('   Contract Type: LINEAR')
                    console.log('   underlyingToPositionMultiplier:', info.underlyingToPositionMultiplier)
                    console.log('   Contract Size (underlying per contract):', contractSize)
                    console.log('   Current Price:', currentPrice)
                    console.log('   USD per contract:', usdPerContract)
                    console.log('   Minimum Trade Amount:', minTradeAmount)

                    contracts = Math.floor(usdAmount / usdPerContract)
                    console.log('   Raw contracts (before rounding):', contracts)

                } else if (info.underlyingToSettleMultiplier && info.multiplier) {
                    // INVERSE CONTRACT (USD perpetuals like XBTUSD)
                    // Contract Size = Multiplier / underlyingToSettleMultiplier
                    contractSize = info.multiplier / info.underlyingToSettleMultiplier
                    minTradeAmount = contractSize * lotSize
                    console.log('   Contract Type: INVERSE')
                    console.log('   multiplier:', info.multiplier)
                    console.log('   underlyingToSettleMultiplier:', info.underlyingToSettleMultiplier)
                    console.log('   Contract Size (USD per contract):', contractSize)
                    console.log('   Minimum Trade Amount:', minTradeAmount)

                    contracts = Math.floor(usdAmount / contractSize)
                    console.log('   Raw contracts (before rounding):', contracts)

                } else if (info.multiplier && info.settlCurrency) {
                    // QUANTO CONTRACT
                    // Contract Size = multiplier (in settlCurrency)
                    // Minimum Trade Amount = lotSize (directly)
                    contractSize = info.multiplier
                    minTradeAmount = lotSize
                    console.log('   Contract Type: QUANTO')
                    console.log('   multiplier:', info.multiplier)
                    console.log('   settlCurrency:', info.settlCurrency)
                    console.log('   Contract Size:', contractSize)
                    console.log('   Minimum Trade Amount:', minTradeAmount)

                    contracts = Math.floor(usdAmount / contractSize)
                    console.log('   Raw contracts (before rounding):', contracts)

                } else {
                    throw new Error(`Unable to determine contract type for ${symbol}`)
                }

                // Round UP to next lot size
                contracts = Math.ceil(contracts / lotSize) * lotSize
                console.log('   Rounded UP to lot size:', contracts)

                // Calculate actual dollar amount based on rounded contracts
                let actualDollarAmount
                if (info.underlyingToPositionMultiplier) {
                    // LINEAR: need to recalculate with current price
                    const ticker = await trade.ticker(symbol)
                    const currentPrice = ticker.last
                    const contractSize = 1 / info.underlyingToPositionMultiplier
                    actualDollarAmount = contracts * contractSize * currentPrice
                } else if (info.underlyingToSettleMultiplier && info.multiplier) {
                    // INVERSE
                    const contractSize = info.multiplier / info.underlyingToSettleMultiplier
                    actualDollarAmount = contracts * contractSize
                } else if (info.multiplier && info.settlCurrency) {
                    // QUANTO
                    actualDollarAmount = contracts * info.multiplier
                }

                console.log('   ✅ Final contracts:', contracts)
                console.log('   ✅ Actual dollar amount (rounded up):', actualDollarAmount.toFixed(2))

                return {
                    contracts: contracts,
                    actualDollarAmount: actualDollarAmount
                }

            } catch (error) {
                console.error('   ❌ Error converting USD to contracts:', error.message)
                throw error
            }
        }

        //
        function getAutoQnty(defaultSize, isUSDT = false) {
            console.log('\n💰 getAutoQnty() called')
            console.log('   Default Size:', defaultSize)
            console.log('   Is USDT calculation:', isUSDT)
            
            // For USDT pairs, return appropriate minimum based on symbol
            if (isUSDT) {
                // Get the symbol from parent scope to determine lot size
                const currentSymbol = symbol // This comes from parent createTrade scope
                let minDollars
                
                if (currentSymbol.includes('XRP')) {
                    // XRP lot size 100, price ~$2.50 = minimum ~$250
                    minDollars = 250
                } else if (currentSymbol.includes('BMEX')) {
                    // BMEX lot size 1000, price ~$0.0001 = minimum ~$0.10, use $10
                    minDollars = 10
                } else {
                    // Default minimum
                    minDollars = 10
                }
                
                console.log('   💵 USDT auto mode for', currentSymbol, ': minimum $' + minDollars)
                return minDollars
            }
            
            // For BTC/USD pairs, use margin balance calculation
            // Check if WebSocket data is available
            if (!streamPrivate.latest['margin'] ||
                !streamPrivate.latest['margin'][alias] ||
                !streamPrivate.latest['margin'][alias][0]) {
                console.log('   ⚠️  WARNING: No WebSocket margin data available')
                console.log('   ℹ️  Using default size:', defaultSize, 'BTC')
                return defaultSize
            }
            
            let marginBalance = parseInt(streamPrivate.latest['margin'][alias][0]['marginBalance']) / 100000000
            let calcMultiplierVal = +calcMultiplier(getLevel(marginBalance))
            console.log('   Margin Balance:', marginBalance, 'BTC')
            console.log('   Account Level:', getLevel(marginBalance))
            console.log('   Multiplier:', calcMultiplierVal)
            console.log('   Final Order Size:', calcMultiplierVal * defaultSize, 'BTC')
            return calcMultiplierVal * defaultSize
        }

        //Helper function to parse percentage from quantity string
        function parsePercentage(qString) {
            const percentMatch = qString.match(/^(\d+(?:\.\d+)?)%$/)
            if (percentMatch) {
                return parseFloat(percentMatch[1])
            }
            // If it's "100" without %, treat as 100%
            const numValue = parseFloat(qString)
            if (!isNaN(numValue) && numValue > 0 && numValue <= 100) {
                return numValue
            }
            return 100 // Default to 100% if invalid
        }

        //Helper function to determine market type from command
        function getMarketType(command) {
            switch(command) {
                case 'B':
                case 'S':
                case 'CB':
                case 'CS':
                    return 'spot'
                case 'LF':
                case 'SF':
                case 'CLF':
                case 'CSF':
                case 'FLF':
                case 'FSF':
                    return 'futures'
                default:
                    return 'spot'
            }
        }

        //Helper function to resolve side from command
        function resolveSide(command) {
            switch(command) {
                case 'B':
                case 'CB':
                    return 'B'
                case 'S':
                case 'CS':
                    return 'S'
                case 'LF':
                case 'CLF':
                    return 'LF'
                case 'SF':
                case 'CSF':
                    return 'SF'
                default:
                    return 'B'
            }
        }

        //Helper function to validate spot symbols
        function isValidSpotSymbol(symbol) {
            const validSpots = [
                'BTC/USDT',         // Bitcoin spot
                'ETH/USDT',         // Ethereum spot
                'SOL/USDT',         // Solana spot
                'XRP/USDT',         // Ripple spot
                'DOGE/USDT',        // Dogecoin spot
                'ADA/USDT',         // Cardano spot
                'AVAX/USDT',        // Avalanche spot
                'MATIC/USDT',       // Polygon spot
                'DOT/USDT',         // Polkadot spot
                'LTC/USDT',         // Litecoin spot
                'LINK/USDT',        // Chainlink spot
                'BCH/USDT',         // Bitcoin Cash spot
                'UNI/USDT',         // Uniswap spot
                'ATOM/USDT',        // Cosmos spot
                'ETC/USDT',         // Ethereum Classic spot
                'FIL/USDT',         // Filecoin spot
                'APT/USDT',         // Aptos spot
                'ARB/USDT',         // Arbitrum spot
                'OP/USDT',          // Optimism spot
                'SUI/USDT',         // Sui spot
                'BMEX/USDT'         // BitMEX Token spot
            ]
            return validSpots.includes(symbol)
        }

        //Helper function to validate perpetual futures symbols
        function isValidPerpetualSymbol(symbol) {
            const validPerps = [
                'BTC/USDT:USDT',    // Bitcoin perpetual
                'ETH/USDT:USDT',    // Ethereum perpetual
                'SOL/USDT:USDT',    // Solana perpetual
                'XRP/USDT:USDT',    // Ripple perpetual
                'DOGE/USDT:USDT',   // Dogecoin perpetual
                'ADA/USDT:USDT',    // Cardano perpetual
                'AVAX/USDT:USDT',   // Avalanche perpetual
                'MATIC/USDT:USDT',  // Polygon perpetual
                'DOT/USDT:USDT',    // Polkadot perpetual
                'LTC/USDT:USDT',    // Litecoin perpetual
                'LINK/USDT:USDT',   // Chainlink perpetual
                'BCH/USDT:USDT',    // Bitcoin Cash perpetual
                'UNI/USDT:USDT',    // Uniswap perpetual
                'ATOM/USDT:USDT',   // Cosmos perpetual
                'ETC/USDT:USDT',    // Ethereum Classic perpetual
                'FIL/USDT:USDT',    // Filecoin perpetual
                'APT/USDT:USDT',    // Aptos perpetual
                'ARB/USDT:USDT',    // Arbitrum perpetual
                'OP/USDT:USDT',     // Optimism perpetual
                'SUI/USDT:USDT',    // Sui perpetual
                'BMEX/USDT:USDT'    // BitMEX Token perpetual
            ]
            return validPerps.includes(symbol)
        }

        //Function to insert trades with specific tag & side
        async function pushTagTrades(tag, data, input, dollarAmount = null) {
            console.log('\n📌 pushTagTrades() called')
            console.log('   Tag:', tag)
            console.log('   Command:', input.c)
            console.log('   Dollar Amount:', dollarAmount)
            console.log('   Data Side:', data.side)
            console.log('   Data object keys:', Object.keys(data))
            console.log('   Data FULL:', JSON.stringify(data, null, 2))

            // Determine market type and side based on command
            const marketType = getMarketType(input.c)
            const side = resolveSide(input.c)
            console.log('   Market Type:', marketType)
            console.log('   Resolved Side:', side)

            // DEBUG: Log all possible quantity fields
            console.log('   🔍 DEBUG - Quantity fields:')
            console.log('      data.filled:', data.filled)
            console.log('      data.cumQty:', data.cumQty)
            console.log('      data.orderQty:', data.orderQty)
            console.log('      data.lastQty:', data.lastQty)
            console.log('      data.amount:', data.amount)
            console.log('      data.contracts:', data.contracts)

            // Extract order ID from various possible fields
            const orderId = data.orderID || data.orderId || data.id || data.clOrdID || ''
            const price = data.avgPx || data.price || data.lastPx || 0
            const contracts = data.orderQty || data.contracts || data.cumQty || 0

            // Extract num_contracts (the actual filled quantity for aggregation)
            // Priority: filled/cumQty (actual fill) > orderQty (requested) > contracts (fallback)
            const numContracts = parseInt(
                data.filled ||
                data.cumQty ||
                data.orderQty ||
                data.lastQty ||
                data.amount ||
                contracts ||
                0
            )

            console.log('   ✅ Extracted - orderId:', orderId, 'price:', price, 'contracts:', contracts, 'num_contracts:', numContracts)

            // Save trade to database
            const newTrade = new Trades_Opened({
                tag: tag,
                account: input.a,
                symbol: input.s,
                side: side,
                market_type: marketType,
                alias: alias,
                order_id: orderId || undefined, // Use undefined instead of empty string
                price: price,
                contracts: contracts,
                num_contracts: numContracts,
                dollar_amount: dollarAmount, // Store original USD amount for futures
                metadata: input,
                opened: new Date()
            })

            try {
                // Check mongoose connection state before saving
                if (mongoose.connection.readyState !== 1) {
                    console.log(`⚠️  Mongoose connection state: ${mongoose.connection.readyState} (0=disconnected, 1=connected, 2=connecting, 3=disconnecting)`)
                }

                await newTrade.save()
                console.log('✅ Trade saved to database')
                tradeVerbose ? console.log("   Trade:", JSON.stringify(newTrade,null,1) ) : ''

                // Update or create position in open_positions
                console.log('📊 Updating open_positions...')
                const existingPosition = await Positions_Open.findOne({
                    tag: tag,
                    account: input.a,
                    market_type: marketType
                })

                if (existingPosition) {
                    // Verify side matches
                    if (existingPosition.side !== side) {
                        console.log(`⚠️  WARNING: Existing ${marketType} position side (${existingPosition.side}) doesn't match new trade side (${side})`)
                        console.log(`⚠️  This could indicate mixed position direction for same tag`)
                    }

                    // Update existing position using num_contracts
                    const newTotalContracts = existingPosition.total_contracts + numContracts
                    const newAvgPrice = numContracts > 0 ? (
                        (existingPosition.average_price * existingPosition.total_contracts) +
                        (price * numContracts)
                    ) / newTotalContracts : existingPosition.average_price

                    console.log(`   Existing ${marketType} position found - updating`)
                    console.log(`   Old: ${existingPosition.total_contracts} @ ${existingPosition.average_price}`)
                    console.log(`   Adding: ${numContracts} @ ${price}`)
                    console.log(`   New: ${newTotalContracts} @ ${newAvgPrice.toFixed(4)}`)

                    // Calculate new dollar amount (add to existing if both present)
                    const updateFields = {
                        total_contracts: newTotalContracts,
                        average_price: newAvgPrice,
                        last_updated: new Date()
                    }

                    if (dollarAmount !== null) {
                        const existingDollarAmount = existingPosition.dollar_amount || 0
                        updateFields.dollar_amount = existingDollarAmount + dollarAmount
                        console.log(`   Dollar amount: ${existingDollarAmount} + ${dollarAmount} = ${updateFields.dollar_amount}`)
                    }

                    await Positions_Open.updateOne(
                        { tag: tag, account: input.a, market_type: marketType },
                        {
                            $set: updateFields,
                            $inc: { trade_count: 1 },
                            $push: { trade_ids: orderId || 'unknown' }
                        }
                    )
                    console.log('✅ Position updated')
                } else {
                    // Create new position using num_contracts
                    console.log(`   No existing ${marketType} position - creating new`)
                    const positionData = {
                        tag: tag,
                        account: input.a,
                        symbol: input.s,
                        side: side,
                        market_type: marketType,
                        total_contracts: numContracts,
                        average_price: price,
                        trade_count: 1,
                        trade_ids: orderId ? [orderId] : [],
                        first_opened: new Date(),
                        last_updated: new Date(),
                        metadata: input
                    }

                    if (dollarAmount !== null) {
                        positionData.dollar_amount = dollarAmount
                        console.log(`   Initial dollar amount: ${dollarAmount}`)
                    }

                    const newPosition = new Positions_Open(positionData)
                    await newPosition.save()
                    console.log('✅ New position created')
                }
            } catch (error) {
                console.error('❌ Error saving trade to database:')
                console.error('   Error name:', error.name)
                console.error('   Error message:', error.message)
                console.error('   Mongoose state:', mongoose.connection.readyState)
                if (error.reason) {
                    console.error('   Reason:', error.reason)
                }
            }
        }

        //Function to insert pending limit trades with specific tag & side
        function pushTagLimitTrades(tag, data) {
            const side = data.side === 'sell' ? 'S' : 'B'
            const tagObj = {
                tag: tag,
                pendingTrades: [[],[]]
            }

            const tradeObj = {
                alias: alias,
                side: side,
                type: 'Limit',
                data: data,
                input: input
            }
            
            const isTag = (obj) => obj.tag === tag
            const indexTag = tpOrders.findIndex(isTag)

            //Empty tagTrades Array
            if(indexTag === -1) {

                //Directly put in object!
                if(side === 'B') {
                    tagObj.pendingTrades[0].push(tradeObj)
                    tpOrders.push(tagObj)
                } else if (side === 'S') {
                    tagObj.pendingTrades[1].push(tradeObj)
                    tpOrders.push(tagObj)
                } else {
                    console.log("pushTagTrades unknown side: ",side)
                }

                tradeVerbose ? console.log("tpOrders (after pushLimitTrades): ", JSON.stringify(tpOrders,null,2) ) : ''
                return

            } else {
                //Go over all tagObjects and look for matching tag in object, then push into the existing array
                    // console.log("tag in tagTrades at index: ",indexTag)
                    //LONG[0] OR SHORT[1] ARRAY 
                    if(side === 'B') {
                        tpOrders[indexTag]["pendingTrades"][0].push(tradeObj)
                    } else if (side === 'S') {
                        tpOrders[indexTag]["pendingTrades"][1].push(tradeObj)
                    } else {
                        console.log("pushTagLimitTrades unknown side: ",side)
                    }
                    
                    tradeVerbose ? console.log("tpOrders (after pushLimitTrades): ", JSON.stringify(tpOrders,null,2) ) : ''
                    return
            }
            
        }

        //Trigger Market Orders to DB
        function pushTriggerOrders(data, price, side) {
            Trigger_Orders.create({
                openTradeID: data.id,
                symbol: input.s,
                side: side,
                contracts: data.amount,
                price: price,
                tag: input.tag,
                account: alias
            }).then(d => { 
                console.log('Created TriggerOrder: ',d)
                return { code: 200, message:'Success to process Market Trigger Order', input:input }
            }).catch(e => { 
                console.log('Failed to create triggerOrder: ',e)
                return {code: 500, message:'Unable to process trade', input:input, e:e}
            })
        }
        //<---------------------END-----------------------> 

        //<---------------------TRADE FUNCTION SECTION-----------------------> 
        //Create a Market Order without TP
        async function createMarketOrder(symbol,input) {
            console.log('\n🔹 createMarketOrder() called')
            console.log('   Symbol:', symbol)
            console.log('   Input:', JSON.stringify(input, null, 2))
            
            //NO TP OR SL
            const command = input.c
            const regXBT = new RegExp(/XBT$/s)
            const regUSDT = new RegExp(/USDT$/s)
            const regAuto = new RegExp(/^auto$/s)
            const isUSDTPair = symbol.includes('USDT')
            
            let qntyValue
            let isUSDTAmount = false // Track if input is USDT amount (not contracts)
            
            if (regXBT.test(input.q)) {
                // Has XBT suffix: "20XBT" -> spend 20 BTC worth
                qntyValue = +input.q.split('XBT')[0]
                console.log("   Quantity type: XBT amount")
            } else if (regUSDT.test(input.q)) {
                // Has USDT suffix: "10USDT" -> spend $10 worth
                // User sends dollar amount directly (10 = $10)
                qntyValue = +input.q.split('USDT')[0]
                isUSDTAmount = true
                console.log("   Quantity type: USDT amount ($" + qntyValue + " worth)")
            } else if (regAuto.test(input.q)) {
                // Auto quantity - pass true if USDT pair
                qntyValue = +getAutoQnty(0.01, isUSDTPair)
                isUSDTAmount = isUSDTPair // If auto on USDT pair, treat as USDT amount
                console.log("   Quantity type: auto")
            } else {
                // Plain number: "20" -> 20 contracts
                qntyValue = +input.q
                console.log("   Quantity type: plain number (contracts)")
            }
            
            const orderTag = input.tag || tag

            console.log("   qntyValue: ", qntyValue)
            console.log("   Symbol:", symbol)
            console.log("   isUSDTPair:", isUSDTPair)
            console.log("   isUSDTAmount:", isUSDTAmount)
            
            // Helper function to get lot size for a symbol
            function getLotSize(symbol) {
                switch(symbol) {
                    case 'BMEX/USDT': return 1
                    case 'XRP/USDT': return 1
                    case 'XRPUSD': return 1
                    default: return 1
                }
            }

            // Check if this is a futures command
            const isFuturesCommand = ['LF', 'SF', 'CLF', 'CSF', 'FLF', 'FSF'].includes(command)

            console.log("   Is Futures Command:", isFuturesCommand)

            let qntyUSD
            let dollarAmount = null // Track actual USD amount for futures (adjusted if below minimum)

            if (isFuturesCommand) {
                // For futures commands, qntyValue represents USD amount to trade
                // Convert USD to contract count
                console.log("   🔄 Converting futures USD to contracts...")
                const conversion = await convertFuturesUSDToContracts(qntyValue, symbol, trade)
                qntyUSD = conversion.contracts
                dollarAmount = conversion.actualDollarAmount // Use actual amount (may be higher if below minimum)
                console.log(`   ✅ Futures conversion: $${qntyValue} USD → ${qntyUSD} contracts (actual: $${dollarAmount.toFixed(2)})`)
            } else if (isUSDTPair && isUSDTAmount) {
                // For USDT pairs with USDT amount: convert USDT to contracts
                // Get current price: USDT amount / price = contracts
                const ticker = await trade.ticker(symbol)
                const currentPrice = ticker.last
                const rawContracts = qntyValue / currentPrice
                
                // Round to lot size (BitMEX requires multiples of lot size)
                const lotSize = getLotSize(symbol)
                let roundedContracts = Math.floor(rawContracts / lotSize) * lotSize
                
                console.log("   Current price:", currentPrice, "USDT")
                console.log("   USDT amount to spend:", qntyValue)
                console.log("   Raw contracts:", rawContracts)
                console.log("   Lot size:", lotSize)
                console.log("   Rounded to lot size:", roundedContracts)
                
                // Check if amount is too small for lot size
                if (roundedContracts < lotSize) {
                    const minUSDT = lotSize * currentPrice
                    console.log(`   ❌ ERROR: Amount too small for lot size`)
                    console.log(`   ℹ️  Minimum order: ${minUSDT} USDT ($${minUSDT})`)
                    console.log(`   ℹ️  You tried to order: ${qntyValue} USDT ($${qntyValue})`)
                    throw new Error(`Order amount too small. Minimum: ${minUSDT} USDT for ${symbol} (lot size: ${lotSize})`)
                }
                
                qntyUSD = roundedContracts
                console.log("   Final quantity:", qntyUSD, "contracts")
            } else if (isUSDTPair) {
                // For USDT pairs with contract amount: round to lot size
                const lotSize = getLotSize(symbol)
                let roundedContracts = Math.floor(qntyValue / lotSize) * lotSize
                qntyUSD = roundedContracts < lotSize ? lotSize : roundedContracts
                console.log("   Using value as contracts (rounded to lot size):", qntyUSD)
            } else {
                // For USD pairs: convert XBT to USD contracts
                qntyUSD = resolveContracts(qntyValue, symbol)
                console.log("   Converted XBT to USD contracts:", qntyUSD)
            }
            
            console.log("   Final quantity (contracts):", qntyUSD)
            console.log("   Command: ", command)
            console.log("   Tag: ", orderTag)
            
            if(command === 'S') {
                // S = Sell Spot
                // Check for opposing B position first
                console.log('   📉 Processing SELL SPOT command...')

                const position = await Positions_Open.findOne({
                    tag: orderTag,
                    account: input.a,
                    market_type: 'spot'
                })

                if (position && position.side === 'B') {
                    // Opposing BUY position exists - handle as close/flip
                    const currentContracts = position.total_contracts
                    const newContracts = qntyUSD

                    console.log(`   🔄 Opposing B position detected: ${currentContracts} contracts @ ${position.average_price}`)
                    console.log(`   📉 S command will sell ${newContracts} contracts`)

                    try {
                        const sellOrder = await trade.marketSellOrder(symbol, newContracts)
                        const fillPrice = sellOrder.avgPx || sellOrder.price || sellOrder.lastPx || 0

                        console.log('✅ CCXT - Bitmex Sell Order Complete: ', new Date())
                        console.log('   Fill price:', fillPrice)

                        if (newContracts < currentContracts) {
                            // PARTIAL CLOSE: Reduce buy position
                            const remainingContracts = currentContracts - newContracts
                            console.log(`   📉 Partial close: ${newContracts} contracts closed, ${remainingContracts} remaining`)

                            // Calculate P&L for closed portion
                            const pnl = (fillPrice - position.average_price) * newContracts
                            const pnlPercentage = (pnl / (position.average_price * newContracts)) * 100
                            console.log(`   P&L: ${pnl.toFixed(4)} (${pnlPercentage.toFixed(2)}%)`)

                            // Update position with reduced contracts
                            await Positions_Open.updateOne(
                                { tag: orderTag, account: input.a, market_type: 'spot' },
                                {
                                    $set: {
                                        total_contracts: remainingContracts,
                                        last_updated: new Date()
                                    }
                                }
                            )

                            // Record partial close
                            const closeTrade = new Trades_Closed({
                                tag: orderTag,
                                account: input.a,
                                symbol: input.s,
                                side: 'S',
                                market_type: 'spot',
                                contracts_closed: newContracts,
                                close_price: fillPrice,
                                percentage: (newContracts / currentContracts) * 100,
                                order_id: sellOrder.orderID || sellOrder.id || sellOrder.clOrdID || undefined,
                                position_before: currentContracts,
                                position_after: remainingContracts,
                                average_entry_price: position.average_price,
                                pnl: pnl,
                                pnl_percentage: pnlPercentage,
                                metadata: input,
                                closed_at: new Date()
                            })
                            await closeTrade.save()
                            console.log('✅ Partial close recorded')

                            return {code: 200, message:`Partial close: ${newContracts} contracts closed, ${remainingContracts} remaining`, input:input, pnl: pnl}

                        } else if (newContracts === currentContracts) {
                            // FULL CLOSE: Close entire buy position
                            console.log(`   ✅ Full close: entire B position closed`)

                            // Calculate P&L
                            const pnl = (fillPrice - position.average_price) * currentContracts
                            const pnlPercentage = (pnl / (position.average_price * currentContracts)) * 100
                            console.log(`   P&L: ${pnl.toFixed(4)} (${pnlPercentage.toFixed(2)}%)`)

                            // Delete position
                            await Positions_Open.deleteOne({ tag: orderTag, account: input.a, market_type: 'spot' })

                            // Record full close
                            const closeTrade = new Trades_Closed({
                                tag: orderTag,
                                account: input.a,
                                symbol: input.s,
                                side: 'S',
                                market_type: 'spot',
                                contracts_closed: currentContracts,
                                close_price: fillPrice,
                                percentage: 100,
                                order_id: sellOrder.orderID || sellOrder.id || sellOrder.clOrdID || undefined,
                                position_before: currentContracts,
                                position_after: 0,
                                average_entry_price: position.average_price,
                                pnl: pnl,
                                pnl_percentage: pnlPercentage,
                                metadata: input,
                                closed_at: new Date()
                            })
                            await closeTrade.save()
                            console.log('✅ Full close recorded')

                            return {code: 200, message:`Full close: B position closed`, input:input, pnl: pnl}

                        } else {
                            // CLOSE + FLIP: Close buy and open sell with remainder
                            const remainderContracts = newContracts - currentContracts
                            console.log(`   🔄 Close + Flip: closing ${currentContracts} B, opening ${remainderContracts} S`)

                            // Calculate P&L for closed portion
                            const pnl = (fillPrice - position.average_price) * currentContracts
                            const pnlPercentage = (pnl / (position.average_price * currentContracts)) * 100
                            console.log(`   P&L from close: ${pnl.toFixed(4)} (${pnlPercentage.toFixed(2)}%)`)

                            // Update position to S with remainder
                            await Positions_Open.updateOne(
                                { tag: orderTag, account: input.a, market_type: 'spot' },
                                {
                                    $set: {
                                        side: 'S',
                                        total_contracts: remainderContracts,
                                        average_price: fillPrice,
                                        trade_count: 1,
                                        trade_ids: [sellOrder.orderID || sellOrder.id || sellOrder.clOrdID],
                                        last_updated: new Date()
                                    }
                                }
                            )

                            // Record close of B position
                            const closeTrade = new Trades_Closed({
                                tag: orderTag,
                                account: input.a,
                                symbol: input.s,
                                side: 'S',
                                market_type: 'spot',
                                contracts_closed: currentContracts,
                                close_price: fillPrice,
                                percentage: 100,
                                order_id: sellOrder.orderID || sellOrder.id || sellOrder.clOrdID || undefined,
                                position_before: currentContracts,
                                position_after: 0,
                                average_entry_price: position.average_price,
                                pnl: pnl,
                                pnl_percentage: pnlPercentage,
                                metadata: { ...input, flip_remainder: remainderContracts },
                                closed_at: new Date()
                            })
                            await closeTrade.save()
                            console.log(`✅ Closed B and opened S with ${remainderContracts} contracts`)

                            return {code: 200, message:`Closed B + opened S with ${remainderContracts} contracts`, input:input, pnl: pnl}
                        }

                    } catch (e) {
                        console.log('   ❌ ERROR in S opposing position handling:')
                        console.log('   Error:', e)
                        inactiveList.push({
                            'username': alias,
                            'action': 'createMarketOrder[S-opposing]',
                            'input': input,
                            'error': e
                        })
                        return {code: 500, message:'Unable to process S close/flip', input:input, e:e}
                    }

                } else {
                    // No opposing position - normal S open/add
                    console.log('   📉 No opposing position - executing normal SELL SPOT order')
                    trade.marketSellOrder(symbol,qntyUSD).then(function (data) {
                        console.log('   ✅ CCXT - Bitmex Sell Order Complete: ', new Date)
                        console.log('   Order Data:', JSON.stringify(data, null, 2))
                        pushTagTrades(orderTag,data,input)
                        return {code: 200, message:'Success to process Sell Market Order', input:input}
                    }).catch(e => {
                        //Send Server Error!
                        console.log('   ❌ ERROR in Market Sell Order:')
                        console.log('   Error:', e)
                        inactiveList.push({
                            'username': alias,
                            'action': 'createMarketOrder[S]',
                            'input': input,
                            'error':e
                        })
                        console.log("   Failed to submit Market Sell Order: ",e)
                        return {code: 500, message:'Unable to process trade', input:input, e:e}
                    })
                }

            } else if (command === 'B') {
                // B = Buy Spot (add to position or create new)
                console.log('   📈 Processing BUY SPOT command...')
                console.log('   📈 Executing BUY Market Order (spot can only add to holdings)')
                //2. Create Market Order
                trade.marketBuyOrder(symbol,qntyUSD).then(function (data) {
                    console.log('   ✅ CCXT - Bitmex Buy Order Complete: ', new Date)
                    console.log('   Order Data:', JSON.stringify(data, null, 2))
                    pushTagTrades(orderTag,data,input)
                    return {code: 200, message:'Success to process Buy Market Order', input:input}

                    //IF TRADE FAILS (MARKET ORDER)
                }).catch(e => {
                    //Send Server Error!
                    console.log('   ❌ ERROR in Market Buy Order:')
                    console.log('   Error:', e)
                    inactiveList.push({
                        'username': alias,
                        'action': 'creatMarketOrder[B]',
                        'input': input,
                        'error':e
                    })
                    console.log("   Failed to submit Market Buy Order: ",e)
                    return {code: 500, message:'Unable to process trade', input:input, e:e}
                })

            } else if (command === 'CB') {
                // CB = Close Buy (spot)
                console.log('   🔻 Executing CLOSE BUY SPOT position...')

                // 1. Get current position from open_positions (spot only)
                const position = await Positions_Open.findOne({
                    tag: orderTag,
                    account: input.a,
                    market_type: 'spot'
                })

                if (!position) {
                    console.log(`❌ No open spot position found for tag "${orderTag}"`)
                    return {code: 404, message:'No open spot position found for tag', input:input}
                }

                if (position.side !== 'B') {
                    console.log(`❌ Cannot CB (close buy) on sell position. Position side: ${position.side}`)
                    return {code: 400, message:'Cannot CB (close buy) on sell position', input:input}
                }

                // 2. Parse percentage and calculate contracts to close
                const percentage = parsePercentage(input.q)
                const contractsToClose = Math.floor(position.total_contracts * (percentage / 100))

                if (contractsToClose === 0) {
                    console.log(`❌ Percentage too small, 0 contracts to close`)
                    return {code: 400, message:'Percentage too small, 0 contracts to close', input:input}
                }

                console.log(`📊 Position: ${position.total_contracts} contracts @ avg ${position.average_price}`)
                console.log(`   Closing ${percentage}% = ${contractsToClose} contracts`)

                // 3. Place market sell order to close longs
                try {
                    const closeOrder = await trade.marketSellOrder(symbol, contractsToClose)
                    const fillPrice = closeOrder.avgPx || closeOrder.price || closeOrder.lastPx || 0

                    console.log('✅ CCXT - Bitmex Close Buy Order Complete: ', new Date())
                    console.log('   Fill price:', fillPrice)

                    // 4. Calculate P&L
                    const pnl = (fillPrice - position.average_price) * contractsToClose
                    const pnlPercentage = (pnl / (position.average_price * contractsToClose)) * 100

                    console.log(`   P&L: ${pnl.toFixed(4)} (${pnlPercentage.toFixed(2)}%)`)

                    // 5. Update position or delete if fully closed
                    const remainingContracts = position.total_contracts - contractsToClose

                    if (remainingContracts === 0 || percentage >= 100) {
                        // Full close - delete position
                        await Positions_Open.deleteOne({ tag: orderTag, account: input.a, market_type: 'spot' })
                        console.log('✅ Position fully closed - removed from open_positions')
                    } else {
                        // Partial close - update position
                        await Positions_Open.updateOne(
                            { tag: orderTag, account: input.a, market_type: 'spot' },
                            {
                                $set: {
                                    total_contracts: remainingContracts,
                                    last_updated: new Date()
                                }
                            }
                        )
                        console.log(`✅ Position updated: ${remainingContracts} contracts remaining`)
                    }

                    // 6. Record close action in closed_trades
                    const closeTrade = new Trades_Closed({
                        tag: orderTag,
                        account: input.a,
                        symbol: input.s,
                        side: 'S', // Sold to close buys
                        market_type: 'spot',
                        contracts_closed: contractsToClose,
                        close_price: fillPrice,
                        percentage: percentage,
                        order_id: closeOrder.orderID || closeOrder.id || closeOrder.clOrdID || undefined,
                        position_before: position.total_contracts,
                        position_after: remainingContracts,
                        average_entry_price: position.average_price,
                        pnl: pnl,
                        pnl_percentage: pnlPercentage,
                        metadata: input,
                        closed_at: new Date()
                    })
                    await closeTrade.save()
                    console.log('✅ Close action recorded in closed_trades')

                    return {code: 200, message:'Success closing buy position', input:input, pnl: pnl}

                } catch (e) {
                    console.log('❌ ERROR in Close Buy Order:')
                    console.log('   Error:', e)
                    inactiveList.push({
                        'username': alias,
                        'action': 'createMarketOrder[CB]',
                        'input': input,
                        'error': e
                    })
                    return {code: 500, message:'Unable to close buy position', input:input, e:e}
                }

            } else if (command === 'CS') {
                // CS = Close Sell (spot)
                console.log('   🔺 Executing CLOSE SELL SPOT position...')

                // 1. Get current position from open_positions (spot only)
                const position = await Positions_Open.findOne({
                    tag: orderTag,
                    account: input.a,
                    market_type: 'spot'
                })

                if (!position) {
                    console.log(`❌ No open spot position found for tag "${orderTag}"`)
                    return {code: 404, message:'No open spot position found for tag', input:input}
                }

                if (position.side !== 'S') {
                    console.log(`❌ Cannot CS (close sell) on buy position. Position side: ${position.side}`)
                    return {code: 400, message:'Cannot CS (close sell) on buy position', input:input}
                }

                // 2. Parse percentage and calculate contracts to close
                const percentage = parsePercentage(input.q)
                const contractsToClose = Math.floor(position.total_contracts * (percentage / 100))

                if (contractsToClose === 0) {
                    console.log(`❌ Percentage too small, 0 contracts to close`)
                    return {code: 400, message:'Percentage too small, 0 contracts to close', input:input}
                }

                console.log(`📊 Position: ${position.total_contracts} contracts @ avg ${position.average_price}`)
                console.log(`   Closing ${percentage}% = ${contractsToClose} contracts`)

                // 3. Place market buy order to close shorts
                try {
                    const closeOrder = await trade.marketBuyOrder(symbol, contractsToClose)
                    const fillPrice = closeOrder.avgPx || closeOrder.price || closeOrder.lastPx || 0

                    console.log('✅ CCXT - Bitmex Close Sell Order Complete: ', new Date())
                    console.log('   Fill price:', fillPrice)

                    // 4. Calculate P&L (inverted for sells)
                    const pnl = (position.average_price - fillPrice) * contractsToClose
                    const pnlPercentage = (pnl / (position.average_price * contractsToClose)) * 100

                    console.log(`   P&L: ${pnl.toFixed(4)} (${pnlPercentage.toFixed(2)}%)`)

                    // 5. Update position or delete if fully closed
                    const remainingContracts = position.total_contracts - contractsToClose

                    if (remainingContracts === 0 || percentage >= 100) {
                        // Full close - delete position
                        await Positions_Open.deleteOne({ tag: orderTag, account: input.a, market_type: 'spot' })
                        console.log('✅ Position fully closed - removed from open_positions')
                    } else {
                        // Partial close - update position
                        await Positions_Open.updateOne(
                            { tag: orderTag, account: input.a, market_type: 'spot' },
                            {
                                $set: {
                                    total_contracts: remainingContracts,
                                    last_updated: new Date()
                                }
                            }
                        )
                        console.log(`✅ Position updated: ${remainingContracts} contracts remaining`)
                    }

                    // 6. Record close action in closed_trades
                    const closeTrade = new Trades_Closed({
                        tag: orderTag,
                        account: input.a,
                        symbol: input.s,
                        side: 'B', // Bought to close sells
                        market_type: 'spot',
                        contracts_closed: contractsToClose,
                        close_price: fillPrice,
                        percentage: percentage,
                        order_id: closeOrder.orderID || closeOrder.id || closeOrder.clOrdID || undefined,
                        position_before: position.total_contracts,
                        position_after: remainingContracts,
                        average_entry_price: position.average_price,
                        pnl: pnl,
                        pnl_percentage: pnlPercentage,
                        metadata: input,
                        closed_at: new Date()
                    })
                    await closeTrade.save()
                    console.log('✅ Close action recorded in closed_trades')

                    return {code: 200, message:'Success closing sell position', input:input, pnl: pnl}

                } catch (e) {
                    console.log('❌ ERROR in Close Sell Order:')
                    console.log('   Error:', e)
                    inactiveList.push({
                        'username': alias,
                        'action': 'createMarketOrder[CS]',
                        'input': input,
                        'error': e
                    })
                    return {code: 500, message:'Unable to close sell position', input:input, e:e}
                }

            } else if (command === 'CLF') {
                // CLF = Close Long Futures
                console.log('   🔻 Executing CLOSE LONG FUTURES position...')

                // 1. Get current position from open_positions (futures only)
                const position = await Positions_Open.findOne({
                    tag: orderTag,
                    account: input.a,
                    market_type: 'futures'
                })

                if (!position) {
                    console.log(`❌ No open futures position found for tag "${orderTag}"`)
                    return {code: 404, message:'No open futures position found for tag', input:input}
                }

                if (position.side !== 'LF') {
                    console.log(`❌ Cannot CLF (close long futures) on short position. Position side: ${position.side}`)
                    return {code: 400, message:'Cannot CLF (close long futures) on short position', input:input}
                }

                // 2. Parse percentage and calculate contracts to close
                const percentage = parsePercentage(input.q)
                const contractsToClose = Math.floor(position.total_contracts * (percentage / 100))

                if (contractsToClose === 0) {
                    console.log(`❌ Percentage too small, 0 contracts to close`)
                    return {code: 400, message:'Percentage too small, 0 contracts to close', input:input}
                }

                console.log(`📊 Position: ${position.total_contracts} contracts @ avg ${position.average_price}`)
                console.log(`   Closing ${percentage}% = ${contractsToClose} contracts`)

                // 3. Place market sell order to close long futures
                try {
                    const closeOrder = await trade.marketSellOrder(symbol, contractsToClose)
                    const fillPrice = closeOrder.avgPx || closeOrder.price || closeOrder.lastPx || 0

                    console.log('✅ CCXT - Bitmex Close Long Futures Order Complete: ', new Date())
                    console.log('   Fill price:', fillPrice)

                    // 4. Calculate P&L
                    const pnl = (fillPrice - position.average_price) * contractsToClose
                    const pnlPercentage = (pnl / (position.average_price * contractsToClose)) * 100

                    console.log(`   P&L: ${pnl.toFixed(4)} (${pnlPercentage.toFixed(2)}%)`)

                    // 5. Calculate dollar amount for close (proportional to percentage closed)
                    const closeDollarAmount = position.dollar_amount ? (position.dollar_amount * (percentage / 100)) : null
                    const remainingDollarAmount = position.dollar_amount ? (position.dollar_amount - closeDollarAmount) : null

                    console.log(`   Dollar amount closed: ${closeDollarAmount}`)
                    console.log(`   Dollar amount remaining: ${remainingDollarAmount}`)

                    // 6. Update position or delete if fully closed
                    const remainingContracts = position.total_contracts - contractsToClose

                    if (remainingContracts === 0 || percentage >= 100) {
                        // Full close - delete position
                        await Positions_Open.deleteOne({ tag: orderTag, account: input.a, market_type: 'futures' })
                        console.log('✅ Position fully closed - removed from open_positions')
                    } else {
                        // Partial close - update position
                        const updateFields = {
                            total_contracts: remainingContracts,
                            last_updated: new Date()
                        }
                        if (remainingDollarAmount !== null) {
                            updateFields.dollar_amount = remainingDollarAmount
                        }
                        await Positions_Open.updateOne(
                            { tag: orderTag, account: input.a, market_type: 'futures' },
                            { $set: updateFields }
                        )
                        console.log(`✅ Position updated: ${remainingContracts} contracts remaining`)
                    }

                    // 7. Record close action in closed_trades
                    const closeTrade = new Trades_Closed({
                        tag: orderTag,
                        account: input.a,
                        symbol: input.s,
                        side: 'SF', // Short futures to close long futures
                        market_type: 'futures',
                        contracts_closed: contractsToClose,
                        close_price: fillPrice,
                        percentage: percentage,
                        order_id: closeOrder.orderID || closeOrder.id || closeOrder.clOrdID || undefined,
                        position_before: position.total_contracts,
                        position_after: remainingContracts,
                        average_entry_price: position.average_price,
                        dollar_amount: closeDollarAmount,
                        pnl: pnl,
                        pnl_percentage: pnlPercentage,
                        metadata: input,
                        closed_at: new Date()
                    })
                    await closeTrade.save()
                    console.log('✅ Close action recorded in closed_trades')

                    return {code: 200, message:'Success closing long futures position', input:input, pnl: pnl}

                } catch (e) {
                    console.log('❌ ERROR in Close Long Futures Order:')
                    console.log('   Error:', e)
                    inactiveList.push({
                        'username': alias,
                        'action': 'createMarketOrder[CLF]',
                        'input': input,
                        'error': e
                    })
                    return {code: 500, message:'Unable to close long futures position', input:input, e:e}
                }

            } else if (command === 'CSF') {
                // CSF = Close Short Futures
                console.log('   🔺 Executing CLOSE SHORT FUTURES position...')

                // 1. Get current position from open_positions (futures only)
                const position = await Positions_Open.findOne({
                    tag: orderTag,
                    account: input.a,
                    market_type: 'futures'
                })

                if (!position) {
                    console.log(`❌ No open futures position found for tag "${orderTag}"`)
                    return {code: 404, message:'No open futures position found for tag', input:input}
                }

                if (position.side !== 'SF') {
                    console.log(`❌ Cannot CSF (close short futures) on long position. Position side: ${position.side}`)
                    return {code: 400, message:'Cannot CSF (close short futures) on long position', input:input}
                }

                // 2. Parse percentage and calculate contracts to close
                const percentage = parsePercentage(input.q)
                const contractsToClose = Math.floor(position.total_contracts * (percentage / 100))

                if (contractsToClose === 0) {
                    console.log(`❌ Percentage too small, 0 contracts to close`)
                    return {code: 400, message:'Percentage too small, 0 contracts to close', input:input}
                }

                console.log(`📊 Position: ${position.total_contracts} contracts @ avg ${position.average_price}`)
                console.log(`   Closing ${percentage}% = ${contractsToClose} contracts`)

                // 3. Place market buy order to close short futures
                try {
                    const closeOrder = await trade.marketBuyOrder(symbol, contractsToClose)
                    const fillPrice = closeOrder.avgPx || closeOrder.price || closeOrder.lastPx || 0

                    console.log('✅ CCXT - Bitmex Close Short Futures Order Complete: ', new Date())
                    console.log('   Fill price:', fillPrice)

                    // 4. Calculate P&L (inverted for shorts)
                    const pnl = (position.average_price - fillPrice) * contractsToClose
                    const pnlPercentage = (pnl / (position.average_price * contractsToClose)) * 100

                    console.log(`   P&L: ${pnl.toFixed(4)} (${pnlPercentage.toFixed(2)}%)`)

                    // 5. Calculate dollar amount for close (proportional to percentage closed)
                    const closeDollarAmount = position.dollar_amount ? (position.dollar_amount * (percentage / 100)) : null
                    const remainingDollarAmount = position.dollar_amount ? (position.dollar_amount - closeDollarAmount) : null

                    console.log(`   Dollar amount closed: ${closeDollarAmount}`)
                    console.log(`   Dollar amount remaining: ${remainingDollarAmount}`)

                    // 6. Update position or delete if fully closed
                    const remainingContracts = position.total_contracts - contractsToClose

                    if (remainingContracts === 0 || percentage >= 100) {
                        // Full close - delete position
                        await Positions_Open.deleteOne({ tag: orderTag, account: input.a, market_type: 'futures' })
                        console.log('✅ Position fully closed - removed from open_positions')
                    } else {
                        // Partial close - update position
                        const updateFields = {
                            total_contracts: remainingContracts,
                            last_updated: new Date()
                        }
                        if (remainingDollarAmount !== null) {
                            updateFields.dollar_amount = remainingDollarAmount
                        }
                        await Positions_Open.updateOne(
                            { tag: orderTag, account: input.a, market_type: 'futures' },
                            { $set: updateFields }
                        )
                        console.log(`✅ Position updated: ${remainingContracts} contracts remaining`)
                    }

                    // 7. Record close action in closed_trades
                    const closeTrade = new Trades_Closed({
                        tag: orderTag,
                        account: input.a,
                        symbol: input.s,
                        side: 'LF', // Long futures to close short futures
                        market_type: 'futures',
                        contracts_closed: contractsToClose,
                        close_price: fillPrice,
                        percentage: percentage,
                        order_id: closeOrder.orderID || closeOrder.id || closeOrder.clOrdID || undefined,
                        position_before: position.total_contracts,
                        position_after: remainingContracts,
                        average_entry_price: position.average_price,
                        dollar_amount: closeDollarAmount,
                        pnl: pnl,
                        pnl_percentage: pnlPercentage,
                        metadata: input,
                        closed_at: new Date()
                    })
                    await closeTrade.save()
                    console.log('✅ Close action recorded in closed_trades')

                    return {code: 200, message:'Success closing short futures position', input:input, pnl: pnl}

                } catch (e) {
                    console.log('❌ ERROR in Close Short Futures Order:')
                    console.log('   Error:', e)
                    inactiveList.push({
                        'username': alias,
                        'action': 'createMarketOrder[CSF]',
                        'input': input,
                        'error': e
                    })
                    return {code: 500, message:'Unable to close short futures position', input:input, e:e}
                }

            } else if (command === 'LF') {
                // LF = Long Futures (market buy)
                // Check for opposing SF position first
                console.log('   📈 Processing LONG FUTURES command...')

                const position = await Positions_Open.findOne({
                    tag: orderTag,
                    account: input.a,
                    market_type: 'futures'
                })

                if (position && position.side === 'SF') {
                    // Opposing SHORT position exists - handle as close/flip
                    const currentContracts = position.total_contracts
                    const newContracts = qntyUSD

                    console.log(`   🔄 Opposing SF position detected: ${currentContracts} contracts @ ${position.average_price}`)
                    console.log(`   📈 LF command will buy ${newContracts} contracts`)

                    try {
                        const buyOrder = await trade.marketBuyOrder(symbol, newContracts)
                        const fillPrice = buyOrder.avgPx || buyOrder.price || buyOrder.lastPx || 0

                        console.log('✅ CCXT - Bitmex Buy Order Complete: ', new Date())
                        console.log('   Fill price:', fillPrice)

                        if (newContracts < currentContracts) {
                            // PARTIAL CLOSE: Reduce short position
                            const remainingContracts = currentContracts - newContracts
                            console.log(`   📉 Partial close: ${newContracts} contracts closed, ${remainingContracts} remaining`)

                            // Calculate P&L for closed portion
                            const pnl = (position.average_price - fillPrice) * newContracts
                            const pnlPercentage = (pnl / (position.average_price * newContracts)) * 100
                            console.log(`   P&L: ${pnl.toFixed(4)} (${pnlPercentage.toFixed(2)}%)`)

                            // Update position with reduced contracts
                            await Positions_Open.updateOne(
                                { tag: orderTag, account: input.a, market_type: 'futures' },
                                {
                                    $set: {
                                        total_contracts: remainingContracts,
                                        last_updated: new Date()
                                    }
                                }
                            )

                            // Record partial close
                            const closeTrade = new Trades_Closed({
                                tag: orderTag,
                                account: input.a,
                                symbol: input.s,
                                side: 'LF',
                                market_type: 'futures',
                                contracts_closed: newContracts,
                                close_price: fillPrice,
                                percentage: (newContracts / currentContracts) * 100,
                                order_id: buyOrder.orderID || buyOrder.id || buyOrder.clOrdID || undefined,
                                position_before: currentContracts,
                                position_after: remainingContracts,
                                average_entry_price: position.average_price,
                                pnl: pnl,
                                pnl_percentage: pnlPercentage,
                                metadata: input,
                                closed_at: new Date()
                            })
                            await closeTrade.save()
                            console.log('✅ Partial close recorded')

                            return {code: 200, message:`Partial close: ${newContracts} contracts closed, ${remainingContracts} remaining`, input:input, pnl: pnl}

                        } else if (newContracts === currentContracts) {
                            // FULL CLOSE: Close entire short position
                            console.log(`   ✅ Full close: entire SF position closed`)

                            // Calculate P&L
                            const pnl = (position.average_price - fillPrice) * currentContracts
                            const pnlPercentage = (pnl / (position.average_price * currentContracts)) * 100
                            console.log(`   P&L: ${pnl.toFixed(4)} (${pnlPercentage.toFixed(2)}%)`)

                            // Delete position
                            await Positions_Open.deleteOne({ tag: orderTag, account: input.a, market_type: 'futures' })

                            // Record full close
                            const closeTrade = new Trades_Closed({
                                tag: orderTag,
                                account: input.a,
                                symbol: input.s,
                                side: 'LF',
                                market_type: 'futures',
                                contracts_closed: currentContracts,
                                close_price: fillPrice,
                                percentage: 100,
                                order_id: buyOrder.orderID || buyOrder.id || buyOrder.clOrdID || undefined,
                                position_before: currentContracts,
                                position_after: 0,
                                average_entry_price: position.average_price,
                                pnl: pnl,
                                pnl_percentage: pnlPercentage,
                                metadata: input,
                                closed_at: new Date()
                            })
                            await closeTrade.save()
                            console.log('✅ Full close recorded')

                            return {code: 200, message:`Full close: SF position closed`, input:input, pnl: pnl}

                        } else {
                            // CLOSE + FLIP: Close short and open long with remainder
                            const remainderContracts = newContracts - currentContracts
                            console.log(`   🔄 Close + Flip: closing ${currentContracts} SF, opening ${remainderContracts} LF`)

                            // Calculate P&L for closed portion
                            const pnl = (position.average_price - fillPrice) * currentContracts
                            const pnlPercentage = (pnl / (position.average_price * currentContracts)) * 100
                            console.log(`   P&L from close: ${pnl.toFixed(4)} (${pnlPercentage.toFixed(2)}%)`)

                            // Update position to LF with remainder
                            await Positions_Open.updateOne(
                                { tag: orderTag, account: input.a, market_type: 'futures' },
                                {
                                    $set: {
                                        side: 'LF',
                                        total_contracts: remainderContracts,
                                        average_price: fillPrice,
                                        trade_count: 1,
                                        trade_ids: [buyOrder.orderID || buyOrder.id || buyOrder.clOrdID],
                                        last_updated: new Date()
                                    }
                                }
                            )

                            // Record close of SF position
                            const closeTrade = new Trades_Closed({
                                tag: orderTag,
                                account: input.a,
                                symbol: input.s,
                                side: 'LF',
                                market_type: 'futures',
                                contracts_closed: currentContracts,
                                close_price: fillPrice,
                                percentage: 100,
                                order_id: buyOrder.orderID || buyOrder.id || buyOrder.clOrdID || undefined,
                                position_before: currentContracts,
                                position_after: 0,
                                average_entry_price: position.average_price,
                                pnl: pnl,
                                pnl_percentage: pnlPercentage,
                                metadata: { ...input, flip_remainder: remainderContracts },
                                closed_at: new Date()
                            })
                            await closeTrade.save()
                            console.log(`✅ Closed SF and opened LF with ${remainderContracts} contracts`)

                            return {code: 200, message:`Closed SF + opened LF with ${remainderContracts} contracts`, input:input, pnl: pnl}
                        }

                    } catch (e) {
                        console.log('   ❌ ERROR in LF opposing position handling:')
                        console.log('   Error:', e)
                        inactiveList.push({
                            'username': alias,
                            'action': 'createMarketOrder[LF-opposing]',
                            'input': input,
                            'error': e
                        })
                        return {code: 500, message:'Unable to process LF close/flip', input:input, e:e}
                    }

                } else {
                    // No opposing position - normal LF open/add
                    console.log('   📈 No opposing position - executing normal LONG FUTURES order')
                    trade.marketBuyOrder(symbol,qntyUSD).then(function (data) {
                        console.log('   ✅ CCXT - Bitmex Long Futures Order Complete: ', new Date)
                        console.log('   Order Data:', JSON.stringify(data, null, 2))
                        pushTagTrades(orderTag,data,input,dollarAmount)
                        return {code: 200, message:'Success to process Long Futures Market Order', input:input}
                    }).catch(e => {
                        console.log('   ❌ ERROR in Long Futures Market Order:')
                        console.log('   Error:', e)
                        inactiveList.push({
                            'username': alias,
                            'action': 'createMarketOrder[LF]',
                            'input': input,
                            'error':e
                        })
                        console.log("   Failed to submit Long Futures Market Order: ",e)
                        return {code: 500, message:'Unable to process long futures trade', input:input, e:e}
                    })
                }

            } else if (command === 'SF') {
                // SF = Short Futures (market sell)
                // Check for opposing LF position first
                console.log('   📉 Processing SHORT FUTURES command...')

                const position = await Positions_Open.findOne({
                    tag: orderTag,
                    account: input.a,
                    market_type: 'futures'
                })

                if (position && position.side === 'LF') {
                    // Opposing LONG position exists - handle as close/flip
                    const currentContracts = position.total_contracts
                    const newContracts = qntyUSD

                    console.log(`   🔄 Opposing LF position detected: ${currentContracts} contracts @ ${position.average_price}`)
                    console.log(`   📉 SF command will sell ${newContracts} contracts`)

                    try {
                        const sellOrder = await trade.marketSellOrder(symbol, newContracts)
                        const fillPrice = sellOrder.avgPx || sellOrder.price || sellOrder.lastPx || 0

                        console.log('✅ CCXT - Bitmex Sell Order Complete: ', new Date())
                        console.log('   Fill price:', fillPrice)

                        if (newContracts < currentContracts) {
                            // PARTIAL CLOSE: Reduce long position
                            const remainingContracts = currentContracts - newContracts
                            console.log(`   📉 Partial close: ${newContracts} contracts closed, ${remainingContracts} remaining`)

                            // Calculate P&L for closed portion
                            const pnl = (fillPrice - position.average_price) * newContracts
                            const pnlPercentage = (pnl / (position.average_price * newContracts)) * 100
                            console.log(`   P&L: ${pnl.toFixed(4)} (${pnlPercentage.toFixed(2)}%)`)

                            // Update position with reduced contracts
                            await Positions_Open.updateOne(
                                { tag: orderTag, account: input.a, market_type: 'futures' },
                                {
                                    $set: {
                                        total_contracts: remainingContracts,
                                        last_updated: new Date()
                                    }
                                }
                            )

                            // Record partial close
                            const closeTrade = new Trades_Closed({
                                tag: orderTag,
                                account: input.a,
                                symbol: input.s,
                                side: 'SF',
                                market_type: 'futures',
                                contracts_closed: newContracts,
                                close_price: fillPrice,
                                percentage: (newContracts / currentContracts) * 100,
                                order_id: sellOrder.orderID || sellOrder.id || sellOrder.clOrdID || undefined,
                                position_before: currentContracts,
                                position_after: remainingContracts,
                                average_entry_price: position.average_price,
                                pnl: pnl,
                                pnl_percentage: pnlPercentage,
                                metadata: input,
                                closed_at: new Date()
                            })
                            await closeTrade.save()
                            console.log('✅ Partial close recorded')

                            return {code: 200, message:`Partial close: ${newContracts} contracts closed, ${remainingContracts} remaining`, input:input, pnl: pnl}

                        } else if (newContracts === currentContracts) {
                            // FULL CLOSE: Close entire long position
                            console.log(`   ✅ Full close: entire LF position closed`)

                            // Calculate P&L
                            const pnl = (fillPrice - position.average_price) * currentContracts
                            const pnlPercentage = (pnl / (position.average_price * currentContracts)) * 100
                            console.log(`   P&L: ${pnl.toFixed(4)} (${pnlPercentage.toFixed(2)}%)`)

                            // Delete position
                            await Positions_Open.deleteOne({ tag: orderTag, account: input.a, market_type: 'futures' })

                            // Record full close
                            const closeTrade = new Trades_Closed({
                                tag: orderTag,
                                account: input.a,
                                symbol: input.s,
                                side: 'SF',
                                market_type: 'futures',
                                contracts_closed: currentContracts,
                                close_price: fillPrice,
                                percentage: 100,
                                order_id: sellOrder.orderID || sellOrder.id || sellOrder.clOrdID || undefined,
                                position_before: currentContracts,
                                position_after: 0,
                                average_entry_price: position.average_price,
                                pnl: pnl,
                                pnl_percentage: pnlPercentage,
                                metadata: input,
                                closed_at: new Date()
                            })
                            await closeTrade.save()
                            console.log('✅ Full close recorded')

                            return {code: 200, message:`Full close: LF position closed`, input:input, pnl: pnl}

                        } else {
                            // CLOSE + FLIP: Close long and open short with remainder
                            const remainderContracts = newContracts - currentContracts
                            console.log(`   🔄 Close + Flip: closing ${currentContracts} LF, opening ${remainderContracts} SF`)

                            // Calculate P&L for closed portion
                            const pnl = (fillPrice - position.average_price) * currentContracts
                            const pnlPercentage = (pnl / (position.average_price * currentContracts)) * 100
                            console.log(`   P&L from close: ${pnl.toFixed(4)} (${pnlPercentage.toFixed(2)}%)`)

                            // Update position to SF with remainder
                            await Positions_Open.updateOne(
                                { tag: orderTag, account: input.a, market_type: 'futures' },
                                {
                                    $set: {
                                        side: 'SF',
                                        total_contracts: remainderContracts,
                                        average_price: fillPrice,
                                        trade_count: 1,
                                        trade_ids: [sellOrder.orderID || sellOrder.id || sellOrder.clOrdID],
                                        last_updated: new Date()
                                    }
                                }
                            )

                            // Record close of LF position
                            const closeTrade = new Trades_Closed({
                                tag: orderTag,
                                account: input.a,
                                symbol: input.s,
                                side: 'SF',
                                market_type: 'futures',
                                contracts_closed: currentContracts,
                                close_price: fillPrice,
                                percentage: 100,
                                order_id: sellOrder.orderID || sellOrder.id || sellOrder.clOrdID || undefined,
                                position_before: currentContracts,
                                position_after: 0,
                                average_entry_price: position.average_price,
                                pnl: pnl,
                                pnl_percentage: pnlPercentage,
                                metadata: { ...input, flip_remainder: remainderContracts },
                                closed_at: new Date()
                            })
                            await closeTrade.save()
                            console.log(`✅ Closed LF and opened SF with ${remainderContracts} contracts`)

                            return {code: 200, message:`Closed LF + opened SF with ${remainderContracts} contracts`, input:input, pnl: pnl}
                        }

                    } catch (e) {
                        console.log('   ❌ ERROR in SF opposing position handling:')
                        console.log('   Error:', e)
                        inactiveList.push({
                            'username': alias,
                            'action': 'createMarketOrder[SF-opposing]',
                            'input': input,
                            'error': e
                        })
                        return {code: 500, message:'Unable to process SF close/flip', input:input, e:e}
                    }

                } else {
                    // No opposing position - normal SF open/add
                    console.log('   📉 No opposing position - executing normal SHORT FUTURES order')
                    trade.marketSellOrder(symbol,qntyUSD).then(function (data) {
                        console.log('   ✅ CCXT - Bitmex Short Futures Order Complete: ', new Date)
                        console.log('   Order Data:', JSON.stringify(data, null, 2))
                        pushTagTrades(orderTag,data,input,dollarAmount)
                        return {code: 200, message:'Success to process Short Futures Market Order', input:input}
                    }).catch(e => {
                        console.log('   ❌ ERROR in Short Futures Market Order:')
                        console.log('   Error:', e)
                        inactiveList.push({
                            'username': alias,
                            'action': 'createMarketOrder[SF]',
                            'input': input,
                            'error':e
                        })
                        console.log("   Failed to submit Short Futures Market Order: ",e)
                        return {code: 500, message:'Unable to process short futures trade', input:input, e:e}
                    })
                }

            } else if (command === 'FLF') {
                // FLF = Flip Long to Short (only if currently LF)
                console.log('   🔄 Executing FLIP LONG to SHORT...')

                // 1. Get current position from open_positions (futures only)
                const position = await Positions_Open.findOne({
                    tag: orderTag,
                    account: input.a,
                    market_type: 'futures'
                })

                if (!position) {
                    console.log(`❌ No open futures position found for tag "${orderTag}"`)
                    return {code: 404, message:'No open futures position found to flip', input:input}
                }

                const currentContracts = position.total_contracts
                const currentSide = position.side

                // Validate: only flip if currently LF
                if (currentSide !== 'LF') {
                    console.log(`⚠️  FLF command ignored: current position is ${currentSide}, not LF`)
                    mainLog.print('Warning', `FLF ignored - position already ${currentSide} for tag "${orderTag}"`)
                    return {code: 200, message:`FLF ignored - position already ${currentSide}`, input:input}
                }

                const flipContracts = currentContracts * 2 // Close current + open opposite

                console.log(`📊 Current Position: ${currentSide} ${currentContracts} contracts @ avg ${position.average_price}`)
                console.log(`   Flipping LF to SF: ${flipContracts} contracts`)

                // 2. Execute flip trade (sell 2x to flip long to short)
                try {
                    console.log('   📉 Selling', flipContracts, 'contracts to flip LF → SF')
                    const flipOrder = await trade.marketSellOrder(symbol, flipContracts)
                    const newSide = 'SF'

                    const fillPrice = flipOrder.avgPx || flipOrder.price || flipOrder.lastPx || 0

                    console.log('✅ CCXT - Bitmex Flip Long to Short Order Complete: ', new Date())
                    console.log('   Fill price:', fillPrice)

                    // 3. Calculate P&L from closed portion
                    const pnl = (fillPrice - position.average_price) * currentContracts
                    const pnlPercentage = (pnl / (position.average_price * currentContracts)) * 100

                    console.log(`   P&L from closed portion: ${pnl.toFixed(4)} (${pnlPercentage.toFixed(2)}%)`)

                    // 4. Get old dollar amount to record in closed trade
                    const oldDollarAmount = position.dollar_amount || null
                    console.log(`   Position dollar amount (preserved): ${oldDollarAmount}`)

                    // 5. Update position to new side (dollar_amount stays unchanged)
                    const updateFields = {
                        side: newSide,
                        total_contracts: currentContracts,
                        average_price: fillPrice,
                        trade_count: 1,
                        trade_ids: [flipOrder.orderID || flipOrder.id || flipOrder.clOrdID],
                        last_updated: new Date()
                    }

                    await Positions_Open.updateOne(
                        { tag: orderTag, account: input.a, market_type: 'futures' },
                        { $set: updateFields }
                    )
                    console.log(`✅ Position flipped: ${currentSide} → ${newSide} (${currentContracts} contracts @ ${fillPrice})`)

                    // 6. Record close action for closed portion in closed_trades
                    const closeTrade = new Trades_Closed({
                        tag: orderTag,
                        account: input.a,
                        symbol: input.s,
                        side: 'SF', // Sold to close the long
                        market_type: 'futures',
                        contracts_closed: currentContracts,
                        close_price: fillPrice,
                        percentage: 100, // Closed 100% of old position
                        order_id: flipOrder.orderID || flipOrder.id || flipOrder.clOrdID || undefined,
                        position_before: currentContracts,
                        position_after: 0, // Old position fully closed
                        average_entry_price: position.average_price,
                        dollar_amount: oldDollarAmount, // Store old position's dollar amount
                        pnl: pnl,
                        pnl_percentage: pnlPercentage,
                        metadata: { ...input, flip: 'FLF', new_side: newSide },
                        closed_at: new Date()
                    })
                    await closeTrade.save()
                    console.log('✅ Close action recorded in closed_trades')

                    return {code: 200, message:`Success flipping futures position: LF → SF`, input:input, pnl: pnl}

                } catch (e) {
                    console.log('❌ ERROR in Flip Long to Short Order:')
                    console.log('   Error:', e)
                    inactiveList.push({
                        'username': alias,
                        'action': 'createMarketOrder[FLF]',
                        'input': input,
                        'error': e
                    })
                    return {code: 500, message:'Unable to flip long to short', input:input, e:e}
                }

            } else if (command === 'FSF') {
                // FSF = Flip Short to Long (only if currently SF)
                console.log('   🔄 Executing FLIP SHORT to LONG...')

                // 1. Get current position from open_positions (futures only)
                const position = await Positions_Open.findOne({
                    tag: orderTag,
                    account: input.a,
                    market_type: 'futures'
                })

                if (!position) {
                    console.log(`❌ No open futures position found for tag "${orderTag}"`)
                    return {code: 404, message:'No open futures position found to flip', input:input}
                }

                const currentContracts = position.total_contracts
                const currentSide = position.side

                // Validate: only flip if currently SF
                if (currentSide !== 'SF') {
                    console.log(`⚠️  FSF command ignored: current position is ${currentSide}, not SF`)
                    mainLog.print('Warning', `FSF ignored - position already ${currentSide} for tag "${orderTag}"`)
                    return {code: 200, message:`FSF ignored - position already ${currentSide}`, input:input}
                }

                const flipContracts = currentContracts * 2 // Close current + open opposite

                console.log(`📊 Current Position: ${currentSide} ${currentContracts} contracts @ avg ${position.average_price}`)
                console.log(`   Flipping SF to LF: ${flipContracts} contracts`)

                // 2. Execute flip trade (buy 2x to flip short to long)
                try {
                    console.log('   📈 Buying', flipContracts, 'contracts to flip SF → LF')
                    const flipOrder = await trade.marketBuyOrder(symbol, flipContracts)
                    const newSide = 'LF'

                    const fillPrice = flipOrder.avgPx || flipOrder.price || flipOrder.lastPx || 0

                    console.log('✅ CCXT - Bitmex Flip Short to Long Order Complete: ', new Date())
                    console.log('   Fill price:', fillPrice)

                    // 3. Calculate P&L from closed portion
                    const pnl = (position.average_price - fillPrice) * currentContracts
                    const pnlPercentage = (pnl / (position.average_price * currentContracts)) * 100

                    console.log(`   P&L from closed portion: ${pnl.toFixed(4)} (${pnlPercentage.toFixed(2)}%)`)

                    // 4. Get old dollar amount to record in closed trade
                    const oldDollarAmount = position.dollar_amount || null
                    console.log(`   Position dollar amount (preserved): ${oldDollarAmount}`)

                    // 5. Update position to new side (dollar_amount stays unchanged)
                    const updateFields = {
                        side: newSide,
                        total_contracts: currentContracts,
                        average_price: fillPrice,
                        trade_count: 1,
                        trade_ids: [flipOrder.orderID || flipOrder.id || flipOrder.clOrdID],
                        last_updated: new Date()
                    }

                    await Positions_Open.updateOne(
                        { tag: orderTag, account: input.a, market_type: 'futures' },
                        { $set: updateFields }
                    )
                    console.log(`✅ Position flipped: ${currentSide} → ${newSide} (${currentContracts} contracts @ ${fillPrice})`)

                    // 6. Record close action for closed portion in closed_trades
                    const closeTrade = new Trades_Closed({
                        tag: orderTag,
                        account: input.a,
                        symbol: input.s,
                        side: 'LF', // Bought to close the short
                        market_type: 'futures',
                        contracts_closed: currentContracts,
                        close_price: fillPrice,
                        percentage: 100, // Closed 100% of old position
                        order_id: flipOrder.orderID || flipOrder.id || flipOrder.clOrdID || undefined,
                        position_before: currentContracts,
                        position_after: 0, // Old position fully closed
                        average_entry_price: position.average_price,
                        dollar_amount: oldDollarAmount, // Store old position's dollar amount
                        pnl: pnl,
                        pnl_percentage: pnlPercentage,
                        metadata: { ...input, flip: 'FSF', new_side: newSide },
                        closed_at: new Date()
                    })
                    await closeTrade.save()
                    console.log('✅ Close action recorded in closed_trades')

                    return {code: 200, message:`Success flipping futures position: SF → LF`, input:input, pnl: pnl}

                } catch (e) {
                    console.log('❌ ERROR in Flip Short to Long Order:')
                    console.log('   Error:', e)
                    inactiveList.push({
                        'username': alias,
                        'action': 'createMarketOrder[FSF]',
                        'input': input,
                        'error': e
                    })
                    return {code: 500, message:'Unable to flip short to long', input:input, e:e}
                }

            } else {
                inactiveList.push({
                    'username': alias,
                    'action': 'creatMarketOrder[1]',
                    'input': input,
                    'error':'unsupported command with order type'
                })
                return {code: 400, message:'Unsupported Command with Order Type', input:input}
            }
        }

        //Create a Market Order with TP (Additional Limit Order of Opposite Side)
        async function createMarketTPOrder(symbol,input) {
            console.log('\n🔹 createMarketTPOrder() called')
            console.log('   Symbol:', symbol)
            console.log('   Input:', JSON.stringify(input, null, 2))
            
            const command = input.c
            const regXBT = new RegExp(/XBT$/s)
            const regUSDT = new RegExp(/USDT$/s)
            const regAuto = new RegExp(/^auto$/s)
            const isUSDTPair = symbol.includes('USDT')
            
            let qntyValue
            let isUSDTAmount = false
            
            if (regXBT.test(input.q)) {
                qntyValue = +input.q.split('XBT')[0]
                console.log("   Quantity type: XBT amount")
            } else if (regUSDT.test(input.q)) {
                // Has USDT suffix: "10USDT" -> spend $10 worth
                qntyValue = +input.q.split('USDT')[0]
                isUSDTAmount = true
                console.log("   Quantity type: USDT amount ($" + qntyValue + " worth)")
            } else if (regAuto.test(input.q)) {
                qntyValue = +getAutoQnty(0.01, isUSDTPair)
                isUSDTAmount = isUSDTPair
                console.log("   Quantity type: auto")
            } else {
                qntyValue = +input.q
                console.log("   Quantity type: plain number (contracts)")
            }
            
            const tpValue = input.tp ? input.tp.slice(0, -1) : tp.slice(0, -1);
            const orderTag = input.tag || tag

            //1. Calculate USD amount
            console.log("   qntyValue: ", qntyValue)
            console.log("   Symbol:", symbol)
            console.log("   isUSDTPair:", isUSDTPair)
            console.log("   isUSDTAmount:", isUSDTAmount)
            
            // Helper function to get lot size for a symbol
            function getLotSize(symbol) {
                switch(symbol) {
                    case 'BMEX/USDT': return 1000
                    case 'XRP/USDT': return 100
                    case 'XRPUSD': return 100
                    default: return 1
                }
            }
            
            let qntyUSD
            if (isUSDTPair && isUSDTAmount) {
                const ticker = await trade.ticker(symbol)
                const currentPrice = ticker.last
                const rawContracts = qntyValue / currentPrice
                const lotSize = getLotSize(symbol)
                let roundedContracts = Math.floor(rawContracts / lotSize) * lotSize
                qntyUSD = roundedContracts < lotSize ? lotSize : roundedContracts
                console.log("   Current price:", currentPrice, "USDT")
                console.log("   USDT amount to spend:", qntyValue)
                console.log("   Raw contracts:", rawContracts)
                console.log("   Lot size:", lotSize)
                console.log("   Rounded to lot size:", roundedContracts)
                console.log("   Final (min 1 lot):", qntyUSD)
            } else if (isUSDTPair) {
                const lotSize = getLotSize(symbol)
                let roundedContracts = Math.floor(qntyValue / lotSize) * lotSize
                qntyUSD = roundedContracts < lotSize ? lotSize : roundedContracts
                console.log("   Using value as contracts (rounded to lot size):", qntyUSD)
            } else {
                qntyUSD = resolveContracts(qntyValue, symbol)
                console.log("   Converted XBT to USD contracts:", qntyUSD)
            }
            
            console.log("   Final quantity (contracts):", qntyUSD)

            if(command === 'S') {                
                //2. Create Market Order
                trade.marketSellOrder(symbol,qntyUSD).then(function (data) {
                    console.log('CCXT - Bitmex Sell Order Complete: ', new Date)
                    console.log('CCXT - Bitmex executing addition limit order tp...: ', new Date)
                    
                    //MARKET ORDER SUCCESS CONTINUE LIMIT ORDER
                    //Calculate TP (price * tp%) = limit order price
                    
                    // console.log('Amount of Contracts: ',data.amount)

                    //3. Price from Market Order
                    const orderPrice = data.price
                    console.log('   📊 Market order filled at price:', orderPrice)
                    console.log('   🎯 TP percentage:', tpValue, '%')
                    
                    //4. Calculate TP based on Entry Price
                    const tp_price = (orderPrice * ((100 - parseFloat(tpValue))/100))
                    console.log('   💰 Calculated TP price (before decimals):', tp_price)
                    
                    //5. Fix Decimals
                    const entryPrice = resolveDecimals(tp_price, symbol)
                    console.log('   ✅ Final TP price (after decimals):', entryPrice)
                    
                    //Push into array because of success, if limit tp fails it will still be recorded otherwise not.
                    pushTagTrades(orderTag,data,input)

                    //6. Opposite Side Trade Limit Order
                    console.log('   📤 Submitting limit buy order at:', entryPrice)
                    trade.limitBuyOrder(symbol,qntyUSD,entryPrice).then(function (data_limit){
                        console.log('CCXT - Bitmex Buy Limit Order (TP) Complete: ', new Date)
                        //7. Success - Send OK from Server 2 trades (market+limit) success!
                        pushTagLimitTrades(orderTag,data_limit,input)
                        return {code: 200, message:'Success to process Sell Market & Buy Limit Order', input:input}

                        //WHEN LIMIT ORDER FAILS
                    }).catch(e => {
                        //Send Server Error!
                        inactiveList.push({
                            'username': alias,
                            'action': 'creatMarketTPOrder[2]',
                            'input': input,
                            'error':e
                        })
                        console.log("[2] Failed to submit Appended Limit Order: ",e)
                        return {code: 500, message:'Unable to process trade', input:input, e:e}
                    })
                    
                    //IF FIRST TRADE FAILS (MARKET ORDER)
                }).catch(e => {
                    //Send Server Error!
                    inactiveList.push({
                        'username': alias,
                        'action': 'creatMarketTPOrder[1]',
                        'input': input,
                        'error':e
                    })
                    console.log("[1] Failed to submit Market Order: ",e)
                    return {code: 500, message:'Unable to process trade', input:input, e:e}
                })

            } else if (command === 'B') {
                //2. Create Market Order
                trade.marketBuyOrder(symbol,qntyUSD).then(function (data) {
                    console.log('CCXT - Bitmex Buy Order Complete: ', new Date)
                    console.log('CCXT - Bitmex executing addition limit order tp...: ', new Date)
                    
                    //MARKET ORDER SUCCESS CONTINUE LIMIT ORDER
                    //Calculate TP (price * tp%) = limit order price
                    
                    //3. Price from Market Order
                    const orderPrice = data.price 
                    
                    //4. Calculate TP based on Entry Price
                    const tp_price = (orderPrice * ((100 + parseFloat(tp))/100))
                    
                    //5. Fix Decimals
                    const entryPrice = resolveDecimals(tp_price, symbol)

                    //Push into array because of success, if limit tp fails it will still be recorded otherwise not.
                    pushTagTrades(orderTag,data,input)

                    //6. Opposite Side Trade Limit Order
                    trade.limitSellOrder(symbol,qntyUSD,entryPrice).then(function (data_limit){
                        console.log('CCXT - Bitmex Sell Limit Order (TP) Complete: ', new Date)
                        //7. Success - Send OK from Server 2 trades (market+limit) success!
                        pushTagLimitTrades(orderTag,data_limit,input)
                        return {code: 200, message:'Success to process Buy Market & Sell Limit Order', input:input}


                    }).catch(e => {
                        //Send Server Error!
                        inactiveList.push({
                            'username': alias,
                            'action': 'creatMarketTPOrder[2]',
                            'input': input,
                            'error':e
                        })
                        console.log("[2] Failed to submit Appended Limit Order: ",e)
                        return {code: 500, message:'Unable to process trade', input:input, e:e}
                    })
                    
                    //IF FIRST TRADE FAILS (MARKET ORDER)
                }).catch(e => {
                    //Send Server Error!
                    inactiveList.push({
                        'username': alias,
                        'action': 'creatMarketTPOrder[1]',
                        'input': input,
                        'error':e
                    })
                    console.log("[1] Failed to submit Market Order: ",e)
                    return {code: 500, message:'Unable to process trade', input:input, e:e}
                })

            } else {
                inactiveList.push({
                    'username': alias,
                    'action': 'creatMarketTPOrder[1]',
                    'input': input,
                    'error':'unsupported command with order type'
                })
                return {code: 400, message:'Unsupported Command with Order Type', input:input}
            }
        }

        //Create a Trigger Market Order with P
        function createMarketTriggerOrderP(symbol,input) {
            const command = input.c
            const regXBT = new RegExp(/XBT$/s)
            const regAuto = new RegExp(/^auto$/s)
            const qntyXBT = regXBT.test(input.q) ? +input.q.split('XBT')[0] : regAuto.test(input.q) ? +getAutoQnty(0.01) : 0.0025
            const p = +input.p.slice(0, -1);
            
            //1. Calculate USD amount
            const qntyUSD = resolveContracts(qntyXBT,symbol)
            console.log("qntyXBT: ", qntyXBT)

            const data = {
                id: 'only-trigger',
                amount: qntyUSD
            }

            if(command === 'ST') {               
                 
                //Is a % from Market Price! input.s is bitmex symbol, where as symbol is resovled for CCXT
                const entryPrice = resolveDecimals(stream.latest.instruments[input.s].lastPrice * ( 1 + (p / 100)), symbol)

                //Create Trigger Market Order
                pushTriggerOrders(data,entryPrice,'S')
                    
            } else if (command === 'BT') {
                //Is a % from Market Price! input.s is bitmex symbol, where as symbol is resovled for CCXT
                const entryPrice = resolveDecimals(stream.latest.instruments[input.s].lastPrice * ( 1 - (p / 100)), symbol)

                //Create Trigger Market Order
                pushTriggerOrders(data,entryPrice,'B')

            } else {
                return {code: 400, message:'Unsupported Command with Order Type', input:input}
            }
        }
        
        //Create a Market Order with TP (Additional Limit Order of Opposite Side)
        function createMarketTriggerOrderTP(symbol,input) {
            const command = input.c
            const regXBT = new RegExp(/XBT$/s)
            const regAuto = new RegExp(/^auto$/s)
            const qntyXBT = regXBT.test(input.q) ? +input.q.split('XBT')[0] : regAuto.test(input.q) ? +getAutoQnty(0.01) : 0.0025
            const tp = input.tp.slice(0, -1);

            //1. Calculate USD amount
            console.log("qntyXBT: ", qntyXBT)
            const qntyUSD = resolveContracts(qntyXBT,symbol)

            if(command === 'ST') {                
                //2. Create Market Order
                trade.marketSellOrder(symbol,qntyUSD).then(function (data) {
                    console.log('CCXT - Bitmex Sell Order Complete: ', new Date)
                    console.log('CCXT - Bitmex executing addition limit order tp...: ', new Date)
                    
                    //MARKET ORDER SUCCESS CONTINUE LIMIT ORDER
                    //Calculate TP (price * tp%) = limit order price
                    
                    // console.log('Amount of Contracts: ',data.amount)

                    //3. Price from Market Order
                    const orderPrice = data.price 
                    
                    //4. Calculate TP based on Entry Price
                    const tp_price = (orderPrice * ((100 - parseFloat(tp))/100))
                    
                    //5. Fix Decimals
                    const entryPrice = resolveDecimals(tp_price, symbol)
                    
                    //Create Trigger Market Order
                    pushTriggerOrders(data,entryPrice,'B')
                    
                    //IF FIRST TRADE FAILS (MARKET ORDER)
                }).catch(e => {
                    //Send Server Error!
                    console.log("[1] Failed to submit Market Order: ",e)
                    inactiveList.push({
                        'username': alias,
                        'action': 'creatMarketTriggerOrderTP[1]',
                        'input': input,
                        'error':e
                    })
                    return {code: 500, message:'Unable to process trade', input:input, e:e}
                })

            } else if (command === 'BT') {
                //2. Create Market Order
                trade.marketBuyOrder(symbol,qntyUSD).then(function (data) {
                    console.log('CCXT - Bitmex Buy Order Complete: ', new Date)
                    console.log('CCXT - Bitmex executing addition limit order tp...: ', new Date)
                    
                    //MARKET ORDER SUCCESS CONTINUE LIMIT ORDER
                    //Calculate TP (price * tp%) = limit order price
                    
                    //3. Price from Market Order
                    const orderPrice = data.price 
                    
                    //4. Calculate TP based on Entry Price
                    const tp_price = (orderPrice * ((100 + parseFloat(tp))/100))
                    
                    //5. Fix Decimals
                    const entryPrice = resolveDecimals(tp_price, symbol)

                    //Create Trigger Market Order
                    pushTriggerOrders(data,entryPrice,'S')
                    
                    //IF FIRST TRADE FAILS (MARKET ORDER)
                }).catch(e => {
                    //Send Server Error!
                    inactiveList.push({
                        'username': alias,
                        'action': 'creatMarketTriggerOrderTP[1]',
                        'input': input,
                        'error':e
                    })
                    console.log("[1] Failed to submit Market Order: ",e)
                    return {code: 500, message:'Unable to process trade', input:input, e:e}
                })

            } else {
                inactiveList.push({
                    'username': alias,
                    'action': 'creatMarketTriggerOrderTP[1]',
                    'input': input,
                    'error':'unsupported command with order type'
                })
                return {code: 400, message:'Unsupported Command with Order Type', input:input}
            }
        }

        //CALCULATE ORDER QNTY AT LOWER PRICE !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        //Create a Limit Order
        function createLimitOrder(symbol,input) {
            const command = input.c
            const regXBT = new RegExp(/XBT$/s)
            const regAuto = new RegExp(/^auto$/s)
            const qntyXBT = regXBT.test(input.q) ? +input.q.split('XBT')[0] : regAuto.test(input.q) ? +getAutoQnty(0.01) : 0.0025
            const priceOffset = +input.p.split('%')[0]
            const tag = input.tag
            const symbolPrice = stream.latest.instruments[input.s].lastPrice

            if(command === 'S') {
                //GET TICKER LAST PRICE
                console.log("qntyXBT: ", qntyXBT)

                const offsetPrice = resolveDecimals(symbolPrice * (1 + (priceOffset / 100)),symbol) 
                const qntyUSD = resolveContracts(qntyXBT,symbol,offsetPrice)
                //SHORTING MEANS LIMIT ABOVE MARKET PRICE

                console.log('Current price: ',symbolPrice, " Offset: ", priceOffset, "% -  Calc Price: ", offsetPrice)

                //2. Create Limit Order
                trade.limitSellOrder(symbol,qntyUSD, offsetPrice).then(function (data) {
                    console.log('CCXT - Bitmex Sell Order Complete: ', new Date)
                    pushTagLimitTrades(tag,data,input)
                    return {code: 200, message:'Success Sell Limit Order', input:input}

                }).catch(e => {
                    //Send Server Error!
                    inactiveList.push({
                        'username': alias,
                        'action': 'creatLimitOrder[1]',
                        'input': input,
                        'error':e
                    })
                    console.log("[2] Failed to submit Limit Order: ",e)
                    return {code: 500, message:'Unable to process trade', input:input, e:e}
                })
            } else if (command === 'B') {
                //GET TICKER LAST PRICE
                console.log("qntyXBT: ", qntyXBT)

                const offsetPrice = resolveDecimals(symbolPrice * (1 - (priceOffset / 100)),symbol) 
                const qntyUSD = resolveContracts(qntyXBT,symbol,offsetPrice)
                //BUY MEANS LIMIT BELOW MARKET PRICE

                console.log('Current price: ',symbolPrice, " Offset: ", priceOffset, "% -  Calc Price: ", offsetPrice)

                //2. Create Limit Order
                console.log(symbol,qntyUSD,offsetPrice)
                trade.limitBuyOrder(symbol,qntyUSD, offsetPrice).then(function (data) {
                    console.log('CCXT - Bitmex Buy Order Complete: ', new Date)
                    pushTagLimitTrades(tag,data,input)
                    return {code: 200, message:'Success Buy Limit Order', input:input}

                }).catch(e => {
                    //Send Server Error!
                    inactiveList.push({
                        'username': alias,
                        'action': 'creatLimitOrder[1]',
                        'input': input,
                        'error':e
                    })
                    console.log("[1] Failed to submit Limit Order: ",e)
                    return {code: 500, message:'Unable to process trade', input:input, e:e}
                })
            } else {
                inactiveList.push({
                    'username': alias,
                    'action': 'creatLimitOrder[1]',
                    'input': input,
                    'error': 'unsupported command with order type'
                })
                return {code: 400, message:'Unsupported Command with Order Type', input:input}
            }
        }

        //Create a Limit Order with TP (Additional Limit Order of Opposite Side)
        function createLimitTPOrder(symbol,input) {
            const command = input.c
            const regXBT = new RegExp(/XBT$/s)
            const regAuto = new RegExp(/^auto$/s)
            const qntyXBT = regXBT.test(input.q) ? +input.q.split('XBT')[0] : regAuto.test(input.q) ? +getAutoQnty(0.01) : 0.0025
            const priceOffset = +input.p.split('%')[0]
            const tpValue = input.tp ? +input.tp.slice(0, -1) : +tp.slice(0, -1); // Handle if tp is passed or use parent scope
            const orderTag = input.tag || tag // Use input.tag if provided, otherwise use parent scope tag
            const symbolPrice = stream.latest.instruments[input.s].lastPrice

            if(command === 'S') {
                //GET TICKER LAST PRICE
                console.log("qntyXBT: ", qntyXBT)
                const offsetPrice = resolveDecimals(symbolPrice * (1 + (priceOffset / 100)),symbol) 
                //SHORTING MEANS LIMIT ABOVE MARKET PRICE

                const qntyUSD = resolveContracts(qntyXBT,symbol,offsetPrice)

                console.log('Current price: ',symbolPrice, " Offset: ", priceOffset, "% -  Calc Price: ", offsetPrice)
                console.log('Sell Limit USD Qnty:',qntyUSD)

                //2. Create Limit Order
                trade.limitSellOrder(symbol,qntyUSD, offsetPrice).then(async function (data) {
                    console.log('CCXT - Bitmex Sell Order Complete: ', new Date)
                    console.log('CCXT - Bitmex executing addition limit order tp...: ', new Date)
                    
                    //LIMIT ORDER SUCCESS CONTINUE LIMIT ORDER
                    //Calculate TP (price * tp%) = limit order price
                    
                    //3. Current price!
                    let orderPrice = symbolPrice
                    
                    //4. Calculate TP based on Entry Price
                    const tp_price = (orderPrice * ((100 - parseFloat(tp))/100))
                    
                    //5. Fix Decimals
                    const entryPrice = resolveDecimals(tp_price, symbol)

                    //Push both limit trades, first one now in case tp fails
                    pushTagLimitTrades(tag,data,input)

                    //6. Opposite Side Trade Limit Order - Has to be a POST order
                    trade.limitBuyOrder(symbol,qntyUSD,entryPrice, {}).then(function (data_limit){
                        console.log('CCXT - Bitmex Buy Limit Order (TP) Complete: ', new Date)
                        //7. Success - Send OK from Server 2 trades (limit+limit) success!
                        pushTagLimitTrades(orderTag,data_limit,input)
                        return {code: 200, message:'Success Sell Limit Order & Buy Limit Order', input:input}

                        //WHEN LIMIT ORDER FAILS
                    }).catch(e => {
                        //Send Server Error!
                        inactiveList.push({
                            'username': alias,
                            'action': 'creatLimitTPOrder[2]',
                            'input': input,
                            'error':e
                        })
                        console.log("[2] Failed to submit Appended Limit Order: ",e)
                        return {code: 500, message:'Unable to process trade', input:input, e:e}
                    })
                    
                    //TICKER PRICE FETCH FAIL
                }).catch(e => {
                    inactiveList.push({
                        'username': alias,
                        'action': 'creatLimitTPOrder[1]',
                        'input': input,
                        'error':e
                    })
                    console.log("[1] Unable to fetch price to create order: ",e)
                })

            } else if (command === 'B') {
                //GET TICKER LAST PRICE
                console.log("qntyXBT: ", qntyXBT)
                let offsetPrice = resolveDecimals(symbolPrice * (1 - (priceOffset / 100)),symbol) 
                //LONGING MEANS LIMIT BELOW MARKET PRICE
                const qntyUSD = resolveContracts(qntyXBT,symbol,offsetPrice)

                console.log('Current price: ',symbolPrice, " Offset: ", priceOffset, "% -  Calc Price: ", offsetPrice)
                console.log('Buy Limit USD Qnty:',qntyUSD)

                //2. Create Limit Order
                trade.limitBuyOrder(symbol,qntyUSD, offsetPrice).then(async function (data) {
                    console.log('CCXT - Bitmex Buy Order Complete: ', new Date)
                    console.log('CCXT - Bitmex executing addition limit order tp...: ', new Date)
                    
                    //LIMIT ORDER SUCCESS CONTINUE LIMIT ORDER
                    //Calculate TP (price * tp%) = limit order price
                    
                    //3. Current price!
                    let orderPrice = symbolPrice
                    
                    //4. Calculate TP based on Entry Price
                    const tp_price = (orderPrice * ((100 + parseFloat(tp))/100))
                    
                    //5. Fix Decimals
                    const entryPrice = resolveDecimals(tp_price, symbol)

                    //Push both limit trades, first one now in case tp fails
                    pushTagLimitTrades(tag,data,input)

                    //6. Opposite Side Trade Limit Order - Has to be a POST order
                    trade.limitSellOrder(symbol,qntyUSD,entryPrice, {}).then(function (data_limit){
                        console.log('CCXT - Bitmex Sell Limit Order (TP) Complete: ', new Date)
                        //7. Success - Send OK from Server 2 trades (limit+limit) success!
                        pushTagLimitTrades(orderTag,data_limit,input)
                        return {code: 200, message:'Success Buy Limit Order && Sell Limit Order', input:input}

                        //WHEN LIMIT ORDER FAILS
                    }).catch(e => {
                        //Send Server Error!
                        inactiveList.push({
                            'username': alias,
                            'action': 'creatLimitTPOrder[2]',
                            'input': input,
                            'error':e
                        })
                        console.log("[2] Failed to submit Appended Limit Order: ",e)
                        return {code: 500, message:'Unable to process trade', input:input, e:e}
                    })  
                    //IF FIRST TRADE FAILS (MARKET ORDER)
                }).catch(e => {
                    //Send Server Error!
                    inactiveList.push({
                        'username': alias,
                        'action': 'creatLimitTPOrder[1]',
                        'input': input,
                        'error':e
                    })
                    console.log("[1] Failed to submit Limit Order: ",e)
                    return {code: 500, message:'Unable to process trade', input:input, e:e}
                })

            } else {
                inactiveList.push({
                    'username': alias,
                    'action': 'creatLimitTPOrder[1]',
                    'input': input,
                    'error':'unsupported command with order type'
                })
                return {code: 400, message:'Unsupported Command with Order Type', input:input}
            }
        }

        //Function to close trades on a certain tag & side
        async function closeTagTrades(tag, side) {
            const sideCode = side === 'sell' ? 'S' : 'B'

            try {
                const result = await Trades_Opened.deleteMany({
                    tag: tag,
                    side: sideCode
                })

                if (result.deletedCount > 0) {
                    console.log(`✅ Closed ${result.deletedCount} ${sideCode === 'B' ? 'buy' : 'sell'} trades for tag: ${tag}`)
                } else {
                    console.log('No trades found to close for tag: ', tag)
                }

                return result.deletedCount
            } catch (error) {
                console.error('Error closing trades:', error)
                return 0
            }
        }

        function clearTriggerTag(tag) {
            Trigger_Orders.deleteMany({tag: tag}).lean().then(d=> {
                console.log(`Deleted all pending Trigger Orders for tag ${tag}: `,d)
            })
        }

        //<---------------------END----------------------->

        // Validate symbol based on market type
        const marketType = getMarketType(command)
        if (marketType === 'spot' && !isValidSpotSymbol(symbol)) {
            console.log(`❌ Invalid spot symbol: ${symbol}`)
            mainLog.print('Validation', `Invalid spot symbol for spot command: ${symbol}`)
            return sendJSON(res, 400, `Invalid spot symbol. Must be one of: BTC/USDT, ETH/USDT, SOL/USDT, XRP/USDT, etc.`, {}, null)
        }
        if (marketType === 'futures' && !isValidPerpetualSymbol(symbol)) {
            console.log(`❌ Invalid perpetual futures symbol: ${symbol}`)
            mainLog.print('Validation', `Invalid perpetual symbol for futures command: ${symbol}`)
            return sendJSON(res, 400, `Invalid perpetual futures symbol. Must be one of: BTC/USDT:USDT, ETH/USDT:USDT, SOL/USDT:USDT, XRP/USDT:USDT, etc.`, {}, null)
        }
        console.log('✅ Symbol validation passed for', marketType, 'market')

        //Call appropiate function based on post parameters, Market or Limit => Buy or Sell => With or Without TP.
        console.log('\n🔀 Entering main switch statement')
        console.log('   Type:', type)
        console.log('   Command:', command)
        console.log('   TP:', tp)

        switch(type) {
            case 'M':
                console.log('   ➡️  Market Order Path')
                //DO
                switch(command) {
                    case 'B':
                        //Market Buy
                        if(tp !== '0%') {
                            //HAS TP? Add Create Limit Order Sell
                            console.log('   ➡️  Market Buy WITH TP')
                            mainLog.print(`Trade:${alias}`,"M-B-TP")
                            return createMarketTPOrder(symbol,input)
                        } else {
                            //NO TP - Only Market Order Buy
                            console.log('   ➡️  Market Buy WITHOUT TP')
                            mainLog.print(`Trade:${alias}`,"M-B-TP0")
                            return createMarketOrder(symbol,input)
                        }

                    case 'S':
                        //Market Sell
                        if(tp !== '0%') {
                            //HAS TP? Add Create Limit Order Buy
                            console.log('   ➡️  Market Sell WITH TP')
                            mainLog.print(`Trade:${alias}`,"M-S-TP")
                            return createMarketTPOrder(symbol,input)
                        } else {
                            //NO TP - Only Market Order Sell
                            console.log('   ➡️  Market Sell WITHOUT TP')
                            mainLog.print(`Trade:${alias}`,"M-S-TP0")
                            return createMarketOrder(symbol,input)
                        }

                    case 'BT':
                        //Market Buy Trigger Order
                        if(tp !== '0%' && p === '0%' || p === null) {
                            mainLog.print(`Trade:${alias}`,"M-BT-TP")
                            return createMarketTriggerOrderTP(symbol,input)
                        } else if(p !== '0%' && tp === '0%' || tp === null) {
                            //NO TP - Only create trigger price (basically a hidden limit buy order that market buys when price reaches > | <)
                            mainLog.print(`Trade:${alias}`,"M-BT-TP0-P")
                            return createMarketTriggerOrderP(symbol,input)
                        }

                    case 'ST':
                        //Market Sell Trigger Order
                        if(tp !== '0%' && p === '0%' || p === null) {
                            //HAS TP? Create Market Order with Trigger TP
                            mainLog.print(`Trade:${alias}`,"M-ST-TP")
                            return createMarketTriggerOrderTP(symbol,input)
                        } else if(p !== '0%' && tp === '0%' || tp === null) {
                            //NO TP - Only create trigger price (basically a hidden limit sell order that market buys when price reaches > | <)
                            mainLog.print(`Trade:${alias}`,"M-ST-TP0-P")
                            return createMarketTriggerOrderP(symbol,input)
                        }

                    case 'CB':
                        //Market Close Buy (spot)
                        //Q=percentage (e.g., "50%")
                        mainLog.print(`Trade:${alias}`,"M-CB")
                        return createMarketOrder(symbol, input)
                    case 'CS':
                        //Market Close Sell (spot)
                        //Q=percentage (e.g., "50%")
                        mainLog.print(`Trade:${alias}`,"M-CS")
                        return createMarketOrder(symbol, input)

                    case 'LF':
                        //Market Long Futures
                        if(tp !== '0%') {
                            console.log('   ➡️  Market Long Futures WITH TP')
                            mainLog.print(`Trade:${alias}`,"M-LF-TP")
                            return createMarketTPOrder(symbol,input)
                        } else {
                            console.log('   ➡️  Market Long Futures WITHOUT TP')
                            mainLog.print(`Trade:${alias}`,"M-LF-TP0")
                            return createMarketOrder(symbol,input)
                        }

                    case 'SF':
                        //Market Short Futures
                        if(tp !== '0%') {
                            console.log('   ➡️  Market Short Futures WITH TP')
                            mainLog.print(`Trade:${alias}`,"M-SF-TP")
                            return createMarketTPOrder(symbol,input)
                        } else {
                            console.log('   ➡️  Market Short Futures WITHOUT TP')
                            mainLog.print(`Trade:${alias}`,"M-SF-TP0")
                            return createMarketOrder(symbol,input)
                        }

                    case 'CLF':
                        //Market Close Long Futures
                        //Q=percentage (e.g., "50%")
                        mainLog.print(`Trade:${alias}`,"M-CLF")
                        return createMarketOrder(symbol, input)

                    case 'CSF':
                        //Market Close Short Futures
                        //Q=percentage (e.g., "50%")
                        mainLog.print(`Trade:${alias}`,"M-CSF")
                        return createMarketOrder(symbol, input)

                    case 'FLF':
                        //Flip Long to Short
                        mainLog.print(`Trade:${alias}`,"M-FLF")
                        return createMarketOrder(symbol, input)

                    case 'FSF':
                        //Flip Short to Long
                        mainLog.print(`Trade:${alias}`,"M-FSF")
                        return createMarketOrder(symbol, input)
                }
                break;
            case 'L':
                //DO
                switch(command) {
                    case 'B':
                        //Limit Order Buy
                        if(tp !== '0%') {
                            //HAS TP? Add Create Limit Order Sell
                            mainLog.print(`Trade:${alias}`,"L-B-TP")
                            return createLimitTPOrder(symbol,input)
                        } else {
                            //NO TP - Only Limit Order Buy
                            mainLog.print(`Trade:${alias}`,"L-B-TP0")
                            return createLimitOrder(symbol,input)
                        }
                    case 'S':
                        //Limit Order Sell
                        if(tp !== '0%') {
                            //HAS TP? Add Create Limit Order Buy
                            mainLog.print(`Trade:${alias}`,"L-S-TP")
                            return createLimitTPOrder(symbol,input)
                        } else {
                            //NO TP - Only Limit Order Sell
                            mainLog.print(`Trade:${alias}`,"L-S-TP0")
                            return createLimitOrder(symbol,input)
                        }
                    case 'LF':
                        //Limit Order Long Futures
                        if(tp !== '0%') {
                            mainLog.print(`Trade:${alias}`,"L-LF-TP")
                            return createLimitTPOrder(symbol,input)
                        } else {
                            mainLog.print(`Trade:${alias}`,"L-LF-TP0")
                            return createLimitOrder(symbol,input)
                        }
                    case 'SF':
                        //Limit Order Short Futures
                        if(tp !== '0%') {
                            mainLog.print(`Trade:${alias}`,"L-SF-TP")
                            return createLimitTPOrder(symbol,input)
                        } else {
                            mainLog.print(`Trade:${alias}`,"L-SF-TP0")
                            return createLimitOrder(symbol,input)
                        }
                    default:
                        //Not Supported command with Order Type!
                        mainLog.print(`Trade:${alias}`,'Unsupported command with order type!')
                        break;
                }
                break;
            default:
                console.log('   ⚠️  Order Type not supported!')
                mainLog.print(`Trade:${alias}`,'Order Type not supported!')
                break;
        }
        console.log('========== CREATE TRADE END ==========\n')
    }

    clearLimitOrders = function(tag,alias) {
        let ccxt = users[alias]['ccxt']

        let tagIndex = 0
        const tagOrders = tpOrders.filter((tagObj, index) => {
            tagIndex = index
            return tagObj.tag === tag
        })
        console.log('tpOrders',tpOrders)
        if(tagOrders.length < 1) return console.log(tagOrders)
        const tagBuysAlias = tagOrders[0].pendingTrades[0].filter(trade => trade.alias === alias)
        const tagSellsAlias = tagOrders[0].pendingTrades[1].filter(trade => trade.alias === alias)

        const tagBuyIds = tagBuysAlias.map(trade => trade.data.id)
        const tagSellIds = tagSellsAlias.map(trade => trade.data.id)
        const tagIds = [...tagBuyIds, ...tagSellIds]

        console.log("BuysIds:",tagIds)

        const orders = streamPrivate.latest.order[alias]
        const limitOrdersUnfilled = orders.filter(o=>tagIds.includes(o.orderID))

        // console.log('Limit Unfilled: ', limitOrdersUnfilled.length)
        // console.log('Total Orders: ', orders.length)

        limitOrdersUnfilled.forEach(trade => {
            console.log('Canceling order with id: ',trade.orderID)
            ccxt.cancelOrder(trade.orderID)
            tpOrders[tagIndex]['pendingTrades'][0].map((d, index) => {
                d.alias == alias ? tpOrders[tagIndex]['pendingTrades'][0].splice(index,1) : ''
            })
            tpOrders[tagIndex]['pendingTrades'][1].map((d, index) => {
                d.alias == alias ? tpOrders[tagIndex]['pendingTrades'][0].splice(index,1) : ''
            })
        })
    }
}

//Start Application
(async function start() {
    //1. start the Express Server
    const app = await express.init()
    await MongoDB.database.then(console.log('Mongoose Connected!'))

    //2. Start Stream
    await stream.init()
    // await streamPrivate.startWebSocketMD()
    // await streamPrivate.checkLoaded().then(console.log('checkLoaded: true'))
    
    async function initCCXTUsers() {
        console.log('\n🔄 ========== INITIALIZING CCXT USERS ==========')
        return new Promise((resolve, reject) => {
            let usersProcessed = 0;

            console.log('📊 Querying database for users...')
            User.find({}, (err,dbUsers) => {
                console.log(`📋 Total users in database: ${dbUsers ? dbUsers.length : 0}`)
                
                if(err) {
                    console.log('❌ Database error:', err)
                    reject(err)
                    return
                }
                
                console.log('🔍 Filtering users with API keys...')
                console.log('🔍 Checking for API keys in both top-level and nested api object...')
                const gotAPI = dbUsers.filter(u => {
                    const hasTopLevel = u.apiKey && u.apiSecret
                    const hasNested = u.api && u.api.apiKey && u.api.apiSecret
                    console.log(`   User ${u.username}: top-level=${hasTopLevel}, nested=${hasNested}`)
                    return hasTopLevel || hasNested
                })
                console.log(`✅ Users WITH API keys: ${gotAPI.length}`)
                console.log(`⚠️  Users WITHOUT API keys: ${dbUsers.length - gotAPI.length}`)
                
                if(gotAPI.length < 1) {
                    console.log('⚠️  No users with API keys found!')
                    resolve('No users were found, initialization complete.')
                    return
                }
                
                console.log('\n👥 Processing users with API keys:')
                gotAPI.forEach((user, index) => {
                    console.log(`\n🔸 User ${index + 1}/${gotAPI.length}: ${user.username}`)
                    console.log(`   Email: ${user.email}`)
                    console.log(`   Has API Key (top-level): ${user.apiKey ? 'Yes' : 'No'}`)
                    console.log(`   Has API Secret (top-level): ${user.apiSecret ? 'Yes' : 'No'}`)
                    console.log(`   Has API object: ${user.api ? 'Yes' : 'No'}`)
                    if(user.api) {
                        console.log(`   Has API Key (nested): ${user.api.apiKey ? 'Yes' : 'No'}`)
                        console.log(`   Has API Secret (nested): ${user.api.apiSecret ? 'Yes' : 'No'}`)
                    }
                })
                
                console.log('\n🔧 Creating CCXT instances...')
                gotAPI.forEach(async user => {
                        let uBal = -1;
                        console.log(`\n📝 Setting up user: ${user.username}`)
                        
                        // Get API keys from either top-level or nested api object
                        const apiKey = user.apiKey || (user.api && user.api.apiKey)
                        const apiSecret = user.apiSecret || (user.api && user.api.apiSecret)
                        
                        console.log(`   🔑 API Key source: ${user.apiKey ? 'top-level' : 'nested api object'}`)
                        console.log(`   🔑 API Key found: ${apiKey ? 'Yes' : 'No'}`)
                        console.log(`   🔑 API Secret found: ${apiSecret ? 'Yes' : 'No'}`)
                        
                        users[user.username] = {
                            name: user.username,
                            apiKey: apiKey,
                            apiSecret: apiSecret,
                            ccxt: null
                        }
                        console.log(`   ✅ User object created in memory`)

                        try {
                            console.log(`   💰 Fetching wallet balance for ${user.username}...`)

                            let btcBalance = 0
                            let usdtBalance = 0

                            // Check if WebSocket data exists
                            if (streamPrivate['latest']['margin'] &&
                                streamPrivate['latest']['margin'][user.username] &&
                                streamPrivate['latest']['margin'][user.username][0]) {
                                btcBalance = streamPrivate['latest']['margin'][user.username][0]['walletBalance'] / 100000000
                                console.log(`   💰 Wallet Balance (from WS): ${btcBalance} BTC`)
                                uBal = btcBalance
                            } else {
                                console.log(`   ⚠️  WebSocket margin data not available, fetching via CCXT...`)
                                // Create temporary CCXT instance to fetch balance
                                const tempCCXT = new CreateCCXT(apiKey, apiSecret, user.username)
                                await tempCCXT.init()
                                const balance = await tempCCXT.balance()
                                
                                // Check for BTC or USDT balance
                                btcBalance = balance.BTC ? balance.BTC.total : 0
                                usdtBalance = balance.USDT ? balance.USDT.total : 0
                                
                                console.log(`   💰 Wallet Balance (from CCXT):`)
                                console.log(`      BTC: ${btcBalance}`)
                                console.log(`      USDT: ${usdtBalance}`)
                                
                                // Use BTC balance for backward compatibility
                                uBal = btcBalance
                            }

                            // Check if user has sufficient balance (BTC > 0.001 OR USDT > 10)
                            const hasSufficientBalance = btcBalance > 0.001 || usdtBalance > 10
                            
                            if(hasSufficientBalance) {
                                console.log(`   ✅ Balance sufficient (BTC: ${btcBalance}, USDT: ${usdtBalance})`)
                                ccxtLog.print('BALANCE_OK',`${user.username} has sufficient balance - adding to CCXT!`)
                                console.log(`   🔧 Creating CCXT instance...`)
                                users[user.username]['ccxt'] = new CreateCCXT(apiKey, apiSecret, user.username)
                                await users[user.username]['ccxt'].init()
                                    .then(()=> {
                                        usersProcessed++
                                        console.log(`   ✅ CCXT initialized successfully`)
                                    })
                                    .catch(e => {
                                        console.log(`   ❌ CCXT initialization failed:`, e)
                                        reject(user.username,'Failed to load ccxt:',e)
                                    })
                                let isLoaded = usersProcessed === gotAPI.length
                                ccxtLog.print('Initializing',`${usersProcessed} CCXT user(s) loaded and initialized... - isLoaded: ${isLoaded}`)
    
                            } else {
                                console.log(`   ⚠️  Balance too low (BTC: ${btcBalance} < 0.001, USDT: ${usdtBalance} < 10) - skipping`)
                                ccxtLog.print('BALANCE_LOW',`${user.username} has insufficient balance - skipping.`)
                                usersProcessed++;
                            }
                        } catch(e) {
                            console.log(`   ❌ Error processing user ${user.username}:`, e)
                            usersProcessed++;
                            if (users[user.username]) {
                                delete users[user.username]
                                console.log(`   🗑️  Removed user ${user.username} from users object to prevent ccxt errors!`)
                            }
                        }

                        if(usersProcessed===gotAPI.length) {
                            console.log(`\n✅ All users processed (${usersProcessed}/${gotAPI.length})`)
                            console.log('🔄 ========== CCXT INITIALIZATION COMPLETE ==========\n')
                            resolve('all ccxt initialized')
                        }
                })
            }).lean()
        })
    }

    async function processTriggerOrders(users) {
        const instruments = stream.latest.instruments
        const isTrigger = (currPrice, triggPrice, side) => {
            if(side === 'S') {
                return currPrice >= triggPrice
            } else if (side === 'B') {
                return currPrice <= triggPrice
            } else {
                console.log('Invalid Side isTrigger: ',side)
                return false
            }
        }
        const resolveSymbol = (symbol) => {            
            switch(symbol) {
                case 'XBTUSD':
                    return 'BTC/USD'
                case 'XRPUSD':
                    return 'XRP/USD'
                case 'ETHUSD':
                    return 'ETH/USD'
                case 'LTCUSD':
                    return 'LTC/USD'
                case 'BCHUSD':
                    return 'BCH/USD'
                default:
                    return 'BTC/USD'
            }
        }
        const process = () => Trigger_Orders.find({}).lean().then(d => {
            d.forEach(order => {
                const lastPrice = instruments[order.symbol].lastPrice
                const isTriggerVal = isTrigger(lastPrice,order.price,order.side)
                // console.log(`Processing _id '${order._id}' (db_id) with openTradeID '${order.openTradeID}' (for tp)`)
                procOrdVerbose ? console.log(`Process _id '${order._id}' => ${order.symbol}:${order.side}:${order.price}`) : ''
                procOrdVerbose ? console.log(`Current price ${lastPrice} ${order.symbol} has triggered ${isTriggerVal}`) : ''
                procOrdVerbose ? console.log(isTriggerVal ? `Transmitting to CCXT! Removing from DB\n` : '\n') : ''

                if(isTriggerVal) {
                    let trade = users[order.account]['ccxt']
                    
                    Trigger_Orders.deleteOne({ _id: order._id})
                        .then(d=>console.log('Removed Trigger from TriggerOrders:',d))
                        .catch(e => console.log(e))

                    if(order.side === 'S') {
                        trade.marketSellOrder(resolveSymbol(order.symbol),order.contracts).then(d => {
                            console.log('CCXT - Bitmex Sell Order Complete: ', new Date)
                            TO_Processed.create({...order})
                                .then(d => console.log('Moved Trigger to Processed Collection: ',d))
                                .catch(e => console.log(e))
                        }).catch(e => {
                            TO_Processed.create({...order, status: 'Failed'})
                                .then(d => console.log('Moved Trigger to Processed Collection: ',d))
                                .catch(e => console.log(e))
                            console.log("Failed to create trade for TriggerOrder: ",e)
                        })
                    } else if (order.side === 'B') {
                        trade.marketBuyOrder(resolveSymbol(order.symbol),order.contracts).then(d => {
                            console.log('CCXT - Bitmex Buy Order Complete: ', new Date)
                            TO_Processed.create({...order})
                                .then(d => console.log('Moved Trigger to Processed Collection: ',d))
                                .catch(e => console.log(e))
                        }).catch(e => {
                            TO_Processed.create({...order, status: 'Failed'})
                                .then(d => console.log('Moved Trigger to Processed Collection: ',d))
                                .catch(e => console.log(e))
                            console.log("Failed to create trade for TriggerOrder: ",e)
                        })
                    }
                }
            })
        }).catch(e => console.log('Failed to process trigger orders: ',e))

        setInterval(process, 1000*15)
    }

    //3. Create ccxt instances for all users
    //4. Initialize main() to define trade functions, then init users
    await main(app)

    await initCCXTUsers()
        .then(() => {
            mainLog.print('Starting main app - users initialized!')
            mainLog.print('Starting Trigger Order Cycle!')
            processTriggerOrders(users)
        })
        .catch(e => {
            readFileLog.print(`${color.pick.red}FATAL${color.pick.end}`,`Error initializeUsers: ${e}`)
            readFileLog.print(`${color.pick.red}FATAL${color.pick.end}`,`DEFAULT REJECTING ALL TRADES BEFORE FIXED`)
        })

    //GET LINKS FROM EXPRESS
    //GET - React Index.js
    app.get('/', async function (req, res) {
        res.status(200).json({ status: 'ok', service: 'ccxt-bot' });
    })

    //POST routes now registered - main() was called above to define createTrade function
    app.post('/ccxt', async function (req, res) {
        console.log('\n🌐 ========== POST /ccxt RECEIVED ==========')
        const input = req.body;
        console.log('📨 Request Body:', JSON.stringify(input, null, 2))

        const errors = postSchema.validate(input)
        console.log('✔️  Validation Errors:', errors.length === 0 ? 'None' : errors)

        //VALIDATE INPUT
        if(errors.length == 0) {
            if(input.a === 'all') {
                console.log('🔄 Processing for ALL users')
                const keys = Object.keys(users)
                console.log('👥 User count:', keys.length)
                console.log('👥 Users:', keys)

                // Debug: Show full users object structure
                console.log('\n🔍 DEBUG: Users object structure:')
                keys.forEach(key => {
                    console.log(`   ${key}:`, {
                        name: users[key].name,
                        hasApiKey: !!users[key].apiKey,
                        hasApiSecret: !!users[key].apiSecret,
                        hasCCXT: !!users[key].ccxt,
                        ccxtType: users[key].ccxt ? typeof users[key].ccxt : 'null'
                    })
                })

                for(const key of keys) {
                    console.log(`\n🔸 Processing user: ${key}`)
                    let ccxt = users[key]['ccxt']
                    console.log(`   CCXT available: ${ccxt ? 'Yes' : 'No'}`)
                    if (!ccxt) {
                        console.log(`   ⚠️  User object exists but CCXT is null`)
                        console.log(`   ℹ️  This means CCXT initialization failed or balance was too low`)
                        console.log(`   ℹ️  Check server startup logs for initialization errors`)
                    }
                    createTrade(input,key, ccxt).then(d => {
                        console.log(`   ✅ CreateTrade completed for ${key}`)
                    }).catch(e => {
                        console.log(`   ❌ CreateTrade failed for ${key}:`, e)
                    })
                }
                sendJSON(res,200,'Success to process (all) orders',input)

            } else if(input.a !== 'all' && Object.keys(users).includes(input.a)) {
                console.log(`🔸 Processing for single user: ${input.a}`)
                let name = input.a
                let ccxt = users[name]['ccxt']
                console.log(`   CCXT available: ${ccxt ? 'Yes' : 'No'}`)
                createTrade(input,name,ccxt).then(d => {
                    console.log(`   ✅ CreateTrade completed for ${name}`)
                    sendJSON(res,200,'Success to process (single) order',input)
                }).catch(e => {
                    console.log(`   ❌ CreateTrade failed for ${name}:`, e)
                    sendJSON(res,500,'Failed to process order',input,e)
                })
            } else {
                console.log(`⚠️  User '${input.a}' not found in users list`)
                console.log('   Available users:', Object.keys(users))
                sendJSON(res,404,'User not found',input)
            }
        } else {
            //Validation contains errors
            console.log('❌ Validation failed!')
            validateLog.print('ERROR',`${errors}`)
            sendJSON(res,400,'Unable to create trade',input,errors)
        }
        console.log('🌐 ========== POST /ccxt END ==========\n')
    })

    app.post('/api/private/cancel', async function (req,res) {
        const {tag, alias} = req.body
        clearLimitOrders(tag, alias)
    })

    app.get('/health', async function (_req, res) {
        try {
            // Ping MongoDB to check connection
            await mongoose.connection.db.admin().ping();
            res.status(200).json({
                status: 'ok',
                service: 'ccxt-bot',
                timestamp: new Date().toISOString(),
                mongodb: 'connected'
            });
        } catch (error) {
            res.status(503).json({
                status: 'error',
                service: 'ccxt-bot',
                timestamp: new Date().toISOString(),
                mongodb: 'disconnected',
                error: error.message
            });
        }
    })

    //API LINKS
    app.get('/api/tagTrades', async function (req,res) {
        try {
            const trades = await Trades_Opened.find({}).sort({ created: -1 })

            // Group by tag for backwards compatibility with old format
            const tagTradesFormat = []
            const tagGroups = {}

            trades.forEach(trade => {
                if (!tagGroups[trade.tag]) {
                    tagGroups[trade.tag] = {
                        tag: trade.tag,
                        openTrades: [[], []] // [longs, shorts]
                    }
                }

                const tradeObj = {
                    alias: trade.alias,
                    symbol: trade.symbol,
                    orderId: trade.order_id,
                    price: trade.price,
                    contracts: trade.contracts,
                    opened: trade.opened
                }

                // Add to longs [0] or shorts [1]
                if (trade.side === 'B') {
                    tagGroups[trade.tag].openTrades[0].push(tradeObj)
                } else {
                    tagGroups[trade.tag].openTrades[1].push(tradeObj)
                }
            })

            // Convert to array format
            Object.values(tagGroups).forEach(group => {
                tagTradesFormat.push(group)
            })

            return res.json(tagTradesFormat)
        } catch (error) {
            console.error('Error fetching tagTrades:', error)
            return res.status(500).json({ error: 'Failed to fetch trades' })
        }
    })

    app.get('/api/tpOrders', async function (req,res) {
        return res.json(tpOrders)
    })

    // Get all open positions (aggregated view)
    app.get('/api/openPositions', async function (req, res) {
        try {
            const positions = await Positions_Open.find({}).sort({ last_updated: -1 })
            return res.json(positions)
        } catch (error) {
            console.error('Error fetching open positions:', error)
            return res.status(500).json({ error: 'Failed to fetch open positions' })
        }
    })

    // Get specific position by tag
    app.get('/api/openPositions/:tag', async function (req, res) {
        try {
            const position = await Positions_Open.findOne({ tag: req.params.tag })
            if (!position) {
                return res.status(404).json({ error: 'Position not found' })
            }
            return res.json(position)
        } catch (error) {
            console.error('Error fetching position:', error)
            return res.status(500).json({ error: 'Failed to fetch position' })
        }
    })

    // Get closed trades history
    app.get('/api/closedTrades', async function (req, res) {
        try {
            const limit = parseInt(req.query.limit) || 100
            const closes = await Trades_Closed.find({})
                .sort({ closed_at: -1 })
                .limit(limit)
            return res.json(closes)
        } catch (error) {
            console.error('Error fetching closed trades:', error)
            return res.status(500).json({ error: 'Failed to fetch closed trades' })
        }
    })

    // Get closed trades for specific tag
    app.get('/api/closedTrades/:tag', async function (req, res) {
        try {
            const closes = await Trades_Closed.find({ tag: req.params.tag })
                .sort({ closed_at: -1 })
            return res.json(closes)
        } catch (error) {
            console.error('Error fetching closed trades for tag:', error)
            return res.status(500).json({ error: 'Failed to fetch closed trades' })
        }
    })

    // Calculate total P&L for a tag
    app.get('/api/pnl/:tag', async function (req, res) {
        try {
            const closes = await Trades_Closed.find({ tag: req.params.tag })
            const totalPnl = closes.reduce((sum, close) => sum + (close.pnl || 0), 0)
            const totalPnlPercentage = closes.reduce((sum, close) => sum + (close.pnl_percentage || 0), 0)

            return res.json({
                tag: req.params.tag,
                total_pnl: totalPnl,
                total_pnl_percentage: totalPnlPercentage,
                close_count: closes.length,
                closes: closes
            })
        } catch (error) {
            console.error('Error calculating P&L:', error)
            return res.status(500).json({ error: 'Failed to calculate P&L' })
        }
    })

    // Get user positions directly from CCXT (bypasses WebSocket)
    app.get('/api/positions/:username', async function (req, res) {
        const username = req.params.username
        console.log(`\n📊 GET /api/positions/${username}`)
        
        try {
            // Check if user exists in users object
            if (!users[username]) {
                console.log(`   ❌ User ${username} not found in users object`)
                return res.status(404).json({
                    error: 'User not found',
                    message: `User ${username} does not exist or CCXT not initialized`
                })
            }
            
            // Check if CCXT instance exists
            if (!users[username].ccxt) {
                console.log(`   ❌ CCXT not initialized for ${username}`)
                return res.status(503).json({
                    error: 'CCXT not available',
                    message: `CCXT instance not initialized for user ${username}. Check balance requirements.`
                })
            }
            
            console.log(`   ✅ Fetching data for ${username}...`)
            const ccxt = users[username].ccxt
            
            // Fetch balance
            const balance = await ccxt.balance()
            console.log(`   ✅ Balance fetched successfully`)
            
            // Fetch positions using the new positions method
            const positionsData = await ccxt.positions()
            console.log(`   ✅ Positions data fetched`)
            console.log(`   🔍 Positions data type:`, typeof positionsData)
            console.log(`   🔍 Is array:`, Array.isArray(positionsData))
            
            // The response is an array of position objects
            const positions = Array.isArray(positionsData) ? positionsData : []
            console.log(`   ✅ Total positions: ${positions.length}`)
            
            // Filter for active positions (non-zero quantity)
            const activePositions = positions.filter(p => p.currentQty && p.currentQty !== 0)
            console.log(`   ✅ Active positions (currentQty !== 0): ${activePositions.length}`)
            
            // Fetch open orders
            const openOrders = await ccxt.openOrders()
            console.log(`   ✅ Open orders fetched: ${openOrders.length}`)
            
            return res.json({
                username: username,
                timestamp: new Date().toISOString(),
                balance: {
                    BTC: balance.BTC,
                    USDT: balance.USDT,
                    total: balance.total
                },
                positions: activePositions,
                openOrders: openOrders,
                summary: {
                    totalPositions: activePositions.length,
                    totalOrders: openOrders.length
                }
            })
            
        } catch (error) {
            console.log(`   ❌ Error fetching positions:`, error.message)
            return res.status(500).json({
                error: 'Failed to fetch positions',
                message: error.message
            })
        }
    })

    // Debug endpoint - catches and logs all requests
    app.all('/api/debug/*', async function (req, res) {
        console.log('\n🔍 ========== DEBUG REQUEST ==========')
        console.log('📍 Method:', req.method)
        console.log('📍 URL:', req.url)
        console.log('📍 Path:', req.path)
        console.log('📍 Query:', JSON.stringify(req.query, null, 2))
        console.log('📍 Headers:', JSON.stringify(req.headers, null, 2))
        console.log('📍 Body:', JSON.stringify(req.body, null, 2))
        console.log('📍 Params:', JSON.stringify(req.params, null, 2))
        console.log('🔍 ====================================\n')
        
        return res.json({
            message: 'Debug endpoint - request logged to console',
            request: {
                method: req.method,
                url: req.url,
                path: req.path,
                query: req.query,
                headers: req.headers,
                body: req.body,
                params: req.params
            }
        })
    })

    app.get('/api/latest/public', async function (req,res) {
        return res.json(stream.latest)
    })

    app.get('/api/latest/private', async function (req,res) {
        const { authorization } = req.headers
        // console.log(req.headers)

        if(authorization !== '') {
            // console.log('Received Token in Headers: ',authorization)
            User.findOne({ _id: authorization, isAdmin: true }).then(d => {
                if(d) {
                    return res.json(streamPrivate.latest)
                } else {
                    return res.json({
                        statusCode: 403,
                        message: 'Not authorized'
                    })
                }
            })
        } else {
            console.log('No token provided')
            return res.json({
                statusCode: 403,
                message: 'No token provided'
            })
        }
        
    })

    app.get('/api/latest/private/:id', async function (req,res) {
        const { authorization } = req.headers

        User.findOne({ _id: authorization }).then(d => {
            console.log('Database Response: ',d.username)
            const username = d.username
            const latest = streamPrivate.latest

            if(d) {
                const response = {
                    // user: latest['users'].filter(u=>Object.keys(u)==username),
                    affiliate: latest['affiliate'][username],
                    execution: latest['execution'][username],
                    order: latest['order'][username],
                    margin: latest['margin'][username],
                    position: latest['position'][username],
                    transact: latest['transact'][username],
                    wallet: latest['wallet'][username]
                }
                return res.json(response)
            } else {
                return res.json({
                    statusCode: 403,
                    message: 'Not authorized'
                })
            }
        })

        if(authorization !== '') {
            // console.log('Received Token in Headers: ',authorization)
            
        } else {
            console.log('No token provided')
            return res.json({
                statusCode: 403,
                message: 'No token provided'
            })
        }
    })

    app.get('/api/latest/private/trigger/active/:account', async function (req,res) {
        var account = req.params.account;
        Trigger_Orders.find({account: account})
            .lean()
            .then(data => {
                if(data) { 
                    return res.status(200).json(data) 
                } else {
                    return res.status(404).json({message: 'No data for user'})
                }
            })
            .catch(e => {
                return res.status(500).json({ message: 'Server Error', error: e })
            })
        
    })

    app.get('/api/latest/private/trigger/complete/:account', async function (req,res) {
        var account = req.params.account;
        TO_Processed.find({account: account})
            .lean()
            .then(data => {
                if(data) { 
                    return res.status(200).json(data) 
                } else {
                    return res.status(404).json({message: 'No data for user'})
                }
            })
            .catch(e => {
                return res.status(500).json({ message: 'Server Error', error: e })
            })
        
    })

    app.post('/register', async function(req,res) {
        const {email,username,password,apiKey,secretKey} = req.body
        User.create({
            email,
            username,
            password,
            apiKey,
            secretKey
        }).then(d => {
            console.log('Created User: ',req.body)
            res.json({
                statusCode: 200,
                payload: req.body
            })
        }).catch(e => {
            res.json({
                statusCode: 501,
                message: 'Username already exists' 
            })
        })
    })

    app.post('/login', async function(req,res){
        const { username, password } = req.body
        console.log(req.body)
        User.findOne({
            username,
            password
        }).then(d => {
                if(d) {
                    console.log('Found username with password:',username)
                    res.json({
                        statusCode: 200,
                        valid: true,
                        token: d._id
                    })
                } else {
                    console.log('Found username with wrong password',username)
                    res.json({
                        statusCode: 401,
                        valid: false
                    })
                }
            })
            .catch(e => { 
                console.log('/login Error: ',e)
                res.json({
                    statusCode: 500
                })
            })

    })
    
    //Start the Express server on PORT (in production has to be forwarded to port 80 for TradingView to POST on Webhook!)
    const listener = app.listen(process.env.PORT || 3000, function () {
        console.log('Using port: '+process.env.PORT)
        expressLog.print(`${color.pick.green}LISTENING${color.pick.end}`,`Listening for calls on port:${listener.address().port}!`)
    })

    // WebSocket servers with manual upgrade handling
    const positionsWss = new WebSocket.Server({ noServer: true })
    const logsWss = new WebSocket.Server({ noServer: true })
    const positionsLog = new Logger('Positions WS', color.pick.cyan)
    const logsLog = new Logger('Logs WS', color.pick.green)
    const logBuffer = require('./utils/logBuffer')

    // Handle upgrade requests and route to correct WebSocket server
    listener.on('upgrade', (request, socket, head) => {
        const pathname = request.url

        if (pathname === '/positions-ws') {
            positionsWss.handleUpgrade(request, socket, head, (ws) => {
                positionsWss.emit('connection', ws, request)
            })
        } else if (pathname === '/logs-ws') {
            logsWss.handleUpgrade(request, socket, head, (ws) => {
                logsWss.emit('connection', ws, request)
            })
        } else {
            socket.destroy()
        }
    })

    positionsLog.print('Init', 'WebSocket server created on /positions-ws')
    logsLog.print('Init', 'WebSocket server created on /logs-ws')

    // Broadcast positions to all connected clients
    async function broadcastPositions() {
        if (positionsWss.clients.size === 0) return

        try {
            const positions = await Positions_Open.find({}).sort({ last_updated: -1 }).lean()

            // Collect account balances from streamPrivate
            const balances = {}
            positionsLog.print('Debug', `streamPrivate.latest.margin exists: ${!!streamPrivate.latest.margin}`)
            if (streamPrivate.latest.margin) {
                const usernames = Object.keys(streamPrivate.latest.margin)
                positionsLog.print('Debug', `Found ${usernames.length} users in margin data: ${usernames.join(', ')}`)
                Object.keys(streamPrivate.latest.margin).forEach(username => {
                    const marginData = streamPrivate.latest.margin[username]
                    if (marginData && marginData[0]) {
                        balances[username] = {
                            walletBalance: marginData[0].walletBalance ? marginData[0].walletBalance / 100000000 : 0,
                            marginBalance: marginData[0].marginBalance ? marginData[0].marginBalance / 100000000 : 0,
                            availableMargin: marginData[0].availableMargin ? marginData[0].availableMargin / 100000000 : 0
                        }
                        positionsLog.print('Debug', `Added balance for ${username}: ${JSON.stringify(balances[username])}`)
                    }
                })
            }
            positionsLog.print('Debug', `Total balances collected: ${Object.keys(balances).length}`)

            const message = JSON.stringify({
                positions: positions,
                balances: balances
            })

            positionsWss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(message)
                }
            })
        } catch (e) {
            positionsLog.print('Error', `Failed to broadcast: ${e.message}`)
        }
    }

    // Handle new WebSocket connections
    positionsWss.on('connection', async (ws) => {
        positionsLog.print('Connect', `Client connected (total: ${positionsWss.clients.size})`)

        // Send initial positions and balances
        try {
            const positions = await Positions_Open.find({}).sort({ last_updated: -1 }).lean()

            // Collect account balances
            const balances = {}
            if (streamPrivate.latest.margin) {
                Object.keys(streamPrivate.latest.margin).forEach(username => {
                    const marginData = streamPrivate.latest.margin[username]
                    if (marginData && marginData[0]) {
                        balances[username] = {
                            walletBalance: marginData[0].walletBalance ? marginData[0].walletBalance / 100000000 : 0,
                            marginBalance: marginData[0].marginBalance ? marginData[0].marginBalance / 100000000 : 0,
                            availableMargin: marginData[0].availableMargin ? marginData[0].availableMargin / 100000000 : 0
                        }
                    }
                })
            }

            ws.send(JSON.stringify({
                positions: positions,
                balances: balances
            }))
        } catch (e) {
            positionsLog.print('Error', `Failed to send initial data: ${e.message}`)
        }

        ws.on('close', () => {
            positionsLog.print('Disconnect', `Client disconnected (total: ${positionsWss.clients.size})`)
        })
    })

    // MongoDB change stream for real-time updates
    const changeStream = Positions_Open.watch()
    positionsLog.print('Init', 'MongoDB change stream started')

    changeStream.on('change', (change) => {
        positionsLog.print('Change', `Detected: ${change.operationType}`)
        broadcastPositions()
    })

    changeStream.on('error', (error) => {
        positionsLog.print('Error', `Change stream error: ${error.message}`)
    })

    // ========== LOG STREAMING WEBSOCKET ==========
    logsWss.on('connection', (ws) => {
        logsLog.print('Connect', `Client connected (total: ${logsWss.clients.size})`);

        // Send log history to new client
        try {
            const history = logBuffer.getHistory();
            ws.send(JSON.stringify({
                type: 'history',
                logs: history
            }));
            logsLog.print('History', `Sent ${history.length} historical logs to client`);
        } catch (e) {
            logsLog.print('Error', `Failed to send history: ${e.message}`);
        }

        // Subscribe to new logs
        const unsubscribe = logBuffer.subscribe((logEntry) => {
            if (ws.readyState === WebSocket.OPEN) {
                try {
                    ws.send(JSON.stringify({
                        type: 'log',
                        log: logEntry
                    }));
                } catch (e) {
                    // Client disconnected, will be cleaned up on close
                }
            }
        });

        ws.on('close', () => {
            unsubscribe();
            logsLog.print('Disconnect', `Client disconnected (total: ${logsWss.clients.size})`);
        });

        ws.on('error', (error) => {
            logsLog.print('Error', `WebSocket error: ${error.message}`);
            unsubscribe();
        });
    });
})();

// setTimeout(() => console.log(stream.latest.instruments['XBTUSD'].lastPrice), 5000)
// setTimeout(() => console.log(stream.latest.instruments['XRPUSD'].lastPrice), 5000)


