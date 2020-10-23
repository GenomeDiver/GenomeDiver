import _ from 'lodash';
import React from 'react';
import moment from 'moment';
import { Icon } from 'antd'

export function titleCase(text) {
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()
}

// https://sysgears.com/articles/how-to-handle-errors-in-scala-graphql-api-with-sangria/
// GraphQL errors are still returning 200, need to discern and message
// appropriately, returns a promise 
export function gqlError(response) {
    return new Promise((resolve, reject) => {
        if ('data' in response && 'errors' in response.data) {
            reject({response});
        } else {
            resolve(response);
        }
    })
}

// jwt authentication header convenience method
export function authHeader() {
    let auth = JSON.parse(localStorage.getItem('auth'));
    if (auth && auth.jwt) {
        return { 
            'Authorization': 'Bearer ' + auth.jwt,
            'Cache-Control': 'no-cache'
        };
    } else {
        return {};
    }
}

// jwt refresh token 
export function refreshHeader() {
    let auth = JSON.parse(localStorage.getItem('auth'));
    if (auth && auth.refresh) {
        return { 'Refresh-Token': auth.refresh };
    } else {
        return {};
    }
}

// rename a 'key' inside an object to some other key 
export const renameProp = (oldProp, newProp, {[oldProp]: old, ...others }) => ({
    [newProp]: old, ...others
})

// generate a list of latest analysis from patient->case object 
const latestFromCase = (patient_case) => {

    // flatten all analysis 
    const analysis = _.chain(patient_case)
    .map((a)=>{return a.analysis})
    .flatMap().value(); 

    // get all ids of analysis 
    let ids = new Set(analysis.map((a)=>{return a.id}))
    ids.delete(0);

    // determine the latest via 
    const latest = analysis.filter((a)=>{
        if (ids.has(a.parent)) {
            ids.delete(a.parent)
            ids.delete(a.id)
            return true
        }
        return false;
    }).concat(analysis.filter((a) => {
        if (ids.has(a.id)) {
            return true;
        }
        return false 
    }))
    
    return latest;
}

// generate the expansion links with a summary of the dives/analysis 
// given the role (CAREGIVER | LAB_USER) 
export const expansionSummary = (patientData, role, format) => {
    return patientData ? patientData.patients.map((p) => {
        let r = {
            id:p.id,
            format 
        };
        
        if (p.case) {

            // get latest analysis 
            const latest = latestFromCase(p.case);

            if (role === 'CAREGIVER') {
                // find all in various states {parent:0, status:'DONE'}
                r['refine_count']  = _.filter(latest, (a) => {return a.parent === 0 && a.status === 'DONE'}).length 
                r['explore_count'] = _.filter(latest, (a) => {return a.parent !== 0 && a.status === 'DONE'}).length 
                r['summary_count'] = _.filter(latest, (a) => {return a.parent !== 0 && (a.status === 'CONFIRMED' || a.status === 'REANALYSIS')}).length;
            
            } else if (role === 'LAB_USER') {
                r['summary_count'] = latest.length;
            }
        }

        return r;
    }) : null;
}

