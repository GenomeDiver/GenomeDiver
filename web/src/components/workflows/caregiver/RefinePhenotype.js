import React, { PureComponent } from 'react';
import { connect } from 'react-redux';
import { Link } from 'react-router-dom';
import { CSSTransition } from 'react-transition-group';
import { diveTree, phenotypesToDrag, flexStyle, loadingIcon} from '../../../helpers'
import { Card, Row, Col, Button, Spin, Alert, Select, Modal, Typography, Result, message, notification, Icon } from 'antd';
import { PatientDetail, PatientDetailPhenotypes, startAnalysis, cancelAnalysis, completeAnalysis}  from '../../../actions';
import { DragDropContext } from 'react-beautiful-dnd';
import { PatientDiveBadge } from '../shared/PatientDiveBadge'
import { PhenotypeCategory } from './DraggablePhenotypes'
import HPOSelector from '../../inputs/HPOSelector'
import Rest from '../../../services/Rest'
import axios from 'axios';
import _ from 'lodash';

const iconStyleLarge = {
    width: 25,
    height: 25
}
const CancelToken = axios.CancelToken;
const { Text } = Typography;
const { Option } = Select;
const { confirm }   = Modal;

const FIRST_PIPELINE  = "FIRST_RUN"
const SECOND_PIPELINE = "SECOND_RUN"
const PIPELINE_DONE   = "DONE"
const CATEGORIES      = ['UNASSIGNED', 'PRESENT', 'ABSENT', 'UNKNOWN']

const HPO_URL         = "https://hpo.jax.org/app/browse/term/"
const booleanIconStyle = () => {
    return {color:'rgb(23, 144, 255)', fontSize:'1.45em', display:'inline-block'}
}


const REVIEW_MESSAGE = 
<div>
    <p><strong>REVIEWERS:</strong> To simulate a patient whose diagnosis might benefit from further phenotyping guided by GenomeDiver, we have altered public genome <a rel="noopener noreferrer" href='https://www.internationalgenome.org/data-portal/sample/NA12878'>NA12878</a> by adding a variant of uncertain clinical significance to the <i>FBN1</i> gene.</p>
    <p>In your session, GenomeDiver will i) analyze this simulated genome in order to suggest phenotypic terms plausibly associated with first-pass top-scoring variants, and then ii) prompt you to categorize each such term as definitely present (Present), definitely absent (Absent), or potentially present (Unknown) in the patient, in order to refine final shortlisting of likely causal variant(s) and associated disease(s).</p>
    <p>In trying out GenomeDiver, you can assign these phenotype terms as you wish, to see how results vary pending the patient's actual signs/symptoms. You might, for example, try classifying the terms to be consistent with a presentation of  <a rel="noopener noreferrer" href='https://www.omim.org/entry/154700' target='_blank'>Marfan syndrome</a>, as one disease that such a variant might plausibly cause.</p>
    <p>When finished, click 'Submit' to confirm your classification and prompt GenomeDiver to finalize its shortlist of likely diseases (typically taking 20-30 minutes), after which you will be prompted to 'Explore findings' in the patient.</p>
</div>

// <Icon component={() => (<img src="/image.svg" />)} />
//  <li><b>To add a yet unlisted phenotypic feature, click [+] to find and choose term ( <Icon type='eye' theme='filled'/> )</b></li>
const HELP_MESSAGE = 
<div>
    <span>Your input on phenotypic features (clinical signs and symptoms, as standard <a href={HPO_URL} target="_blank" rel="noopener noreferrer">HPO</a> terms) helps interpret your patient's DNA. <br/>
    Here, you'll classify via <b>drag and drop</b> (as present, absent, or uncertain) phenotypic features loosely suggested by DNA (<img alt="helix" style={iconStyleLarge} src="/images/helix.svg"/>) or noted on the original order (<Icon type='paper-clip'/>), and add any other(s) needed.
    </span>
    <ul>
        <li><b>If your patient has a particular phenotypic feature, put (or leave) it in <i>Present.</i></b></li>
        <li><b>If your patient may have a particular phenotypic feature (even if originally listed as <i>Present</i>), put it in <i>Unknown.</i></b></li>
        <li><b>If your patient lacks a particular phenotypic feature (even if originally listed as <i>Present</i>), put it in <i>Absent.</i></b></li>
        <li><b>To add a yet unlisted phenotypic feature, enter it in <i>Add phenotype feature</i> box. )</b></li>
        <li><b>If a present phenotypic feature (or its absence) likely crucially defines the patient's disease, click ( <Icon type='star' theme='filled'/> ) to highlight it for lab review.</b></li>
    </ul>
