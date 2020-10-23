import React, { PureComponent } from 'react';
import {formItemLayout, tailFormItemLayout} from './layouts'
import {Row, Form, Input, Select, Button} from 'antd';


class AddUserForm extends PureComponent {

    // Fields
    // ---------------------------------------------------
    // FirstName
    // LastName
    // Username
    // Email
    // Role             (dropdown)
    // Institution      (dropdown - dependent on role)
    // Mobile
    //
    // Lab ID
    // Clinic ID
    //
    constructor(props) {
        super(props);

        this.state = {
            selectedRole: null
        }
    }

    handleSelectedRole = (e) => {
        this.setState({selectedRole:e});
    }

    handleAddUser = (e) => {
        e.preventDefault();
        this.props.form.validateFields().then(result => {
            // const body = this.props.form.getFieldsValue();
            // console.log('handle add user', body);

        }).catch(error => {
            // do nothing
        });
    }

    render() {
        const {institutionData} = this.props;
        const {selectedRole} = this.state;
        const roleToType = {
            'CAREGIVER':'CLINIC',
            'LAB_USER':'LAB'
        }
        
        const {getFieldDecorator} = this.props.form;
        //  getFieldError, isFieldTouched

        const filteredInstitutions = (institutionData && selectedRole) ?
            institutionData.filter((i) => {return i.type === roleToType[selectedRole]}) : [];

        return (
            <Row style={{marginTop:20}} onSubmit={this.handleAddUser}>
                <Form {...formItemLayout}>

                    <Form.Item label='First Name'>
                        {getFieldDecorator('first_name', {
                            rules: [{ required: true, message: 'Please input a first name' }],
                        })(<Input/>)}
                    </Form.Item>

                    <Form.Item label='Last Name'>
                        {getFieldDecorator('last_name', {
                            rules: [{ required: true, message: 'Please input a last name' }],
                        })(<Input/>)}
                    </Form.Item>

                    <Form.Item label='Username'>
                        {getFieldDecorator('username', {
                            rules: [{ required: true, message: 'Please input a username' }],
                        })(<Input/>)}
                    </Form.Item>

                    <Form.Item label='Email'>
                    {getFieldDecorator('email', {
                        rules: [{type: 'email', message: 'The input is not valid e-mail!'},
                                {required: true, message: 'Please input an e-mail!',}],
                      })(<Input/>)}
                    </Form.Item>

                    <Form.Item label='Role'>
                        {getFieldDecorator('type', {
                            rules: [{ required: true, message: 'Please select the user\'s role!' }],
                         })(<Select style={{ width: 150 }} onChange={this.handleSelectedRole}>
                              <Select.Option value="CAREGIVER">CAREGIVER</Select.Option>
                              <Select.Option value="LAB_USER">LAB USER</Select.Option>
                           </Select>)}
                    </Form.Item>

                    <Form.Item label='Institution'>
                        {getFieldDecorator('institution', {
                            rules: [{ required: true, message: 'Please pick the user\'s institution' }],
                         })(<Select disabled={!selectedRole} style={{ width: '100%' }}>
                            {filteredInstitutions && filteredInstitutions.map(i => (
                                <Select.Option key={i.id} value={i.id}>{i.name}</Select.Option>
                            ))}
                           </Select>)}
                    </Form.Item>

                    <Form.Item label='Mobile'>
                    {getFieldDecorator('phone', {
                        rules: [{ required: false, message: 'Please input a mobile number' }],
                    })(<Input/>)}
                    </Form.Item>

                    <Form.Item {...tailFormItemLayout}>
                        <Button type="primary" htmlType="submit">SUBMIT</Button>
                    </Form.Item>

                </Form>
            </Row>)
    }
}

export default Form.create({ name: 'add_user' })(AddUserForm);