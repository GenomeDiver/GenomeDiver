import React, { PureComponent, forwardRef } from 'react';
import { connect } from 'react-redux';
import { CSSTransition } from 'react-transition-group';
import { loadingIcon, gqlError, titleCase } from '../../../helpers';
import { PatientDetail } from '../../../actions';
import { Tree, Card, Row, Col, Spin, Button, Typography, Icon, Affix,
         Modal, Progress, Empty, message, Result, Tooltip, Alert} from 'antd';

// sub-components 
import { PatientDiveBadge } from '../shared/PatientDiveBadge';
import AddDiveCommentForm from '../../forms/AddDiveCommentForm';
import VariantTable  from '../lab/VariantTable';
import PhenotypesTable from '../lab/PhenotypesTable'
import DiseaseTable from '../caregiver/DiseaseTable';
import axios from 'axios';
import Rest from '../../../services/Rest';
import _ from 'lodash';
import './CaseAnalysisStatus.css';

const LAB_REVIEW = <div>
    <ul>
        <li><b>Variant:</b> DNA spelling at a particular chromosome site, as specified in <a rel="noopener noreferrer" href="https://varnomen.hgvs.org/" target="blank">HGVS</a> notation</li>
        <li><b>Zyg:</b> zygosity; specifies whether the variant appears on each copy of the given chromosome (hom, for chromosomes 1-22; hem, for chromosomes M, X, Y) or instead on just one of multiple (usually two) copies of that chromosome (het).</li>
        <li><b>Effect:</b> predicted effect on protein or other gene product</li>
        <li><b>Gene:</b> gene spanning or nearest the variant. (Note: if multiple genes qualify, we name the longest whose product the variant may directly affect.)</li>
        <li><b>Disease(s):</b> disease(s) associated with variation in the gene, as curated by <a rel="noopener noreferrer" href="https://hpo.jax.org/app/" target="blank">HPO</a></li>
    </ul>
</div>

const CAREGIVER_CONFIRM = <div>
    <span>Your input on diseases helps to interpret your patient's genome.  Here you'll review diseases consistent with her/his phenotype, and loosely suggested by genomic findings (through rare, functionally intriguing DNA variants in or near disease-relevant genes).</span>
    <ul>
        <li>If a disease doesn't fit your patient, don't flag it.</li>
        <li>Flagging does NOT diagnose, but merely helps the lab interpret findings.</li>
        <li>Click a disease to see its OMIM or ORPHA description. </li>
    </ul>
</div>

const CAREGIVER_SEND_TO_LAB = <p>
    Here you can share the updated phenotypic feature(s), flagged disease(s), and/or comment(s) with the lab, to help them interpret your patient's genome findings. <br/>
    <b>For a re-analysis (after first clinical report), you must also order outside GenomeDiver. </b>
</p>

const REANALYSIS_DISCLAIMER = <p>You can ask the clinical lab to reanalyze this patient's data in light of updated phenotype(s), 
    flagged disease(s), and/or comment(s). Such a request does NOT require the lab to reanalyze data (which would instead 
require a formal clinical order).</p>

const CAREGIVER     = 'CAREGIVER';
const LAB_USER      = 'LAB_USER';
const CancelToken   = axios.CancelToken;
const { Text }      = Typography;
const { TreeNode }  = Tree;
const EXCUSE_1      = 'Awaiting phenotype refinement from caregiver'
const EXCUSE_2      = 'Awaiting confirmation from caregiver'

// const HELP_MESSAGE  = '';
const DISABLED      = 'Dive is disabled';
const ERROR_1       = 'First-pass analysis error';
const ERROR_2       = 'refined analysis error';
const QUEUED_1      = 'Queued first-pass analysis ';
const QUEUED_2      = 'Queued refined analysis'
const RUNNING_1     = 'Running first-pass analysis';
const RUNNING_2     = 'Running refined analysis';
const DONE_1        = 'Need caregiver to refine phenotype(s)';
const DONE_2        = 'Need caregiver to review disease(s)';
const CONFIRMED     = 'Submit dive summary to lab';
const REANALYSIS    = 'Sent to lab';

