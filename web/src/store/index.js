import root from '../reducers';
import { createStore, applyMiddleware, compose} from 'redux';
import { createLogger } from 'redux-logger';
import thunkMiddleware from 'redux-thunk';
import {LOGIN_USER, LOGOUT_USER} from '../actions';

let local_auth = localStorage.getItem('auth')
local_auth = local_auth ? JSON.parse(local_auth) : null

const initial_state = {
   'Auth' : {
        info: local_auth ? {
            'username': local_auth.username, 
            'role': local_auth.role, 
            'refresh': local_auth.refresh,
            "jwt": local_auth.jwt} : null,
        status:  local_auth ? LOGIN_USER : LOGOUT_USER,
        message: null,
    }
}

/*eslint-disable */
const composeSetup = process.env.NODE_ENV !== 'production' && typeof window === 'object' &&
  window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ ?
  window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ : compose
/*eslint-enable */

// disable redux logger for production
const store = (process.env.NODE_ENV !== 'production') ? 
    createStore(root, initial_state,
        composeSetup(applyMiddleware(thunkMiddleware, createLogger()))
        //composeSetup(applyMiddleware(thunkMiddleware))
    ) : 
    createStore(root, initial_state,
        composeSetup(applyMiddleware(thunkMiddleware))
    )

export default store;