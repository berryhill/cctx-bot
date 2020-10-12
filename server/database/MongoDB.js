require('dotenv').config()
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const user = new Schema({
    created: { type: Date, default: Date.now },
    email: { type: String, min: 6, match: /^[a-z]{1,}@[a-z]{2,}.[a-z]{2,}$/, required: true, unique: true},
    username: { type: String, min: 3, max: 30, match: /^[a-zA-Z0-9]{3,30}$/, required: true, unique: true },
    password: { type: String, min: 5, max: 30, required: true },
    telegram: { type: Object, require: false},
    api: { type: Object, required: false },
    phone: { type: String, required: false },
    config: { type: Object, required: false }
})

module.exports = {
    User: mongoose.model('User', user),
    database: mongoose.connect(process.env.DB_URL, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        useFindAndModify: false,
        useCreateIndex: true
    })
}






