import React from 'react'
import TableRow from './TableRow';

const LimitOrder = ({ tpOrders }) => {
    const buildLimitTable = () => {
        tpOrders.map((tag) => {
            //Get both sells and buys for a tag and put in trades
            const trades = [...tag['pendingTrades'][0], ...tag['pendingTrades'][1]]

            //Sort the trades ascending
            trades.sort((a,b) => a.data.timestamp - b.data.timestamp)

            //Return table element for every trade for this tag
            const row = trades.map((trade, index) => <TableRow key={index} tag={tag} trade={trade}/>)
            return row
        })
    }
    
    return (
        <div>
            <h3>Opened Limit Orders</h3>
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
                    { buildLimitTable() }
                </tbody>
            </table>
        </div>
    )
}

export default LimitOrder
