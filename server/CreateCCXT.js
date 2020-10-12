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
            this.bitmex = new ccxt.bitmex ({
                'apiKey': this.apiKey,
                'secret': this.apiSecret,
                'enableRateLimit': true
            })

            //Enable Bitmex Testnet
            if( Object.keys(this.bitmex.urls).includes('test') ) {
                log.print('Config', 'Using Bitmex Testnet')    
                this.bitmex.urls['api'] = this.bitmex.urls['test']
            }

            //Load Market Values from Bitmex
            let response = await this.bitmex.loadMarkets()
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
        return this.bitmex.createMarketSellOrder (symbol, amount, params)
    },
    
    this.marketBuyOrder = function(symbol, amount, params) {
        log.print('Trade', 'Sending Buy Order to Bitmex')    
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
    
    this.balance = function() {
        log.print('Status', 'Getting user balance')    
        return this.bitmex.fetchBalance()
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










