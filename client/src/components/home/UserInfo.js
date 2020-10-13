import React from 'react';
import './userinfo.css';

const UserInfo = ({ unauthorized, latestPrivate, instruments }) => {
    const toBitcoin = (satoshis) => {
        return parseInt(satoshis) / 100000000
    }

    let hasData = Object.keys(latestPrivate).length !== 0
    return (
        <div className='container-info'>
            {
                hasData ? 
                <div className='info-user'>
                    <p><b>Bitmex Account Balance</b></p>
                    <p><b>Free:</b> <i>{ toBitcoin( latestPrivate.margin[0]['availableMargin'] )} BTC</i></p>
                    <p><b>Used:</b> <i>{ toBitcoin( latestPrivate.margin[0]['maintMargin'] )} BTC</i></p>
                    <p><b>Total:</b> <i>{ toBitcoin( latestPrivate.margin[0]['marginBalance'] )} BTC</i></p>
                </div> : <div><p>Limited Mode</p><p>Not showing user info</p></div>
            }
            <div className='info-price'>
                <p><b>More Information</b></p>
                <p><b>Last Price { instruments['XBTUSD'].symbol}:</b> {instruments['XBTUSD'].lastPrice}</p>
                <p><b>Last Price { instruments['XRPUSD'].symbol}:</b> {instruments['XRPUSD'].lastPrice}</p>
                <p><b>Last Price { instruments['ETHUSD'].symbol}:</b> {instruments['ETHUSD'].lastPrice}</p>
                <p><b>Last Price { instruments['LTCUSD'].symbol}:</b> {instruments['LTCUSD'].lastPrice}</p>
                <p><b>Last Price { instruments['BCHUSD'].symbol}:</b> {instruments['BCHUSD'].lastPrice}</p>
                <p><b>Updated:</b> { instruments['XBTUSD'].timestamp}</p>
            </div>
        </div>
    )
}

export default UserInfo
