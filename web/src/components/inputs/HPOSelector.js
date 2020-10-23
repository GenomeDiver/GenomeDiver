import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Select, Spin, Modal } from 'antd';
import { debounce } from 'lodash';
import {gqlError} from '../../helpers'
import Rest from '../../services/Rest';
import '../styles/HPOSelector.css';
import _ from 'lodash';

const Option = Select.Option;

class OptionInner extends Component {
    render() {
       const {d} = this.props; 
       return (
            <ul style={{listStyle:'none'}}>
                <li><strong>{d.hpo_term}</strong> ({d.hpo_id})</li>
                <li style={{fontSize:'1em'}}>{d.description}</li>
            </ul>
       )
    }
}

class HPOSelector extends Component {
    constructor(props) {
        super(props); 
        
        const patient_total_phenotypes = this.props.patient.phenotypes;
        const patient_unassoc_phenotypes = patient_total_phenotypes.filter((p) => _.isEmpty(p.of_analysis))

        // initial phenotypes from the patients 
        const initialValue = this.props.analysis ? [] : patient_unassoc_phenotypes.map(p => ({
            'key': p.hpo_id, 'label': <OptionInner d={p}/>
        }));
        
        // broadcast initial HPO phenotypes list to parent (listener)
        const initialHPOList = this.props.analysis ? [] : patient_unassoc_phenotypes.map(p => p.hpo_id)
        if (!this.props.search) {this.props.onChangeHPO(initialHPOList); }

        // keep a copy of the initial value to do a diff 
        this.state = {
            data: [],
            value: initialValue,
            initial_value: initialValue,
            loading: false
        }
        
        this.fetchHPO = debounce(this.fetchHPO, 300);
    }

    fetchHPO = (value) => {
        Rest.Ontology(value)
            .then(response => {
                const data = response.data.data.hpo_ontology.map(term => ({
                    hpo_term: term.name,
                    hpo_id : term.hpo_id,
                    description: term.description,
                    user_defined: value
                }));
                
                // add in support for free text 
                // figure out which ones to remove and which ones to add 
                this.setState({ data, loading: false });
            }).catch(error => {
                Modal.error({
                    title:"Error",
                    content: error.message || error.response.data.errors.map(d => d.message).join('\n'),
                    onOk() {}
                })
            });
    }

    handleChange = (new_value, option) => {
        const {value} = this.state;
        const {patient, authInfo, analysis, search} = this.props; 
        
        if (new_value.length > value.length) {

            // ADDITION of a new Phenotype 
            let value_k = new Set(value.map(v => (v.key)));
            let new_input = new_value.filter(v => !value_k.has(v.key)).shift();

            // SYNC addition with BACKEND 
            // Obtain the phenotype id from the backend 
            if (new_input) {
                const {d} = new_input.label.props
                const key = d.hpo_id ? d.hpo_id : d.user_defined
                
                // @GraphQL 
                Rest.addPhenotype(
                        patient.id, 
                        d.user_defined ? d.user_defined : "", 
                        d.hpo_id,
                        authInfo.role.toUpperCase().split('_')[0],
                        analysis 
                    )
                    .then(response => {return gqlError(response)})
                    .then(response => {
                        
                        // data(axios) / data(graphql)
                        const pheno_id = response.data.data.addPhenotype.id;
                        const option_props = {
                            d: {...d, id:pheno_id}
                        }
                        
                        // we inject the id into the element 
                        const option = {key, label: React.createElement(OptionInner, option_props)}
                        new_value = [option, ...value];
                        
                        if (!search) {
                            this.setState({
                                value: new_value, data: [], loading: false,
                            })
                        } else {
                            this.setState({
                                value: [], data: [], loading: false,
                            })
                        }

                        // broadcast to parent component HPO update
                        this.props.onChangeHPO(new_value.map(p => p.key));

                }).catch(error => {
                        Modal.error({
                            title:"Error",
                            content: error.message || error.response.data.errors.map(d => d.message).join('\n'),
                            onOk() {}
                        })
                })
            }

        } else if (new_value.length < value.length) { 

            // SUBTRACTION of an HPO Phenotype 
            let value_k = new Set(new_value.map(v => (v.key)));
            let sub_value = value.filter(v => !value_k.has(v.key)).shift();

            // SYNC w/ backend
            if (sub_value) {
                const {d} = sub_value.label.props 
                Rest.removePhenotype(d.id).then(response => {
                    this.setState({
                        value: new_value,
                        data: [],
                        loading: false,
                    })

                    // broadcast to parent component HPO update
                    this.props.onChangeHPO(new_value.map(p => p.key));
                }); 
            }
        } else {
            // should not happen 
        }
    }

    render() {
        const { loading, data, value } = this.state;
        const { css, mode, size, placeholder } = this.props;

        return (
            <Select 
                className={css}
                value={value} 
                labelInValue
                filterOption={false}
                mode={mode}
                placeholder={placeholder}
                notFoundContent={loading ? <Spin size="small" /> : null}
                onSearch={this.fetchHPO} 
                onChange={this.handleChange}
                size={size}>

                {data.map(d => 
                    <Option key={d.hpo_id ? d.hpo_id : d.user_defined}>
                        <OptionInner d={d}/>
                    </Option>)
                }

          </Select>
        )
    }
}

HPOSelector.defaultProps = {
    'css':'ontology-select lab',
    'mode':'multiple',
    'search':false,
    'size':'default',
    'analysis':null,
    'placeholder':"Add HPO phenotype name (e.g., headache) or ID (HP:0002315)..."
}

function mapStateToProps(store, ownProps) {
    const { Auth } = store;
    return {
        authInfo: Auth.info
     }
  }

export default connect(
    mapStateToProps
)(HPOSelector);
