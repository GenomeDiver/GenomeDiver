import React, { PureComponent } from 'react';
import { connect } from 'react-redux';
import { Row, Col, Card, Alert, Icon} from 'antd';
import { flatPatients, flexStyle, expansionSummary } from '../../../helpers'
import { listPatients } from '../../../actions';
import _ from 'lodash';

import GenericTable from '../../../components/GenericTable';

const HELP_MESSAGE = <p>
    After the lab uploads a patient's genome data, GenomeDiver launches a <i>dive</i> (analysis workflow) that needs you to <i>Refine phenotype</i>, <i>Explore findings</i>, and <i>Send to lab</i>. <br/>
    <b>To complete these irreversible steps, when ready, click any patient marked with a (<Icon type='thunderbolt' style={{color:"rgb(22, 144, 255)"}} theme='filled'/>)  and follow the prompts.</b><br/>
    After a dive finishes, you can read its summary by clicking <i>Review</i>.
</p>;

// generate expansion summary 
const expansion_format = [
    {key:"refine", text:"Refine phenotype"}, 
    {key:"explore", text:"Explore findings"},
    {key:"summary", text:"Review"}
]

class SelectPatient extends PureComponent {
    
    componentDidMount() {
        //if (!this.props.patientData) { //}
        // load patients no matter what; take a refresh penalty instead of dealing with 
        // potential stale patient information 
        this.props.patients();       
    }

    // onExpand = (record) => {
       
    // }

    onPatientSelectNoChoice = (expanded, record) => {
        // prior to rendering, expansion examines a case in which there is no discernable choice 
        // for a given route ("dive") and immediately select the next step. In terms of UX 
        // this is somewhat jarring, but has been agreed upon by committee to be the safest shortcut 
        const {patientData, role} = this.props;
        
        const expansion = _.first(_.filter(
            expansionSummary(patientData, role, expansion_format), 
            (e) => {return Number.parseInt(e.id, 10) === Number.parseInt(record.key,10)}))
        
        if (expansion) {
            const {refine_count, explore_count, summary_count} = expansion;
            if (_.sum([refine_count, explore_count, summary_count]) === 1) {
                if (refine_count === 1) {
                    this.props.setPatient(record, "refine")
                } else if (explore_count === 1) {
                    this.props.setPatient(record, "explore")
                } else if (summary_count === 1) {
                    this.props.setPatient(record, "summary")
                }
            }
        }

        // true, false ~ action taken by pre-expansion render. 
        // action prevents rendering from occuring. 
        return false; 
    }

    onPatientSelect = (record, index) => {
        // selects the patient and the next step to take either 1) refinement of phenotypes 
        // 2) exploration of results or 3) reviewing of results for resubmittion to lab 
        this.props.setPatient(record, index)
    }

    render() {
        const {patientData, showInfo, role} = this.props;

        // construct data for the table, with default sort by ("action needed?")
        const flattened_patients = 
            _.sortBy(flatPatients(patientData, role), (r) => {
                return -r['action'];
            });
            
        // construct expansion 
        const expansion = expansionSummary(patientData, 
            this.props.role, expansion_format);
     
        return (
        <Card style={{marginTop:12}}>

            <h2 className='gd-heading'>Pick a patient to continue</h2>

            {/* Help message */}
            {showInfo && <Row><Alert description={HELP_MESSAGE} type="info" showIcon/></Row>}

            <Row gutter={8} style={flexStyle}>
                <Col span={24}>
                {flattened_patients &&
                    <div style={{cursor:'pointer'}}>

                    {/* Table with users */}
                    <GenericTable
                        expansion={expansion}
                        onExpand={this.onPatientSelectNoChoice}
                        onExpansionClick={this.onPatientSelect}
                        expansionControlStyle={{
                            margin: '0px 0px 0px 17%'
                        }}
                        data={flattened_patients}
                        titleMap={{
                            'action':'Action needed?',
                            'first_name_enc':'first_name',
                            'last_name_enc':'last_name',
                            'date_of_birth':'date_of_birth',
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
                            'date_of_birth': (a, b) => a.date_of_birth.localeCompare(b.date_of_birth),
                            'physician': (a, b) => a.physician.localeCompare(b.physician),
                            'genetic_counselor': (a, b) => a.genetic_counselor.localeCompare(b.genetic_counselor),
                            'lab': (a, b) => a.lab.localeCompare(b.lab),
                            'action': (a,b) => a.action < b.action
                        }}
                        sortOrder={[
                            'id', 'patient', 'mrn_id_enc', 'date_of_birth',
                            'physician', 'genetic_counselor', 'lab'
                        ]}/>
                    </div>}
                </Col>
            </Row>
        </Card>
        )
    }
}

function mapStateToProps(store, ownProps) {
    let {PatientList} = store;
    return {
        patientData: PatientList.data,
    };
  }
  
function mapDispatchToProps(dispatch, ownProps) {
    return {
        patients: () => {
            dispatch(listPatients());
        }
    }
};

export default connect(
    mapStateToProps, 
    mapDispatchToProps
)(SelectPatient);

