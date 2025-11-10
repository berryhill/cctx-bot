const WebSocket = require('ws');
const Logger = require('./../utils/logger')
const log = new Logger('WebSocket')
const color = require('./../utils/colors')

module.exports = function BitmexWS(verbose) {
    try {
        this.verbose = verbose
        this.ws = new WebSocket('wss://ws.testnet.bitmex.com/realtime');
        this.instrumentsSubscribe = ["XBTUSD","ETHUSD","XRPUSD","LTCUSD","BCHUSD"]
        this.latest = {
            startTime: new Date,
            instruments: {}
        }
        this.isLoaded = false

        this.createArgs = () => {
            let args = []
            this.instrumentsSubscribe.forEach(i => {
                args.push(`instrument:${i}`)
            })
            return args
        }

        this.subscribe = () => {
            this.ws.send(JSON.stringify({"op": "subscribe", "args": [...this.createArgs()]}));
            // let value  = JSON.stringify({"op": "authKeyExpires", "args": [...genSignature()]});
            // console.log(value)
            // this.ws.send(value)
        }

        this.unsubscribe = (instrument) => {
            log.print('STATUS',`Unsubscribing from ${instrument} on stream`)
            this.ws.send(JSON.stringify({"op": "unsubscribe", "args": [`instrument:${instrument}`]}));
        }

        this.ws.onopen = (event) => {
            log.print(`${color.pick.green}OPEN${color.pick.end}`,`Connection Established!`)
            log.print('STATUS',`Sending Subscribe request..`)
            this.subscribe()
        };
        
        this.ws.onmessage = (event) => {
            const d = JSON.parse(event.data)
            // console.log(d)

            if(d.info) {
                log.print('INFO',`${d.info}`)
                log.print('VERSION',`${d.version}`)
                log.print('TIMESTAMP',`${d.timestamp}`)
                log.print('DOCS',`${d.docs}`)
                log.print(`${color.pick.red}LIMIT REMAINING${color.pick.end}`, `${color.pick.red}`+`${d.limit.remaining}${color.pick.end}\n`)

            } else if(d.success) {
                log.print('SUBSCRIBE', `${d.subscribe}`)
            }

            if(d.action === 'partial') {
                //Create Initial Data - One Time
                d.data.forEach(s => {
                    log.print(`${color.pick.green}PARTIAL - Initialzed${color.pick.end}`,`${s.symbol}`)
                    this.latest.instruments[s.symbol] = s
                    this.isLoaded = true
                })
            } else if (d.action === 'update') {
                d.data.forEach(s => {
                    let updateKeys = Object.keys(s)
                    this.verbose?log.print('UPDATE',`${s.symbol} - Keys: ${updateKeys}`):''
                    updateKeys.forEach(key => {
                        this.latest.instruments[s.symbol][key] = s[key]
                        
                    })
                })
            }

            // console.log(latest)
            // const l = JSON.stringify(JSON.parse(d).data,null,1)
        };

        this.ws.onclose = (event) => {
            if (event.wasClean) {
                log.print('CLOSE',`Connection closed cleanly, code=${event.code} reason=${event.reason}`)
            } else {
                // e.g. server process killed or network down
                // event.code is usually 1006 in this case
                log.print('CLOSE',`Connection died.`)
            }
        };

        this.ws.onerror = (error) => {
            log.print('ERROR',`${error.message}`)
        };

        this.init = () => new Promise((resolve,reject) => {
            setTimeout(() =>{
                if(this.isLoaded) {
                    return resolve('success')
                } else {
                    return reject('failed')
                }
            },8000)
        })
    } catch(e) {
        console.log("Catched Error: ",e)
    }
}