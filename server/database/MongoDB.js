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
    config: { type: Object, required: false },
    exchange: { type: String, enum: ['bitmex', 'hyperliquid'], required: false, default: 'bitmex' }
})

const triggerOrdersSchema = new Schema({
    openTradeID: { type: String, required: true },
    symbol: { type: String, required: true },
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
    side: { type: String, match:/^B$|^S$|^LF$|^SF$/, required: true },
    market_type: { type: String, enum: ['spot', 'futures'], required: false, default: 'spot' },
    alias: { type: String, required: true },
    order_id: { type: String, required: false },
    price: { type: Number, required: true },
    contracts: { type: Number, required: true },
    num_contracts: { type: Number, required: false },
    dollar_amount: { type: Number, required: false },
    metadata: { type: Object, required: false },
    opened: { type: Date, default: Date.now },
    created: { type: Date, default: Date.now }
})

const openPositionsSchema = new Schema({
    tag: { type: String, required: true, index: true },
    account: { type: String, required: true, index: true },
    symbol: { type: String, required: true },
    side: { type: String, match:/^B$|^S$|^LF$|^SF$/, required: true },
    market_type: { type: String, enum: ['spot', 'futures'], required: false, default: 'spot' },
    total_contracts: { type: Number, required: true, min: 0 },
    average_price: { type: Number, required: true },
    dollar_amount: { type: Number, required: false },
    trade_count: { type: Number, required: true, default: 0 },
    trade_ids: [{ type: String }],
    first_opened: { type: Date, required: true },
    last_updated: { type: Date, required: true },
    metadata: { type: Object, required: false }
})

// Create unique compound index for tag + account + market_type
openPositionsSchema.index({ tag: 1, account: 1, market_type: 1 }, { unique: true })

const closedTradesSchema = new Schema({
    tag: { type: String, required: true, index: true },
    account: { type: String, required: true, index: true },
    symbol: { type: String, required: true },
    side: { type: String, match:/^B$|^S$|^LF$|^SF$/, required: true },
    market_type: { type: String, enum: ['spot', 'futures'], required: false, default: 'spot' },
    contracts_closed: { type: Number, required: true },
    close_price: { type: Number, required: true },
    percentage: { type: Number, required: true },
    order_id: { type: String, required: false },
    position_before: { type: Number, required: true },
    position_after: { type: Number, required: true },
    average_entry_price: { type: Number, required: true },
    dollar_amount: { type: Number, required: false },
    pnl: { type: Number, required: false },
    pnl_percentage: { type: Number, required: false },
    metadata: { type: Object, required: false },
    closed_at: { type: Date, required: true, default: Date.now },
    created: { type: Date, required: true, default: Date.now }
})

module.exports = {
    User: mongoose.model('User', userSchema),
    Trigger_Orders: mongoose.model('Trigger_Orders', triggerOrdersSchema),
    TO_Processed: mongoose.model('TO_Processed', tOrdersProcessedSchema),
    Trades_Opened: mongoose.model('Trades_Opened', openTradesSchema, 'trades_opened'),
    Positions_Open: mongoose.model('Positions_Open', openPositionsSchema, 'positions_open'),
    Trades_Closed: mongoose.model('Trades_Closed', closedTradesSchema, 'trades_closed'),
    database: mongoose.connect(process.env.DB_URL, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        useFindAndModify: false,
        useCreateIndex: true,
        readPreference: 'primary',
        replicaSet: 'rs0'
    })
}