const DISP = {

    // Some disambiguation is necessary. 
    // COMPLETE = pipeline completed
    // DONE     = user acknowledged completion 

    // Analysis Pipeline (1)
    // TODO make REANALYZING 
    'CREATED'               : QUEUED_1,
    'QUEUED'                : QUEUED_1,
    'RUNNING'               : RUNNING_1,
    'COMPLETE'              : DONE_1,
    'DONE'                  : DONE_1,
    'ERROR'                 : ERROR_1,
    'DISABLED'              : DISABLED,
    'CONFIRMED'             : CONFIRMED,
    'REANALYSIS'            : REANALYSIS,

    // Analysis Pipeline (2) 
    'DONE-CREATED'          : QUEUED_2,
    'DONE-QUEUED'           : QUEUED_2,
    'DONE-RUNNING'          : RUNNING_2,
    'DONE-COMPLETE'         : DONE_2,
    'DONE-DONE'             : DONE_2,
    'DONE-ERROR'            : ERROR_2,
    'CONFIRMED-CONFIRMED'   : CONFIRMED,
    'REANALYSIS-REANALYSIS' : REANALYSIS
};

const default_state = {
    analysis_detail_focus: null,    // user selected analysis 
    analysis_detail : null,         // detailed information on focused analysis (1,2)
    display_disease : null,         // disease information (caregiver)
    display_variants: null,         // variant information (lab user) 
    show_excuse: null,              // intermittent state messaging 
    case_dives: null                
};

const flexStyle = {
    marginTop:20, 
    alignItems:'stretch'
};

const centerStyle = {
    position:'absolute',
    width:'100%',
    top:'35%'
}

/* 
    Case and Analysis Status (#1, #2)
    
    - Provide information about the status of the analysis as well as the outputs 
      of analysis. 
*/ 

class CaseAnalysisStatus extends PureComponent {

    constructor(props) {
        super(props);
        
        this.state = {...default_state}

        // cancel request 
        this.request_source = CancelToken.source();
        this.interval = null;     
    }

    static searchDiveData(case_dives, selection){
        // some basic error check, 
        // const {case_dives} = this.state;
        
        if (!(selection && selection[0])) {
            return {
                object_type: 'UNKNOWN'
            } 
        } 

        // Return the object being searched 
        const [object_type, id] = selection[0].split('-');
        switch (object_type) {
            case 'case':
                return {
                    object_type,
                    payload:_.find(case_dives, {id:Number.parseInt(id)})
                }
            
            case 'dive':
                return {
                    object_type,
                    payload:_.chain(case_dives).map(c => c.dives)
                            .find(selection[0]).value()[selection[0]]
                }
            
            default:
                return {
                    object_type: 'UNKNOWN'
                } 
        }
    }
    
    static analysisDive(cases, view) {

        function status_filter(status) {
            const finished_states = new Set(['CONFIRMED', 'REANALYSIS']);

            switch (view) {
                case 'caregiver_explore': 
                    return !(finished_states.has(status));
                
                case 'caregiver_summary': 
                    return finished_states.has(status);

                case 'lab':
                default:
                    return true;
            }
         }   
        

         // cases -> dives -> analysis 
         //_.sortBy(c.analysis,'parent')
        return _.reduce(cases, (acc_c, c) => {
            acc_c.push({
                id:c.id,
                name:c.name,
                dives: 
                    // has parent, push analysis into dive
                    _.reduce(c.analysis 
                        .filter(a => a.parent !== 0)
                        .filter(a => status_filter(a.status)), 
                        (acc_v2, a) => {
                            if (acc_v2['dive-'+a.parent]) {
                                acc_v2['dive-'+a.parent].push(a)
                            } else {
                                // interesting situation: 
                                // CONFIRMED, COMPLETE is an error but should be displayed
                                const error_state = c.analysis.filter(p => p.id === a.parent)[0] 
                                acc_v2['dive-'+error_state.id] = [error_state, a]
                            }
                    return acc_v2;
                    
                    // no parent => new dive definition 
                },  _.reduce(c.analysis 
                        .filter(a => a.parent === 0)
                        .filter(a => status_filter(a.status)), 
                        (acc_v1, a) => {
                        acc_v1['dive-'+a.id] = [a]
                        return acc_v1;
                } , {}))
            });
            return acc_c;
        }, []);
    }

