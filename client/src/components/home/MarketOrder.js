import React from 'react'
import TableRow from './TableRow';

const MarketOrder = ({ tagTrades }) => {
    const buildMarketTable = () => {
        tagTrades.map((tag) => {
            //Get both sells and buys for a tag and put in trades
            const trades = [...tag['openTrades'][0], ...tag['openTrades'][1]]

            //Sort the trades ascending
            trades.sort((a,b) => a.data.timestamp - b.data.timestamp)

            //Return table element for every trade for this tag
            const row = trades.map((trade, index) => <TableRow key={index} tag={tag} trade={trade}/>)
            return row
        })
    }

    return (
        <div>
            <h3>Orders opened at Market</h3>
            <table>
                <thead>
                    <tr className="table-head">
                        <th>Tag</th>
                        <th>Date</th>
                        <th>Symbol</th>
                        <th>Side</th>
                        <th>Type</th>
                        <th>Price</th>
                        <th>TP</th>
                        <th>P</th>
                        <th>Qnty</th>
                        <th>Account</th>
                    </tr>
                </thead>
                <tbody>
                    { buildMarketTable() }
                </tbody>
            </table>
        </div>
    )
}

export default MarketOrder
