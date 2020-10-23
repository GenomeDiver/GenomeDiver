export const InstitutionList = function(state = {}, action) {
    switch (action.type) {
        case 'LOGOUT_USER':
            return {};

        case "INSTITUTION_LIST_REQUEST_START":
        case "INSTITUTION_LIST_REQUEST_PROGRESS":
        case "INSTITUTION_LIST_REQUEST_SUCCESS":
        case "INSTITUTION_LIST_REQUEST_ERROR":
            return {...state,
                status: action.type,
                data_admin  : action.payload ? action.payload : null
            }

        case "INSTITUTION_LIST_LAB_REQUEST_START":
        case "INSTITUTION_LIST_LAB_REQUEST_PROGRESS":
        case "INSTITUTION_LIST_LAB_REQUEST_SUCCESS":
        case "INSTITUTION_LIST_LAB_REQUEST_ERROR":
           return {...state,
               status: action.type,
               data_lab  : action.payload ? action.payload : null
           }

        default:
            return state;
    }
}

export const InstitutionRequest = function(state = {}, action) {
    switch (action.type) {
        case 'LOGOUT_USER':
             return {};

        case "INSTITUTION_ADD_REQUEST_START":
        case "INSTITUTION_ADD_REQUEST_PROGRESS":
        case "INSTITUTION_ADD_REQUEST_SUCCESS":
        case "INSTITUTION_ADD_REQUEST_ERROR":
            return {...state,
                status: action.type,
                data  : action.payload ? action.payload : null
            }
        default:
            return state;
    }
}

export const UserList = function(state = {}, action) {
    switch (action.type) {
        case 'LOGOUT_USER':
            return {};

        case "USER_LIST_REQUEST_START":
        case "USER_LIST_REQUEST_PROGRESS":
        case "USER_LIST_REQUEST_SUCCESS":
        case "USER_LIST_REQUEST_ERROR":
            return {...state,
                status: action.type,
                data  : action.payload ? action.payload : null
            }
        default:
            return state;
    }
}

export const Audit = function(state = {}, action) {
    switch (action.type) {
        case 'LOGOUT_USER':
            return {};

        case "AUDIT_REQUEST_START":
        case "AUDIT_REQUEST_PROGRESS":
        case "AUDIT_REQUEST_SUCCESS":
        case "AUDIT_REQUEST_ERROR":
            return {...state,
                status: action.type,
                data  : action.payload ? action.payload : null
            }
        default:
            return state;
    }
}