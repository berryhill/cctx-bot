const Schema = require('validate');

//Defines what is allowed/format of what we expect to receive tot the POST end of CCXT on the Webserver. Validation of data.
const postSchema = new Schema({
    "s": {
        type: String,
        required: true,
        message: {
            type: 'Symbol must be a string.',
            required: 'Symbol is required.'
            }
        },
    "c": {
        type:String,
        required: true,
        enum: ['B','S','CB','CS','LF','SF','CLF','CSF','FLIPF'],
        message: {
            type: 'Command must be a string.',
            required: 'Command is required.'
            }
    },
    "t": {
        type: String,
        required: true,
        enum: ['M','L'],
        message: {
            type: 'Order Type must be a string.',
            required: 'Order Type is required.'
            }
        },
    "tag": {
        type: String,
        required: false,
        match: /^[a-zA-Z0-9]{1,}$/,
        message: {
            type: 'Tag must be a string.',
            required: 'Tag is required.'
            }
    },
    "tp": {
        //Target Price from Entry
        type: String,
        required: false,
        match: /^[0-9]{1,}%$|^[0-9]{1,3}\.[0-9]{1,3}%$/,
        message: {
            type: 'TP must be a string.',
            required: 'TP is required.'
            }
    },
    "p": {
        //Defined Entry Price, in % from market price or +-5 USD from market price
        type: String,
        required: false,
        match: /^[0-9]{1,}%$|^[0-9]{1,5}\.[0-9]{1,3}%$|^\+?-?[0-9]{1,}$/,
        message: {
            type: 'TP must be a string.',
            required: 'TP is required.'
            }
    },
    "q": {
        //>0.0025 XBT or USDT amount - validation removed for flexibility
        type: String,
        required: true,
        message: {
            type: 'Amount must be a string.',
            required: 'Amount is required.'
            }
    },
    "a": {
        //Account
        type: String,
        required: true,
        match: /^[a-zA-Z0-9]{3,}$/,
        message: {
            type: 'Account must be a string.',
            required: 'Account is required.'
            }
    },
    "code": {
        //Code
        type: String,
        required: true,
        match: /^13131$/,
        message: {
            type: 'Code must be a string.',
            required: 'Code is required.'
            }
    }
});

module.exports = postSchema