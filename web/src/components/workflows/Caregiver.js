import React, { PureComponent } from 'react';
import { connect } from 'react-redux'
import history from '../../helpers/History';
import {Steps, Modal, Row, Col, Switch, Icon } from 'antd';
// import { Link } from 'react-router-dom';
import SelectPatient from './caregiver/SelectPatient';
import RefinePhenotype from './caregiver/RefinePhenotype';
import CaseAnalysisStatus from './shared/CaseAnalysisStatus';

// const { Title } = Typography;
/************************************************************************************
 
[ Caregiver Workflow ]
    
    [Select Patient]
    
    [Refine Phenotypes]
    Caregiver starts with a patient selection screen and depending on the current status 
    of the patient (successful completion of PIPELINE(1)) the caregiver can prioritize phenotype
    which will trigger PIPELINE(2). 

    [Summary]
  
*************************************************************************************/

const Step = Steps.Step;

const step_keys = ["select", "refine", "explore", "summary"];

const steps = [
    {title: 'Pick patient'},
    {title: 'Refine phenotype'},
    {title: 'Explore findings'},
    {title: 'Review'}
];

class Caregiver extends PureComponent {

    constructor(props) {
        super(props);

        this.default_state = {
            current_step: 0,
            current_patient: null,
            info:(localStorage.getItem('info') === 'true')
        }

        this.state = {...this.default_state}
      }
    
      
    onStepSelect = new_step => {
        const {current_patient} = this.state;
        // const current_status = current_patient ? current_patient.status : -1;
        
        switch(new_step) {
            case 0: 
            default:
                // select patient, no patient restrictions 
                this.caregiverHome();
                break;

            case 1:
            case 2:
            case 3:
                // refine phenotypes / summary 
                // require an active otherwise message patient required
                if (current_patient) {
                    history.push(`/caregiver/${step_keys[new_step]}`);
                } else {
                    Modal.warn({
                        title:"WARNING: MISSING PATIENT",
                        content: "Please pick a patient",
                        onOk() {}
                    })
                }
                break;

        }
    }

    componentDidMount() {

        // ------- DEBUGGING ONLY 
        // setTimeout(() => {
        //     this.setPatient({key:1}, 'explore');
        // }, 500);
        // ------- DEBUGGING ONLY 

        if (localStorage.getItem('info') === null) {
            localStorage.setItem('info', 'true')
            this.setState({info:true});
        }
    }

    infoToggle = (e) => {
        const {info} = this.state;
        localStorage.setItem("info", (!info).toString())
        this.setState({info:!info});
    }

    caregiverHome = () => {history.push("/caregiver")}

    caregiverSummary = () => {this.onStepSelect(3)}

    setPatient = (patient_record, op) => {
        // current_step is based on patient_status
        // current_patient ~ patient_record
        // current_patient is a flattened
        
        if (step_keys.indexOf(op) !== -1) {
            this.setState({
                current_patient: {
                    ...patient_record,
                    id: Number.parseInt(patient_record.key)}
            });

            history.push(`/caregiver/${op}`)
        }
    }
    

    componentDidUpdate(prevProps) {
        const current_patient = this.state.current_patient;
        const current_location = this.props.location; 
        const prev_location = prevProps.location;
        
        if (current_location !== prev_location) {
            if (current_location.pathname === "/caregiver") {
                this.setState({...this.default_state});
            } else if (current_patient && current_patient.id >= 1) {
                const current_step = step_keys.indexOf(current_location.pathname.split('/').pop())
                this.setState({current_step});
            }
        }
    }

    render() {
        const { current_step, current_patient, info } = this.state;
        const valid_patient = current_patient && current_patient.id >= 1;
        const {auth} = this.props;

        return (
            <div>
                {/* Caregiver WorkFlow*/}
                <Row style={{marginBottom:30}}>
                    <Col span={12} >
                   </Col>
                   <Col span={12} style={{textAlign:'right'}}>
                        <span>Info on/off </span>
                        <Switch 
                            checkedChildren={<Icon type="info-circle" />}
                            defaultChecked={info} 
                            onChange={(e) => this.infoToggle(e)}/>
                   </Col>
                </Row>

                {/* Select from current Patients */}
                <Steps current={current_step} onChange={this.onStepSelect}>
                    {steps.map(item => <Step key={item.title} title={item.title} disabled={current_step===0}/>)}
                </Steps>

                {(current_step === 0 && !current_patient) && 
                    <SelectPatient 
                        showInfo={info}
                        setPatient={this.setPatient} 
                        role={auth.role} />}

                {/* Refine Phenotypes for Selected Patient (Drag and Drop) */}
                {(current_step === 1 && valid_patient) &&
                    <RefinePhenotype 
                        showInfo={info}
                        patient_id={current_patient.id} 
                        goHome={this.caregiverHome} />}
                
                {/* Explore of Analysis for Selected Patient */}
                {(current_step === 2 && valid_patient) && 
                    <CaseAnalysisStatus view={'caregiver_explore'} 
                        showInfo={info}
                        patient_id={current_patient.id} 
                        goHome={this.caregiverHome}
                        goSummary={this.caregiverSummary}/>}
                
                {/* Summary of Results */}
                {(current_step === 3 && valid_patient) && 
                    <CaseAnalysisStatus 
                        view={'caregiver_summary'} 
                        showInfo={info}
                        patient_id={current_patient.id} 
                        goHome={this.caregiverHome}/>}
                
            </div>            
        )
    }
}

function mapStateToProps(store, ownProps) {
    const { Auth } = store;

    return {
        auth :  Auth.info
    }
}

export default connect(
    mapStateToProps,
    null
)(Caregiver);

// https://github.com/axios/axios#cancellation