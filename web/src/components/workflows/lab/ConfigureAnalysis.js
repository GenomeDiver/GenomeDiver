import React, { PureComponent } from 'react';
import { Link } from 'react-router-dom';
import { Card, Row, Col, Button, Spin, Modal, Alert, Select, Form, Result} from 'antd';
import { PatientDetail, startAnalysis, cancelAnalysis, completeAnalysis} from '../../../actions';
import { connect } from 'react-redux';
import { CSSTransition } from 'react-transition-group';
import { flexStyle, loadingIcon } from '../../../helpers'
import { PatientDiveBadge } from '../shared/PatientDiveBadge';
import HPOSelector from '../../inputs/HPOSelector';
import VCFUploader from '../../inputs/VCFUploader';
import _ from 'lodash';
import './styles/ConfigureAnalysis.css';

// const HELP_MESSAGE = <ul>
//     <li>For each sign/symptom on this patient's genome test order, input corresponding phenotype term(s)</li>
//     <li>Input the patient's whole-genome data in the vcf format</li>
// </ul>

const HELP_MESSAGE = <div>
    <span>To start a new <i>dive</i> (analysis workflow)</span>
    <ul>
        <li><b>Enter <a rel="noopener noreferrer" href="https://hpo.jax.org/app/" target="blank">HPO</a> phenotype term(s) for each sign/symptom on patient's genome test order.</b></li>
        <li>Upload patient's whole-genome data in the VCF format (.vcf/.gz). </li>
        <li>GenomeDiver will analyze genome and phenotype data, refined by caregiver, to then return findings</li>    
    </ul>
</div>

const MESSAGE_DIVE_STARTED = <p>
    GenomeDiver will shortlist relevant phenotypes and diseases for caregiver to classify. <br/>
    After the caregiver submits the final dive summary for your review, the patient's dive status will be updated. <br/>
    To start/review another dive, <Link to="/lab">return to patient list.</Link>
</p>

const { Option }    = Select;
const { confirm }   = Modal;

const START         = 'SUBMIT';
const FIRST_RUN     = 'FIRST_RUN';

const default_state = {
    assembly:"grch37", 
    case_id:null, 
    vcf_name:null,
    hpo_list:[],
    error_validation:[],
    submitted_analysis:false
}

class ConfigureAnalysis extends PureComponent {
    
    constructor(props) {
        super(props);
        this.state = {...default_state}
    }

    componentDidMount() {
        // always refresh the patient when this component is loaded 
        this.props.patients(this.props.patient_id);
        
        // start with the default state 
        this.setState(default_state);
    }

    componentDidUpdate(prevProps) {
        const prev_patient = prevProps.patient;
        const {patient, analysis_status, analysis_message} = this.props; 
  
        // patient -> take new case 
        if (!prev_patient && patient && patient.case && patient.case.length > 0) {
            this.setState({case_id:patient.case[0].id})
        }

        // analysis_status is in error 
        if (analysis_status === 'ANALYSIS_REQUEST_ERROR') {
            const ctx = this; 
            Modal.error({
                title:"Error",
                content:analysis_message,
                onOk() {
                    ctx.props.cancelAnalysis();
                }
            })
        }

        if (analysis_status === 'ANALYSIS_REQUEST_SUCCESS') {
            this.props.completeAnalysis();
            this.setState({submitted_analysis: true});
        }
    }

    onChangeCase(case_id) {
        this.setState({case_id});
    }

    onChangeAssembly(assembly) {
        // set the reference assembly (GRCh37 || GRCh38)
        this.setState({assembly});
    }
  
    onChangeVCF(vcf_name) {
        // set the VCF uploaded VCF name for the start of this analysis
        this.setState({vcf_name});
    }

    onChangeHPO(hpo_list) {
        // update the running list of HPO Terms
        // this is for validation purposes ONLY. The reason is that
        // HPO terms are already stored on the server side. They just haven't been
        // converted into input terms. 
        this.setState({hpo_list});
    }

    showConfirm(ctx) {
        confirm({
            title: 'Are you sure?',
            content: 'Analysis will start on the patient with the uploaded VCF and HPO phenotype features',
            onOk() {
                const{hpo_list, case_id, vcf_name, error_validation} = ctx.state;
                
                let validation = []
                if (!case_id) {validation.push("Please specify a case for the patient.")}
                if (!vcf_name || _.isEmpty(vcf_name)) {validation.push("Please upload a variant call file (*.vcf, *.gz)")}
                if (_.isEmpty(hpo_list)) {validation.push("Please input at least one HPO term")}
                
                // update the display of validation errors 
                if (!_.isEqual(error_validation.sort(), validation.sort())) {
                    ctx.setState({error_validation: validation})
                }

                // sex should already be filled out in the insert patient form 

                // no errors - submit analysis 
                if (_.isEmpty(validation)) {
                    const {id} = ctx.props.patient;
                    const {case_id, assembly, vcf_name} = ctx.state;
                    
                    // console.log("START ANALYSIS ", vcf_name)
                    ctx.props.startAnalysisLab(id, case_id, FIRST_RUN, assembly, vcf_name); 
                }
            }
        });
    }

