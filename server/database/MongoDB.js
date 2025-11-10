require('dotenv').config()
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const userSchema = new Schema({
    created: { type: Date, default: Date.now },
    email: { type: String, min: 6, match: /^[a-z]{1,}@[a-z]{2,}.[a-z]{2,}$/, required: true, unique: true },
    username: { type: String, min: 3, max: 30, match: /^[a-zA-Z0-9]{3,30}$/, required: true, unique: true },
    password: { type: String, min: 5, max: 30, required: true },
    telegram: { type: Object, require: false},
    api: { type: Object, required: false },
    phone: { type: String, required: false },
    config: { type: Object, required: false }
})

const triggerOrdersSchema = new Schema({
    openTradeID: { type: String, required: true },
    symbol: { type: String, match:/^XBTUSD$|^XRPUSD$|^ETHUSD$|^LTCUSD$|^BCHUSD$/, required: true },
    side: { type: String, match:/^B$|^S$/, required: true },
    contracts: { type: Number, min: 1, max: 1000000, require: true },
    price: { type: Number, min: 0, max: 1000000, require: true },
    tag: { type: String, required:true },
    account: { type: String, require: true },
    created: { type: Date, default: Date.now }
})

const tOrdersProcessedSchema = new Schema({
    openTradeID: { type: String, required: true },
    symbol: { type: String, required: true },
    side: { type: String, match:/^B$|^S$/, required: true },
    contracts: { type: Number, min: 1, max: 1000000, require: true },
    price: { type: Number, min: 0, max: 1000000, require: true },
    tag: { type: String, required:true },
    account: { type: String, require: true },
    status: { type: String, default: 'Processed' },
    processedOn: { type: Date, default: Date.now },
    created: { type: Date, required: true}
})

const openTradesSchema = new Schema({
    tag: { type: String, required: true, index: true },
    account: { type: String, required: true, index: true },
    symbol: { type: String, required: true },
    side: { type: String, match:/^B$|^S$/, required: true },
    alias: { type: String, required: true },
    order_id: { type: String, required: false },
    price: { type: Number, required: true },
    contracts: { type: Number, required: true },
    metadata: { type: Object, required: false },
    opened: { type: Date, default: Date.now },
    created: { type: Date, default: Date.now }
})

module.exports = {
    User: mongoose.model('User', userSchema),
    Trigger_Orders: mongoose.model('Trigger_Orders', triggerOrdersSchema),
    TO_Processed: mongoose.model('TO_Processed', tOrdersProcessedSchema),
    Open_Trades: mongoose.model('Open_Trades', openTradesSchema),
    database: mongoose.connect(process.env.DB_URL, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        useFindAndModify: false,
        useCreateIndex: true,
        readPreference: 'primary',
        replicaSet: 'rs0'
    })
}