    componentWillUnmount() {
        this.interval = null;
    }

    componentDidMount() {
        // console.log(CaseAnalysisStatus.analysisDive(mock.data.patients[0].case, "caregiver_explore"));

        const {patient_id} = this.props;

        //if (!patient || (patient && patient_id !== patient.id)) {
        this.props.patients(patient_id);
        //}

        // set the initial state
        this.setState(default_state);
    }

    onCommentUpdate = (analysis_id, new_comment) => {
        const {analysis_detail} = this.state;
        Rest.modifyAnalysisComment(analysis_id, new_comment)
        .then(response => {
            message.success("Comment updated");

            // update analysis 
            const modified_analysis = [...analysis_detail[`analysis_${analysis_id}`]]
            modified_analysis[0].comment = new_comment;

            // merge new state into analysis detail 
            const modified_detail = {
                ...analysis_detail,
                [`analysis_${analysis_id}`]: modified_analysis
            }

            this.setState({analysis_detail:modified_detail});
        });
    }

    onDiseaseFlag = (v, disease) => {
        // const {user} = this.props; 
        const {analysis_detail, analysis_detail_focus, case_dives} = this.state;
        const checked = !!v;
        const search = CaseAnalysisStatus.searchDiveData(case_dives, [analysis_detail_focus])
        const dive = search.payload || []; 
        
        // check if the dive contains both pipelines 
        if (dive.length === 2) {
            const analysis_2     = _.last(dive);

            // find the location of modification 
            //const idx            = _.findIndex(analysis_detail.disease_gene, {disease});
            const idxs              = _.keys(_.pickBy(analysis_detail.disease_gene, {disease}))
            const modified_copy  = [...analysis_detail.disease_gene];
            
            // make the appropriate change 
            const request = checked ? 
                Rest.addDiseaseAssociation(analysis_2.id, disease) :
                Rest.removeDiseaseAssociation(analysis_2.id, disease)

            request
                .then(response => {return gqlError(response)})
                .then(response => {
                
                    // modify local state 
                    idxs.forEach(idx => 
                        modified_copy[idx] = {
                            ...analysis_detail.disease_gene[idx],
                            'selected': checked ? disease : ''
                        }
                    )
                    
                    // finally set state 
                    this.setState({analysis_detail:
                        {...analysis_detail,'disease_gene':modified_copy}
                    });  
                    
                })
                .catch((error) => {
                    this.displayError(error)}
                );
        }
    }
    
    onConfirmAnalysis = (analysis_ids) => {
        const {patient_id} = this.props;

        // TODO possible modal? 
        Rest.confirmAnalysis(analysis_ids)
            .then(response => {return gqlError(response)})
            .then(response => {
                message.success('Dive session confirmed');
                this.props.patients(patient_id);
                this.setState(default_state);
                this.props.goSummary();
            })
            .catch((error) => {this.displayError(error)}); 
    }

    onReanalysis = (analysis_ids) => {
        const {patient_id} = this.props;

        Rest.setReanalysis(analysis_ids)
            .then(response => {return gqlError(response)})
            .then(response => {
                message.success('Dive session submitted to lab.');
                this.props.patients(patient_id);
                this.setState(default_state);
            })
            .catch((error) => {this.displayError(error)}); 

    }

