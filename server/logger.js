function timeTag() { 
    return `${c.yellow}[${(new Date).toISOString()}]${c.end}`
}

const c = {
    end: "\x1b[0m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
}

module.exports = function Logger(service,color) {
    this.service = service
    this.color = color ? color : c.cyan
    this.print = (update,message) => console.log(`${timeTag()}${this.color}[${this.service}]${"\x1b[0m"} <${update}>: ${message}`)
};