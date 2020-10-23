import React, { PureComponent } from 'react';
import {Row, Col, Card, Typography } from 'antd';
import history from '../../helpers/History';
import LoginReseConfirmForm from '../forms/LoginResetConfirmForm';
/* 
    Registration Confirmation 

    - token 
    - password & password (must match)
*/ 

const { Text } = Typography;
const ValidModes = new Set(["RESET", "CONFIRM"]);

class LoginResetConfirm extends PureComponent {

    render() {
        const mode = this.props.match.path.split('/')[1].toUpperCase();
        const {token} = this.props.match.params;
        
        if (!ValidModes.has(mode)) {
            history.push('/');
        }
        
        //const valid_token =  token.match(/^\w{32}$/s);
        const heading = mode === 'RESET' ? 'Reset Password' : 'Confirm Registration';

        return (
            <Row style={{marginTop:'9em'}}>
                <Col offset={6} span={12}>
                    <Card>
                        <h3>{heading}</h3> 
                        <p><Text disabled>Token: {token}</Text></p>
                        <LoginReseConfirmForm/>
                    </Card>
                </Col>
            </Row>
        )
    }
}

export default LoginResetConfirm;