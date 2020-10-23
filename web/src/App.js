import React, { PureComponent } from 'react';
import { connect } from 'react-redux'
import { Route, Switch } from 'react-router-dom';
import jwt_decode from 'jwt-decode';
import { PrivateRoute } from './components/routes'
import { Row, Layout, Button, Avatar, Tooltip, message} from 'antd';

import Home from                 './components/pages/Home';
import LoginModal from           './components/pages/Login';
import LoginResetConfirm from    './components/pages/LoginResetConfirm';
import Lab from                  './components/workflows/Lab';
import Admin from                './components/workflows/Admin';
import Caregiver from            './components/workflows/Caregiver';
import history from              './helpers/History';

import './styles/App.css';

import {
    display_login_modal, hide_login_modal, remember,
    login, logout, loginClearMessage, setLoginForget, loginForget,
    
    //  - attempted is modal
    //  - start, progress, error is service related
    ATTEMPT_LOGIN, ATTEMPT_LOGIN_CANCEL,
    LOGIN_REQUEST_START, LOGIN_REQUEST_PROGRESS,
    LOGOUT_REQUEST_START, LOGOUT_REQUEST_PROGRESS,
    LOGIN_ERROR, LOGOUT_ERROR, LOGIN_USER
} from './actions';
import Rest from './services/Rest';

const ButtonGroup = Button.Group;

class App extends PureComponent {

   handleLogout = () => {
        this.props.logout()
        history.push('/')
   }

   handleLoginModalStart = () => {
        this.props.loginModalStart()
   }

   componentDidMount() {
        this.routeAuth()  
   }

   componentDidUpdate() {
        this.routeAuth()
   }

   routeAuth() {
        const {authInfo} = this.props;

        if (authInfo && authInfo.jwt) {
            const token_expired = new Date() > new Date(jwt_decode(authInfo.jwt).exp * 1000);
            
            if (token_expired) { 
                if (authInfo.refresh) {
                    // jwt token has expired => attempt to refresh 
                    // this is a dispatch; success / catching occurs in action.
                    this.props.remember();
                } else {
                    // denied refresh token => logging out 
                    this.props.logout(true);
                }
            } else {
                Rest.currentUser().then((response) => {
                    this.defaultRouting();
                }).catch((error) => {
                    this.props.logout(true)
                });
            }
        } else {
            history.push('/');
        }
        
  }

  defaultRouting() {
    if (this.props.authInfo && this.props.authInfo.role) {
        
        // derive route from user's role
        const route = this.props.authInfo.role.toLowerCase().split('_')[0];

        switch (this.props.authInfo.role) {
            case 'ADMIN':
            case 'CAREGIVER':
            case 'LAB_USER':
                history.push(`/${route}`)
                break;
            default:
                break;
        }
    }
  }

