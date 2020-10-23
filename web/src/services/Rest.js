import {API} from './Config';
import {authHeader, refreshHeader} from '../helpers';
import axios from 'axios';

function graphql(request_body, token) {
    return axios.post(
        `${API}/graphql`, 
        request_body, 
        {
            'headers': authHeader(),
            'cancelToken': token
        });
}

function gql_quote(arr) {
    return arr.map((a) => {return `"${a}"`}).toString()
}

// -----------------------------------------------------------
// Institution 
// 
//  - listInstitutions   (authenticated)          Get a list of institutions that the user can see 
//  - addInstitution     (authenticated / admin)  Add an institution with name as a parameter 
// 
//  Institutions are the unix group equivalent for authorization for patient data 
//  users that are connected to patients and their attributes via sharing the same institution. 
// 
// -----------------------------------------------------------

function listInstitutions() {
    return axios.get(`${API}/institution`, {'headers': authHeader()});
}

function addInstitution({institution, type}) {
    return axios.put(`${API}/institution`,
        {'name':institution, type},
        {'headers': authHeader()});
}

// -----------------------------------------------------------
// Users 
//
//  - login      (unauthenticated)        Only endpoint where the username and password is sent 
//  - remember   (authenticated)          Refreshes the JWT token, via refresh token stored on front end 
//  - logout     (authenticated)          Signs out user and clears any local sessions that may be lingering 
//  - listUsers  (authenticated / admin)  Lists valid users 
//  - addUser    (authenticated / admin)  Add a user with associated institution 
//  - removeUser (authenticated / admin)  Remove a user (mark as inactive) from the database 
//                
// -----------------------------------------------------------

function login({username, password}) {
    return axios.post(`${API}/user/login`, {username, password});
}
function currentUser() {
    return axios.get(`${API}/user/current`, {'headers': authHeader()});
}
function remember() {
    return axios.post(`${API}/user/remember`, null, {'headers': refreshHeader()});
}
function logout() {
    return axios.post(`${API}/user/logout`, null, {'headers': authHeader()});
}
function listUsers() {
    return axios.get(`${API}/users`, {'headers': authHeader()});
}
function addUser() {
    return axios.put(`${API}/user`, null, {'headers': authHeader()});
}
function removeUser() {
    return axios.delete(`${API}/user`, null, {'headers': authHeader()});
}

// -----------------------------------------------------------
// User Password 
//
// - loginForget 
// -----------------------------------------------------------
function loginForget({email}) {
    // TODO: base_url - this needs to fixed, this is an unecessary variable
    return axios.post(`${API}/user/forgot`, {email, base_url:`${window.origin}/reset`});
}

function resetPassword() {
    return null;
}

function confirmPassword() {
    return null;
}

// -----------------------------------------------------------
// Patient Management
//
// - listInsititutionsLab : List institutions relevant to lab 
// - ListPatients : Lists patients 
// - getPatientLabDetail : 
// -----------------------------------------------------------
function listInstitutionsLab() {
    return graphql({
        'query':'{institutions{id name type}}'
    });
}

function listPatients() {
    return graphql({
        'query':'{patients {id first_name_enc last_name_enc mrn_id_enc date_of_birth physician_first_name physician_last_name gc_first_name gc_last_name status case{analysis{id parent status}} institutions {name type}}}'
    });
}

function getPatientLabDetail(id, incl_pheno=false, incl_assoc=false) {

    // phenotypes -> associated -> analysis ~ semi-complex query 
    const pheno = incl_pheno ? 'phenotypes {id hpo_term hpo_id user_defined category important created_by of_analysis{id pipeline status parent}}' : '';
    const varia = incl_assoc ? 'variant_associations {id hgvs_variant hgvs_gene hpo_term hpo_disease caregiver_flag context}' : '';

    return graphql({
        'query' : `{patients(
            patient_id:${id}) {id first_name_enc last_name_enc sex mrn_id_enc date_of_birth physician_first_name 
            physician_last_name physician_email gc_first_name gc_last_name status case {id name analysis {id pipeline time_started time_completed status parent input{id name value}}} institutions {id name type} ${pheno} ${varia}}}`
    });
}