</div>

const SUBMIT_MESSAGE = 
    <span>You can reclassify or add phenotypic features until you <i>Submit</i>. GenomeDiver will then scan the patient's genome for relevant genotypes, and list candidate diseases for you to review.</span>

const SUBMITTED_MESSAGE = <div style={{padding:'20px 20%'}}>
    <p>
        Thanks for refining your patient’s phenotype. GenomeDiver will now look for phenotype-consistent diseases suggested by the patient's DNA sequence. <br/>
        When the <Icon type='thunderbolt' theme='filled' style={booleanIconStyle()}/> reappears in your patient’s record (in ~30 minutes), you can continue to Explore findings. <br/>
        Until then, you can continue other dives in your <Link to="/caregiver">patient list</Link>
    </p>
</div>

const CHOOSE_DIVE = <span>Begin by selecting a dive.</span>

const START           = "SUBMIT"
const REFRESH_INTERVAL = 2000; 
//const REFRESH_INTERVAL = 2000; 

// keep track of phenotype->attributes being juggled about locally in the 
// drag-n-drop tool. the reason for a local copy as opposed to just 
// props is to keep indexing information. 
const default_state = {
    'prior_case_id':null, 
    'prior_analysis_id':null,
    'pipeline':FIRST_PIPELINE,
    'local_phenotype':null,
    'local_phenotype_timestamp_l':Date.now(),
    'local_phenotype_timestamp_r':Date.now(),
    'update_phenotype':null,
    'update_phenotype_timestamp_l':Date.now(),
    'update_phenotype_timestamp_r':Date.now(),
    'error_validation':[],
    'submitted_analysis':false
}

class RefinePhenotype extends PureComponent {

    constructor(props) {
        super(props);

        // processed patient phenotypes as state 
        this.state = {...default_state}
        
        // axios request cancellation token 
        this.request_source = CancelToken.source();

        // TODO clean up request on update 
        this.refresh_phenotypes_interval = null;
    }

    showConfirm(ctx) {
        confirm({
            title: 'Are you sure?',
            content: 'Analysis will start on the patient with the phenotypes in "PRESENT" Category. After clicking OK, you can\'t change phenotype data for this dive.',
            onOk() {
                const {patient} = ctx.props;
                const {error_validation, prior_case_id, prior_analysis_id} = ctx.state

                const select_case = patient && patient.case ? _.find(patient.case, {id: prior_case_id}): false;
                const select_analysis = select_case && select_case.analysis ? _.find(select_case.analysis, {id: prior_analysis_id}) : false;
                const select_assembly = select_analysis && select_analysis.input ? _.find(select_analysis.input, {name: "Reference"})  : false;

                let validation = [] 
                if (!select_case)     {validation.push("Please specify a case for the patient.")}
                if (!select_analysis) {validation.push("Please select an analysis to continue.")}
                if (!select_assembly) {validation.push("Assembly not found.")}
                
                // // update the display of validation errors 
                if (!_.isEqual(error_validation.sort(), validation.sort())) {
                     ctx.setState({error_validation: validation})
                }

                // // no errors - submit analysis 
                if (_.isEmpty(validation)) {
                    ctx.props.startAnalysisCare(
                        patient.id, 
                        select_case.id, 
                        SECOND_PIPELINE, 
                        select_assembly.value, 
                        select_analysis.id
                    )
                }
            }
        });
    }

