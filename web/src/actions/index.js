import Rest from '../services/Rest'
import {message} from 'antd';
import {gqlError} from '../helpers'

// Errors are coming from multiple sources, somewhat of a kludge
// solution to 'look' for errors in the return object.
function findError(error, message) {

    // HTTP Errors 
    if (error.message) {
        message = error.message 
    }

    // GrqphQL Errors (200) 
    if (error && error.response && error.response.data) {
        message = error.response.data;

        if (error.response.data.error) {
            message = error.response.data.error;
        } else if (error.response.data.errors) {
            message = error.response.data.errors.map((e) => e.message).join('\n');
        }
    }
    return message;
}

// store the auth information in a localStorage session 
function setAuth(response) {
    const info = {
        'jwt': response.headers['set-authorization'],
        'refresh': response.headers['set-refresh-token'],
        'username': response.data['username'],
        'role': response.data['role']
    }

    localStorage.setItem('auth', JSON.stringify(info))

    return info;
}

function genericError(dispatch, error, errorAction, errorMessage = 'Unknown Error') {
    if (error.response) {
        if (error.response.status !== 403) {
            try {
                errorMessage = findError(error, errorMessage);
            } finally {
                dispatch(action(errorAction, {message: errorMessage}))
            }
        } else {
            dispatch(action(LOGOUT_USER))
        }
    } else {
        dispatch(action(CONNECTION_SERVER_ISSUE))
    }
}

function action(type, payload = {}) {
	return { type, ...payload };
}

export const UNKNOWN_ERROR = "UNKNOWN_ERROR";

export const SET_HOME = 'SET_HOME';
export const SET_FORGET = 'SET_FORGET';
export const FORGET_REQUEST_START ='FORGET_REQUEST_START';
export const FORGET_REQUEST_PROGRESS = 'FORGET_REQUEST_PROGRESS';
export const FORGET_REQUEST_SUCCESS = 'FORGET_REQUEST_SUCCESS';
export const FORGET_REQUEST_ERROR ='FORGET_REQUEST_ERROR';

export const CONNECTED = 'CONNECTED';
export const CONNECTION_SERVER_ISSUE = 'CONNECTION_SERVER_ISSUE';

//  Authentication
export const ATTEMPT_LOGIN = 'ATTEMPT_LOGIN';
export const ATTEMPT_LOGIN_CANCEL = 'ATTEMPT_LOGIN_CANCEL';
export const ATTEMPT_LOGOUT = 'ATTEMPT_LOGOUT';
export const LOGIN_REQUEST_START = 'LOGIN_REQUEST_START';
export const LOGIN_REQUEST_PROGRESS = 'LOGIN_REQUEST_PROGRESS';
export const LOGIN_ERROR = 'LOGIN_ERROR';
export const LOGOUT_REQUEST_START = 'LOGOUT_REQUEST_START';
export const LOGOUT_REQUEST_PROGRESS = 'LOGOUT_REQUEST_PROGRESS';
export const LOGOUT_ERROR = 'LOGOUT_ERROR';
export const LOGIN_USER = 'LOGIN_USER';         // i.e. authenticated
export const LOGOUT_USER = 'LOGOUT_USER';       // i.e  unauthenticated

export const FORGOT_PASSWORD = 'FORGOT_PASSWORD';
export const RESET_PASSWORD = 'RESET_PASSWORD';
export const CONFIRM_REGISTRATION = 'CONFIRM_REGISTRATION';

// Analysis 
export const ANALYSIS_REQUEST_DEFAULT = 'ANALYSIS_REQUEST_DEFAULT';
export const ANALYSIS_REQUEST_START = 'ANALYSIS_REQUEST_START';
export const ANALYSIS_REQUEST_PROGRESS = 'ANALYSIS_REQUEST_PROGRESS';
export const ANALYSIS_REQUEST_SUCCESS = 'ANALYSIS_REQUEST_SUCCESS';
export const ANALYSIS_REQUEST_COMPLETE = 'ANALYSIS_REQUEST_COMPLETE';
export const ANALYSIS_REQUEST_ERROR = 'ANALYSIS_REQUEST_ERROR';
export const ANALYSIS_REQUEST_CANCEL = 'ANALYSIS_REQUEST_CANCEL';

