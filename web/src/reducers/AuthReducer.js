
// https://scalac.io/react-redux-jwt-authentication/
export const LoginForget = function(state = {show:false}, action) {

    // request constraints - need a better way of handling this
    if (action.type === 'FORGET_REQUEST_SUCCESS') {
        // console.log(action.origin, state.origin, action)
        if (action.origin !== state.origin) {
            return state;
        }
    }

    switch (action.type) {
        case 'SET_FORGET':
            return {...state,
                status: action.type,
                show: action.payload,
                origin: null
            };

        case 'FORGET_REQUEST_START':
        case 'FORGET_REQUEST_PROGRESS':
        case 'FORGET_REQUEST_ERROR':
            return {...state,
                status:  action.type,
                origin:  action.origin  ? action.origin  : null
            };

        case 'FORGET_REQUEST_SUCCESS':
            return {show: false};

        default:
            return state;
    }
}

export const Auth = function(state = {status:'LOGOUT_USER', info:null, message:null}, action) {

    if (action.type.endsWith('LOGIN_USER')) {

        // Progress must be immediately before
        if (!state.status.endsWith('PROGRESS')) {
            return state;
        }

        // Request origin mismatch, login may have been a canceled request 
        if (action.origin !== state.origin) {
            return state;
        }
    }

    // any form of logout incurrs a removal of the auth storage object 
    if (action.type.endsWith("LOGOUT_USER")) {
        localStorage.removeItem('auth');
    }

    switch (action.type) {
        case 'LOGOUT_USER':
        case 'LOGOUT_ERROR':
        case 'ATTEMPT_LOGIN':
        case 'ATTEMPT_LOGIN_CANCEL':
        case 'ATTEMPT_LOGOUT':
        case 'LOGIN_REQUEST_START':
        case 'LOGOUT_REQUEST_START':
        case 'LOGOUT_REQUEST_PROGRESS':
        case 'LOGIN_REQUEST_PROGRESS':
        case 'LOGIN_ERROR':
        case 'LOGIN_USER':
            return {...state,
                status:  action.type,
                origin:  action.origin  ? action.origin  : null,
                info:    action.info    ? action.info    : null,
                message: action.message ? action.message : null};

        default:
            return state;
    }
}

export const Connection = function (state = {status:'CONNECTED'}, action) {
    switch (action.type) {
        case 'CONNECTION_SERVER_ISSUE':
        case 'CONNECTED':
            return {...state,
                status:  action.type,
                info:    action.info    ? action.info    : null,
                message: action.message ? action.message : null};

        default:
            return state;
    }
}