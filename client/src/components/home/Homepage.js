import React from 'react';
import TableRow from './TableRow';
import LoadingScreen from './LoadingScreen';
import './homepage.css';
import './LoadingScreen';

const Homepage = (props) => {
    const { tagTrades, tpOrders, latestPublic , session, logout, postform } = props
    const { unauthorized } = props
    const { instruments } = latestPublic

    const buildTable = () => {
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

    const buildPositionTable = () => {
        if(!unauthorized) {
            props.latestPrivate['position'][session.username].map((pos) => {
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

    // const buildOrderTable = () => (
    //     latestPrivate['order'][session.username].map((pos) => {
    //         const { symbol, currency, currentQty, liquidationPrice } = pos

    //         //Return table element for current symbol
    //         return (
    //             <tr key={symbol}>
    //                 <td>{symbol}</td>
    //                 <td>{currentQty}</td>
    //                 <td>{currency}</td>
    //                 <td>{liquidationPrice}</td>
    //             </tr>
    //         )
    //     })
    // )

    const toBitcoin = (satoshis) => {
        return parseInt(satoshis) / 100000000
    }

    return (
        props.isLoaded ? <div className='container'>
            {/* {console.log(latestPrivate)} */}
            <div className='top-container'>
                <div><h1>CCXT - All Registered Trades Since Online</h1></div>
                <div className='form-button-container'>
                    <h4>Logged in as <b>{session['username']}</b></h4>
                    { 
                        !unauthorized ? 
                        <input 
                            type="button" 
                            onClick={(e) => {
                                    e.preventDefault();
                                    console.log("Clicked PostForm Button!")
                                    postform()
                                }} 
                            value="Go To POST-Form"
                        /> : 'Limited Mode'
                    }
                    <input 
                        type="button" 
                        onClick={(e) => {
                                e.preventDefault();
                                console.log("Clicked Logout Button!")
                                logout()
                            }} 
                        value="Logout"
                    />
                </div>
            </div>
            <br/>
            <br/>
            <div className='container-info'>
                {
                    !unauthorized ? 
                    <div className='info-user'>
                        <p><b>Bitmex Account Balance</b></p>
                        <p><b>Free:</b> <i>{ toBitcoin( props.latestPrivate.margin[session.username][0]['availableMargin'] )} BTC</i></p>
                        <p><b>Used:</b> <i>{ toBitcoin( props.latestPrivate.margin[session.username][0]['maintMargin'] )} BTC</i></p>
                        <p><b>Total:</b> <i>{ toBitcoin( props.latestPrivate.margin[session.username][0]['marginBalance'] )} BTC</i></p>
                    </div> : 'Limited Mode - Not showing user info'
                }
                <div className='info-price'>
                    <p><b>More Information</b></p>
                    <p><b>Last Price { instruments['XBTUSD'].symbol}:</b> {instruments['XBTUSD'].lastPrice}</p>
                    <p><b>Last Price { instruments['XRPUSD'].symbol}:</b> {instruments['XRPUSD'].lastPrice}</p>
                    <p><b>Last Price { instruments['ETHUSD'].symbol}:</b> {instruments['ETHUSD'].lastPrice}</p>
                    <p><b>Updated:</b> { instruments['XBTUSD'].timestamp}</p>
                </div>
            </div>
            <div className='container-table'>
                <h3>Orders opened at Market</h3>
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
                        { buildTable() }
                    </tbody>
                </table>
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
        </div> : <LoadingScreen />
    )

}

export default Homepage;