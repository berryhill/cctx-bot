const express = require('express');
const cors = require('cors');
const Logger = require('./../utils/logger');
const color = require('./../utils/colors');
const log = new Logger('Express',color.pick.magenta);
const path = require('path')

const whitelist = ['https://signalgone.com']
const corsOptions = {
  origin: function (origin, callback) {
    if (whitelist.indexOf(origin) !== -1) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  }
}

//Setup Express and MiddleWare
log.print('Loading','Setting up App and Middleware')
const app = express();
// app.use(cors(corsOptions)); //USE FOR PRODUCTION!
app.use(cors());
app.use(express.json());
// Static file serving disabled for production deployment
// The client is served separately in development/local environments
// app.use(express.static(path.resolve("../build") + "/public"));

module.exports = function Express() {
    this.init = () => new Promise((resolve,reject) => {
        if(app !== undefined) {
            resolve(app)
            log.print(`${color.pick.yellow}Ready${color.pick.end}`,'App created and MiddleWare Loaded\n')
        } else {
            reject('fail')
            log.print(`${color.pick.red}Failure${color.pick.end}`,'Express App failed to load!')
        }
    })
}