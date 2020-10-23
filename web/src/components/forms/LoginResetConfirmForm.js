import React, { PureComponent } from 'react';
import {Row, Form, Alert} from 'antd';

class LoginResetConfirmForm extends PureComponent {

    render() {
        //const {userData} = this.props;
        const errorMessage = '';
        
        return (
        <Row>
            <Form layout='inline'>
                <Form.Item>

                </Form.Item>
            </Form>

            <Row>
                {errorMessage &&
                    <Alert key='error' description={errorMessage}
                    type="error" onClose={this.handleErrorClose}/>
                }
            </Row>
        </Row>
        )
    }
}

export default Form.create({ name: 'login_reset' })(LoginResetConfirmForm)