// Institution
export const INSTITUTION_LIST_REQUEST_START = 'INSTITUTION_LIST_REQUEST_START';
export const INSTITUTION_LIST_REQUEST_PROGRESS = 'INSTITUTION_LIST_REQUEST_PROGRESS';
export const INSTITUTION_LIST_REQUEST_SUCCESS = 'INSTITUTION_LIST_REQUEST_SUCCESS';
export const INSTITUTION_LIST_REQUEST_ERROR = 'INSTITUTION_LIST_REQUEST_ERROR';

export const INSTITUTION_ADD_REQUEST_START = 'INSTITUTION_ADD_REQUEST_START';
export const INSTITUTION_ADD_REQUEST_PROGRESS = 'INSTITUTION_ADD_REQUEST_PROGRESS';
export const INSTITUTION_ADD_REQUEST_SUCCESS = 'INSTITUTION_ADD_REQUEST_SUCCESS';
export const INSTITUTION_ADD_REQUEST_ERROR = 'INSTITUTION_ADD_REQUEST_ERROR';

// User
export const USER_LIST_REQUEST_START = 'USER_LIST_REQUEST_START';
export const USER_LIST_REQUEST_PROGRESS = 'USER_LIST_REQUEST_PROGRESS';
export const USER_LIST_REQUEST_SUCCESS = 'USER_LIST_REQUEST_SUCCESS';
export const USER_LIST_REQUEST_ERROR = 'USER_LIST_REQUEST_ERROR';

export const USER_ADD_REQUEST_START = 'USER_ADD_REQUEST_START';
export const USER_ADD_REQUEST_PROGRESS = 'USER_ADD_REQUEST_PROGRESS';
export const USER_ADD_REQUEST_SUCCESS = 'USER_ADD_REQUEST_SUCCESS';
export const USER_ADD_REQUEST_ERROR = 'USER_ADD_REQUEST_ERROR';

export const CREATE_USER = 'CREATE_USER';
export const REMOVE_USER = 'REMOVE_USER';

// Patient
export const CREATE_PATIENT = 'CREATE_PATIENT';
export const REMOVE_PATIENT = 'REMOVE_PATIENT';

// Patient (GraphQL)
export const PATIENT_LIST_REQUEST_START = 'PATIENT_LIST_REQUEST_START';
export const PATIENT_LIST_REQUEST_PROGRESS = 'PATIENT_LIST_REQUEST_PROGRESS';
export const PATIENT_LIST_REQUEST_SUCCESS = 'PATIENT_LIST_REQUEST_SUCCESS';
export const PATIENT_LIST_REQUEST_ERROR = 'PATIENT_LIST_REQUEST_ERROR';

export const PATIENT_DETAIL_REQUEST_START = 'PATIENT_DETAIL_REQUEST_START';
export const PATIENT_DETAIL_REQUEST_PROGRESS = 'PATIENT_DETAIL_REQUEST_PROGRESS';
export const PATIENT_DETAIL_REQUEST_SUCCESS = 'PATIENT_DETAIL_REQUEST_SUCCESS';
export const PATIENT_DETAIL_REQUEST_ERROR = 'PATIENT_DETAIL_REQUEST_ERROR';

export const PATIENT_DETAIL_PHENOTYPE_REQUEST_START = 'PATIENT_DETAIL_PHENOTYPE_REQUEST_START'
export const PATIENT_DETAIL_PHENOTYPE_REQUEST_PROGRESS = 'PATIENT_DETAIL_PHENOTYPE_REQUEST_PROGRESS'
export const PATIENT_DETAIL_PHENOTYPE_REQUEST_SUCCESS = 'PATIENT_DETAIL_PHENOTYPE_REQUEST_SUCCESS'
export const PATIENT_DETAIL_PHENOTYPE_REQUEST_ERROR = 'PATIENT_DETAIL_PHENOTYPE_REQUEST_ERROR'

// Institutions (GraphQL, Lab)
export const INSTITUTION_LIST_LAB_REQUEST_START = 'INSTITUTION_LIST_LAB_REQUEST_START';
export const INSTITUTION_LIST_LAB_REQUEST_PROGRESS = 'INSTITUTION_LIST_LAB_REQUEST_PROGRESS';
export const INSTITUTION_LIST_LAB_REQUEST_SUCCESS = 'INSTITUTION_LIST_LAB_REQUEST_SUCCESS';
export const INSTITUTION_LIST_LAB_REQUEST_ERROR = 'INSTITUTION_LIST_LAB_REQUEST_ERROR';

