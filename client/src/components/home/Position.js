import React from 'react'

const Position = ({ latestPrivate, unauthorized}) => {
    let hasData = Object.keys(latestPrivate).length !== 0

    const buildPositionTable = () => {
        if(hasData) {
            return latestPrivate['position'].map((pos) => {
                const { symbol, currency, currentQty, liquidationPrice } = pos
    
                //Return table element for current symbol
                return (
                    <tr key={symbol}>
                        <td>{symbol}</td>
                        <td>{currentQty}</td>
                        <td>{currency}</td>
                        <td>{liquidationPrice}</td>
                    </tr>
                )
            })
        } else {
            return 'Limited Mode'
        }
    }
    
    return (
        hasData ?
        <div>
            <h3>Position Data</h3>
            <table>
                <thead>
                    <tr className="table-head">
                        <th>Symbol</th>
                        <th>Current Qty</th>
                        <th>Currency</th>
                        <th>Liquidation Price</th>
                    </tr>
                </thead>
                {
                    !unauthorized ? 
                    <tbody>
                        {buildPositionTable()}
                    </tbody> : 'Limited Mode - Not showing position table'
                }
            </table>
        </div>
        : ''
    )
}

export default Position