    onTreeSelect = (selection) => {
        const {case_dives} = this.state; 
        const data = CaseAnalysisStatus.searchDiveData(case_dives, selection);
        switch (data.object_type) {
            case 'case':
            default:
                this.setState({
                    analysis_detail:null,
                    analysis_detail_focus:null,
                    display_disease:null,
                    display_variants:null,
                    show_excuse:null
                });

                // cancel any requests;
                this.request_source.cancel();
                break;

            case 'dive':
                this.setState({analysis_detail_focus: selection[0]});
                break;
        }
    }

    generateDiveDisplay(dives) {
        const completion = dives.map(d => {
            if (d.status === 'ERROR' || d.state === 'DISABLED') {return 0}

            // re-analysis is > (2*10), analysis is completed 
            // status re-analysis beyond confirmed. 
            return ['CREATED', 'QUEUED', 'RUNNING', 
                    'COMPLETE', 'DONE', 'CONFIRMED', 
                    'REANALYSIS'].indexOf(d.status)
        });

        const stat = dives.map(d => d.status).join('-');
        const date = new Date(dives[0].time_started)
        // const date_completed  = _.get(dives, '1.time_completed') ? new Date(_.get(dives, '1.time_completed')) : undefined;
        const display_status  = _.get(DISP, stat, "");
        let progress_status = 'normal';
        
        if (display_status.toLowerCase().indexOf('error') !== -1) {
            progress_status = 'exception'
        } else if (display_status.toLowerCase().indexOf('running') !== -1) {
            progress_status = 'active';
        } else if (display_status.toLowerCase().indexOf('submitted') !== -1) {
            progress_status = 'success';
        } else if (display_status.toLowerCase().indexOf('review') !== -1) {
            progress_status = 'normal';
        }

        return (
            <div style={{display:'flex', flexDirection:'column'}}>
                <div style={{position:'relative', whiteSpace: 'pre-wrap'}}>
                    <Text strong>Dive #{dives[0].id}:&nbsp;</Text><br/>
                    <span>{display_status}</span>
                </div>
                
                <Progress size="small" status={progress_status} 
                    percent={Math.min(Math.round(_.sum(completion)/10 * 100), 100)}
                    format={percent => `${percent/10}/10`}/>
                <div>
                    <Text style={{fontSize:'small'}} type='secondary'>
                        Date started: {date.toLocaleDateString()}     
                    </Text>
                    {/* date_completed && 
                        <Text style={{fontSize:'small'}} type='secondary'>
                            &nbsp;- {date_completed.toLocaleDateString()}     
                        </Text>
                    */}
                </div>
            </div>
        )
    }

    analysisDetailLab(analysis_ids, cancel_token) {
        const {patient} = this.props;
        return Rest.getAnalysisDetailLab(patient.id, analysis_ids, cancel_token)
            .then(response => {return gqlError(response)})
            .then(response => {
                const analysis_detail = response.data.data;
                this.setState({analysis_detail});
                
                // first analysis completed 
                if (analysis_ids.length === 1) {
                    // do nothing 
                    this.setState({
                        display_disease:null,
                        display_variants:null,
                        show_excuse:EXCUSE_1
                    });
                }
                return Promise.resolve(true)
            })
            .catch((error) => {this.displayError(error)});
    }

