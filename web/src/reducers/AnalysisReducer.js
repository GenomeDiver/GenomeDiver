export const Analysis = function(state = {status:"ANALYSIS_REQUEST_DEFAULT"}, action) {
    switch (action.type) {

        case "LOGOUT_USER":
        case "ANALYSIS_REQUEST_COMPLETE":
        case "ANALYSIS_REQUEST_CANCEL":
            return {...state,
                status:"ANALYSIS_REQUEST_DEFAULT",
                message:null,
                origin:null
            };
        
        case "ANALYSIS_REQUEST_START":
        case "ANALYSIS_REQUEST_PROGRESS":
        case "ANALYSIS_REQUEST_SUCCESS":
        case "ANALYSIS_REQUEST_ERROR":
            return {...state,
                status:  action.type,
                message: action.message ? action.message : null,
                origin:  action.origin  ? action.origin  : null
            };

        default:
            return state;
    }
}