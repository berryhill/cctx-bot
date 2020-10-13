import React from 'react';

import LoadingScreen from './LoadingScreen';
import UserInfo from './UserInfo';

import Position from './Position';
import MarketOrder from './MarketOrder';
import LimitOrder from './LimitOrder';

import './homepage.css';

const Homepage = (props) => {
    const { tagTrades, tpOrders, latestPublic } = props
    const { instruments } = latestPublic

    // const buildOrderTable = () => (
    //     props.latestPrivate['order'][session.username].map((pos) => {
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

    return (
        props.isLoaded ? 
        <div className='container'>
            <div className='top-container'>
                <div className='top-title'>
                    <h1>All Trades Listed Since Online</h1>
                    <UserInfo
                        className='user-info'
                        latestPrivate={props.latestPrivate}
                        instruments={instruments}
                    />
                </div>
            </div>
            <div className='container-table'>
                <Position 
                    className='table-position'
                    latestPrivate={props.latestPrivate}
                />
                <MarketOrder 
                    className='table-marketorder' 
                    tagTrades={tagTrades} />
                <LimitOrder 
                    className='table-limitorder' 
                    tpOrders={tpOrders} />
            </div>
        </div> 
        : <LoadingScreen />
    )

}

export default Homepage;