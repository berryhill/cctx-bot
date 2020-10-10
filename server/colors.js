module.exports = {
    pick: {
        end: "\x1b[0m",
        bold: "\x1b[1m",
        faint: "\x1b[2m",
        italic: "\x1b[3m",
        underlined: "\x1b[4m",
        blink: "\x1b[5m",
        inverse: "\x1b[7m",
        hidden: "\x1b[8m",
        strike: "\x1b[9m",
    
        black:"\x1b[30",
        red: "\x1b[31m",
        green: "\x1B[32m",
        yellow: "\x1b[33m",
        blue: "\x1b[34m",
        magenta: "\x1b[35m",
        cyan: "\x1b[36m",
        white: "\x1b[37",
    
        BgBlack: "\x1b[40",
        BgRed: "\x1b[41",
        BgGreen: "\x1b[42",
        BgYellow: "\x1b[43",
        BgBlue: "\x1b[44",
        BgMagenta: "\x1b[45",
        BgCyan: "\x1b[46",
        BgWhite: "\x1b[47",
    },
    rgbFont(r,g,b) {
        return `\x1B[38;2;${r};${g};${b}m`
    },
    rgbBG(r,g,b){
        return `\x1B[48;2;${r};${g};${b}m`
    },

    cursor: {
        oneBack: "\b",
        oneUp: "\x1b[a",
        nUp(n) { return `\x1b[${n}a`},
        beginLine: "\r",
        beginPrevLine: "\x1b[f",
        beginPrevLineN(n) { return `x1b[${n}f]`},
        ereaseLine: "\x1b[2k"
    }
}