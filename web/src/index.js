import React from 'react';
import ReactDOM from 'react-dom';
import { Provider } from 'react-redux';
import { Router } from "react-router-dom";
import store from './store'
import history from './helpers/History';
import App from './App';
import './styles/index.css';
// import * as serviceWorker from './serviceWorker';

// using interceptors instead of relying on routing ...
// https://codeburst.io/react-redux-react-router-private-route-alternative-eb22d90650a9

// setup React-Router 
ReactDOM.render(
    <Provider store={store}>
        <Router history={history}>
            <App/>
        </Router>
    </Provider>
, document.getElementById('root'));

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: http://bit.ly/CRA-PWA
// serviceWorker.register();
