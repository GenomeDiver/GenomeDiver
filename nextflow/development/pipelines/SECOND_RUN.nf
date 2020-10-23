// TODO: GRAPHQL return 200 response code - need to harden this

/* 
    GENOME DIVER: SECOND PASS Exomiser pipeline 
    ----------------------------------------------------------
    The following pipeline is triggered from the caregiver input 
    which is essentially both a priorization of the previous output 
    phenotypes. Exomisier is ran again with the filtered variants 

    The resulting variants with their associated genes and diseases
    are then stored for presentation. 
*/

def helpMessage() {
    log.info"""
    
    Example Usage:
        ./nextflow -c nextflow.config run SECOND_RUN.nf --dir /opt/diver/data
        --patient 1 --analysis 1

    Mandatory Arguments: 
        --dir                   Data directory where the pipeline outputs are stored
        --patient               Patient ID [Integer]
        --parent_analysis       Parent Analysis ID [Integer]
        --analysis              Analysis ID [Integer]
        --ref_assembly          GRCH37 or GRCH38. Maps to (hg19 or hg38)
        --sex                   FEMALE, MALE, or UNKNOWN 
        --hpo                   HPO ID(s) (comma separated)

    Optional Arguments
        --help                  Displays this help message 

    """.stripIndent() 
}


// Display help message 
if (params.help) {exit 0, helpMessage()}

// Directory exists check 
if (!params.dir) {exit 1, "Data directory not specified"}
data_dir = new File(params.dir)
if (!data_dir.exists()) {exit 1, "Data directory does not exist."}

// Patient ID check 
if (!params.patient) {exit 1, "Patient ID not specified"}
if (!(params.patient.toInteger())) {exit 1, "Patient ID should be an integer"}

// Parent Analysis ID check 
if (!params.parent_analysis) {exit 1, "Parent analysis ID not specified"}
if (!(params.parent_analysis.toInteger())) {exit 1, "Patient ID should be an integer"}

// Analysis ID check 
if (!params.analysis) {exit 1, "Analysis ID not specified"}
if (!(params.analysis.toInteger())) {exit 1, "Patient ID should be an integer"}

// Error Checking 
if (!params.hpo) {exit 1, "HPO ID(s) not specified"}
if (!params.ref_assembly) {exit 1, "Reference assembly not specified"}
if (!params.sex) {exit 1, "Sex not specified"}
if (!(params.ref_assembly.toUpperCase().trim() in ["GRCH37", "GRCH38"])) {exit 1, "Reference assembly not recognized [GRCh37, GRCh38]"}
if (!(params.sex.toUpperCase().trim() in ["FEMALE", "MALE", "UNKNOWN"])) {exit 1, "Sex not recognized [Female, Male, Unknown]"}

// Analysis (FIRST PASS) Directory 
file_parent = new File("${params.dir}/patient-${params.patient}/analysis-${params.parent_analysis}")
file_analysis = new File("${file_parent.getAbsolutePath()}/analysis-${params.analysis}")
file_vcf = new File("${file_parent.getAbsolutePath()}/$rare_annotated_filtered")

if (!file_parent.exists()) {exit 1, "Parent analysis fold must exist"}
if (!file_vcf.exists()) {exit 1, "VCF Rare Missing from Parent analysis directory"}
if (!file_analysis.exists()) {file_analysis.mkdir()}

parent_analysis_dir = file_parent.getAbsolutePath()
analysis_dir = file_analysis.getAbsolutePath()
vcf_file = file_vcf.getAbsolutePath()

def engine = new groovy.text.GStringTemplateEngine()
analysis_id = params.analysis.toInteger()

// Hydrating the Exomiser configurations 
parsed_hpo = params.hpo.tokenize(",").collect{"\'${it.trim()}\'"}.sort()
invalid_hpo = parsed_hpo.findAll{!(it ==~ /'HP:\d{7}'/)}
if (!invalid_hpo.isEmpty()) {exit 1, "Invalid HPO ID(s) detected: $invalid_hpo"}

