// TODO: zxcvbn for password strength estimation 

import React, { PureComponent } from 'react';
import { connect } from 'react-redux';
import { Modal} from 'antd';
import LoginForm from '../forms/LoginForm';
import LoginForgetForm from '../forms/LoginForgetForm';

import {
    ATTEMPT_LOGIN,
    LOGIN_REQUEST_START,
    LOGIN_REQUEST_PROGRESS,
    LOGIN_ERROR
} from '../../actions';

// should be only logout success
const visibleStatuses = new Set([ATTEMPT_LOGIN, LOGIN_REQUEST_START, LOGIN_REQUEST_PROGRESS, LOGIN_ERROR ])

class Login extends PureComponent {

     render() {

        const {authStatus, authMessage, loginClearMessage, loginCancel, loginReset,
               login, loginForget, loginForgetDisplay, showForget} = this.props;

        const modalVisible = (visibleStatuses.has(authStatus));

        return (
            <Modal title="SIGN IN" visible={modalVisible} centered={true} onCancel={loginCancel} footer={null}>

                {modalVisible && !showForget && <LoginForm
                    authStatus={authStatus}
                    authMessage={authMessage}
                    loginClearMessage={loginClearMessage}
                    login={login}
                    loginReset={loginReset}
                    loginForgetDisplay={loginForgetDisplay}
                />}

                {modalVisible && showForget && <LoginForgetForm
                    loginForgetDisplay={loginForgetDisplay}
                    loginForget={loginForget}
                />}

            </Modal>
        );
     }
}

function mapStateToProps(store, ownProps) {
  const { Auth, LoginForget } = store;
  return {
    authStatus: Auth.status,
    authMessage: Auth.message,
    showForget: LoginForget.show
   }
}

export default connect(
    mapStateToProps
)(Login);