import React, { Component } from 'react';
import { Form, Icon, Input, Row, Col, Button} from 'antd';

class LoginForgetForm extends Component {

    constructor(props) {
        super(props);
        this.state = {
            emailFocus: false
        }
    }
    
    handleForget = (e) => {
        e.preventDefault();
        this.props.form.validateFields().then(result => {
            const body = this.props.form.getFieldsValue();
            this.props.loginForget(body);

        }).catch(error => {});
    }

    handleLoginForgetDisplay = (e) => {
        this.props.loginForgetDisplay(false);
    }

    handleEmailFocus = (e) => {
        this.setState({emailFocus:true})
    }

    handleEmailBlur = (e) => {
        this.setState({emailFocus:false})
    }

    resetFields = (e) => {
        this.props.form.resetFields();
    }

    render() {
        const {getFieldDecorator, getFieldError} = this.props.form;
        const {emailFocus} = this.state;
        const emailError =  !emailFocus && getFieldError('email') ;

        return(
            <Form className='forget-form' onSubmit={this.handleForget}>
                 <Row gutter={20}>
                     <Col>
                        <Form.Item validateStatus={emailError ? 'error' : ''} help={emailError || ''}>
                            {getFieldDecorator('email', {
                                rules: [
                                    { type: 'email', message: 'The input is not valid e-mail!'},
                                    { required: true, message: 'Please input your email!' }],
                             })(
                                <Input size='large' autoComplete='off' onFocus={this.handleEmailFocus} onBlur={this.handleEmailBlur}
                                       prefix={<Icon type="inbox"
                                       style={{ color: 'rgba(0,0,0,.25)' }} />}
                                       placeholder="Email" />
                             )}
                        </Form.Item>

                        <Button type="link" role="button" className="login-form-forgot" onClick={this.handleLoginForgetDisplay}>
                            <Icon type="left" />Back to Login</Button>

                        <Row style={{'textAlign':'right'}}>
                             <Button.Group size="large">
                                <Button key="reset" onClick={this.resetFields}>RESET</Button>
                                <Button type="primary" htmlType="submit">SUBMIT</Button>
                             </Button.Group>
                        </Row>
                     </Col>
                 </Row>
            </Form>
        )
    }
}

export default Form.create({ name: 'login-forget' })(LoginForgetForm);