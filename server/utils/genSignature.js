const crypto = require('crypto');

module.exports = function(apiKey,apiSecret) {
    const user = {
        "apiKey":apiKey,
        "apiSecret":apiSecret
    }

    const url = 'GET/realtime';
    const expires = Math.round(new Date().getTime() / 1000) + 60*60; // 1 min in the future

    const signature = crypto.createHmac('sha256', user.apiSecret)
        .update(url + expires)
        .digest('hex');


    // console.log("[!] Authentication Signature: ",signature)

    return {"op": "authKeyExpires", "args": [user.apiKey,expires,signature]}
}