require('dotenv').config();

const mongoose = require('mongoose');
const MongoDB = require('./database/MongoDB');
const { User, Trigger_Orders, TO_Processed, Open_Trades } = require('./database/MongoDB');
const postSchema = require('./validation/postSchema');
const CreateCCXT = require('./CreateCCXT');
const BitmexStream = require('./wss/wss_stream');
const streamPrivate = require('./wss/wss_auth_md');
const ExpressServer = require('./express/express');
const express = new ExpressServer();
const stream = new BitmexStream(false);

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
// tagTrades migrated to MongoDB Open_Trades collection
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
        const symbol = resolveSymbol(input.s);
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
                // USDT pairs
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
                    return 'BTC/USD'
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
                case 'BTC/USD':
                    // 11249 BTC/USD Minimum Price Increment	0.5 USD 
                    val = parseFloat(Math.ceil(price));
                    console.log('BTC/USD Resolved Order Price: ',val)
                    return val
                case 'XRP/USD':
                    // 0,2314 XRP/USD Minimum Price Increment	0.0001 USD 
                    val = parseFloat(price.toFixed(4))
                    console.log('XRP/USD Resolved Order Price: ',val)
                    return val
                case 'ETH/USD':
                    // 1.2314,2 ETH/USD Minimum Price Increment	0.05 USD 
                    val = parseFloat(round(price,1))
                    console.log('ETH/USD Resolved Order Price: ',val)
                    return val
                case 'LTC/USD':
                    // 10,23 LTC/USD Minimum Price Increment 0.01 USD 
                    val = parseFloat(round(price,2))
                    console.log('LTC/USD Resolved Order Price: ',val)
                    return val
                case 'BCH/USD':
                    // 301,9 ETH/USD Minimum Price Increment	0.05 USD
                    val = parseFloat(round(price,1))
                    console.log('BCH/USD Resolved Order Price: ',val)
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
                case 'BTC/USD': //1 USD (Currently 0.00008778 XBT per contract)
                    price = entryPrice ? entryPrice : stream.latest.instruments['XBTUSD'].lastPrice
                    val = Math.ceil(xbtValue * price)
                    console.log('BTC/USD resolvedContracts: ',val,'price: ',price)
                    return val
                case 'XRP/USD': //0.0002 XBT per 1 USD (Currently 0.00005109 XBT per contract)
                    price = entryPrice ? (0.0002 * entryPrice) : (0.0002 * stream.latest.instruments['XRPUSD'].lastPrice)
                    val = Math.ceil(xbtValue / price)
                    console.log('XRP/USD resolvedContracts: ',val,'price: ',price)
                    return val
                case 'ETH/USD': //0.001 mXBT per 1 USD (Currently 0.00037427 XBT per contract)
                    price = entryPrice ? (0.000001 * entryPrice) : ( 0.000001 * stream.latest.instruments['ETHUSD'].lastPrice)
                    val = Math.ceil(xbtValue / price)
                    console.log('ETH/USD resolvedContracts: ',val,'price: ',price)
                    return val
                case 'LTC/USD': //0.002 mXBT per 1 USD (Currently 0.00010027 XBT per contract)
                    price = entryPrice ? (0.000002 * entryPrice) : ( 0.000002 * stream.latest.instruments['LTCUSD'].lastPrice)
                    val = Math.ceil(xbtValue / price)
                    console.log('LTC/USD resolvedContracts: ',val,'price: ',price)
                    return val
                case 'BCH/USD': //0.001 mXBT per 1 USD (Currently 0.00023979 XBT per contract)
                    price = entryPrice ? (0.000001 * entryPrice) : ( 0.000001 * stream.latest.instruments['BCHUSD'].lastPrice)
                    val = Math.ceil(xbtValue / price)
                    console.log('BCH/USD resolvedContracts: ',val,'price: ',price)
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

        //Function to insert trades with specific tag & side
        async function pushTagTrades(tag, data, input) {
            console.log('\n📌 pushTagTrades() called')
            console.log('   Tag:', tag)
            console.log('   Data Side:', data.side)
            console.log('   Data object keys:', Object.keys(data))
            console.log('   Data:', JSON.stringify(data, null, 2))

            const side = data.side === 'sell' ? 'S' : 'B'
            console.log('   Resolved Side:', side)

            // Extract order ID from various possible fields
            const orderId = data.orderID || data.orderId || data.id || data.clOrdID || ''
            const price = data.avgPx || data.price || data.lastPx || 0
            const contracts = data.orderQty || data.contracts || data.cumQty || 0

            console.log('   Extracted - orderId:', orderId, 'price:', price, 'contracts:', contracts)

            // Save trade to database
            const newTrade = new Open_Trades({
                tag: tag,
                account: input.a,
                symbol: input.s,
                side: side,
                alias: alias,
                order_id: orderId || undefined, // Use undefined instead of empty string
                price: price,
                contracts: contracts,
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
                    case 'XRP/USD': return 1
                    default: return 1
                }
            }
            
            let qntyUSD
            if (isUSDTPair && isUSDTAmount) {
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
                console.log('   📉 Executing SELL Market Order...')
                // 2. Create Market Order
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
                        'action': 'createMarketOrder[1]',
                        'input': input,
                        'error':e
                    })
                    console.log("   Failed to submit Market Sell Order: ",e)
                    return {code: 500, message:'Unable to process trade', input:input, e:e}
                })

            } else if (command === 'B') {
                console.log('   📈 Executing BUY Market Order...')
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
                        'action': 'creatMarketOrder[1]',
                        'input': input,
                        'error':e
                    })
                    console.log("   Failed to submit Market Buy Order: ",e)
                    return {code: 500, message:'Unable to process trade', input:input, e:e}
                })

            } else if (command === 'CB') {
                // Find all buy trades for this tag from database
                const buyTrades = await Open_Trades.find({
                    tag: tag,
                    account: input.a,
                    side: 'B'
                })

                if (buyTrades.length === 0) {
                    console.log(`❌ No buy trades found for tag "${tag}"`)
                    return {code: 404, message:'No buy trades found to close', input:input}
                }

                // Calculate total contracts to close
                let totalContracts = 0
                buyTrades.forEach(trade => {
                    totalContracts += trade.contracts
                })

                console.log(`📊 Closing ${buyTrades.length} buy trade(s), total contracts: ${totalContracts}`)

                // Delete from database BEFORE placing order
                await Open_Trades.deleteMany({
                    tag: tag,
                    account: input.a,
                    side: 'B'
                })
                console.log(`✅ Removed ${buyTrades.length} buy trades from database`)

                // WE CLOSE BUY ORDERS WITH MARKET SELL ORDERS (OPPOSITE DIRECTION)
                trade.marketSellOrder(symbol, totalContracts)
                    .then(async function(data) {
                        console.log('CCXT - Bitmex Close Buy Order Complete: ', new Date)
                        await pushTagTrades(orderTag, data, input)
                        return {code: 200, message:'Success to Close Buy Orders', input:input}
                    })
                    .catch(e => {
                        inactiveList.push({
                            'username': alias,
                            'action': 'creatMarketOrder[1]',
                            'input': input,
                            'error':e
                        })
                        console.log("[1] Failed to submit Market Order: ",e)
                        return {code: 500, message:'Unable to close Buy Orders', input:input, e:e}
                    })
            } else if (command === 'CS') {
                // Find all sell trades for this tag from database
                const sellTrades = await Open_Trades.find({
                    tag: tag,
                    account: input.a,
                    side: 'S'
                })

                if (sellTrades.length === 0) {
                    console.log(`❌ No sell trades found for tag "${tag}"`)
                    return {code: 404, message:'No sell trades found to close', input:input}
                }

                // Calculate total contracts to close
                let totalContracts = 0
                sellTrades.forEach(trade => {
                    totalContracts += trade.contracts
                })

                console.log(`📊 Closing ${sellTrades.length} sell trade(s), total contracts: ${totalContracts}`)

                // Delete from database BEFORE placing order
                await Open_Trades.deleteMany({
                    tag: tag,
                    account: input.a,
                    side: 'S'
                })
                console.log(`✅ Removed ${sellTrades.length} sell trades from database`)

                // WE CLOSE SELL ORDERS WITH MARKET BUY ORDERS (OPPOSITE DIRECTION)
                trade.marketBuyOrder(symbol, totalContracts)
                    .then(async function(data) {
                        console.log('CCXT - Bitmex Close Sell Order Complete: ', new Date)
                        await pushTagTrades(orderTag, data, input)
                        return {code: 200, message:'Success to Close Sell Orders', input:input}
                    })
                    .catch(e => {
                        inactiveList.push({
                            'username': alias,
                            'action': 'creatMarketOrder[1]',
                            'input': input,
                            'error':e
                        })
                        console.log("[1] Failed to submit Market Order: ",e)
                        return {code: 500, message:'Unable to close Sell Orders', input:input, e:e}
                    })
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
                    case 'XRP/USD': return 100
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
                const result = await Open_Trades.deleteMany({
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
                        //Market Close Buys
                        //Always TP=NULL, P=NULL, Q=SUM(TAGS)
                        mainLog.print(`Trade:${alias}`,"M-CB")
                        return createMarketOrder(symbol, input)
                    case 'CS':
                        //Market Close Sells
                        //Always TP=NULL, P=NULL, Q=SUM(TAGS)
                        mainLog.print(`Trade:${alias}`,"M-CS")
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
        expressLog.print('Request','/ health check')
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
            expressLog.print('Request','/health check - OK')
        } catch (error) {
            res.status(503).json({
                status: 'error',
                service: 'ccxt-bot',
                timestamp: new Date().toISOString(),
                mongodb: 'disconnected',
                error: error.message
            });
            expressLog.print('Request','/health check - FAILED')
        }
    })

    //API LINKS
    app.get('/api/tagTrades', async function (req,res) {
        try {
            const trades = await Open_Trades.find({}).sort({ created: -1 })

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
})();

// setTimeout(() => console.log(stream.latest.instruments['XBTUSD'].lastPrice), 5000)
// setTimeout(() => console.log(stream.latest.instruments['XRPUSD'].lastPrice), 5000)


