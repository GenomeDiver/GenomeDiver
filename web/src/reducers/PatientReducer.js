import _ from 'lodash';


// patients currently being worked on
// when the user refreshes the browser we essentially lose state.
export const PatientList = function(state = {}, action) {
    switch (action.type) {
        case "LOGOUT_USER":
            return {};

        case "PATIENT_LIST_REQUEST_START":
        case "PATIENT_LIST_REQUEST_PROGRESS":
        case "PATIENT_LIST_REQUEST_SUCCESS":
        case "PATIENT_LIST_REQUEST_ERROR":
            return {...state,
                status: action.type,
                data  : action.payload ? action.payload : null
            }

        default:
            return state;
    }
}

export const PatientDetail = function(state = {}, action) {
    switch (action.type) {
        case "LOGOUT_USER":
            return {};

        case "PATIENT_DETAIL_REQUEST_START":
        case "PATIENT_DETAIL_REQUEST_PROGRESS":
        case "PATIENT_DETAIL_REQUEST_SUCCESS":
        case "PATIENT_DETAIL_REQUEST_ERROR":
            return {...state,
                status: action.type,
                data  : action.payload ? action.payload : null
            }

        case "PATIENT_DETAIL_PHENOTYPE_REQUEST_START":
        case "PATIENT_DETAIL_PHENOTYPE_REQUEST_PROGRESS":
        case "PATIENT_DETAIL_PHENOTYPE_REQUEST_ERROR":
            return {...state,
                status: action.type
            }

        case "PATIENT_DETAIL_PHENOTYPE_REQUEST_SUCCESS":
            // PHENOTYPE REQUEST overwrites PATIENT DETAIL
            return {...state,
                status: action.type,
                data  : action.payload ? 
                    _.merge({}, state['data'], action.payload) 
                    : state['data']
            }

        default:
            return state;
    }
}