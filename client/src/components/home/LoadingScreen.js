import React from 'react';
import './loadingscreen.css'

const LoadingScreen = () => {
    return (
        <div className="loading-container">
            <div className="loading-box">
                <h2>Your data is being loaded please wait...</h2>
            </div>
        </div>
    )
}

export default LoadingScreen;