  render() {
    const { Header, Content, Footer } = Layout;
    const { connectionStatus, authStatus, authInfo, loginClearMessage, loginModalCancel,
            loginForget, loginReset, loginForgetDisplay, login} = this.props;

    const authRole = (authInfo && authInfo.role) ? authInfo.role : '';
    const headerStyleLogo = { color: '#f3f3f3', height: 65, display:'inline-block', marginRight:'1em'};
    const headerStyle= { color: '#f3f3f3', display:'inline-block', marginRight:'1em'};
    const roleDisplay = {
        'ADMIN':'Adminstrator',
        'LAB_USER':'Lab User',
        'CAREGIVER':'Caregiver'
    };

    if (connectionStatus === 'CONNECTION_ISSUE') {
        message.info('Connection Issues');
    }
    
    return (
      <Layout>

        {/* Global Header */}
        <Header style={{ zIndex: 1, width: '100%' }}>
            <Row>
                <img style={{ ...headerStyleLogo, float:'left'}}
                     src="/images/gd-logo.svg"
                     alt="GenomeDiver"
                />



                <div style={{display:'inline-block', float:'right'}}>
  
                    {authInfo &&
                        <Tooltip title={ `${authInfo.username} (${roleDisplay[authInfo.role]})`}>
                            <Avatar size="medium" icon="user"/>
                        </Tooltip>}
                    
                    <ButtonGroup>
                        {authInfo ? 
                            <Button type='primary' onClick={this.handleLogout} style={{marginLeft:'1em'}}>SIGN OUT</Button> :
                            <Button type='primary' onClick={this.handleLoginModalStart}>SIGN IN</Button>}
                           
                            {/* <Button type='primary' icon='question' onClick={this.toggleHelp}></Button> */}
                            
                    </ButtonGroup>
      
                </div>

                <h3 style={{ ...headerStyle, float:'right'}}>DEMO VERSION</h3>
            </Row>
        </Header>

        {/* Workflow Routing

            - ADMIN WORKFLOW:
                + add institutions
                + add / remove users
                + assigns roles and relationships to institutions
                + access audit trails

            - LAB WORKFLOW:

            - CAREGIVER WORKFLOW:

        */}
        <Content style={{margin: 20, padding: 20}}>
            <Switch>

                {/* public routes*/}
                <Route exact  path='/'               component={Home}/>
                <Route        path='/confirm/:token' component={LoginResetConfirm}/>
                <Route        path='/reset/:token'   component={LoginResetConfirm}/>

                {/* protected routes - user MUST be logged in first and role must match*/}
                {authStatus === LOGIN_USER &&
                    [<PrivateRoute key='1' path='/admin'          component={Admin}     authRole={authRole} routeRole={'ADMIN'}/>,
                     <PrivateRoute key='2' path='/lab'            component={Lab}       authRole={authRole} routeRole={'LAB_USER'}/>,
                     <PrivateRoute key='3' path='/caregiver'      component={Caregiver} authRole={authRole} routeRole={'CAREGIVER'}/>]
                }

                {/* catch all */}
                <Route                              component={Home} />
            </Switch>
        </Content>
                
        {/* Footer appears only if user is logged in AND assigned a route*/}
        {authStatus === LOGIN_USER && window.location.pathname !== '/' && <Footer>
            <p style={{textAlign:'center', fontSize:'small'}}>For any questions or comments please contact:&nbsp;
                <a href="mailto:genomediver@nygenome.org">genomediver@nygenome.org</a></p>
        </Footer>}

        {/* Show Login Modal */}
        {(authStatus === ATTEMPT_LOGIN              ||
          authStatus === ATTEMPT_LOGIN_CANCEL       ||
          authStatus === LOGIN_REQUEST_START        ||
          authStatus === LOGIN_REQUEST_PROGRESS     ||
          authStatus === LOGOUT_REQUEST_START       ||
          authStatus === LOGOUT_REQUEST_PROGRESS    ||
          authStatus === LOGIN_ERROR                ||
          authStatus === LOGOUT_ERROR ) &&  <LoginModal
            loginForgetDisplay={loginForgetDisplay}
            loginForget={loginForget}
            login={login}
            loginClearMessage={loginClearMessage}
            loginReset={loginReset}
            loginCancel={loginModalCancel}/>}
        
      </Layout>
    );
  }
}

function mapStateToProps(store, ownProps) {
  const { Auth, Connection } = store;

  return {
    authStatus: Auth.status,
    authInfo :  Auth.info,
    connectionStatus: Connection.status
   }
}

function mapDispatchToProps(dispatch, ownProps) {
    return {
        loginModalStart: () => {
            dispatch(setLoginForget(false));
            dispatch(display_login_modal());
        },
        loginReset:() => {
            dispatch(display_login_modal());
        },
        loginModalCancel:() => {
            dispatch(hide_login_modal());
        },
        loginForgetDisplay: (show) => {
            dispatch(setLoginForget(show))
        },
        loginForget({email}) {
            dispatch(loginForget({email}))
        },
        loginClearMessage: (status) => {
           dispatch(loginClearMessage(status));
        },
        login:({username, password}) => {
            dispatch(login({username, password}));
        },
        logout:() => {
            dispatch(logout());
        },
        remember:() => {
            dispatch(remember());
        }
    };
}

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(App);