    onChangeHPO(hpo_list) {
        //notification.success("Phenotype added to [CANDIDATE PHENOTYPES]")
        message.success("Phenotype added");

        // this.props.patients(this.props.patient_id);
        this.props.patientPhenotype(this.props.patient_id);
    }

    componentDidMount() {
        
        // TODO: optimise this when opportune,  
        // - should not load the entire patient 
        // + should load a subtree (phenotypes of patient)
        // const {patient, patient_id} = this.props;

         // reload patient data if it is stale 
        // if (!patient || 
        //     (patient && patient_id !== patient.id) || 
        //     (patient && !patient.phenotypes)) {
        this.props.patients(this.props.patient_id);
        //}
       
        // set initial state
        this.setState(default_state)
        this.checkPhenotypes(0); 
    }

    componentWillUnmount() {
        clearTimeout(this.refresh_phenotypes_interval);
    }

    checkPhenotypes(duration) {
        this.refresh_phenotypes_interval = setTimeout(
            this.checkPhenotypeChanges.bind(this), duration
        );
    }

    checkPhenotypeChanges() {
        const {local_phenotype, prior_analysis_id} = this.state; 
        const {patient_id} = this.props;

        if (local_phenotype && prior_analysis_id) {
            
            this.setState({
                update_phenotype_timestamp_l:Date.now()
            })
            Rest.getAnalysisDetailPhenotypes(patient_id, prior_analysis_id).then((response) => {
                const update_phenotype = response.data.data.analysis[0].phenotypes;

                // make sure analysis id hasn't shifted while the request is in transit.
                if (this.state.prior_analysis_id === prior_analysis_id) {
                    this.setState({
                        update_phenotype,
                        update_phenotype_timestamp_r:Date.now()
                    });
                }
                
                this.checkPhenotypes(REFRESH_INTERVAL);
            }).catch(()=>{
                this.checkPhenotypes(REFRESH_INTERVAL);
            });

        } else {
            this.checkPhenotypes(200);
        }
    }
    
    componentDidUpdate(prevProps, prevState) {
        const {analysis_status, analysis_message, patient} = this.props;
        const {
            prior_case_id, prior_analysis_id,
            local_phenotype,update_phenotype,
            local_phenotype_timestamp_l, 
            local_phenotype_timestamp_r, 
            update_phenotype_timestamp_l,
            update_phenotype_timestamp_r
        } = this.state; 
        
        if (prevState.prior_analysis_id !== this.state.prior_analysis_id) { 
            // there is a *good* chance that local phenotypes are out of sync 
            // reload patient details and re-derive local_phenotype
            // this.props.patients(this.props.patient_id);
            this.props.patientPhenotype(this.props.patient_id);
        }

        if (patient && patient.case && !prior_case_id && !prior_analysis_id) {
            const dives = diveTree(patient.case, FIRST_PIPELINE, PIPELINE_DONE);
            if (dives.length === 1) {
                this.selectCaseAnalysis(`${dives[0].case_id}-${dives[0].analysis[0].id}`)
            }
        }

        // default choice when there is only one dive to choose from 
        if (patient && patient.case && !prior_case_id && !prior_analysis_id) {
            
            //console.log("default choice !!!!! ")
            //this.selectCaseAnalysis(`${patient.case[0].id}-${patient.case[0].analysis[0].id}`)
        }

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
            // notification.success({
            //     message:"Analysis Submitted",
            //     description:""
            // });
            this.props.completeAnalysis();
            this.setState({submitted_analysis:true})
            
            //setTimeout(() => this.props.goHome(), 1000);
        }