    analysisDetailCare(analysis_ids, cancel_token) {
        const {patient} = this.props;
        Rest.getAnalysisDetailCare(patient.id, analysis_ids, cancel_token)
            .then(response => {return gqlError(response)})
            .then(response => {
                
                // analysis detail (analysis, disease / gene)
                const analysis_detail = response.data.data;
                this.setState({analysis_detail});
                   
                // Both Analysis have completed
                // --------------------------------------------------------
                if (analysis_ids.length === 2) {
                
                    // find all the diseases; 
                    const analysis_diseases = analysis_detail.disease_gene.map(d => {return d['disease']});

                    // find annotations relevant to those diseases
                    // 
                    //  - assocated phenotypes 
                    //  - proper names of disease (OMIM, ORPHA)
                    //  - list of genes, in the analysis 
                    // 
                    return Rest.getAnalysisDetailAnnotation(
                        _.chain(analysis_detail.disease_gene)
                            .flatMap(dg => dg.gene.split(', '))
                            .uniq().value(), 
                        _.first(analysis_detail[`analysis_${analysis_ids[1]}`]).input
                            .filter(p => p.name === 'Phenotype')
                            .map(p => p.value),
                        analysis_diseases,
                        cancel_token
                        );         
                } else {
                    return Promise.resolve({
                        data:['dive-incomplete']
                    });
                }     
            })
            .then(response => {return gqlError(response)})
            .then(response => {
                
                // completed analysis (1) 
                if (response.data[0] === 'dive-incomplete') {
                    this.setState({
                        display_disease:null,
                        display_variants:null 
                    });
                    return Promise.resolve(true)
                }
                
                // completed analysis (2)
                this.setState({'analysis_detail':{
                    ...this.state.analysis_detail,
                    annotations:response.data.data
                }});
            })
            .catch((error) => {this.displayError(error)});  
    }

    displayError(error) {

        // ignore cancellations 
        if (axios.isCancel(error)) {
            return; 
        }

        // TODO: need to catch generic/rest and graphql
        Modal.error({
            title:'Error',
            content: error.message || error.response.data
                .errors.map(d => d.message).join('\n'),
            onOk() {}
        });
    }

    componentDidUpdate(prevProps, prevState) {
        const {user}       = this.props; 
        const {case_dives} = this.state;
        const focus        = this.state.analysis_detail_focus;
        const p_focus      = prevState.analysis_detail_focus;
        const new_focus    = focus && p_focus !== focus;
        const cancel_token = this.request_source.token;
        
        // grab analysis with context dependent data 
        if (user.role === CAREGIVER && new_focus) {
            const dive = CaseAnalysisStatus.searchDiveData(case_dives, [focus]);
            this.analysisDetailCare(dive.payload.map(a => a.id), cancel_token);
        }

        if (user.role === LAB_USER && new_focus) {
            const dive = CaseAnalysisStatus.searchDiveData(case_dives, [focus]);
            this.analysisDetailLab(dive.payload.map(a => a.id), cancel_token);
        }
    };

