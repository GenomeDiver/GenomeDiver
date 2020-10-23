import React, { PureComponent } from 'react';
import { Form, Icon, Input, Alert, Divider, Row, Col, Button} from 'antd';

import './styles/LoginForm.css'

class LoginForm extends PureComponent {

    handleErrorClose = (e) => {
        this.props.loginClearMessage(this.props.authStatus);
    }

    handleLoginForgetDisplay = (e) => {
        this.props.loginForgetDisplay(true);
    }

    userLogin = (e) => {
        this.props.form.validateFields().then(result => {
            const credentials = this.props.form.getFieldsValue(); // {username: password}
            this.props.login(credentials);
        }).catch(error => {
            // ignore catching errors -  ajax errors in authMessage
        }).finally(f => {

        })
    }

    resetFields = (e) => {
        this.handleErrorClose(e);
        this.props.form.resetFields();
        this.props.loginReset();
    }

    render() {
        const {authStatus, authMessage} = this.props;

        // service errors
        // input validation issues
        const {getFieldDecorator, getFieldError} = this.props.form;

        //const userNameError = isFieldTouched('username') && getFieldError('username');
        //const passwordError = isFieldTouched('password') && getFieldError('password');
        const userNameError = getFieldError('username');
        const passwordError = getFieldError('password');
        const REVIEW =
            <p><strong>REVIEWERS:</strong><br/>
            Valid usernames include <strong>reviewer_1</strong>, <strong>reviewer_2</strong>, <strong>reviewer_3</strong>, and <strong>reviewer_4</strong> <br/>
            Password is the grant number: HG[6-numbers]
            </p>

        return(<Form className='login-form'>
                <Row gutter={20}>
                    <Alert type='warning' description={REVIEW} showIcon/>
                </Row>
                <Row gutter={20}>
                    <Col>
                        <Form.Item validateStatus={userNameError ? 'error' : ''} help={userNameError || ''}>
                            {getFieldDecorator('username', {
                                rules: [{ required: true, message: 'Please input your username!' }],
                             })(
                                <Input
                                       autoComplete='off'
                                       size='large'
                                       prefix={<Icon type="user"
                                       style={{ color: 'rgba(0,0,0,.25)' }} />}
                                       placeholder="Username / Email" />
                             )}
                        </Form.Item>

                        <Form.Item validateStatus={passwordError ? 'error' : ''} help={passwordError || ''}>
                            {getFieldDecorator('password', {
                                rules: [{ required: true, message: 'Please input your Password!' }],
                             })(
                                <Input
                                       autoComplete='off'
                                       size='large'
                                       prefix={<Icon type="lock"
                                       style={{ color: 'rgba(0,0,0,.25)' }} />}
                                       type="password"
                                       placeholder="Password" />
                             )}
                        </Form.Item>
                        <Button type="link" role="button" className="login-form-forgot" onClick={this.handleLoginForgetDisplay}>Forgot username or password?</Button>
                    </Col>
                </Row>

                <Row>
                    {authMessage && <Divider/>}
                    {authMessage &&
                        <Alert key='error' description={authMessage}
                        type="error" onClose={this.handleErrorClose}/>
                    }
                </Row>

                <Row style={{'textAlign':'right'}}>
                     <Button.Group size="large">
                        <Button key="reset" onClick={this.resetFields}>RESET</Button>
                        <Button key="submit" loading={authStatus.endsWith('PROGRESS')} htmlType="submit" type="primary" onClick={this.userLogin}>SUBMIT</Button>
                     </Button.Group>
                </Row>
            </Form>
        )
    }
}

export default (Form.create({ name: 'login' })(LoginForm));
