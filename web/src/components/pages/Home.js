import React, { PureComponent } from 'react';
import Particles from 'react-particles-js';
import './Home.css';
import { connect } from 'react-redux';
import {setHome} from '../../actions'

class Home extends PureComponent {

    componentWillMount() {
        this.props.setHome(true)
    }

    componentWillUnmount() {
        this.props.setHome(false)
        document.body.classList.toggle('home', false);
    }

    render() {
        // const role = (this.props.authInfo && this.props.authInfo.role) ? this.props.authInfo.role.toLowerCase().split('_')[0] : false

        return (
            <div>
                <Particles s
                    style={{"opacity":0.4}} 
                    width={'100%'} 
                    height={'100%'}
                    params={{
                        "particles": {
                            "number": {
                                "value": 80,
                                "density": {
                                    "enable": true
                                }
                            },
                            "move": {
                                "speed": 1.5
                            },
                            "line_linked": {
                                "enable": true
                            },
                            "size": {
                                "value": 2
                            }
                        }
                        }}/>
                    <div style={{
                        'position':'absolute',
                        'display':'flex',
                        'flexDirection': 'column',
                        'alignItems':'center',
                        'justifyContent':'center',
                        'width':'100%',
                        'height':'100%',
                        'top':40,
                        'left':0
                    }}>
         
                    <h3 style={{
                        'fontWeight':'bold',
                        'fontSize':'x-large',
                        'color': 'white'
                    }}>The software platform for enhanced medical genomic diagnostics</h3>
                    
                    <p style={{'color': 'white'}}></p>
                    
                    {/** role && <Button type="primary" size="large" onClick = {() => history.push(`/${role}`)}>START<Icon type="right"/></Button> **/}

                    </div>
            </div>
        )
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
        setHome: (val) => {
            dispatch(setHome(val));
        }
    };
}

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(Home);