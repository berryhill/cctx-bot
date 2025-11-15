const ccxt = require('ccxt');
const Logger = require('./utils/logger')


module.exports = function CreateCCXT(apiKey, apiSecret, name, exchange = 'bitmex') {
    this.apiKey = apiKey
    this.apiSecret = apiSecret
    this.name = name
    this.exchange = exchange

    let nameTag = `\x1b[31m"<${name}>"\x1b[0m`
    const log = new Logger(`CCXT ${nameTag}`,'\x1b[34m')

    this.init = function() {
        return new Promise((async (resolve,reject) => {
            log.print('Loading', 'Creating new CCXT Instance')
            log.print('Exchange', `Using ${this.exchange}`)
            log.print('Keys', `API Key: ${this.apiKey ? this.apiKey.substring(0, 8) + '...' : 'MISSING'}`)
            log.print('Keys', `API Secret: ${this.apiSecret ? this.apiSecret.substring(0, 8) + '...' : 'MISSING'}`)

            // Create exchange instance based on exchange parameter
            if (this.exchange === 'bitmex') {
                this.bitmex = new ccxt.bitmex ({
                    'apiKey': this.apiKey,
                    'secret': this.apiSecret,
                    'enableRateLimit': true
                })
                this.exchangeInstance = this.bitmex
                log.print('Config', '🌐 Using Bitmex MAINNET')

            } else if (this.exchange === 'hyperliquid') {
                this.hyperliquid = new ccxt.hyperliquid ({
                    'apiKey': this.apiKey,
                    'secret': this.apiSecret,
                    'enableRateLimit': true,
                    'walletAddress': this.apiKey  // Hyperliquid uses wallet address as API key
                })
                this.exchangeInstance = this.hyperliquid
                // For backward compatibility, also assign to bitmex property
                this.bitmex = this.hyperliquid
                log.print('Config', '🌐 Using Hyperliquid')

            } else {
                log.print('Error', `Unsupported exchange: ${this.exchange}`)
                return reject(`Unsupported exchange: ${this.exchange}`)
            }

            // Load Market Values
            let response = await this.exchangeInstance.loadMarkets().catch(e => {
                console.log('Failed to loadMarkets():', e)
                return null
            })

            if(response) {
                resolve('success')
            } else {
                reject('failed')
            }
        }))

    },

    this.marketSellOrder = function(symbol, amount, params) {
        log.print('Trade', `Sending Sell Order to ${this.exchange}`)
        log.print('Trade', `Symbol: ${symbol}, Amount: ${amount}, Params: ${JSON.stringify(params)}`)
        log.print('Trade', `📤 Request Body: ${JSON.stringify({ symbol, amount, params }, null, 2)}`)
        return this.exchangeInstance.createMarketSellOrder (symbol, amount, params)
    },

    this.marketBuyOrder = function(symbol, amount, params) {
        log.print('Trade', `Sending Buy Order to ${this.exchange}`)
        log.print('Trade', `Symbol: ${symbol}, Amount: ${amount}, Params: ${JSON.stringify(params)}`)
        log.print('Trade', `📤 Request Body: ${JSON.stringify({ symbol, amount, params }, null, 2)}`)
        return this.exchangeInstance.createMarketBuyOrder (symbol, amount, params)
    },

    this.limitBuyOrder = function(symbol, amount, price, params) {
        log.print('Trade', `Sending limit Buy Order to ${this.exchange}`)
        return this.exchangeInstance.createLimitBuyOrder (symbol, amount, price, params)
    },

    this.limitSellOrder = function(symbol, amount, price, params) {
        log.print('Trade', `Sending limit Sell Order to ${this.exchange}`)
        return this.exchangeInstance.createLimitSellOrder (symbol, amount, price, params)
    },

    this.cancelOrder = function(id) {
        log.print('Trade', `Sending Cancel Order to ${this.exchange}`)
        return this.exchangeInstance.cancelOrder(id)
    },

    this.balance = function() {
        log.print('Status', 'Getting user balance')
        return this.exchangeInstance.fetchBalance()
    },

    this.positions = function() {
        log.print('Status', 'Getting positions via private API')
        // Use exchange-specific private API if needed
        if (this.exchange === 'bitmex') {
            return this.exchangeInstance.privateGetPosition()
        } else {
            // Hyperliquid uses standard fetchPositions
            return this.exchangeInstance.fetchPositions()
        }
    },

    this.closedOrders = function(symbol, since, limit, params) {
        log.print('Status', 'Getting closed Orders')
        return this.exchangeInstance.fetchClosedOrders (symbol, since, limit, params)
    },

    this.openOrders = function(symbol, since, limit, params) {
        log.print('Status', 'Getting open Orders')
        return this.exchangeInstance.fetchOpenOrders (symbol, since, limit, params)
    },

    this.myTrades = function(symbol, since, limit, params) {
        log.print('Status', 'Getting my Trades')
        return this.exchangeInstance.fetchMyTrades(symbol, since, limit, params)
    },

    this.ticker = function(symbol, params) {
        log.print('Trade', 'Getting Ticker')
        return this.exchangeInstance.fetchTicker(symbol, params)
    }
}
