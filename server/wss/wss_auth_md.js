//Imports
const WebSocket = require('ws');
const genSignature = require('./../utils/genSignature')
const crypto = require('crypto');

//Logger
const color = require('./../utils/colors');
const Logger = require('./../utils/logger');
const log = new Logger('WSS-MD',color.pick.underlined)

//User model
const { User } = require('../database/MongoDB');


const latest = {
    startTime: new Date,
    isLoaded: false,
    users: [],
    verbose: true,
    affiliate: {},
    execution: {},
    order: {},
    margin: {},
    position: {},
    // privateNotifications: {}, NOT USED
    transact: {},
    wallet: {}
}

async function startWebSocketMD() {
    return new Promise(async (resolve,reject) => {
        const wss = new WebSocket('wss://testnet.bitmex.com/realtimemd')
        
        log.print('Loading','Starting WSS realtime-mux-demux...')

        async function loadUsers() {
            return new Promise((resolve,reject) => {
                User.find({}, (err,data) => {
                    if(err) {
                        reject(err)
                    } else {
                        resolve(data)
                    }
                }).lean().catch(e => console.log(e))
            })
        }

        log.print('FILTERING','Loading Users WSS-MD that have API keys...')
        const users = await loadUsers()
                                .then(data => {
                                    return data.filter(u => u.apiKey && u.apiSecret)
                                }).catch(e => { 
                                    log.print('Error','Failed add name(s) in user object!')
                                    reject(d)
                                })
        log.print('FILTERING','All users with API keys in users variable now.')

        
        // "affiliate",   // Affiliate status, such as total referred users & payout %
        // "execution",   // Individual executions; can be multiple per order
        // "order",       // Live updates on your orders
        // "margin",      // Updates on your current account balance and margin requirements
        // "position",    // Updates on your positions
        // "privateNotifications", // Individual notifications - currently not used
        // "transact"     // Deposit/Withdrawal updates
        // "wallet"       // Bitcoin address balance data, including total deposits & withdrawals

        wss.on('open', (d) => {
            log.print('Established','Connected to WebSocket!')

            function createStream(uniqueID,topic) {
                return JSON.stringify([1,uniqueID,topic])
            }

            function authStream(uniqueID, topic, payload) {
                return JSON.stringify([0,uniqueID,topic,payload])
            }

            function subPrivate(uniqueID,topic,payload) {
                return JSON.stringify([0,uniqueID,topic,payload])
            }

            function closeStream(uniqueID,topic) {
                return JSON.stringify([2,uniqueID,topic,payload])
            }

            function loginAndSubscribe(user, subArgs){
                let uniqueID = crypto.createHash('md5').update(user.apiKey).digest('hex');
                let topic = user.username
                wss.send(createStream(uniqueID,topic))
                wss.send(authStream(uniqueID,topic,genSignature(user.apiKey,user.apiSecret)))
                wss.send(subPrivate(uniqueID,topic,{"op": "subscribe", "args": subArgs}))
            }

            // loginAndSubscribe(users.ThreeSteps,["execution", "order", "margin", "position", "wallet"])
            log.print('Initialzing','Authenticating every users private stream...')
            log.print('Initialzing','Subscribing users to channels...')
            // console.log('Users: ',users)
            users.forEach(user => {
                loginAndSubscribe(user,["execution", "order", "margin", "position", "wallet"])
            })

        });

        wss.on('message', (d) => {
            let p = JSON.parse(d)
            const packetType = p[0]
            const uniqueID = p[1]
            const topic = p[2]
            const { table, action, keys, types, foreignKeys, attributes, filter, data, subscribe } = p[3]

            if(!table && !p[3].subscribe) {
                latest.verbose ? log.print('MESSAGE',`${packetType}:${uniqueID}:${topic} => Server Response: ${p[3]}`) : ''
                if(p[3].success && p[3].request.op === 'authKeyExpires'){
                    latest.users.push({
                        [topic]: p[3].request
                    })
                    
                    if(latest.users.length === Object.keys(users).length) {
                        latest.isLoaded = true
                        resolve('Promise: success')
                    }
                    log.print('CHECKING',`Total Users in File: ${latest.users.length} Total in latest.users: ${Object.keys(users).length} isLoaded: ${latest.isLoaded}`)             
                }
            } else if(action) {
                // latest.verbose ? log.print('MESSAGE',`${packetType}:${uniqueID}:${topic} => [${table}.${action}]`) : ''
            } else if(subscribe) {
                latest.verbose ? log.print('MESSAGE',`${packetType}:${uniqueID}:${topic} => Subscribed: ${subscribe}`) : ''
            }

            if(action === 'partial') {
                //Create Initial Data - One Time
                log.print(`${color.pick.green}PARTIAL${color.pick.end}`,`${color.pick.red}${topic}${color.pick.end}: ${table}`)
                latest[table][topic] = data
            } else if (action === 'update') {
                data.forEach(obj => {
                    // latest.verbose ? log.print('UPDATE',`${topic}:${table} => ${Object.keys(obj).concat(' ')}`):''
                    // table==='margin' ? console.log(data) : ''
                    Object.keys(obj).forEach(key => {
                        latest[table][topic][key] = obj[key]
                    })
                })
            } else if (action === 'insert') {
                console.log('INSERT',data)
                latest.verbose ? log.print(`${color.pick.yellow}INSERT${color.pick.end}`,`${color.pick.red}${topic}${color.pick.end}: ${table} count: ${data.length}`) : ''
                data.forEach(obj => {
                        latest[table][topic].push(obj)
                })
            } else if (action === 'delete') {
                console.log('DELETE',data)
                const index = latest[table][topic].indexOf(data);
                latest.verbose ? log.print(`${color.pick.red}DELETE${color.pick.end}`,`${color.pick.red}${topic}${color.pick.end}: ${table} count: ${data.length}`) : ''
                data.forEach(obj => {
                    if (index > -1) {
                        latest[table][topic].splice(obj, 1);
                    }
                })
            }

            // log.print('MESSAGE',`latest: ${latest}`)
        })

        wss.on('close', (d) => {
            log.print('Terminating',`WS closing connection: ${d}`)
        });

        wss.on('error', (e) => {
            log.print('Error',`WebSocket sent received ws.on('error'): ${e}`)
            reject(e)
        })
    })
}

// startWebSocketMD()

module.exports = {
    startWebSocketMD,
    latest
}