// Phenotype (Phenotype - requests is a local state process)

export function setHome(val) {
    return action(SET_HOME, {payload: val});
}

export function setLoginForget(show) {
    return action(SET_FORGET, {payload : show});
}

// Modal
export function display_login_modal() {
    return action(ATTEMPT_LOGIN);
}

export function hide_login_modal() {
    return action(ATTEMPT_LOGIN_CANCEL);
}

export function loginClearMessage(status) {
    return action(status);
}

export function audit() {

}

export function errorMessage(error) {
    return dispatch => {
        genericError(dispatch, error)
    }
}

export function cancelAnalysis() {
    return dispatch => {
        dispatch(action(ANALYSIS_REQUEST_CANCEL));
    }
}

export function completeAnalysis() {
    return dispatch => {
        dispatch(action(ANALYSIS_REQUEST_COMPLETE));
    }
}


// @GraphQL
export function startAnalysis(patient_id, case_id, pipeline, reference, vcf_name = null, parent_analysis_id = null) {
    return dispatch => {
        let origin = Math.random();

        dispatch(action(ANALYSIS_REQUEST_START))
        dispatch(action(ANALYSIS_REQUEST_PROGRESS, {origin}));

        Rest.startAnalysis(patient_id, case_id, pipeline, reference, vcf_name, parent_analysis_id)
            .then(response => {return gqlError(response)})
            .then(response => dispatch(action(ANALYSIS_REQUEST_SUCCESS)))
            .catch(error => {genericError(dispatch, error, ANALYSIS_REQUEST_ERROR)});
    }
}

// @Rest
export function remember() {
    // jwt token refresh should be a silent operation. 
    return dispatch => {
        let origin = Math.random();

        Rest.remember().then(response => {
            const info = setAuth(response);
            dispatch(action(LOGIN_USER, {
                info,origin
            }));

            message.success(`Signed in as ${response.data.username}`);
        }).catch(error => {
            dispatch(action(LOGOUT_USER, {origin}))
        })
    }
}

// @Rest 
export function login({username, password}, history)  {
    return dispatch => {
        let origin = Math.random();

        dispatch(action(LOGIN_REQUEST_START))
        dispatch(action(LOGIN_REQUEST_PROGRESS, {origin}));

        Rest.login({username, password}).then(response => {
            const info = setAuth(response);
            
            dispatch(action(LOGIN_USER, {
                info,
                origin
            }));

            message.success(`Signed in as ${response.data.username}`)
        }).catch(error => {

            // console.log("login error!" , error);

            genericError(dispatch, error, LOGIN_ERROR, 'Login Error');
        });
    }
}

// @Rest
export function logout(silent=false) {
    return dispatch => {
        let origin = Math.random();
        dispatch(action(LOGOUT_REQUEST_PROGRESS, {origin}));
        Rest.logout().then(response => {
            if (!silent) {
                // logout is implicit on token refresh failure
                message.success('Successful Sign Out')
            }
        }).catch(error => {
            genericError(dispatch, error, LOGOUT_ERROR, 'Logout Error');
        }).finally(response => {
            dispatch(action(LOGOUT_USER, {origin}));
        })
    }
}

// @Rest
export function loginForget({email}) {
    return dispatch => {
        let origin = Math.random();
        dispatch(action(FORGET_REQUEST_START));
        dispatch(action(FORGET_REQUEST_PROGRESS, {origin}));

        Rest.loginForget({email}).then(response => {
            dispatch(action(FORGET_REQUEST_SUCCESS, {origin}))
            dispatch(action(ATTEMPT_LOGIN_CANCEL))
            message.success('Please check your email for further instructions')

        }).catch(error => {
            genericError(dispatch, error, FORGET_REQUEST_ERROR, 'Request Error')
        })
    }
}