function getPatientDetailPhenotypes(id) {
    const pheno = 'phenotypes {id hpo_term hpo_id user_defined category important created_by of_analysis{id pipeline status}}';
    return graphql({
        'query' : `{patients(patient_id:${id}) {id ${pheno}}}`
    });
}

function getAnalysisDetailPhenotypes(patient_id, analysis_id) {
    const pheno = 'phenotypes {id hpo_term hpo_id user_defined category important created_by of_analysis{id pipeline status}}';
    return graphql({
        'query': `{analysis(patient_id:${patient_id}, analysis_id:${analysis_id}) {id ${pheno}}}`
    });
}

function createPatient(first_name, last_name, sex, mrn_id, physician_first_name, physician_last_name, physician_email, 
    gc_first_name, gc_last_name, gc_email, date_of_birth, date_of_report, lab_id, clinic_id) {
    
    return graphql({
        'query':`mutation {createPatient(
            first_name_enc: "${first_name}", 
            last_name_enc: "${last_name}",
            sex:"${sex}", 
            lab_id : ${lab_id},
            clinic_id : ${clinic_id}
            mrn_id_enc: "${mrn_id}", 
            physician_first_name:"${physician_first_name}",
            physician_last_name:"${physician_last_name}",
            physician_email:"${physician_email}",
            gc_first_name:"${gc_first_name}",
            gc_last_name:"${gc_last_name}",
            gc_email:"${gc_email}",
            date_of_birth:"${date_of_birth}", 
            date_of_report:"${date_of_report}"
        ){id}}` 
    });
}

//
// TODO: edit patient - not used currently need a place for it 
// 

// -----------------------------------------------------------
// Phenotype Management
// -----------------------------------------------------------
function addPhenotype(patient_id, user_defined, hpo_id, created_by, analysis = null) {
    
    // parent analsis id 
    const inc_analysis = analysis ? `parent_analysis_id:${analysis}` : "";

    return graphql({
        'query' : `mutation {addPhenotype(
            patient_id: ${patient_id}, 
            user_defined: "${user_defined}", 
            hpo_id:"${hpo_id}",
            created_by:${created_by},
            ${inc_analysis})
            {id}}`
    });
}

function removePhenotype(phenotype_id) {
    return graphql({
        'query': `mutation {removePhenotype(phenotype_id: ${phenotype_id}){id}}`
    });
}

function modifyPhenotypeCategory(phenotype_id, category) {
    return graphql({
        'query': `mutation {modifyPhenotypeAttribute(
            phenotype_id:${phenotype_id}, 
            category:${category.toUpperCase()})
            {id}}`
    });
}

function modifyPhenotypeImportance(phenotype_id, important) {
    return graphql({
        'query': `mutation {modifyPhenotypeAttribute(
            phenotype_id:${phenotype_id}, 
            important:${important})
            {id}}`
    });
}

function startAnalysis(patient_id, case_id, pipeline, reference, vcf_name = null, parent_analysis_id = null) {

    // vcf namespace ~ after successful upload 
    const inc_vcf = vcf_name ? `vcf_name:"${vcf_name}",` : '';

    // analysis can be linked to parent if a valid id is given:
    // (parent) => (child), this effectively determines a workflow / "Dive" 
    const inc_parent = parent_analysis_id ? `parent_analysis_id:${parent_analysis_id},`: '';
    
    return graphql({
        'query': `mutation {startAnalysis(
            case_id:${case_id},
            patient_id:${patient_id},
            pipeline:${pipeline}, 
            reference:${reference.toUpperCase()},
            ${inc_vcf}
            ${inc_parent})
            {id}}`
    })
}

function modifyAnalysisComment(analysis_id, analysis_comment) {
    return graphql({
        'query': `mutation {modifyAnalysisComment(
            analysis_id:${analysis_id}, 
            analysis_comment:"${analysis_comment}"
        ){id}}`
    })
}

