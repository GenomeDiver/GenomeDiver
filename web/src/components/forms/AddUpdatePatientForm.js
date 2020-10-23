import React, { PureComponent } from 'react';
import {formItemLayout, tailFormItemLayout} from './layouts'
import {Row, Col, Form, Radio, Input, Select, Button, DatePicker, Modal, Result} from 'antd';
import Rest from '../../services/Rest';
import {gqlError } from '../../helpers';
import moment from 'moment';

const headingStyle = {
    'background': '#fafafa',
    'padding': 10,
    'color':'#111111',
    'marginBottom':20,
    'marginRight':10
}

const dateFormatList = ['MM/DD/YYYY','MM/DD/YY'];

class AddUpdatePatientForm extends PureComponent {

    constructor(props) {
        super(props);

        this.state = {
            submitted_success:false
        }
    }
    
    componentDidMount() {
        this.setState({submitted_success:false});
    }
    
    disabledDate(current) {
        return current > moment().endOf('day');
    }

    handleAddPatient = (e) => {
        e.preventDefault(); // form submit - blocking?
        this.props.form.validateFields().then(result => {
            const body = this.props.form.getFieldsValue();
            const request_body = {...body, 
                date_of_birth: body.date_of_birth.toISOString(),
                date_of_report: body.date_of_report.toISOString() 
            }

            Rest.createPatient(
                request_body['first_name'],
                request_body['last_name'],
                request_body['sex'],
                request_body['mrn_id'],
                request_body['physician_first_name'],
                request_body['physician_last_name'],
                request_body['physician_email'],
                request_body['gc_first_name'],
                request_body['gc_last_name'],
                request_body['gc_email'],
                request_body['date_of_birth'],
                request_body['date_of_report'],
                request_body['lab_id'],
                request_body['clinic_id'])
                .then(response => {return gqlError(response)})
                .then(result => {
                    this.setState({submitted_success:true})
                    // this.props.reloadPatients();
                }).catch(error => {
                    // do nothing
                    Modal.error({
                        title:'Error',
                        content: error.message || error.response.data
                            .errors.map(d => d.message).join('\n'),
                        onOk() {}
                    });
                })
        }).catch(error => {/* validation errors */})
    }

