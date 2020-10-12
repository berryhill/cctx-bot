import React from 'react';
import { Switch, Route, withRouter } from 'react-router-dom';

import Navigation from './components/nav/Navigation';
import Homepage from './components/home/Homepage';
import Login from './components/login/Login';
import Register from './components/register/Register';
import Trade from './components/trade/Trade';

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
        tagTrades: [], 
        tpOrders: [],
        latestPrivate: {}, 
        latestPublic: {},
        isLoaded: false,
        isAuth: false,
        unauthorized: false,
        intervalRefreshID: '',
        token: '',
        session:{
          username: '',
          email: '',
          phone: '',
          config: {
            darkmode: false
          }
        }
    }
  }

  loadData = async () => {
    console.log('loadData run!')
    const getHeaders = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.state.token
      }
    }

    return Promise.all([
      new Promise((resolve,reject) => {
        fetch('/api/tagTrades', getHeaders)
          .then(d=>d.json())
          .then(tagTrades =>  { 
            this.setState({
              tagTrades
            })
            resolve(tagTrades)
          })
          .catch(e => { 
            console.log('Error GET /api/tagTrades',e)
            reject(e)
          })
      }),

      new Promise((resolve,reject) => {
        fetch('/api/tpOrders', getHeaders)
          .then(d=>d.json())
          .then(tpOrders =>  {
            this.setState({
              tpOrders,
            })
            resolve(tpOrders)
          })
          .catch(e => { 
            console.log('Error GET /api/tpOrders',e)
            reject(e)
          })
      }),
      

      new Promise((resolve,reject) => {
        fetch('/api/latest/private', getHeaders)
          .then(d=>d.json())
          .then(latestPrivate =>  {
            if(latestPrivate.statusCode === 403) {
              this.setState({
                unauthorized: true
              })
            }
            this.setState({
              latestPrivate,
            })
            resolve(latestPrivate)            
          })
          .catch(e => console.log('Error GET /api/private',e))
      }),
      

      new Promise((resolve,reject) => {
        fetch('/api/latest/public', getHeaders)
          .then(d=>d.json())
          .then(latestPublic =>  { 
            this.setState({
              latestPublic,
            })
            resolve(latestPublic)
          })
          .catch(e => { 
            console.log('Error GET /api/public',e)
            reject(e)
          })
      })
     
    ]).then((d) => {
      console.log('PromiseAll Response: ',d)
      this.setState({ isLoaded: true })
      return d
    }).catch(e => console.log('PromiseAll error: ',e))

  }

  authMe = (data) => {
    console.log('authMe authenticating user...:',data)
    fetch('/login',{
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data) // body data type must match "Content-Type" header
    }).then(d => d.json())
      .then(d => {
        
        //Received Token
        if(d.token) {
          console.log('Authorized! Received token.')

          this.setState({ 
            isAuth: true, 
            token: d.token, 
            session: {
              username: data.username
            }

          }, function() {
            //Single Time Load
            this.loadData()
              .then((d) => {
                console.log('Data Updated: ',d)
                this.props.history.push("/account");
              })
              .catch(e => console.log('Unable to refresh/load data: ',e))

            //Periodic Update
            const intervalRefreshID = setInterval(() => {
              this.loadData()
              .then((d) => { 
                if(d !== undefined) {
                  console.log('Data Updated: ',d)
                } else {
                  console.log('Data null killing Interval')
                  clearInterval(this.state.intervalRefreshID)
                }
              })
              .catch(e => console.log('Unable to refresh/load data: ',e))
            },10000)

            this.setState({
              intervalRefreshID: intervalRefreshID
            })
          })
        
        } else {
          console.log('Wrong credentials')
        }

      })
      .catch(e=>console.log('Fetch /login error:',e))
  }

  //Switch Pages
  logout = () => {
    clearInterval(this.state.intervalRefreshID);
    this.setState({
        tagTrades: [], 
        tpOrders: [],
        latestPrivate: {}, 
        latestPublic: {},
        isLoaded: false,
        isAuth: false,
        unauthorized: false,
        intervalID: '',
        token: '',
        session:{
          username: '',
          email: '',
          phone: '',
          config: {
            darkmode: false
          }
        }
    })
    this.props.history.push("/");
  }

  render(){
    return (
      <div className='app'>
        <Navigation 
          isLoaded={this.state.isLoaded} 
          isAuth={this.state.isAuth}
          unauthorized={this.state.unauthorized}
          logout={this.logout}
          username={this.state.session.username}
        />
        <Switch>
          <Route exact path="/">
            <Login authMe={this.authMe} />
          </Route>
          <Route exact path="/register">
            <Register />
          </Route>
          <Route exact path="/account">
            <Homepage {...this.state} logout={this.logout}/>
          </Route>
          <Route exact path="/trade">
            <Trade token={this.state.token} logout={this.logout}/>
          </Route>
        </Switch>
      </div>
    )
  }
}

export default withRouter(App);
