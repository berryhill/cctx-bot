import React, { useState } from 'react';
import './login.css'

const Login = (props) => {
    const { authMe, register } = props

    const [ username, setUsername ] = useState('')
    const [ password, setPassword ] = useState('')

    const handleUsernameChange = (e) => {
        setUsername(e.target.value)
    }

    const handlePasswordChange = (e) => {
        setPassword(e.target.value)
    }

    const handleSubmit = (e) => {
        e.preventDefault();
        console.log("Clicked Submit Button!")
        authMe({
            username,
            password
        })
    }

    const handleRegister = (e) => {
        e.preventDefault();
        console.log("Clicked Register Button!")
        register()
    }

    return (
        <div className='container'>
            <div className='menu'>
                <div className='box'>
                    <h2>Login Screen</h2>
                    <div className='box-username'>
                        <label htmlFor='username'>Username:</label>
                        <br></br>
                        <input type='text' id='username' placeholder='username' value={username} onChange={handleUsernameChange}/>
                    </div>
                    <div className='box-password'>
                        <label htmlFor='password'>Password:</label>
                        <br></br>
                        <input type='password' id='password' placeholder='password' value={password} onChange={handlePasswordChange}/>
                    </div>
                    <div className='button-login'>
                        <input type='submit' value='Login' onClick={handleSubmit}/>
                    </div>
                    <h3>Want to Register?</h3>
                    <div className='button-register'>
                        <input type='submit' value='Create Account' onClick={handleRegister}/>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Login;