import React from 'react';
import './userinfo.css';

const UserInfo = ({ unauthorized, margin, session, instruments }) => {
    const toBitcoin = (satoshis) => {
        return parseInt(satoshis) / 100000000
    }

    return (
        <div className='container-info'>
            {
                !unauthorized ? 
                <div className='info-user'>
                    <p><b>Bitmex Account Balance</b></p>
                    <p><b>Free:</b> <i>{ toBitcoin( margin[session.username][0]['availableMargin'] )} BTC</i></p>
                    <p><b>Used:</b> <i>{ toBitcoin( margin[session.username][0]['maintMargin'] )} BTC</i></p>
                    <p><b>Total:</b> <i>{ toBitcoin( margin[session.username][0]['marginBalance'] )} BTC</i></p>
                </div> : <div><p>Limited Mode</p><p>Not showing user info</p></div>
            }
            <div className='info-price'>
                <p><b>More Information</b></p>
                <p><b>Last Price { instruments['XBTUSD'].symbol}:</b> {instruments['XBTUSD'].lastPrice}</p>
                <p><b>Last Price { instruments['XRPUSD'].symbol}:</b> {instruments['XRPUSD'].lastPrice}</p>
                <p><b>Last Price { instruments['ETHUSD'].symbol}:</b> {instruments['ETHUSD'].lastPrice}</p>
                <p><b>Updated:</b> { instruments['XBTUSD'].timestamp}</p>
            </div>
        </div>
    )
}

export default UserInfo
