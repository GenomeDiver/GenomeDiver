import React, { PureComponent } from 'react';
import { Row, Col, Form, Input, Select, Button, Alert } from 'antd';

class AddInstitutionForm extends PureComponent {

    // Institution Name := Sting
    // Institution Type := CLINIC | LAB

    handleAddInstitution = (e) => {
        this.props.form.validateFields().then(result => {
            const body = this.props.form.getFieldsValue();
            this.props.addInstitution(body);
        }).catch(error => {
            // do nothing
        });
    }

    render() {
        const {errorMessage} = this.props;
        // getFieldsError
        const {getFieldDecorator} = this.props.form;
        // getFieldError, isFieldTouched
        //const institutionError = isFieldTouched('institution') && getFieldError('institution');
        //const typeError = isFieldTouched('type') && getFieldError('type');

        return (
        <Row gutter={8} style={{marginTop:40}}>
            <Col span={18} offset={1}>
            <Form layout="inline">
                <Form.Item>
                    {getFieldDecorator('institution', {
                        rules: [{ required: true, message: 'Please input an institution name' }],
                     })(<Input autoComplete='off' placeholder='Institution Name'style={{width: 280}}/>)}
                </Form.Item>
                <Form.Item>
                    {getFieldDecorator('type', {
                        rules: [{ required: true, message: 'Please pick an institution type' }],
                     })(<Select placeholder='Type' style={{ width: 120 }}>
                      <Select.Option value="CLINIC">Clinic</Select.Option>
                      <Select.Option value="LAB">Lab</Select.Option>
                   </Select>)}
                </Form.Item>
                <Form.Item>
                    <Button type='primary' onClick={this.handleAddInstitution}>SUBMIT</Button>
                </Form.Item>
            </Form>

            <Row>
                {errorMessage &&
                    <Alert key='error' description={errorMessage}
                    type="error" onClose={this.handleErrorClose}/>
                }
            </Row>
            </Col>
        </Row>
        )
    }
}

export default Form.create({ name: 'add_institution' })(AddInstitutionForm)