    static getDerivedStateFromProps(props, state) {
        const {user, patient, view}                                 = props; 
        const {case_dives, analysis_detail, analysis_detail_focus}  = state

        let result = {};

        // tree construction, transform patient->case->analysis to patient->dives 
        if (patient && patient.case && !case_dives) {
            result['case_dives'] = CaseAnalysisStatus.analysisDive(patient.case, view)
        }

        // should we show disease (Caregiver) 
        const show_disease    = user.role === CAREGIVER && 
                                analysis_detail_focus && 
                                analysis_detail && 
                                analysis_detail.disease_gene && 
                                analysis_detail.annotations;
        
        // should we show variant associations (lab)
        const show_variants   = user.role === LAB_USER && 
                                analysis_detail_focus && 
                                analysis_detail && 
                                Object.keys(analysis_detail).length === 2
        
        // lab only (display variant associations) 
        if (show_variants) {
            
            // current dive 
            const dive_key = Object.keys(analysis_detail).filter(k => k.startsWith('analysis'))
                .map(a => Number.parseInt(a.split('_')[1]))
                .sort((a, b) => a - b).shift(); 

            const focus_dive = CaseAnalysisStatus.searchDiveData(case_dives || result['case_dives'], [`dive-${dive_key}`]);
            const focus_dive_status = focus_dive.payload.map(a=>{return a.status});
            
            // result requires a referent to the last analysis
            const last_analysis_key = `analysis_${Object.keys(analysis_detail)
                .filter(k => k.startsWith('analysis'))
                .map(a => Number.parseInt(a.split('_')[1]))
                .sort((a, b) => a - b).pop()}`;
                
            const last_analysis = _.first(analysis_detail[last_analysis_key])
            const disease_associations = new Set(last_analysis.disease_associations.map(d=>d.disease))
            
            // lab view need to show the dives in the side bar 
            // lab view should not show the results status belongs to finished states 
            if (!_.isEmpty(_.intersection(focus_dive_status, ['CONFIRMED', 'REANALYSIS']))) {
                result['display_variants'] = last_analysis.variant_associations.map((v, i) => {
                    v['key'] = i;
                    v['assoc'] = disease_associations;
                    return v;
                });  
                result['show_excuse'] = null;

            }  else {
                result['display_variants'] = null;
                result['show_excuse'] = EXCUSE_2
            }
        }

        // caregiver only (display diseases and genes)
        if (show_disease) {
            result['display_disease'] = analysis_detail.disease_gene.map((d,i) => {
                const search = _.chain(analysis_detail.annotations.hpo_disease)
                                .find({'disease_id':d['disease']}).value();
                
                
                let split_disease_name = search.disease_name.split(';')
                d['disease_name'] = search ? 
                    split_disease_name.shift().split(' ')
                    .map(s => {return s.split('-').map(t=>titleCase(t)).join('-')}).join(' ')
                    + (split_disease_name.length ? ';' + split_disease_name.join(';') : '')
                : '(Name not in database)';

                // d['disease_name'] = search ? search.disease_name.toUpperCase() : '(NAME NOT IN DATABASE)';
                // TODO, calculate 'matching phenotypes'

                d['key'] = i;
                return d;
            });
            result['show_excuse'] = null;
        }

        // set excuse; 
        // set state 

        if (result !== {}) {return result}
        return null; 
    }