def ex_assembly = ["GRCH37":"hg19", "GRCH38":"hg38"]
def ex_config_params = [:]
ex_config_params['vcf'] = file_vcf.getAbsolutePath()
ex_config_params['output_prefix'] = "\$PWD/$prefix_ex2"
ex_config_params['hpo'] = parsed_hpo.join(",")
ex_config_params['ref_assembly'] = ex_assembly[params.ref_assembly.toUpperCase().trim()]

def exomiser_config = engine.createTemplate(
     new File("$baseDir/templates/exomiser_2.yml.template")
).make(ex_config_params).toString()

def filter_params = [:]
filter_params['obo'] = "$obo"
filter_params['annotation'] = "$annotation"
filter_params['annotation_disease'] = "$annotation_disease"

// Hydrating the Exomiser configurations 
def filter_config = engine.createTemplate(
    new File("$baseDir/templates/filters.yml.template")
).make(filter_params).toString()

// Adds a Variant Association 
// ------------------------------------------------------------------------
// Add a Variant (HGVS), with a Gene and potential Disease(s) 
// (as recommended) by Exomiser
// 
def add_variant_association = {String token, int analysis_id, String variant_hgvs, String zygosity, String variant_effect, String gene_pheno_score, String gene, String combined_score, String diseases, String delta_combined_score ->
   log.info("Adding variant association analysis:${analysis_id}\t variant:${variant_hgvs}\t diseases:${diseases}")
   
   ((Boolean) new URL("${graphql_api}").openConnection().with({
        payload = """
            |{"query": "mutation {addVariantAssociation(
            |analysis_id:${analysis_id},  
            |variant_hgvs:\\"${variant_hgvs}\\",
            |zygosity:\\"${zygosity}\\",
            |variant_effect:\\"${variant_effect}\\",
            |gene:\\"${gene}\\",
            |diseases:\\"${diseases}\\",
            |gene_pheno_score:${gene_pheno_score},
            |combined_score:${combined_score},
            |delta_combined_score:${delta_combined_score}
            ){id}}"}
        """.stripMargin().replaceAll("[\n\r]", "")

        requestMethod = 'POST'
        doOutput = true 
        setRequestProperty('Authorization', "Bearer ${token}")
        setRequestProperty('Content-Type', 'application/json')
        setRequestProperty('Accept', 'application/json')
        setRequestProperty('Cache-Control', 'no-cache')
        outputStream.write(payload.getBytes("UTF-8"))
        getResponseCode() == 200
    })) 
}


// Set the Analysis Status of the Pipeline 
// ------------------------------------------------------------------------
// Sets the analysis status to COMPLETE or ERROR via GraphQL 
// Requires a JWT auth token to make request 
def set_analysis_status = {String token, int analysis_id, String pipeline_status -> 
    ((Boolean) new URL("${graphql_api}").openConnection().with({
        payload = """
            |{"query": "mutation {updateAnalysis(
            |analysis_id:${analysis_id},  
            |pipeline_status:${pipeline_status}){id}}"}
        """.stripMargin().replaceAll("[\n\r]", "")

        requestMethod = 'POST'
        doOutput = true 
        setRequestProperty('Authorization', "Bearer ${token}")
        setRequestProperty('Content-Type', 'application/json')
        setRequestProperty('Accept', 'application/json')
        setRequestProperty('Cache-Control', 'no-cache')
        outputStream.write(payload.getBytes("UTF-8"))
        getResponseCode() == 200
    }))    
}

genes_parent_tsv = "${prefix_ex1}.genes.tsv"
genes_tsv = "${prefix_ex2}.genes.tsv"

// Run Exomiser and send outputs into the 'ex_result' channel 
// ------------------------------------------------------------------------
process analysis {
    tag             'exomiser'
    errorStrategy   'finish'
    memory          '16 GB'
    time            '8 h'
    cpus            4

    publishDir path:"$analysis_dir", mode: "copy", overwrite: true
    
    input:
        file ("$genes_tsv") from Channel.fromPath("/opt/diver/data/$genes_tsv")

    output:
        file("$rare_refined") into ex2_result_vcf 
        file("$genes_tsv") into genes_tsv_channel
        file("$exomiser_yml") into exomiser_conf 

    script:
    """
    #!/bin/bash 
    echo "$exomiser_config" > $exomiser_yml

    # TODO: this is short-circuiting Exomiser  
    cp ${vcf_file} $rare_refined
    """
}

