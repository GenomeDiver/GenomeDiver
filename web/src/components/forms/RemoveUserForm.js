import React, { PureComponent } from 'react';
import {formItemLayout, tailFormItemLayout} from './layouts'
import {Row, Form, AutoComplete, Button} from 'antd';

class RemoveUserForm extends PureComponent {

    handleRemoveUser = (e) => {
        e.preventDefault();
        this.props.form.validateFields().then(result => {
            const body = this.props.form.getFieldsValue();
            console.log('handle remove user', body);

        }).catch(error => {
            // do nothing
            // <Input/>
            // AutoComplete dataSource={usernames}/>
        });
    }


    render() {
        const {getFieldDecorator} = this.props.form;
        // getFieldError, isFieldTouched

        const usernames = this.props.userData ? this.props.userData.map((u) => {return u.username}) : [];

        return(
            <Row style={{marginTop:20}} onSubmit={this.handleRemoveUser}>
                <Form {...formItemLayout}>
                    <Form.Item label='Username'>
                        {getFieldDecorator('username', {
                            rules: [{ required: true, message: 'Please input a username' }],
                        })(<AutoComplete dataSource={usernames}/>)}
                    </Form.Item>
                    <Form.Item {...tailFormItemLayout}>
                        <Button type="primary" htmlType="submit">SUBMIT</Button>
                    </Form.Item>
                </Form>
            </Row>
        )
    }
}

export default Form.create({name: 'remove_user'})(RemoveUserForm)