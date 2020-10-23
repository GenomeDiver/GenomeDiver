import { combineReducers } from 'redux';
import { Auth, Connection, LoginForget } from './AuthReducer';
import { Audit, InstitutionList, InstitutionRequest, UserList } from './AdminReducer';
import { PatientList, PatientDetail } from './PatientReducer';
import { Analysis } from './AnalysisReducer';

const Home = function(state = {}, action) {
    switch (action.type) {
        case "SET_HOME":

            // side effects - home page doesn't have scrolling 
            if (action.payload) {
                window.scroll(0,0);
            }
            
            // also necessary side effect
            document.body.classList.toggle('home', action.payload);

            return {...state,
                status:  action.type,
                is_home  : action.payload ? action.payload : null
            }

        default:
            return state;
    }
}

export default combineReducers(
    {Connection, Auth, LoginForget,                             
     Audit, InstitutionList, InstitutionRequest, UserList,     
     PatientList, PatientDetail,
     Analysis,
     Home}
)