        if (local_phenotype && update_phenotype 
            && local_phenotype_timestamp_l < local_phenotype_timestamp_r
            && update_phenotype_timestamp_l < update_phenotype_timestamp_r
            && update_phenotype_timestamp_r > local_phenotype_timestamp_r) {
            const updatedPhenotypes = _.sortBy(RefinePhenotype.phenotypesOfAnalysis(update_phenotype, prior_analysis_id,  FIRST_PIPELINE, PIPELINE_DONE), ['id']);
            
            if (updatedPhenotypes.length > local_phenotype.phenotype.length) {
                // TODO 
            }

            _.forEach(updatedPhenotypes, (u,i) => {
                // u is the updated phenotype 
                // l is the local phenotype 
                const l = _.find(Object.values(local_phenotype.phenotype), (p) => {return p.id === u.id})
                                
                if (l['important'] !== u['important']) {
                    notification.warn({
                        message: "PHENOTYPE STAR UPDATED",
                        description: `${u['hpo_term']}: (${l['important']} to ${u['important']})`,
                        duration: 5
                    });

                    const draggableId = _.findKey(local_phenotype.phenotype, {id:l.id})
                    this.onStar(draggableId, l.id, u['important'] | 0)
                }  
                
                if (l['category'] !== u['category']) {
                    notification.warn({
                        message: "PHENOTYPE CATEGORY UPDATED",
                        description: `${u['hpo_term']}: (${l['category']} to ${u['category']})`,
                        duration: 5
                    });
                    
                    const draggableId = _.findKey(local_phenotype.phenotype, {id:l.id})
                    const source_idx = local_phenotype.category[l['category']].ids.indexOf(draggableId);             
                    const drag_event = {
                        combined:null, 
                        mode: "FLUID",
                        reason: "DROP",
                        type: "DEFAULT",
                        draggableId,
                        source: {index:source_idx, droppableId:l['category']},
                        destination: {index:0, droppableId:u['category']}
                    }

                    this.onDragEnd(drag_event);
                }
            });
        }
    }
    
    static phenotypesOfAnalysis(phenotypes, analysis_id, pipeline, status) {
        
        // filter only phenotypes that are relevant to the analysis & and pipeline 
        // that are in focus. 
        return (analysis_id && pipeline) ? _.filter(phenotypes, (p) => {
            return ('of_analysis' in p) && 
                (p['of_analysis'].length === 1) && 
                (p['of_analysis'][0].pipeline === pipeline) &&
                (p['of_analysis'][0].id === analysis_id) && 
                (p['of_analysis'][0].status === status)
        }) : phenotypes 
    }

    static getDerivedStateFromProps(props, state) {

        // method occurrs before render - creates a local copy of the phenotype 
        // data structure 
        const {patient}                                                                 = props; 
        const {prior_case_id, prior_analysis_id, local_phenotype, update_phenotype}     = state; 
    
        if (patient) {
            
            const relevantPhenotypes  = _.sortBy(RefinePhenotype.phenotypesOfAnalysis(patient.phenotypes, prior_analysis_id, FIRST_PIPELINE, PIPELINE_DONE), ['id']);
            const updatedPhenotypes   = _.sortBy(RefinePhenotype.phenotypesOfAnalysis(update_phenotype, prior_analysis_id,  FIRST_PIPELINE, PIPELINE_DONE), ['id'])
            
            // refresh list if new phenotypes are discovered. phenotypes are only monotonically added 
            let to_process_phenotypes = relevantPhenotypes
            
            // re-assign to_process_phenotypes to updated if there is a phenotype added. 
            if (local_phenotype && updatedPhenotypes.length > Object.keys(local_phenotype.phenotype).length) {
                to_process_phenotypes = updatedPhenotypes;

                const added_pheno = new Set(_.difference(to_process_phenotypes.map(p => {return p.id}),
                                      Object.values(local_phenotype.phenotype).map(p => {return p.id})))

                const added_pheno_disp = to_process_phenotypes.filter(p => {
                    return added_pheno.has(p.id);
                }).map(p => {
                    return p.hpo_term;
                }).join(',');

                notification.warn({
                    message: "PHENOTYPE ADDED",
                    description:added_pheno_disp,
                    duration: 5
                });
            }

            // initial state & used updated 
            if ((prior_analysis_id && !local_phenotype) || 
                (local_phenotype && (to_process_phenotypes === updatedPhenotypes))) {
                    
                // refresh drag/drop states - hopefully not too compute intensive 
                return {
                    prior_case_id, 
                    prior_analysis_id,
                    'local_phenotype':  _.cloneDeep(phenotypesToDrag(to_process_phenotypes, CATEGORIES)),
                }
            }
        }
        
        // default do nothing 
        return null;
    }

    selectCaseAnalysis = (case_analysis) => {
        const split = case_analysis
            .split("-")
            .map(i => {return Number.parseInt(i)})
        
        this.setState({
            prior_case_id:split[0],
            prior_analysis_id:split[1],
            local_phenotype:null
        });
    }

    // DND need some work to "persist" the draggable items 
    onDragEnd = (result) => {
        const {destination, source, draggableId} = result;
        const do_nothing = !destination || ((destination.droppableId === source.droppableId) && (destination.index === source.index))

        // conditions for no-op; just return the drag operation 
        if (do_nothing) {return;}

        // pheno_state is the original constructed phenotype state 
        const pheno_state    = this.state.local_phenotype;
        const start_column   = pheno_state.category[source.droppableId];
        const end_column     = pheno_state.category[destination.droppableId];
        
        // remove "draggableId" from source column 
        const ids_2          = Array.from(start_column.ids);
        ids_2.splice(source.index, 1); 

        // change server side 
        const phenotype_id = pheno_state.phenotype[draggableId].id
                
        if (start_column.id === end_column.id) {

            // insertion into the same column           
            ids_2.splice(destination.index, 0, draggableId)

            // updated column (essentially a reordering of the index)
            const column_2 = {
                ...start_column, 
                ids: ids_2 
            }
            
            const pheno_value = pheno_state.phenotype[draggableId];
            this.setState({local_phenotype:{
                ...pheno_state,
                phenotype: {
                    ...pheno_state.phenotype,
                    [draggableId]:{
                        ...pheno_value,
                        category:end_column.id
                    }
                },
                category: {
                    ...pheno_state.category,
                    [start_column.id]: column_2 
                }
            },
            local_phenotype_timestamp_l:Date.now()
            });
            
        } else {

            // insert into the separate column 
            const ids_3 = Array.from(end_column.ids);
            ids_3.splice(destination.index, 0, draggableId);

            // _2 (start) has the  excised item 
            const column_2 = {
                ...start_column,
                ids: ids_2 
            }

            // _3 (end) has the same item inserted at the index 
            const column_3 = {
                ...end_column, 
                ids: ids_3 
            }

            const pheno_value = pheno_state.phenotype[draggableId];
            this.setState({local_phenotype:{
                ...pheno_state,
                phenotype: {
                    ...pheno_state.phenotype,
                    [draggableId]:{
                        ...pheno_value,
                        category:end_column.id
                    }
                },
                category: {
                    ...pheno_state.category,
                    [start_column.id] : column_2,
                    [end_column.id] : column_3 
                }
            },
            local_phenotype_timestamp_l:Date.now()
            });
        }

        Rest.modifyPhenotypeCategory(phenotype_id, destination.droppableId)
           .then((response) => {
                this.setState({local_phenotype_timestamp_r:Date.now()})
            })
           .catch(error => {
            // revert state
            this.setState({pheno_state, local_phenotype_timestamp_r:Date.now()})
            Modal.error({
                title:"Error",
                content: error.response.data.errors.map(d => d.message).join('\n'),
                onOk() {}
            })
        })
    }
    
    onStar = (index_id, pheno_id, value) => {
        const {local_phenotype} = this.state;
        const pheno_value = local_phenotype.phenotype[index_id];
        const new_local_phenotype = {
             ...local_phenotype,
             phenotype: {
                 ...local_phenotype.phenotype,
                 [index_id]: {
                    ...pheno_value,
                    important: !!value
                 }
             }
        }

        this.setState({
            local_phenotype: new_local_phenotype,
            local_phenotype_timestamp_l: Date.now(),
        });

        Rest.modifyPhenotypeImportance(pheno_id, !!value)
            .then((response) => {
                this.setState({local_phenotype_timestamp_r:Date.now()})
            })
            .catch(error => {
                this.setState({local_phenotype, local_phenotype_timestamp_r:Date.now()})
                Modal.error({
                    title:"Error",
                    content: error.response.data.errors.map(d => d.message).join('\n'),
                    onOk() {}
                })
            });
    }

    render() {
        const {patient_id, patient, showInfo} = this.props; 
        const {submitted_analysis, prior_case_id, prior_analysis_id, 
            local_phenotype, error_validation}  = this.state; 

        const select_key = prior_case_id && prior_analysis_id ? 
            `${prior_case_id}-${prior_analysis_id}` : undefined;
        
        // (local) patient exist and is up same as the recommended one
        const valid_patient = patient && (Number.parseInt(patient_id) === Number.parseInt(patient.id))
        const dives = valid_patient ? diveTree(patient.case, FIRST_PIPELINE, PIPELINE_DONE) : undefined
        const disabled_submit = local_phenotype && local_phenotype['category']['UNASSIGNED'].ids.length === 0 ? false : true
        
        // if (valid_patient) {
        //     console.log(dives);
        // }

        return (
            <Card style={{marginTop:20}}> 
                {submitted_analysis &&
                <CSSTransition in={submitted_analysis}
                    timeout={0} classNames="result" unmountOnExit appear>
                    <Result 
                    icon={<Icon type="reload" theme="outlined" />}
                    title='Analyzing'
                    subTitle={SUBMITTED_MESSAGE}/>
                </CSSTransition>
                }

                {!submitted_analysis && valid_patient &&
                    <Row gutter={8} style={flexStyle}>
                        <Col span={24} offset={0}>

                            <h2 className="gd-heading">Refine phenotype</h2>

                            <Row><Alert type="warning" style={{margin:"0 0 12px 0"}} description={REVIEW_MESSAGE} showIcon/></Row>

                            {/* Help Message + Patient Badge*/}
                            {showInfo && <Row><Alert style={{margin:"0 0 12px 0"}} description={HELP_MESSAGE} type="info" showIcon/></Row>}
                            
                            {dives.length > 1 && <Row><Alert stype={{margin:"0 0 12px 0"}} description={CHOOSE_DIVE} type="warning" showIcon /></Row>}

                            {/* Choose an (Prior) Analysis to continue*/}
                            <Row style={{marginTop: 15}}>
                                <Col span={14}>
                                    <PatientDiveBadge patient={patient}/>
                                </Col>

                                {dives && dives.length > 0 && 
                                <Col span={9} offset={1}>
                                    {/* dives.length > 1   && <h3>Please pick a dive for {patient.first_name_enc}</h3>}
                                    {dives.length === 1 && <h3>Dive for {patient.first_name_enc}</h3> */}
                                    
                                    <Select 
                                        size="large" 
                                        style={{ width: '100%' }}
                                        value={select_key ? 
                                        select_key : undefined}
                                        placeholder="Select a Dive" 
                                        disabled={dives.length <= 1}
                                        onChange={this.selectCaseAnalysis}>
                                        
                                        {/* Render Dives -> Analysis */}
                                        {dives.map((dive, dkey) => 
                                            <Option
                                                key     ={`${dive.case_id}-${dive.analysis[0].id}`}  
                                                value   ={`${dive.case_id}-${dive.analysis[0].id}`}>

                                                &nbsp;<Text strong>Dive #{dive.analysis[0].id}</Text>&nbsp;
                                                <Text type='secondary'>({(new Date(dive.analysis[0].time_started)).toLocaleDateString()})</Text>&nbsp;
                                                <Text code>{dive.label.toUpperCase()}</Text>
                                            </Option>
                                        )}
                                    </Select> 
                                </Col>}

                                {dives && dives.length === 0 && 
                                    <Col span={24}>
                                        <Result
                                            status="404"
                                            title="NOT FOUND"
                                            subTitle="No dives to continue."
                                        />
                                    </Col> }
                            </Row>
                            
                            {/* Drag and Drop Implementation using Beautiful React DND */}
                            {prior_analysis_id && local_phenotype && 
                                <Row>
                                    <HPOSelector 
                                        patient={patient} 
                                        css="ontology-select min" 
                                        search={true} 
                                        mode="multiple"
                                        size="large"
                                        analysis={prior_analysis_id}
                                        placeholder="i.e. Intellectual Disability"
                                        onChangeHPO={(h) => this.onChangeHPO(h)}/>

                                    <div className="refine-dnd-wrapper">
                                    <div className="refine-dnd-context">
                                        <DragDropContext onDragEnd={this.onDragEnd}> 
                                            {local_phenotype.categoryOrder.map(category_id => {
                                                return (
                                                    <PhenotypeCategory 
                                                        onStar={this.onStar}
                                                        key={category_id}
                                                        category_id={category_id}
                                                        category={local_phenotype.category[category_id]}
                                                        phenotype_data={local_phenotype.phenotype}>
                                                    </PhenotypeCategory>
                                                    )}
                                                )
                                            }
                                        </DragDropContext>
                                    </div>
                                    </div>
                                </Row>
                            }
                            {/* ===================================================
                                Errors: Validation 
                                =================================================== 
                            */}
                            {error_validation.length > 0 && 
                                <Row style={{marginTop:20}}>
                                    <Alert type="error" showIcon message={error_validation.length > 1 ?
                                        <ul>{error_validation.map(e => (<li key={e}>{e}</li>))}</ul>
                                        : <span>{error_validation[0]}</span>
                                    }/>
                                </Row>}       
                        </Col>
                    </Row>}

                    {!submitted_analysis && !valid_patient && 
                        <Row style={{textAlign:"center", margin:'10em'}}>
                            <Spin indicator={loadingIcon}/>
                    </Row>}

                    {showInfo && <Row style={{marginTop:15}}><Alert style={{margin:"0 0 12px 0"}} description={SUBMIT_MESSAGE} type="info" showIcon/></Row>}

                    <Row style={{marginTop:20}}>
                        <Col span={12}>
                            <Button icon='left' type='primary' onClick={this.props.goHome}>BACK</Button>
                        </Col>
                        {dives && dives.length > 0 && !submitted_analysis && 
                            <Col span={12} style={{textAlign:'right'}}>
                                <Button disabled={disabled_submit} 
                                    onClick={(e) => this.showConfirm(this)} type='primary'>{START}</Button>
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
        patients: (id) => {
            dispatch(PatientDetail(id, true));
        },
        patientPhenotype:(id) => {
            dispatch(PatientDetailPhenotypes(id));
        },
        completeAnalysis:() => {
            dispatch(completeAnalysis());
        },
        cancelAnalysis:() => {
            dispatch(cancelAnalysis());
        },
        startAnalysisCare:(patient_id, case_id, pipeline, reference, parent_analysis_id) => {
            dispatch(startAnalysis(patient_id, case_id, pipeline, reference, null, parent_analysis_id));
        }
    }
};

export default connect(
    mapStateToProps,mapDispatchToProps
)(RefinePhenotype);

// notes: 
// UX: https://uxdesign.cc/drag-and-drop-for-design-systems-8d40502eb26d
// key     = {`${dive.case_id}-${dive[dkey].analysis.id}`}  
// value   = {`${dive.case_id}-${dive[dkey].analysis.id}`}>
// Dive: ({dive[dkey].analysis.pipeline})