// Run Filter (3) Extract Results and compute the 
// ------------------------------------------------------------------------
// Exomiser Variant Combined Score :
// - GENE_PHENO_SCORE + EXOMISER_VARIANT_SCORE / 2 
// 
process filter_three {
    tag             'extract'
    errorStrategy   'finish'
    memory          '8 GB'
    time            '30 m'

    publishDir path:"$analysis_dir", mode: "copy", overwrite: true
    
    input:
        file("$rare_refined") from ex2_result_vcf 
        file("$genes_tsv") from genes_tsv_channel
        file("genes_parent_tsv") from Channel.fromPath("/opt/diver/data/$genes_parent_tsv")

    output:
        file("$shortlist_csv") into filter_3_csv
        file("$shortlist_vcf") into filter_3_vcf
        file("$filter_yml") into filter_output 

    script:
    """
    #!/bin/bash 
    echo "$filter_config" > $filter_yml
    $filter f3 \
    --filter_config $filter_yml \
    --tsv $genes_tsv \
    --input_vcf $rare_refined \
    --output_vcf $shortlist_vcf \
    --output_csv $shortlist_csv \
    """
}

// Workflow Completion
// ------------------------------------------------------------------------
// - report variants back to the analysis 
// - set the analysis status to either:
//
//      + (DONE)    ~ pipeline complete & variants added 
//      + (ERROR)   ~ pipeline errored || reporting variants errored out
//
workflow.onComplete = {
    log.info("complete analysis (2) - reporting results")

    // Login and report irrespective of workflow success / failure
    JWT_TOKEN = ((String) new URL(login_api).openConnection().with({
        requestMethod = 'POST'
        doOutput = true
        setRequestProperty('Content-Type', 'application/json')
        outputStream.write(file(pipeline_credentials).text.getBytes("UTF-8"))
        (getResponseCode() == 200) ? getHeaderField('Set-Authorization') : null
    }))

    if (workflow.success) {
        // Pipeline is complete, report the results back 
        set_analysis_status(JWT_TOKEN, analysis_id, "COMPLETE")
        
        // (Add Variant Associations by parsing the shortlist CSV 
        file("$analysis_dir/$shortlist_csv")
             .readLines()
             .each{

                // regex is ye'ol Java CSV parse
                line_split = it.trim().split(/,(?=([^\"]*\"[^\"]*\")*[^\"]*$)/, -1)
                csv_index = line_split[0]

                if (csv_index?.trim()) {
                    variant_association_added = add_variant_association(
                        JWT_TOKEN, analysis_id,                  // authentication, and analysis
                        line_split[1],                           // variant (HGVS) 
                        line_split[2],                           // zygosity 
                        line_split[3],                           // variant effect 
                        line_split[4],                           // gene pheno score     
                        line_split[5],                           // genes 
                        line_split[6],                           // combined score  
                        line_split[7].replaceAll("\"", ""),      // disease(s) in OMIM/ORPHA
                        line_split[8]                            // delta_combined_score
                        )
                    
                     if (!variant_association_added) {
                        set_analysis_status(JWT_TOKEN, analysis_id, "ERROR")
                        throw new Exception("Add Variant Association Failed, setting pipeline to ERROR")
                    }
                }
             }

        // Set Analysis Status to DONE
        set_analysis_status(JWT_TOKEN, analysis_id, "DONE")
    } else {
        // Set Analysis Status to ERROR
        set_analysis_status(JWT_TOKEN, analysis_id, "ERROR")
    }

    // Logout to to kind to authentication 
    logout = ((Boolean) new URL(logout_api).openConnection().with({
        requestMethod = 'POST'
        doOutput = true
        setRequestProperty('Authorization', "Bearer ${JWT_TOKEN}")
        setRequestProperty('Content-Type', 'application/json')
        setRequestProperty('Accept', 'application/json')
        setRequestProperty('Cache-Control', 'no-cache')
        getResponseCode() == 200
    }))
}