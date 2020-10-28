require('dotenv').config();

const MongoDB = require('./database/MongoDB');
const { User, Trigger_Orders, TO_Processed } = require('./database/MongoDB');
const postSchema = require('./validation/postSchema');
const CreateCCXT = require('./CreateCCXT');
const BitmexStream = require('./wss/wss_stream');
const streamPrivate = require('./wss/wss_auth_md');
const ExpressServer = require('./express/express');
const express = new ExpressServer();
const stream = new BitmexStream(false);
const path = require('path');

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
let tagTrades = []
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

    async function createTrade(input,alias,ccxt) {
        //CCXT Object from Logged in User
        const trade = ccxt
        //General Variables from Post-Syntax in more readable format.
        const symbol = resolveSymbol(input.s);
        const command = input.c //B, S, CB, CS
        const type = input.t //M, L
        const tp = input.tp //For B & S
        const p = input.p

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
                default:
                    console.log('Unsupported Symbol to resolve decimals!')
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
                default:
                    console.log('[ERROR]: Unsupported symbol for resolveQnt.')
                    break;
            }
        }

        //
        function getAutoQnty(defaultSize) {
            let marginBalance = parseInt(streamPrivate.latest['margin'][alias][0]['marginBalance']) / 100000000
            let calcMultiplierVal = +calcMultiplier(getLevel(marginBalance))
            // console.log("streamPrivate.latest['margin'][alias]",streamPrivate.latest['margin'][alias])
            console.log('getAutoQnty marginBalance: ', marginBalance)
            console.log('calcMultiplier: ', calcMultiplierVal)
            console.log('defaultSize (lvl1 BTC qnty - typically 0.0025XBT or 0.01XBT on testnet)',defaultSize)
            console.log('getAutoQnty order size: ', calcMultiplierVal * defaultSize)
            return calcMultiplierVal * defaultSize
        }

        //Function to insert trades with specific tag & side
        function pushTagTrades(tag, data, input) {
            const side = data.side === 'sell' ? 'S' : 'B'
            const tagObj = {
                tag: tag,
                openTrades: [[],[]]
            }

            const tradeObj = {
                alias: alias,
                side: side,
                type: 'Market',
                data: data,
                input: input
            }
            
            const isTag = (obj) => obj.tag === tag
            const indexTag = tagTrades.findIndex(isTag)

            //Empty tagTrades Array
            if(indexTag === -1) {

                //Directly put in object!
                if(side === 'B') {
                    tagObj.openTrades[0].push(tradeObj)
                    tagTrades.push(tagObj)
                } else if (side === 'S') {
                    tagObj.openTrades[1].push(tradeObj)
                    tagTrades.push(tagObj)
                } else {
                    console.log("pushTagTrades unknown side: ",side)
                }

                tradeVerbose ? console.log("tagTrades (after pushTrades): ", JSON.stringify(tagTrades,null,1) ) : ''
                return

            } else {
                //Go over all tagObjects and look for matching tag in object, then push into the existing array
                    // console.log("tag in tagTrades at index: ",indexTag)
                    //LONG[0] OR SHORT[1] ARRAY 
                    if(side === 'B') {
                        tagTrades[indexTag]["openTrades"][0].push(tradeObj)
                    } else if (side === 'S') {
                        tagTrades[indexTag]["openTrades"][1].push(tradeObj)
                    } else {
                        console.log("pushTagTrades unknown side: ",side)
                    }
                    
                    tradeVerbose ? console.log("tagTrades (after pushTrades): ", JSON.stringify(tagTrades,null,1) ) : ''
                    return

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
            //NO TP OR SL
            const command = input.c
            const regXBT = new RegExp(/XBT$/s)
            const regAuto = new RegExp(/^auto$/s)
            const qntyXBT = regXBT.test(input.q) ? +input.q.split('XBT')[0] : regAuto.test(input.q) ? +getAutoQnty(0.01) : 0.0025
            const tag = input.tag

            //GET TICKER LAST PRICE
            console.log("qntyXBT: ", qntyXBT)
            const qntyUSD = resolveContracts(qntyXBT,symbol)
            
            if(command === 'S') {
                // 2. Create Market Order
                trade.marketSellOrder(symbol,qntyUSD).then(function (data) {
                    console.log('CCXT - Bitmex Sell Order Complete: ', new Date)
                    pushTagTrades(tag,data,input)
                    return {code: 200, message:'Success to process Sell Market Order', input:input}
                }).catch(e => {
                    //Send Server Error!
                    inactiveList.push({
                        'username': alias,
                        'action': 'createMarketOrder[1]',
                        'input': input,
                        'error':e
                    })
                    console.log("Failed to submit Market Sell Order: ",e)
                    return {code: 500, message:'Unable to process trade', input:input, e:e}
                })

            } else if (command === 'B') {
                //2. Create Market Order
                trade.marketBuyOrder(symbol,qntyUSD).then(function (data) {
                    console.log('CCXT - Bitmex Buy Order Complete: ', new Date)
                    pushTagTrades(tag,data,input)
                    return {code: 200, message:'Success to process Buy Market Order', input:input}

                    //IF TRADE FAILS (MARKET ORDER)
                }).catch(e => {
                    //Send Server Error!
                    inactiveList.push({
                        'username': alias,
                        'action': 'creatMarketOrder[1]',
                        'input': input,
                        'error':e
                    })
                    console.log("Failed to submit Market Buy Order: ",e)
                    return {code: 500, message:'Unable to process trade', input:input, e:e}
                })

            } else if (command === 'CB') {
                let tagIndex = 0
                //TAG OBJECT IN ARRAY { tag: 'TAG', openTrades: [[{},{},{}], [{},{},{}]]}
                tagTrades.forEach((obj) => {

                    //+++++++WHAT IF NOT FOUND??
                    if(obj['tag'] === tag) {
                        //Found our tag, now need to iterate over every trade of side (S) or (B) and add the USD value together
                        const buyTrades = obj.data[0]
                        let totalOpenBuyValueUSD = 0
                        let totalToClose = 0

                        //Accumulate USD Value and # of Trades
                        for(const trade in buyTrades) {
                            totalOpenBuyValueUSD += parseFloat(trade.valueUSD)
                            totalToClose += 1
                        }

                        //REMOVE tag from tagTrades!!!! No multiple closings with same trades
                        console.log("tagTrades[tagIndex]: ", tagTrades[tagIndex], " tagIndex: ", tagIndex)
                        tagTrades.splice(tagIndex,1)
                        console.log("Removed Tag Array at Index: ", tagIndex)

                        //WE CLOSE BUY ORDERES WITH MARKET SELL ORDERS (OPPOSITE DIRECTION)
                        trade.marketSellOrder(symbol,totalOpenBuyValueUSD)
                            .then(function(data) {
                                console.log('CCXT - Bitmex Close Buy Order Complete: ', new Date)
                                pushTagTrades(tag,data,input)
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
                        //Finish
                        return
                    }
                    tagIndex += 1
                })
            } else if (command === 'CS') {
                let tagIndex = 0
                //TAG OBJECT IN ARRAY { tag: 'TAG', openTrades: [[{},{},{}], [{},{},{}]]}
                tagTrades.forEach((obj) => {

                    //+++++++WHAT IF NOT FOUND??
                    if(obj['tag'] === tag) {
                        //Found our tag, now need to iterate over every trade of side (S) or (B) and add the USD value together
                        const sellTrades = obj.data[1]
                        let totalOpenSellValueUSD = 0
                        let totalToClose = 0

                        //Accumulate USD Value and # of Trades
                        for(const trade in sellTrades) {
                            totalOpenSellValueUSD += parseFloat(trade.valueUSD)
                            totalToClose += 1
                        }

                        //REMOVE tag from tagTrades!!!! No multiple closings with same trades
                        console.log("tagTrades[tagIndex]: ", tagTrades[tagIndex], " tagIndex: ", tagIndex)
                        tagTrades.splice(tagIndex,1)
                        console.log("Removed Tag Array at Index: ", tagIndex)

                        //WE CLOSE SELL ORDERES WITH MARKET BUY ORDERS (OPPOSITE DIRECTION)
                        trade.marketBuyOrder(symbol,totalOpenSellValueUSD)
                            .then(function(data) {
                                console.log('CCXT - Bitmex Close Sell Order Complete: ', new Date)
                                pushTagTrades(tag,data,input)
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
                        //Finish
                        return
                    }
                    tagIndex += 1
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
        function createMarketTPOrder(symbol,input) {
            const command = input.c
            const regXBT = new RegExp(/XBT$/s)
            const regAuto = new RegExp(/^auto$/s)
            const qntyXBT = regXBT.test(input.q) ? +input.q.split('XBT')[0] : regAuto.test(input.q) ? +getAutoQnty(0.01) : 0.0025
            const tp = input.tp.slice(0, -1);
            const tag = input.tag

            //1. Calculate USD amount
            console.log("qntyXBT: ", qntyXBT)
            const qntyUSD = resolveContracts(qntyXBT,symbol)

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
                    
                    //4. Calculate TP based on Entry Price
                    const tp_price = (orderPrice * ((100 - parseFloat(tp))/100))
                    
                    //5. Fix Decimals
                    const entryPrice = resolveDecimals(tp_price, symbol)
                    
                    //Push into array because of success, if limit tp fails it will still be recorded otherwise not.
                    pushTagTrades(tag,data,input)

                    //6. Opposite Side Trade Limit Order
                    trade.limitBuyOrder(symbol,qntyUSD,entryPrice).then(function (data_limit){
                        console.log('CCXT - Bitmex Buy Limit Order (TP) Complete: ', new Date)
                        //7. Success - Send OK from Server 2 trades (market+limit) success!
                        pushTagLimitTrades(tag,data_limit,input)
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
                    pushTagTrades(tag,data,input)

                    //6. Opposite Side Trade Limit Order
                    trade.limitSellOrder(symbol,qntyUSD,entryPrice).then(function (data_limit){
                        console.log('CCXT - Bitmex Sell Limit Order (TP) Complete: ', new Date)
                        //7. Success - Send OK from Server 2 trades (market+limit) success!
                        pushTagLimitTrades(tag,data_limit,input)
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
            const tp = +input.tp.slice(0, -1);
            const tag = input.tag
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
                        pushTagLimitTrades(tag,data_limit,input)
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
                        pushTagLimitTrades(tag,data_limit,input)
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
        function closeTagTrades(tag, data) {
            const side = data.side === 'sell' ? 'S' : 'B'
            for (const obj in tagTrades) {
                //IF TAG FOUND IN tagTrades
                if (obj[tag] === selectedTag) {
                    if(side === 'B') {
                        obj.openTrades[0] = []
                    } else if (side === 'S') {
                        obj.openTrades[1] = []
                    } else {
                        console.log("Unknown side to close: ",side)
                    }
                } else {
                    //tagTrades does not contain any trades to drop with tag
                    console.log('No trades found to close for tag: ',tag)
                }
            }
        }

        function clearTriggerTag(tag) {
            Trigger_Orders.deleteMany({tag: tag}).lean().then(d=> {
                console.log(`Deleted all pending Trigger Orders for tag ${tag}: `,d)
            })
        }

        //<---------------------END-----------------------> 

        //Call appropiate function based on post parameters, Market or Limit => Buy or Sell => With or Without TP.
        switch(type) {
            case 'M':
                //DO
                switch(command) {
                    case 'B':
                        //Market Buy
                        if(tp !== '0%') {
                            //HAS TP? Add Create Limit Order Sell
                            mainLog.print(`Trade:${alias}`,"M-B-TP")
                            return createMarketTPOrder(symbol,input)
                        } else {
                            //NO TP - Only Market Order Buy
                            mainLog.print(`Trade:${alias}`,"M-B-TP0")
                            return createMarketOrder(symbol,input)
                        }

                    case 'S':
                        //Market Sell
                        if(tp !== '0%') {
                            //HAS TP? Add Create Limit Order Buy
                            mainLog.print(`Trade:${alias}`,"M-S-TP")
                            return createMarketTPOrder(symbol,input)
                        } else {
                            //NO TP - Only Market Order Sell
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
                mainLog.print(`Trade:${alias}`,'Order Type not supported!')
                break;
        }
    }

    function clearLimitOrders(tag,alias) {
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


    //POST route for API calls
    app.post('/ccxt', async function (req, res) {
        const input = req.body;
        const errors = postSchema.validate(input)
        console.log(input)

        //VALIDATE INPUT
        if(errors.length == 0) {
            if(input.a === 'all') {

                const keys = Object.keys(users)
                for(const key of keys) {
                    let ccxt = users[key]['ccxt']
                    createTrade(input,key, ccxt).then(d => {
                    })
                }
                sendJSON(res,200,'Success to process (all) orders',input)

            } else if(input.a !== 'all' && Object.keys(users).includes(input.a)) {
                let name = input.a
                let ccxt = users[name]['ccxt']
                createTrade(input,name,ccxt).then(d => {
                    sendJSON(res,200,'Success to process (single) order',input)
                })
            }
        } else {
            //Validation contains errors
            validateLog.print('ERROR',`${errors}`)
            sendJSON(400,'Unable to create trade',input,errors)
        }
    })

    app.post('/api/private/cancel', async function (req,res) {
        const {tag, alias} = req.body
        clearLimitOrders(tag, alias)
    })

}

//Start Application
(async function start() {
    //1. start the Express Server
    const app = await express.init()
    await MongoDB.database.then(console.log('Mongoose Connected!'))

    //2. Start Stream
    await stream.init()
    await streamPrivate.startWebSocketMD()
    await streamPrivate.checkLoaded().then(console.log('checkLoaded: true'))
    
    async function initCCXTUsers() {
        return new Promise((resolve, reject) => {
            let usersProcessed = 0;

            User.find({}, (err,dbUsers) => {
                const gotAPI = dbUsers.filter(u => u.apiKey && u.apiSecret)
                console.log('Users without API keys: ',dbUsers.length - gotAPI.length)
                if(err) {
                    reject(err)
                } else {
                    gotAPI.forEach(async user => {
                        try {
                            users[user.username] = {
                                name: user.username,
                                apiKey: user.apiKey,
                                apiSecret: user.apiSecret,
                                ccxt: null
                            }

                            const uBal = streamPrivate['latest']['margin'][user.username][0]['walletBalance'] / 100000000
                            console.log('Wallet Balance in BTC: ',uBal)

                            if(uBal > 0.25) {
                                ccxtLog.print('BALANCE_OK',`${user.username} has total balance of ${uBal} adding to CCXT!`)
                                users[user.username]['ccxt'] = new CreateCCXT(user.apiKey,user.apiSecret, user.username)
                                await users[user.username]['ccxt'].init().then(()=> usersProcessed++).catch(e => reject(user.username,'Failed to load ccxt:',e))
                                let isLoaded = usersProcessed === gotAPI.length
                                ccxtLog.print('Initializing',`${usersProcessed} CCXT user(s) loaded and initialized... - isLoaded: ${isLoaded}`)

                            } else {
                                ccxtLog.print('BALANCE_LOW',`${user.username} has total balance of ${uBal} so skipping.`)
                                usersProcessed++;
                            }

                            if(usersProcessed===gotAPI.length) {
                                resolve('all ccxt initialized')
                            }
                        } catch(e) {
                            console.log('initCCXT failed to go over gotAPI: ',e)
                        }
                    })
                }
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
    //4. Start Main Program
    await initCCXTUsers()
        .then(() => {
            mainLog.print('Starting main app!')
            main(app)

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
        res.sendFile(path.resolve(__dirname+"./build/public/index.html"));
        expressLog.print('Request','/ requested')
    })

    //API LINKS
    app.get('/api/tagTrades', async function (req,res) {
        return res.json(tagTrades)
    })

    app.get('/api/tpOrders', async function (req,res) {
        return res.json(tpOrders)
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
    const listener = app.listen(3000 || process.env.PORT, function () {
        expressLog.print(`${color.pick.green}LISTENING${color.pick.end}`,`Listening for calls on port:${listener.address().port}!`)
    })
})();

// setTimeout(() => console.log(stream.latest.instruments['XBTUSD'].lastPrice), 5000)
// setTimeout(() => console.log(stream.latest.instruments['XRPUSD'].lastPrice), 5000)


