const ccxt = require('ccxt');
const Logger = require('./utils/logger')


module.exports = function CreateCCXT(apiKey,apiSecret, name) {
    this.apiKey = apiKey
    this.apiSecret = apiSecret
    this.name = name

    let nameTag = `\x1b[31m"<${name}>"\x1b[0m`
    const log = new Logger(`CCXT ${nameTag}`,'\x1b[34m')

    this.init = function() {
        return new Promise((async (resolve,reject) => {
            log.print('Loading', 'Creating new CCXT Instance')
            log.print('Keys', `API Key: ${this.apiKey ? this.apiKey.substring(0, 8) + '...' : 'MISSING'}`)
            log.print('Keys', `API Secret: ${this.apiSecret ? this.apiSecret.substring(0, 8) + '...' : 'MISSING'}`)
            
            this.bitmex = new ccxt.bitmex ({
                'apiKey': this.apiKey,
                'secret': this.apiSecret,
                'enableRateLimit': true
            })

            //Enable Bitmex Testnet (DISABLED - Using Mainnet)
            // if( Object.keys(this.bitmex.urls).includes('test') ) {
            //     log.print('Config', 'Using Bitmex Testnet')
            //     this.bitmex.urls['api'] = this.bitmex.urls['test']
            // }
            log.print('Config', '🌐 Using Bitmex MAINNET')

            //Load Market Values from Bitmex
            let response = await this.bitmex.loadMarkets().catch(e => console.log('Failed to loadMarkets()'))
            if(response) {
                resolve('success')
            } else {
                reject('failed')
            }
                // .then(() => {
                //     log.print('\x1B[32mREADY\x1b[0m', 'Market Data Loaded')
                //     return resolve('loaded');
                // })  
                // .catch(e => {
                //     log.print('Error', `loadMarkets: ${e}`)
                //     return reject('failed to load')
                // })
        }))

    },

    this.marketSellOrder = function(symbol, amount, params) {
        log.print('Trade', 'Sending Sell Order to Bitmex')
        log.print('Trade', `Symbol: ${symbol}, Amount: ${amount}, Params: ${JSON.stringify(params)}`)
        log.print('Trade', `📤 Request Body: ${JSON.stringify({ symbol, amount, params }, null, 2)}`)
        return this.bitmex.createMarketSellOrder (symbol, amount, params)
    },
    
    this.marketBuyOrder = function(symbol, amount, params) {
        log.print('Trade', 'Sending Buy Order to Bitmex')
        log.print('Trade', `Symbol: ${symbol}, Amount: ${amount}, Params: ${JSON.stringify(params)}`)
        log.print('Trade', `📤 Request Body: ${JSON.stringify({ symbol, amount, params }, null, 2)}`)
        return this.bitmex.createMarketBuyOrder (symbol, amount, params)
    },

    this.limitBuyOrder = function(symbol, amount, price, params) {
        log.print('Trade', 'Sending limit Buy Order to Bitmex')    
        return this.bitmex.createLimitBuyOrder (symbol, amount, price, params)
    },

    this.limitSellOrder = function(symbol, amount, price, params) {
        log.print('Trade', 'Sending limit Sell Order to Bitmex')    
        return this.bitmex.createLimitSellOrder (symbol, amount, price, params)
    },

    this.cancelOrder = function(id) {
        log.print('Trade', 'Sending Cancel Order to Bitmex')    
        return this.bitmex.cancelOrder(id)
    },
    
    this.balance = function() {
        log.print('Status', 'Getting user balance')
        return this.bitmex.fetchBalance()
    },
    
    this.positions = function() {
        log.print('Status', 'Getting positions via private API')
        // Use BitMEX private API endpoint directly
        return this.bitmex.privateGetPosition()
    },
    
    this.closedOrders = function(symbol, since, limit, params) {
        log.print('Status', 'Getting closed Orders')    
        return this.bitmex.fetchClosedOrders (symbol, since, limit, params)
    },
    
    this.openOrders = function(symbol, since, limit, params) {
        log.print('Status', 'Getting open Orders')    
        return this.bitmex.fetchOpenOrders (symbol, since, limit, params)
    },
    
    this.myTrades = function(symbol, since, limit, params) {
        log.print('Status', 'Getting my Trades')    
        return this.bitmex.fetchMyTrades(symbol, since, limit, params)
    },
    
    this.ticker = function(symbol, params) {
        log.print('Trade', 'Getting Ticker')    
        return this.bitmex.fetchTicker(symbol, params)
    }
}