    render() {
        const {submitted_success} = this.state;
        const {institutionData} = this.props;
        const {getFieldDecorator} = this.props.form;
        // getFieldError, isFieldTouched

        const valid_clinics = (institutionData) ? institutionData.institutions.filter((i) => {return i.type === 'CLINIC'}) : [];
        const valid_labs = (institutionData) ? institutionData.institutions.filter((i) => {return i.type === 'LAB'}) : [];
        
        return (
            <Row gutter={0} style={{marginTop:30}} onSubmit={this.handleAddPatient}>
                {!submitted_success ? 
                    <Col span={24}>
                    <Form {...formItemLayout}>
                        <div>
                        <h4 span={10} style={headingStyle}>Patient</h4>

                        <Form.Item label='First name'>
                            {getFieldDecorator('first_name', {
                                rules: [{ required: true, message: 'Please input a first name' }],
                            })(<Input autoComplete="off"/>)}
                        </Form.Item>

                        <Form.Item label='Last name'>
                            {getFieldDecorator('last_name', {
                                rules: [{ required: true, message: 'Please input a last name' }],
                            })(<Input autoComplete="off"/>)}
                        </Form.Item>

                        <Form.Item label="Sex">
                            {getFieldDecorator('sex', {
                                rules: [{ required: true, message: 'Please input an estimated sex' }],
                            })(
                                <Radio.Group>
                                    <Radio.Button value="FEMALE">Female</Radio.Button>
                                    <Radio.Button value="MALE">Male</Radio.Button>
                                    <Radio.Button value="UNKNOWN">Other/Unknown</Radio.Button>
                                </Radio.Group>
                            )}
                        </Form.Item>    
                        
                        <Form.Item label='MRN'>
                            {getFieldDecorator('mrn_id', {
                                rules: [{ required: true, message: 'Please input a MRN ID' }],
                            })(<Input autoComplete="off" style={{ width: 150 }}/>)}
                        </Form.Item>

                        <Form.Item label='Date of birth'>
                            {getFieldDecorator('date_of_birth', {
                                rules: [{ required: true, message: 'Please input a Date' }],
                            })(<DatePicker 
                                format={dateFormatList} 
                                disabledDate={this.disabledDate}
                                showToday={false}
                            />)}
                        </Form.Item>
                    </div>

                    <div>
                        <h4 style={headingStyle}>Ordering physician</h4>
                        <Form.Item label='First name'>
                            {getFieldDecorator('physician_first_name', {
                                rules: [{ required: true, message: 'Please input the physician\'s first name' }],
                            })(<Input autoComplete="off"/>)}
                        </Form.Item>

                        <Form.Item label='Last name'>
                            {getFieldDecorator('physician_last_name', {
                                rules: [{ required: true, message: 'Please input the physicians\'s last name' }],
                            })(<Input autoComplete="off"/>)}
                        </Form.Item>

                        <Form.Item label="Email">
                          {getFieldDecorator('physician_email', {
                            rules: [{type: 'email', message: 'The input is not valid e-mail!'},
                                    {required: true, message: 'Please input an e-mail!',}],
                          })(<Input autoComplete="off"/>)}
                        </Form.Item>

                        <Form.Item label='Clinic'>
                            {getFieldDecorator('clinic_id', {
                                rules: [{ required: true, message: 'Please pick the patients\'s clinic!' }],
                             })(<Select style={{ width: '100%' }}>
                                {valid_clinics && valid_clinics.map(i => (
                                    <Select.Option key={i.id} value={i.id}>{i.name}</Select.Option>
                                ))}
                               </Select>)}
                        </Form.Item>
                    </div>

                    <div>
                        <h4 style={headingStyle}>Genetic Counselor</h4>
                        <Form.Item label='First name'>
                            {getFieldDecorator('gc_first_name', {
                                rules: [{ required: false, message: 'Please input the genetics counselor\'s first name' }],
                            })(<Input autoComplete="off"/>)}
                        </Form.Item>

                        <Form.Item label='Last name'>
                            {getFieldDecorator('gc_last_name', {
                                rules: [{ required: false, message: 'Please input the enetics counselor\'s last name' }],
                            })(<Input autoComplete="off"/>)}
                        </Form.Item>

                        <Form.Item label="Email">
                          {getFieldDecorator('gc_email', {
                            rules: [{type: 'email', message: 'The input is not valid e-mail!'},
                                    {required: false, message: 'Please input an e-mail!',}],
                          })(<Input autoComplete="off"/>)}
                        </Form.Item>
                    </div>

                    <div> 
                        <h4 style={headingStyle}>Test details</h4>
                        <Form.Item label='Lab'>
                            {getFieldDecorator('lab_id', {
                                rules: [{ required: true, message: 'Please pick the patients\'s Lab!' }],
                             })(<Select style={{ width: '100%' }}>
                                {valid_labs && valid_labs.map(i => (
                                    <Select.Option key={i.id} value={i.id}>{i.name}</Select.Option>
                                ))}
                               </Select>)}
                        </Form.Item>  

                        <Form.Item label='Date of report'>
                            {getFieldDecorator('date_of_report', {
                                rules: [{ required: true, message: 'Please input a Date' }],
                            })(<DatePicker 
                                format={dateFormatList}
                                disabledDate={this.disabledDate}
                            />)}
                        </Form.Item>
                    </div>

                    <Form.Item {...tailFormItemLayout}>
                        <Button type="primary" htmlType="submit">SUBMIT</Button>
                    </Form.Item>

                </Form>
                </Col> 
                :  
                <Result
                    status="success"
                    title="Successfully entered a patient!"
                />}
            </Row>
        )
    }
}

export default Form.create({ name: 'add_user' })(AddUpdatePatientForm);