import React from 'react';
import { Link } from 'react-router-dom';
import './navigation.css'

const Navigation = ({isLoaded,isAuth,unauthorized}) => {
    return (
        <div className='navigation'>
          <h2 className='title'>CCXT Trading Platform</h2>
          <ul className='nav-links'>
            <li key='login'>
              <Link className='link' to='/'>Login</Link>
            </li>
            <li key='register'>
              <Link className='link' to='/register'>Register</Link>
            </li>
            { 
              isLoaded && isAuth && !unauthorized ?
              <>
                <li key='account'>
                  <Link className='link' to='/account'>My Account</Link>
                </li>
                <li key='trade'>
                  <Link className='link' to='/trade'>Create Trade</Link>
                </li>
              </> : ''
            }          
          </ul>
        </div>
    )
}

export default Navigation