// flattened data structure for table display 
export const flatPatients = (patientData, role) => {
    return patientData ? _.cloneDeep(patientData).patients.map((p) => {
            if (p.case) {
                if (role === 'CAREGIVER') {

                    // get latest analysis & latest statuses 
                    const latest = latestFromCase(p.case);
                    const latest_status = latest.map((a)=>{return a.status});
                    
                    // action for the caregiver is the latest in the state of 'DONE'
                    // pipeline completed ("DONE") ~ caregiver action to confirm results 
                    p['action'] = !_.isEmpty(_.intersection(latest_status, ['DONE']));
                }

                if (role === 'LAB_USER') {
                    const latest = latestFromCase(p.case);
                    const latest_status = latest.map((a)=>{return a.status});

                    // caregiver completion ~ ("REANALYSIS"). Lab action is needed 
                    p['action'] = !_.isEmpty(_.intersection(latest_status, ['REANALYSIS']));
                }


                delete p['case']
            }
            
            if (p.date_of_birth) {
                //p['date_of_birth'] = new Date(p['date_of_birth']).toLocaleDateString();
                p['date_of_birth'] = moment(new Date(p['date_of_birth'])).format('MMM DD YYYY')

            }

            if (p.first_name_enc && p.last_name_enc) {
                p['patient'] = `${p.last_name_enc}, ${p.first_name_enc}`;
                delete p['first_name_enc'];
                delete p['last_name_enc'];
            }

            if (p.physician_first_name && p.physician_last_name) {
                p['physician'] = `${p.physician_last_name}, ${p.physician_first_name} `;
                delete p['physician_first_name'];
                delete p['physician_last_name'];
            }

            p['genetic_counselor'] = 'Unknown'
            if (p.gc_first_name && p.gc_last_name) {
                p['genetic_counselor'] = `${p.gc_last_name}, ${p.gc_first_name} `;    
            }
            
            delete p['gc_first_name'];
            delete p['gc_last_name'];

            if (p.institutions) {
                    p.institutions.forEach((i) => {
                    const institution_type = i.type.toLowerCase()
                    const val = p[i.type.toLowerCase()];
                    
                    // unwrap institution and incorporate role 
                    if ((role === 'CAREGIVER' && institution_type !== 'clinic') || 
                        (role === 'LAB_USER'  && institution_type !== 'lab')) {
                            p[i.type.toLowerCase()] =  val ? val + ', ' + i.name : i.name;
                    }
                })
                delete p['institutions'];
                delete p['status'];
            }
            
            return p;
        }) : null
    }

// generate a case->(dive) tree from case->(analysis). 
// dives [analysis_1, analysis_2] are a more user friendly way 
// to communicate the composite states coming from the analysis 
export const diveTree = (cases, pipeline_to_dive, status) => {

    // limit is used as a further filtering criteria [p1, p2] != valid, only [p1] 
    // status is the pipeline status [QUEUED, CREATED, COMPLETE] 
    // pipeline_to_dive (the name of the pipeline that defines the start of the dive)
    const result = _.reduce(cases, (dives, c) => {
        const {analysis} = c

        // exclude those that have parent, only for first RUN 
        let used_analysis = (pipeline_to_dive === 'FIRST_RUN') ? 
            new Set(analysis.map((a) => {
                return a.parent 
            })) 
            : new Set();
        
        _.forEach(analysis, (a) => {
            if ((a.pipeline === pipeline_to_dive) && (a.status === status) && 
                (!used_analysis.has(a.id))) {
                    used_analysis.add(a.id)
                    dives.push({label:c.name, case_id: c.id, analysis:[a]})
            }
        })
        
        return dives 
    }, []) 

    return result 
}

// create a data structure for the representation of phenotypes in terms of 
// its assigned categories (YES, NO, MAYBE, UNKNOWN), there's also an 
// index which is required by Atlassian react-dnd. 
export const phenotypesToDrag = (phenotypes, order) => {

    const composite = _.reduce(phenotypes, (result, value, key) => {
        const phenotype_id = `phenotype-${key}`
        const category_id = `${value.category}`
        
        // add phenotypes to each category  
        result['phenotype'][phenotype_id] = value;
        let col = result['category'][category_id];
        col.ids.push(phenotype_id)
        
        return result;

    }, _.reduce(order, (result, value, key) => {
        const category_id = `${value}`

        // categories (... columns? ) 
        if (!result['category'][category_id]) {
            result['category'][category_id] = {
                id:category_id,
                ids: []
            }
        }

        return result;
    }, {
        'phenotype':{},
        'category':{},
        'categoryOrder':order 
    }));

    return composite;
}

// commonly used style + icons 
export const flexStyle = {'display':'flex','flexWrap':'wrap'};
export const loadingIcon = <Icon type="sync" style={{ fontSize: 50 }} spin />;

// style hack, transform <input> style to resemble <anchor>
export const inputStyleRemoval = {    
    border: 0, wordBreak: 'break-word', color: '#1890ff',
    whiteSpace: 'unset', textAlign: 'left', padding:0, 
    background: 'transparent', cursor:'pointer'
}