    render() {
        const {patient_id, patient, showInfo} = this.props; 
        const {submitted_analysis, assembly, case_id, error_validation} = this.state;
        const headingStyle = {}
        const valid_patient = (patient && (Number.parseInt(patient_id) === Number.parseInt(patient.id)))
       
        return (
        <Card style={{marginTop:20}}> 

            {submitted_analysis && 
                <CSSTransition in={submitted_analysis} timeout={0} classNames="result" unmountOnExit appear>
                    <Result 
                        status="success" 
                        title="Dive started."
                        subTitle={MESSAGE_DIVE_STARTED}
                    />
                 </CSSTransition>
            }

            {!submitted_analysis && valid_patient &&
                <Row gutter={8} style={flexStyle}>
                    <Col span={24} offset={0}>

                        <h2 className="gd-heading">Start dive</h2>

                        {/* Help Message */}
                        {showInfo && <Row style={{marginTop:15, marginBottom:15}}><Alert description={HELP_MESSAGE} type="info" showIcon/></Row>}
                        
                        <Form>
                            {patient.case && case_id ?
                            <Row style={{marginBottom:20}}>
                                <Col span={14}>
                                {/* Patient Info Area */}
                                <PatientDiveBadge style={{marginTop:20}} patient={patient}/>
                                </Col>
                                <Col span={8} offset={1} >
                                <h4 style={headingStyle}>Case:</h4>
                                
                                    {/*  Patient : Case
                                        ---------------------------------------------------
                                    */}
                                    <Select 
                                        defaultValue = {case_id} style={{ width: "100%", marginBottom: 20 }}
                                        onChange={(v) => this.onChangeCase(v)}>
                                        {patient.case.map((c, ci) => 
                                        <Option key={c.id} value={c.id}>
                                            <span className='case-select'> {`${c.name}`}</span>
                                        </Option>)}
                                    </Select>
                                </Col>
                                
                            </Row> : 
                            <Row style={{marginTop:20, marginBottom:20}}>
                                <Alert type="error" showIcon message="No cases found for patient!"/>
                            </Row>}

                            {patient.case && case_id && 
                            <Row>
                                <Col span={14}>

                                    {/* Patient : Phenotype 
                                        --------------------------------------------------- 
                                    */}
                                    <h4 span={10} style={headingStyle}>Phenotype(s):</h4>
                                    <HPOSelector 
                                        patient = {patient}
                                        onChangeHPO={(h)      => this.onChangeHPO(h)}    
                                    />
                                </Col>

                                <Col span={8} offset={1}>
                                    
                                    {/* 
                                        Patient : Genomic Submission 
                                        --------------------------------------------------- 
                                    */}
                                    <h4 span={10} style={headingStyle}>Genotype:</h4>
                                    <VCFUploader 
                                        patient={patient} assembly={assembly} 
                                        onChangeAssembly={(v) => this.onChangeAssembly(v)}
                                        onChangeVCF={(v)      => this.onChangeVCF(v)}
                                    />
                                </Col>
                            </Row>}
                            
                            {/* 
                                Errors: Validation 
                                --------------------------------------------------- 
                            */}
                            {error_validation.length > 0 && 
                                <Row style={{marginTop:20}}>
                                    <Alert type="error" showIcon message={error_validation.length > 1 ?
                                        <ul>{error_validation.map(e => (<li key={e}>{e}</li>))}</ul>
                                        : <span>{error_validation[0]}</span>
                                    }/>
                                </Row>
                            }
                        </Form>
                    </Col>
                </Row>}
                
                {/* Spinner */}
                {!submitted_analysis && !valid_patient && 
                <Row style={{textAlign:"center", margin:'10em'}}>
                    <Spin indicator={loadingIcon}/>
                </Row>}

                {/* Controls */}
                <Row style={{marginTop:20}}>
                    <Col span={12}>
                        <Button icon='left' type='primary' onClick={this.props.goHome}>BACK</Button>
                    </Col>
                    {!submitted_analysis && 
                        <Col span={12} style={{textAlign: 'right'}}>
                            <Button onClick={(e) => this.showConfirm(this)} size= "default" type='primary'>{START}</Button>
                        </Col>
                    }
                </Row>
        </Card>
        )
    }
}

function mapStateToProps(store, ownProps) {
    let {PatientDetail, Analysis} = store;
    return {
        patient: PatientDetail.data && PatientDetail.data.patients ? PatientDetail.data.patients[0] : undefined,
        analysis_status: Analysis && Analysis.status ? Analysis.status : undefined,
        analysis_message: Analysis && Analysis.message ? Analysis.message : undefined 
    };
  }

function mapDispatchToProps(dispatch, ownProps) {
    return {
        completeAnalysis:() => {
            dispatch(completeAnalysis());
        },
        cancelAnalysis:() => {
            dispatch(cancelAnalysis());
        },
        startAnalysisLab:(patient_id, case_id, pipeline, reference, vcf_name) => {
            dispatch(startAnalysis(patient_id, case_id, pipeline, reference, vcf_name));
        },
        patients: (id) => {
            dispatch(PatientDetail(id, true));
        }
    }
};

export default connect(
    mapStateToProps,mapDispatchToProps
)(ConfigureAnalysis);