function confirmAnalysis(analysis_ids) {
    const fragment = analysis_ids.map(id => {
        return `analysis_${id}:updateAnalysisConfirm(analysis_id:${id}){id}`
    })
    
    return graphql({'query':`mutation {${fragment}}`});
}

function setReanalysis(analysis_ids) {
    const fragment = analysis_ids.map(id => {
        return `analysis_${id}:updateAnalysisRedo(analysis_id:${id}){id}`
    })
    
    return graphql({'query':`mutation {${fragment}}`});
}

function addDiseaseAssociation(analysis_id, disease) {
    return graphql({
        'query':`mutation {addDiseaseAssociation(
            analysis_id:${analysis_id},
            disease:"${disease}")
        {id}}`
    });
}

function removeDiseaseAssociation(analysis_id, disease) {
    return graphql({
        'query':`mutation {removeDiseaseAssociation(
            analysis_id:${analysis_id},
            disease:"${disease}")
        {id}}`
    });
}

function Ontology(search_term, token) {
    return graphql({
        'query': `{hpo_ontology(
            search_term:"${search_term}") 
            {name hpo_id description}}`
    });
}

function getAnalysisDetailLab(patient_id, analysis_ids, cancel_token) {

    const fragment = analysis_ids.map(id => {
        return `analysis_${id}: analysis(patient_id:${patient_id}, analysis_id:${id}) {
            input {name,value},
            comment, 
            disease_associations {disease},
            variant_associations {
                hgvs_variant, zygosity, diseases, gene, variant_effect,
                gene_pheno_score, combined_score
            }}`;
            
    }).join("\n");

    return graphql({
        'query': `{${fragment}}`});
}

function getAnalysisDetailCare(patient_id, analysis_ids, cancel_token) {

    const fragment = analysis_ids.map((id, i) => {
        switch (i) {
            case 0:
                return `analysis_${id}:analysis(patient_id:${patient_id}, analysis_id:${id}) {
                        input {name,value},
                        comment,
                        status
                }`

            case 1:
                return `analysis_${id}:analysis(patient_id:${patient_id}, analysis_id:${id}) {
                        input {name, value}, 
                        comment,
                        status
                    }
                    
                    disease_gene(patient_id:${patient_id}, analysis_id:${id}) {
                        disease, 
                        selected, 
                        gene, 
                        combined_score, delta_combined_score
                }`
            default:
                return '';
        }
    }).join("\n")

    return graphql({
        'query':`{${fragment}}`
    });
}

function getAnalysisDetailAnnotation(genes, hpo_ids = [], diseases = [], cancel_token) {
    const genes_fragment   = genes    ? `genes:[${gql_quote(genes)}]` : '';
    const hpo_fragment     = hpo_ids  ? `hpo_ids:[${gql_quote(hpo_ids)}]` : '';
    const disease_fragment = diseases ? `disease_id:[${gql_quote(diseases)}]` : '';

    return graphql({
        'query':`{
            hpo_gene_phenotype(
                ${genes_fragment}, ${hpo_fragment}            
            ){hpo_id,hpo_term, entrez_gene_symbol}
            hpo_disease(
                ${disease_fragment}
            ){disease_id, disease_name}
        }`
    });
}


const Rest = {
    login, logout, loginForget, remember, currentUser,
    listInstitutions, addInstitution,
    listUsers, addUser, removeUser,
    resetPassword, confirmPassword,
    listPatients, getPatientLabDetail, getPatientDetailPhenotypes, getAnalysisDetailPhenotypes,
    createPatient, listInstitutionsLab,
    Ontology,
    addPhenotype, removePhenotype, 
    modifyPhenotypeCategory, modifyPhenotypeImportance,
    startAnalysis, getAnalysisDetailCare, getAnalysisDetailLab, modifyAnalysisComment, confirmAnalysis, setReanalysis, 
    getAnalysisDetailAnnotation, 
    addDiseaseAssociation, removeDiseaseAssociation
}

export default Rest;