// @GraphQL
export function listInstitutions(context = "ADMIN") {
    return dispatch => {

        switch(context) {
            case 'ADMIN':
                dispatch(action(INSTITUTION_LIST_REQUEST_START))
                dispatch(action(INSTITUTION_LIST_REQUEST_PROGRESS))

                Rest.listInstitutions()
                    .then(response => {return gqlError(response)})
                    .then(response => dispatch(action(INSTITUTION_LIST_REQUEST_SUCCESS, {payload: response.data})))
                    .catch(error => {genericError(dispatch, error, INSTITUTION_LIST_REQUEST_ERROR, "Cannot find institutions")})

            break;
            case 'LAB':
                dispatch(action(INSTITUTION_LIST_LAB_REQUEST_START))
                dispatch(action(INSTITUTION_LIST_LAB_REQUEST_PROGRESS))

                Rest.listInstitutionsLab()
                    .then(response => {return gqlError(response)})
                    .then(response => dispatch(action(INSTITUTION_LIST_LAB_REQUEST_SUCCESS, {payload: response.data.data})))
                    .catch(error => {genericError(dispatch, error, INSTITUTION_LIST_LAB_REQUEST_ERROR, "Cannot find institutions")})
            break;
            default:
                // shouldn't do anything
                break;
        }
    }
}

// @GraphQL
export function addInstitution({institution, type}) {
    return dispatch => {
        dispatch(action(INSTITUTION_ADD_REQUEST_START))
        dispatch(action(INSTITUTION_ADD_REQUEST_PROGRESS))

        Rest.addInstitution({institution, type})
            .then(response => {return gqlError(response)})
            .then(response => {
                dispatch(action(INSTITUTION_ADD_REQUEST_SUCCESS), {payload: response.data})
                dispatch(listInstitutions())
            })
            .catch(error=> {
                genericError(dispatch, error, INSTITUTION_ADD_REQUEST_ERROR, "Cannot add institution")
            })
    }
}

// @GraphQL
export function listUsers() {
    return dispatch => {
        dispatch(action(USER_LIST_REQUEST_START))
        dispatch(action(USER_LIST_REQUEST_PROGRESS))

        Rest.listUsers()
            .then(response => {return gqlError(response)})
            .then(response => dispatch(action(USER_LIST_REQUEST_SUCCESS, {payload: response.data})))
            .catch(error => {
                genericError(dispatch, error, USER_LIST_REQUEST_ERROR, "Cannot find any users")
            });
    };
}

// @GraphQL
export function PatientDetail(id,  incl_pheno=false, incl_assoc=false) {
    return dispatch => {

        dispatch(action(PATIENT_DETAIL_REQUEST_START))
        dispatch(action(PATIENT_DETAIL_REQUEST_PROGRESS))

        Rest.getPatientLabDetail(id, incl_pheno, incl_assoc)
            .then(response => {return gqlError(response)})
            .then(response => dispatch(action(PATIENT_DETAIL_REQUEST_SUCCESS, {payload: response.data.data})))
            .catch(error => {
                genericError(dispatch, error, PATIENT_DETAIL_REQUEST_ERROR, "Cannot find any patient details")
            });

    }
}

// @GraphQL
export function PatientDetailPhenotypes(id) {
    return dispatch => {
        dispatch(action(PATIENT_DETAIL_PHENOTYPE_REQUEST_START))
        dispatch(action(PATIENT_DETAIL_PHENOTYPE_REQUEST_PROGRESS))

        Rest.getPatientDetailPhenotypes(id)
            .then(response => {return gqlError(response)})
            .then(response => dispatch(action(PATIENT_DETAIL_PHENOTYPE_REQUEST_SUCCESS, {
                payload: response.data.data
            })))
            .catch(error => {
                genericError(dispatch, error, PATIENT_DETAIL_PHENOTYPE_REQUEST_ERROR, "Cannot find any patient details [Phenotypes]")
            });
    }
}

// @GraphQL
export function listPatients() {
    // used in caregiver && lab workflows 
    return dispatch => {
        dispatch(action(PATIENT_LIST_REQUEST_START))
        dispatch(action(PATIENT_LIST_REQUEST_PROGRESS))

        Rest.listPatients()
            .then(response => {return gqlError(response)})
            .then(response => dispatch(action(PATIENT_LIST_REQUEST_SUCCESS, {payload: response.data.data})))
            .catch(error => {
                genericError(dispatch, error, PATIENT_LIST_REQUEST_ERROR, "Cannot find any patients")
            });
    }
}

