import React, { PureComponent } from 'react';
import { connect } from 'react-redux';
import { Menu, Row, Col, Card, Alert, Spin } from 'antd';
import { flatPatients, expansionSummary, loadingIcon, flexStyle } from '../../../helpers'
import { listPatients, listInstitutions } from '../../../actions';
import AddUpdatePatientForm from '../../forms/AddUpdatePatientForm';
import GenericTable from '../../../components/GenericTable';

const HELP_MESSAGE_ADD = <div>
    <span>Make a new patient record, with</span>
    <b><ul>
        <li>name</li>
        <li>sex</li>
        <li>medical record identifier (MRN)</li>
        <li>date of birth (DOB)</li>
        <li>referring physician name</li>
        <li>referring physician professional email</li>
        <li>referring physician clinic</li>
        <li>report-issuing lab</li>
    </ul></b>
</div>

const HELP_MESSAGE_SELECT = <ul>
    <li>Find your patient in the list (or, if missing, click Add patient to create new GD patient record). </li>
    <li>Click patient row to review or start a dive (analysis workflow), and follow the prompts.</li>
</ul>

class AddPatient extends PureComponent {

    constructor(props) {
        super(props)

        // (insert_patient || select_patient)
        this.state = {
            currentMenuKey: 'select_patient'
        }
    }

    componentDidMount() {
        if (!this.props.patientData) {
            this.props.patients();
        }

        // load institution data 
        if(!this.props.institutionData) {
            this.props.institutions();
        }
    }

    menuSelect = (e) => {
        this.setState({currentMenuKey:e.key});
    }

    onPatientSelect = (record, op) => {
        //const id = record.key;
        this.props.setPatient(record, op);
    }

    componentDidUpdate(prevProps, prevState) {
        if (prevState.currentMenuKey !== this.state.currentMenuKey 
            && this.state.currentMenuKey === 'select_patient') {
            this.props.patients();
        }
    }

    render() {
        const {currentMenuKey} = this.state;
        const {patientData, institutionData, role, showInfo} = this.props;
        const flattened_patients = flatPatients(patientData, role);
        const expansion_format = [
            {key:"configure", text:"Start dive"}, 
            {key:"summary", text:"Review"}
        ]
        const expansion = expansionSummary(patientData, 
            this.props.role, expansion_format);

        return (
            <Card style={{marginTop:20}}>
                {patientData ? 
                <Row gutter={8} style={flexStyle}>
                    <Col span={24}>
                        {/* showInfo && <Row><Alert description={HELP_MESSAGE} type="info" showIcon/></Row> */} 
                    
                        <Row style={{marginTop:20}}>
                            <Col span={4}>
                                <Menu style={{'height': '100%'}} theme='light' defaultSelectedKeys={[currentMenuKey]} defaultOpenKeys={[currentMenuKey]} mode="inline">
                                    <Menu.Item onClick={this.menuSelect} key="insert_patient">Add patient</Menu.Item>
                                    <Menu.Item onClick={this.menuSelect} key="select_patient">Select patient</Menu.Item>
                                
                                    {/* Insert Case */}
                                </Menu>
                            </Col>
                            <Col span={18} offset={1}>
                                {currentMenuKey === 'insert_patient' && <div>
                                    <h2 className="gd-heading">Add patient</h2>
                                    {showInfo && <Row>
                                        <Alert description={HELP_MESSAGE_ADD} type="info" showIcon></Alert>
                                    </Row>}
                                    <AddUpdatePatientForm 
                                        institutionData={institutionData} 
                                        reloadPatients={() => this.props.patients()}/> 
                                        
                                    </div>}

                                {currentMenuKey === 'select_patient' && flattened_patients &&
                                    <div>
                                    <h2 className="gd-heading">Pick a patient to continue</h2>
                                    {showInfo && <Row>
                                        <Alert description={HELP_MESSAGE_SELECT} type="info" showIcon></Alert>
                                    </Row>}
                                    <GenericTable
                                    
                                    expansion={expansion}
                                    onExpansionClick={this.onPatientSelect}
                                    expansionControlStyle={{
                                        margin: '0px 0px 0px 17%'
                                    }}
                                    data={flattened_patients}
                                    titleMap={{
                                        'action':'Action needed?',
                                        'first_name_enc':'first_name',
                                        'last_name_enc':'last_name',
                                        'mrn_id_enc':'MRN',
                                        'patient':'Patient'
                                    }}
                                    searchMap={
                                        ['patient', 'mrn_id_enc', 'date_of_birth',
                                        'physician', 'genetic_counselor', 'lab'
                                    ]}
                                    sortMap={{
                                        'patient': (a, b) => a.patient.localeCompare(b.patient),
                                        'mrn_id_enc': (a, b) => a.mrn_id_enc.localeCompare(b.mrn_id_enc),
                                        'physician': (a, b) => a.physician.localeCompare(b.physician),
                                        'genetic_counselor': (a, b) => a.genetic_counselor.localeCompare(b.genetic_counselor),
                                        'clinic': (a, b) => a.clinic.localeCompare(b.clinic),
                                    }}
                                    sortOrder={[
                                            'id', 'patient', 'mrn_id_enc', 'date_of_birth',
                                            'physician', 'genetic_counselor', 'clinic'
                                    ]}/>
                                    </div>
                                }
                            </Col>
                        </Row>
                    </Col>
                </Row> :
                <Row style={{textAlign:"center", margin:'10em'}}>
                    <Spin indicator={loadingIcon} />
                </Row>}
            </Card>
        )
    }
}

function mapStateToProps(store, ownProps) {
  let {PatientList, InstitutionList} = store;

  return {
    patientData: PatientList.data,
    institutionData: InstitutionList.data_lab
  };
}

function mapDispatchToProps(dispatch, ownProps) {
    return {
        patients: () => {
            dispatch(listPatients());
        },
        institutions:() => {
            dispatch(listInstitutions('LAB'));
        }
    }
};

export default connect(
    mapStateToProps,mapDispatchToProps
)(AddPatient);