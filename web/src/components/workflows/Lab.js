import React, { PureComponent } from 'react';
import { connect } from 'react-redux'
import { Steps, Modal, Row, Col, Switch, Icon} from 'antd';
//import { Link } from 'react-router-dom'
import history from '../../helpers/History';
import AddPatient from './lab/AddPatient'
import ConfigureAnalysis from './lab/ConfigureAnalysis'
import CaseAnalysisStatus from './shared/CaseAnalysisStatus'

// const { Title } = Typography;
/************************************************************************************
 
[ Lab Workflow ]

    [Add Patient]
    The Lab user kicks off the process of inserting the patient's clinical information. This 
    information (i.e. name, mrn) should generally be fixed

    [Start dive]
    The initial Genotype (VCF) and Phenotypes (HPO Terms) provided trigger
    PIPELINE(1). Its status is displayed in the "PIPELINE" tab. 

    [Summary]
    The Lab user is also allowed to prioritize variants which are boolean flags on variants after 
    PIPELINE(2)  [Variants resulting from RARE_REFINED VCF]. There should only be a handful of 
    variants to consider if all goes well. 

*************************************************************************************/

const Step = Steps.Step;

const step_keys = ["select", "configure", "summary"];

const steps = [
    {title: 'Pick/add patient'}, 
    {title: 'Start dive'},
    {title: 'Review'}
];

class Lab extends PureComponent {

    constructor(props) {
        super(props);
        this.default_state = {
            current_step: 0,
            current_patient: null,
            info:(localStorage.getItem('info') === 'true')
        }

        // console.log("constructor set")
        this.state = {...this.default_state}
      }
    
    componentDidMount() {
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

    onStepSelect = new_step => {
        const {current_patient} = this.state;
        // const current_status = current_patient ? current_patient.status : -1;
        
        switch(new_step) {
            case 0: 
            default:
                this.labHome();
                break;

            case 1: 
            case 2: 
                if (current_patient) {
                    history.push(`/lab/${step_keys[new_step]}`)
                } else {
                    Modal.warn({
                        title:"WARNING: MISSING PATIENT",
                        content: "Please select a patient",
                        onOk() {}
                    })
                }
                break;
        }
    }

    labHome = () => {history.push("/lab");}

    setPatient = (patient_record, op) => {

        // current_step is based on patient_status
        // current_patient ~ patient_record
        // current_patient is a flattened

        // let step_goal = Math.max(0, step_keys.indexOf(op))
        // TODO: probably some restrictions here

        if (step_keys.indexOf(op) !== -1) {
            this.setState({
                current_patient: {...patient_record,
                id: Number.parseInt(patient_record.key)}
            });

            history.push(`/lab/${op}`);
        }
    }

    // ------- DEBUGGING ONLY 
    // componentDidMount() {
    //     setTimeout(() => {
    //         this.setPatient({key:1}, 'summary');
    //     }, 100);
    // }
    // ------- DEBUGGING ONLY 

    componentDidUpdate(prevProps) {
        const current_patient = this.state.current_patient;
        const current_location = this.props.location; 
        const prev_location = prevProps.location;
        
        if (current_location !== prev_location) {
            if (current_location.pathname === "/lab") {
                this.setState({...this.default_state});
            } else if (current_patient && current_patient.id >= 1) {
                const current_step = step_keys.indexOf(current_location.pathname.split('/').pop())
                this.setState({current_step});
            }
        }
    }

    render() {
        const {current_step, current_patient, info } = this.state;
        const valid_patient = current_patient && current_patient.id >= 1;
        const {auth} = this.props;
        
        return(
            <div>

                {/* Lab Workflow */}
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
                
                <Steps current={current_step} onChange={this.onStepSelect}>
                    {steps.map(item => <Step key={item.title} title={item.title} disabled={current_step===0}/>)}
                </Steps>

                {/* Current Patients */}   
                {!valid_patient && current_step === 0 && auth && 
                    <AddPatient 
                        showInfo={info}
                        setPatient={this.setPatient} 
                        role={auth.role}/>}
                
                {/* Configure "Workflow" - Input HPO / VCF */}
                {valid_patient && current_step === 1 &&
                    <ConfigureAnalysis 
                        showInfo={info}
                        patient_id={current_patient.id} 
                        goHome={this.labHome}/>}
                
                {/* Results */}
                {valid_patient && current_step === 2 && 
                    <CaseAnalysisStatus 
                        showInfo={info}
                        view='lab'
                        patient_id={current_patient.id} 
                        goHome={this.labHome}/>}

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
)(Lab);