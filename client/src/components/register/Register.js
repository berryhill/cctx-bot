import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import './register.css';

const Register = () => {
    const [username, setUsername] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [passwordConfirm, setPasswordConfirm] = useState('')

    const registerUser = (e) => {
        e.preventDefault()
        console.log('Register button clicked')
        const data = {
            username,
            email,
            password
        }
        
        if(password===passwordConfirm) {
            fetch('/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            }).then(d=>d.json())
                .then(d => {
                    if(d.statusCode === 501) {
                        alert('Username/email already exists')
                    } else {
                        alert('Successfully registered!')
                        console.log('Registration response: ',d)
                        
                        //REDIRECT TO HOMEPAGE homepage()
                    }
                })
                .catch(e => console.log('Registration Error: ',e))
        } else {
            alert(`The password don't match, please check if you spelled them correctly!`)
        }
    }

    const handleChange = (e) => {
        e.preventDefault()
        const name = e.target.name
        const val = e.target.value

        switch(name) {
            case 'username':
                setUsername(val)
                break;
            case 'email':
                setEmail(val)
                break;
            case 'password':
                setPassword(val)
                break;
            case 'passwordConfirm':
                setPasswordConfirm(val)
                break;
            default:
                return
        }
    }

    return (
        <div className='register-container'>
            <div className='register-box'>
                <div className='title'>
                    <h2>Sign-up</h2>
                    <h5>What are you waiting for? Start earning profit today!</h5>
                </div>
                <div className='form-container'>
                    <label htmlFor='username'>Username:</label>
                    <input 
                        type='text' 
                        value={username} 
                        name='username' 
                        placeholder='Provide your username' 
                        required 
                        onChange={handleChange}
                        />
                    <label htmlFor='email'>Email:</label>
                    <input 
                        type='email' 
                        value={email} 
                        name='email' 
                        placeholder='Provide your email address' 
                        required 
                        onChange={handleChange}
                        />
                    <label htmlFor='password'>Password:</label>
                    <input 
                        type='password' 
                        value={password} 
                        name='password' 
                        placeholder='Provide your password' 
                        required 
                        onChange={handleChange}
                        />
                    <label htmlFor='passwordConfirm'>Password Confirmation:</label>
                    <input 
                        type='password' 
                        value={passwordConfirm} 
                        name='passwordConfirm' 
                        placeholder='Confirm your password once more' 
                        required 
                        onChange={handleChange}
                        />
                    <input type='submit' value='Register' onClick={registerUser}/>
                    <Link to='/'>
                        <button type='button'>
                            Back to Login
                        </button>
                    </Link>
                </div>
            </div>
        </div>
    )
}

export default Register