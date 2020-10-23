import React, { PureComponent } from 'react';
import { Card, Row, Col, Collapse, Typography} from 'antd';
import moment from 'moment';

const { Panel } = Collapse;
const { Text } = Typography;

export class PatientDiveBadge extends PureComponent {

    render() {
        const {patient} = this.props;
        // console.log(patient);

        const minor_col = 8
        const major_col = 16
        const labs = patient.institutions.filter((i) => i.type === "LAB").map((i) => i.name).join(", ")
        const clinics = patient.institutions.filter((i) => i.type === "CLINIC").map((i) => i.name).join(", ")

        return (
            <Collapse style={{...this.props.style, fontSize:'1.1em', fontWeight:500}}>
                <Panel showArrow={true} header={
                        <span>
                        <Text strong>{patient.first_name_enc} {patient.last_name_enc} </Text>
                        <Text style={{'float':'right'}} code>Patient</Text>
                        </span>
                    }>
    
                    <Row type="flex" justify="start" align="top" gutter={16}>
                        <Col span={12}>
                            <Card title="Patient Info" size="small">
                                <Row>
                                    <Col span={minor_col}>First Name:</Col>
                                    <Col span={major_col}>{patient.first_name_enc}</Col>
                                </Row>
                                <Row>
                                    <Col span={minor_col}>Last Name:</Col>
                                    <Col span={major_col}>{patient.last_name_enc}</Col>
                                </Row>
                                <Row>
                                    <Col span={minor_col}>Sex:</Col>
                                    <Col span={major_col}>{patient.sex}</Col>
                                </Row>
                                <Row>
                                    <Col span={minor_col}>MRN ID:</Col>
                                    <Col span={major_col}>{patient.mrn_id_enc}</Col>
                                </Row>
                                <Row>
                                    <Col span={minor_col}>Date of Birth:</Col>
                                    <Col span={major_col}>{moment(new Date(patient.date_of_birth)).format('MMM DD YYYY')}</Col>
                                </Row>
                                <Row>
                                    <Col span={minor_col}>Lab:</Col>
                                    <Col span={major_col}>{labs}</Col>
                                </Row>
                                <Row>
                                    <Col span={minor_col}>Clinic:</Col>
                                    <Col span={major_col}>{clinics}</Col>
                                </Row>
                            </Card>

                        </Col>
                        <Col span={12} offset={0}>
                            <Card title="Physician" size="small">
                                <Row>
                                    <Col span={minor_col}>Name:</Col>
                                    <Col span={major_col}>{patient.physician_first_name} {patient.physician_last_name}</Col>
                                </Row>
                                <Row>
                                    <Col span={minor_col}>Email:</Col>
                                    <Col span={major_col}>{patient.physician_email}</Col>
                                </Row>
                            </Card>
                        </Col>
                    </Row>
                </Panel>        
            </Collapse>
        )
    }
}