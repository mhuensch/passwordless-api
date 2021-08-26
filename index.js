require('dotenv').config()

const express = require('express')
const expressSession = require('express-session')
const corsware = require('cors')
const cookieParser = require('cookie-parser')
const bodyParser = require('body-parser')
const http = require('http')
const axios = require("axios")
const socketio = require('socket.io')
require('express-async-errors')

const session_options =
  { secret: process.env.SECRET
  , resave: true
  , autoSave: true
  , saveUninitialized: true
  , unset: 'destroy'
  , cookie: 
    { httpOnly: true
    , maxAge: parseInt(process.env.MAXAGE || 60000)
    , secure: process.env.SECURE !== 'false'
    }
  }

const cors_options = 
  { origin: process.env.ORIGIN
  , methods: ['GET', 'POST']
  , exposedHeaders: ['set-cookie']
  , credentials: true
  }


/*
  Connect the express middleware we need for making the communication process work.
  It's important that all the logic for auth happen here rather than in the client, 
  as we will be using both access tokens to authorize the user,
  and refresh tokens to limit the number of times a user must 're-auth'.
  This is tricky, because we dont want to expose the tokens to XSS or CSRF attacks.
*/
const app = express()
app.use(cookieParser())

const session = expressSession(session_options)
app.use(session)

const cors = corsware(cors_options)
app.use(cors)

app.use(bodyParser.json())

const server  = http.createServer(app)
const cook_key = 'auth0token'

/*
  Now that we've configured our express app, we need to set up all the 
  endpoints we will need for user management.  These can be called directly by the web client,
  but will not be availiable to any socket connections as that connection can not make use
  of the secured cookies we need to store the refresh token.
*/

// TODO: find some way to load these commands dynamically, indicating which ones need auth,
// and handling errors and auth errors globally.

// Send the user an email with a verification code so we know they are a valid user.
app.post('/send', async (req, res) => {
  const options = 
    { method: 'POST'
    , baseURL: process.env.AUTH0_URL
    , url: '/passwordless/start'
    , headers: {'content-type': 'application/json'}
    , data: 
      { connection: 'email'
      , send: 'code'
      , client_id: process.env.AUTH0_CLIENT_ID
      , email: req.body.email
      }
    }

  await axios.request(options)
  res.json({ message: 'email sent' })
})

// Exchange the user's email and verification code for access and refresh tokens
app.post('/verify', async (req, res) => {
  const options = 
    { method: 'POST'
    , baseURL: process.env.AUTH0_URL
    , url: '/oauth/token'
    , headers: {'content-type': 'application/json'}
    , data: 
      { grant_type: 'http://auth0.com/oauth/grant-type/passwordless/otp'
      , realm: 'email'
      , scope: 'openid profile email offline_access'
      , client_id: process.env.AUTH0_CLIENT_ID
      , username: req.body.email
      , otp: req.body.code
      }
    }

  const result = await axios.request(options)
  
  // This is where the "magic" occurs.  We store the refresh token in an httponly cookie
  // so it is as secure as we can make it and still use it to re-auth when needed.
  // This cookie will survive browser refreshes and closes (unless cleared by the user).
  // If configured correctly (see README.md), this will be a long lived token from Auth0
  // that can be invalidated when necessary and changed when exchanged.
  res.cookie(cook_key, result.data.refresh_token)
  
  // We will send back the access token, to be stored in memory ONLY, so that 
  // it can be used frequently to verify the user.  It should be short lived (< 24 hours)
  // and will not survive browser refresh or close.  However, we can use the refresh token
  // to get a new access token whenever we need, as long as it hasn't been invalidated
  // by another request/device/etc.
  res.json({ token: result.data.access_token })
})

// Exchange the users refresh token for a new auth token.  This should only be called
// when the auth token is invalid (i.e. expired, lost, etc.)
app.get('/token', async (req, res) => {
  const options = 
    { method: 'POST'
    , baseURL: process.env.AUTH0_URL
    , url: '/oauth/token'
    , headers: {'content-type': 'application/json'}
    , data: 
      { grant_type: 'refresh_token'
      , client_id: process.env.AUTH0_CLIENT_ID
      , client_secret: process.env.AUTH0_CLIENT_SECRET
      , refresh_token: req.cookies[cook_key]
      }
    }
  
  // SEE: comments in verify method for what we're doing here and why. 
  try {
    const result = await axios.request(options)
    res.cookie(cook_key, result.data.refresh_token)
    res.json({ token: result.data.access_token })
  } catch (err) {
    res.status(500).send({ error: err.message })
  }
})

// We want to clear all the stored token information for the user.
// This will ensure that there is no "hanging" authorization and minimize exposure
// when the user want's to unauthorize a particular browser/device/etc.
app.get('/disconnect', async (req, res) => {
  const options = 
    { method: 'POST'
    , baseURL: process.env.AUTH0_URL
    , url: '/oauth/revoke'
    , headers: {'content-type': 'application/json'}
    , data: 
      { client_id: process.env.AUTH0_CLIENT_ID
      , client_secret: process.env.AUTH0_CLIENT_SECRET
      , token: req.cookies[cook_key]
      }
    }

  // Expire the current refresh token with Auth0
  try { 
    const result = await axios.request(options)
  } catch (err){
    console.log('Error', err.data)
  }
  // Remove the token from the cookie so it cant be reused by mistake
  res.clearCookie(cook_key)
  // Notify the client we are now disconnected so it can clear any user, token, etc. information
  res.json({ message: 'disconnected' })
})




// Get the info using given tokens so that we can have more information about the user.
app.get('/info', async (req, res) => {
  const auth_header = req.headers.authorization || ''
  const access_token = auth_header.replace('token ', '')
  
  const options = 
    { method: 'GET'
    , baseURL: process.env.AUTH0_URL
    , url: '/userinfo'
    , headers: 
      { 'content-type': 'application/json'
      , 'authorization': `Bearer ${access_token}`
      }
    }
  
  const response = await axios.request(options)
  const result = response.data
  
  result.tokens =  
    { refresh: process.env.SECURE !== 'false' 
      ? req.cookies[cook_key] 
      : 'redacted'
    , access: access_token
    }
  
  res.json(result)
})





// Error handling 
app.use((err, req, res, next) => {
  if (err.message === 'Request failed with status code 401') {
    res.status(401).send({ error: err.message })
    return next()
  }
  
  next(err)
})





const io = socketio(server, { cors: cors_options })

io.on('connection', async (client) => {
  try {
    const access_token = client.handshake.auth.token

    const options = 
      { method: 'GET'
      , baseURL: process.env.AUTH0_URL
      , url: '/userinfo'
      , headers: 
        { 'content-type': 'application/json'
        , 'authorization': `Bearer ${access_token}`
        }
      }

    const response = await axios.request(options)
    const result = response.data
    console.log('USER CONNECTED', result)

  } catch (err) {
    client.emit('unauthorized', 'Invalid Token')
    client.disconnect(true)
  }
  
  
  client.on('test', options => {
    // TODO: this needs to handle the check globally.
    console.log('options token', JSON.parse(options).token)
    console.log('handshake token', client.handshake.auth.token)
  })
})

server.listen(process.env.PORT || 80)