    render() {
        const {patient_id, patient, view, showInfo} = this.props; 
        const {analysis_detail, analysis_detail_focus, case_dives, display_disease, display_variants, show_excuse} = this.state;
        const case_keys  = case_dives ? case_dives.map(ca => 'case-'+ca.id) : undefined
        const treeStyle  = {borderRight:'1px solid lightgrey', minHeight:180, overflowX:'hidden'}
        const show_spin  = analysis_detail_focus && !analysis_detail;
        const show_empty = analysis_detail_focus == null;
        
        // this is a hacky way to get the last analysis can be #1 or #2 
        const analysis_ids = analysis_detail ? Object.keys(analysis_detail)
            .filter(k => k.startsWith('analysis'))
            .map(k => Number.parseInt(k.split('_')[1]))
            .sort((a, b) => a - b) : undefined 

        // the most present analysis 
        const last_analysis_id = analysis_ids ? _.last(analysis_ids) : undefined;
        const last_analysis_comment = !!last_analysis_id ? analysis_detail[`analysis_${last_analysis_id}`][0].comment: undefined;
        const last_analysis_reference = !!last_analysis_id ? _.find(analysis_detail[`analysis_${last_analysis_id}`][0].input, {name:'Reference'}).value: undefined;
        const last_analysis_status = !!last_analysis_id ? analysis_detail[`analysis_${last_analysis_id}`][0].status: undefined;

        // calculate the number of dives 
        const num_dives = _.chain(case_dives)
            .map((d) => Object.keys(d.dives).length)
            .sum().value()

        // Weird that affix components needs a forwardRef 
        const ExcuseElement = forwardRef((props, ref) => {
            return <Result style={{marginTop:30}}
                icon={<Icon type="question-circle"></Icon>}
                title="RESULTS PENDING"
                subTitle={show_excuse || ''}/>
        });
        const read_only = (view === 'caregiver_summary' || view === 'lab')

        return (
            <Card style={{marginTop:20}}>
                {(patient && (Number.parseInt(patient_id) === Number.parseInt(patient.id))) ? 
                <Row>
                    <Col span={24} offset={0}>
                        {view === 'lab' && <h2 className='gd-heading'>Review</h2>} 
                        {view === 'caregiver_explore' && <h2 className='gd-heading'>Explore findings</h2>} 
                        {view === 'caregiver_summary' && <h2 className='gd-heading'>Send to lab</h2>}
                        <Row>
                            <PatientDiveBadge patient={patient}/>    
                        </Row>

                        {case_dives && num_dives === 0 && 
                            <Result style={{marginTop:30}}
                                status="404"
                                title="NOT FOUND"
                                subTitle="No dives found"/>}

                        {case_dives && num_dives > 0 && 
                        <Row style={flexStyle} 
                             type="flex" justify="center" align="top">

                            {/* ------ Tree ------- */}
                            <Col span={7} style={treeStyle}>
                                <Tree defaultExpandedKeys={case_keys} onSelect={this.onTreeSelect}
                                    showIcon={false} showLine={false}>

                            {/* ------ Case ------- */}
                                {case_dives.map(_case => 
                                <TreeNode title={
                                    <span>
                                        <Text style={{float:'left'}} strong>GD ID:&nbsp;</Text> 
                                        <Tooltip title={_case.name}>
                                            <Text style={{float:'left', width:'50%', minWidth:100}} ellipsis={true}> {_case.name}</Text>
                                        </Tooltip>
                                    </span>} 
                                    key={`case-${_case.id}`}>

                            {/* ------ Dive ------- */}
                                {Object.keys(_case.dives)
                                    .sort((a,b) => {return Number.parseInt(b.split('-')[1]) - Number.parseInt(a.split('-')[1])})
                                    .map(dive_key => 
                                    <TreeNode style={{width:'100%'}}
                                        title={this.generateDiveDisplay(_case.dives[dive_key])}
                                        key={dive_key} className={'dive-status'}
                                        icon={<Icon type="question-circle"></Icon>}>
                                    </TreeNode>)}
                                </TreeNode>
                                )}
                                </Tree>
                            </Col>

                            {/* ------ Table ------- */}
                            <Col span={16} offset={1}>
                                
                                {/* Lab View Only 
                                    -----------------------------------------------------------------------
                                    - Display the result of the dive sesssion (for Lab)
                                    - This includes variant information 
                                */}
                                <Row>
                                    {display_variants && showInfo && 
                                        <Row><Alert description={LAB_REVIEW} type="info" showIcon/></Row>}

                                    {display_variants && <VariantTable 
                                        reference = {last_analysis_reference}
                                        display_variants ={ display_variants}/>}   
                                    
                                    {display_variants && <PhenotypesTable 
                                        analysis_ids = {analysis_ids} 
                                        phenotypes = {patient.phenotypes}/>}
                                </Row>

                                {/*  Caregiver View Only 
                                    -----------------------------------------------------------------------
                                    - Display the result of the dive session. (for Caregiver)
                                    - this includes disease, disease id, and genes affected
                                    - also the number of matching phenotypes 
                                */}
                                <Row>
                                    {display_disease && !read_only && 
                                        <h2 className='gd-heading'>Flag any disease(s) likely fitting your patient</h2>}

                                    {display_disease && read_only && last_analysis_status==='CONFIRMED' && 
                                        <h2 className='gd-heading'>When ready, send your input to the lab</h2>}

                                    {display_disease && read_only && last_analysis_status==='REANALYSIS' && 
                                        <h2 className='gd-heading'>Review lab submission</h2>}
                                    
                                    {display_disease && !read_only && showInfo && last_analysis_status === 'DONE' &&
                                        <Row style={{marginBottom:15}}><Alert description={CAREGIVER_CONFIRM} type="info" showIcon/></Row>}
                                    
                                    {display_disease && read_only && showInfo && last_analysis_status === 'CONFIRMED' &&
                                        <Row style={{marginBottom:15}}><Alert description={CAREGIVER_SEND_TO_LAB} type="info" showIcon/></Row>}
                                
                                    {display_disease && <DiseaseTable 
                                        flagged_only = {read_only} 
                                        display_disease = {display_disease}
                                        onDiseaseFlag = {this.onDiseaseFlag}/>}
                     
                                    {display_disease && read_only && <PhenotypesTable 
                                        analysis_ids={analysis_ids}
                                        phenotypes={patient.phenotypes}/>}
                                    
                                    {(display_disease || display_variants) && <AddDiveCommentForm 
                                        analysis_id={last_analysis_id} 
                                        comment={last_analysis_comment}
                                        disabled={read_only}
                                        showInfo={showInfo}
                                        onCommentUpdate={this.onCommentUpdate}/>}

                                    {/* Confirm Analysis (Explore Findings Only) */}
                                    {display_disease && !read_only &&  
                                    <div style={{marginTop:50}}>
                                        <Card style={{textAlign:'center'}}>
                                            <Button 
                                                size='large'
                                                onClick={(e) => this.onConfirmAnalysis(analysis_ids)} 
                                                type='primary'>CONFIRM ANALYSIS</Button>
                                        </Card>
                                    </div>}

                                    {/* Summary (Confirmed Analysis Only) */}
                                    {display_disease && read_only && 
                                    <div style={{marginTop:50}}>
                                        <Card style={{textAlign:'center'}}>
                                            {REANALYSIS_DISCLAIMER}
                                            {last_analysis_status==='CONFIRMED' && <Button onClick={(e) => this.onReanalysis(analysis_ids)}type='primary'>SUBMIT TO LAB</Button>}
                                            {last_analysis_status==='REANALYSIS' && <Button size='large' disabled>SUBMITTED TO LAB</Button>}
                                        </Card>
                                    </div>}
                                </Row>
                                
                                {show_excuse && 
                                    <Affix>
                                        <ExcuseElement/>
                                    </Affix>}

                                {/* Empty Container 
                                    -----------------------------------------------------------------------
                                    - Remind user to select from the Tree Widged to the 
                                      on the side
                                */}
                                {show_empty && 
                                    <CSSTransition in={show_empty} timeout={0} 
                                        classNames="result" unmountOnExit appear>
                                        <Empty 
                                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                                            style={centerStyle}
                                            description={<span>Please pick a dive.</span>}/>
                                    </CSSTransition>}
                                
                                {/* Load Spinner */}
                                {show_spin && 
                                    <Row style={{textAlign:'center', ...centerStyle}}>
                                        <Spin indicator={loadingIcon} />
                                    </Row>}
                            </Col>
                        </Row>}
                    
                        {/* Controls */}
                        <Row style={{marginTop:20}}>
                            <Col span={12}>
                                <Button icon='left' type='primary' onClick={this.props.goHome}>BACK</Button>
                            </Col>
                        </Row>
                    </Col>
                </Row>
                :
                <Row style={{textAlign:'center', margin:'10em'}}>
                    <Spin indicator={loadingIcon} />
                </Row>}
           </Card>
        )
    }
}

function mapStateToProps(store, ownProps) {
    let {PatientDetail, Auth} = store;
    return {
        user: Auth.info ? Auth.info : undefined,
        patient: 
            PatientDetail.data && 
            PatientDetail.data.patients ? PatientDetail.data.patients[0] : undefined
    };
  }

function mapDispatchToProps(dispatch, ownProps) {
    return {
        patients: (id) => {
            dispatch(PatientDetail(id, true));
        }
    }
};

export default connect(
    mapStateToProps,mapDispatchToProps
)(CaseAnalysisStatus);

// https://github.com/ga4gh/ga4gh-server/issues/14