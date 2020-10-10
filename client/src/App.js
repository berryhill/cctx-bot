import React from 'react';
import Homepage from './components/home/Homepage';
import Login from './components/login/Login';
import PostForm from './components/post/PostForm'
// import { BrowserRouter, Route, Switch } from 'react-router-dom'
import LoadingScreen from './components/home/LoadingScreen';
import Register from './components/register/Register'

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
        tagTrades: [], 
        tpOrders: [],
        latestPrivate: {}, 
        latestPublic: {},
        isLoaded: false,
        unauthorized: false,
        isAuth: false,
        intervalRefreshID: '',
        token: '',
        page: 'login',
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
            page: 'homepage',
            session: {
              username: data.username
            }

          }, function() {
            //Single Time Load
            this.loadData()
              .then((d) => {
                console.log('Data Updated: ',d)
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
  logout = (e) => {
    clearInterval(this.state.intervalRefreshID);
    this.setState({
        tagTrades: [], 
        tpOrders: [],
        latestPrivate: {}, 
        latestPublic: {},
        isLoaded: false,
        unauthorized: false,
        isAuth: false,
        intervalID: '',
        token: '',
        page: 'login',
        session:{
          username: '',
          email: '',
          phone: '',
          config: {
            darkmode: false
          }
        }
    })
  }

  homePage = (e) => {
    // e.preventDefault();
    this.setState({
      page: 'homepage'
    })
  }

  postForm = (e) => {
    // e.preventDefault();
    this.setState({
      page: 'postform'
    })
  }

  register = (e) => {
    // e.preventDefault();
    this.setState({
      page: 'register'
    })
  }

  render(){
    if(this.state.isAuth) {
      switch (this.state.page) {
        case 'homepage':
          return this.state.isLoaded ? <Homepage { ...this.state } logout={this.logout} postform={this.postForm}/> : <LoadingScreen />
        case 'postform':
          return <PostForm token={this.state.token} logout={this.logout} homepage={this.homePage}/>
        case 'register':
          return <Register homepage={this.homePage}/>
        default:
          return <Login authMe={this.authMe} register={this.register}/>
      }        
    } else {
      switch(this.state.page) {
        case 'register':
          return <Register homepage={this.homePage}/>
        default:
          return <Login authMe={this.authMe} register={this.register}/>
      }
    }
  }
}

export default App;
