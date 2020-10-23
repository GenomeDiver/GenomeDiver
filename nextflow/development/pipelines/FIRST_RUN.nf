// TODO: GRAPHQL return 200 response code - need to harden this

/* 
    GENOME DIVER: FIRST PASS Exomiser pipeline 
    ------------------------------------------------------------------------
    The following pipeline is triggered from labs input of HPO normalized 
    phenotypes and a VCF file. After the run of Exomiser, Clinvar annotations 
    are ran on the output vcf and scripts both filter and aggregate data 
    to form a recommendation of relevant phenotypes for the caregiver.
*/ 

def helpMessage() {
    log.info"""
    
    Example Usage:
        ./nextflow -C nextflow.config run FIRST_RUN.nf --dir /opt/diver/data --patient 1 
        --analysis 1 --vcf vcf.tar.gz --hpo HP_0002027 

    Mandatory Arguments: 
        --dir                       Data directory where the pipeline outputs are stored 
        --patient                   Patient ID [Integer]
        --analysis                  Analysis ID [Integer]
        --vcf                       name of the VCF used (path is relative to data directory / {patient_id})
        --ref_assembly              GRCH37 or GRCH38. Maps to (hg19 or hg38) 
        --sex                       FEMALE, MALE, or UNKNOWN 
        --hpo                       HPO ID(s) (comma separated)
                     
    Optional Arguments 
        --help                      Displays this help message

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

// Analysis ID check 
if (!params.analysis) {exit 1, "Patient ID not specified"}
if (!(params.analysis.toInteger())) {exit 1, "Patient ID should be an integer"}

// Target VCF file check 
if (!params.vcf) {exit 1, "Patient VCF not specified"}
vcf_file = new File("${data_dir}/patient-${params.patient}/${params.vcf}")
if (!vcf_file.exists()) {exit 1, "Patient VCF not found"}

// Error checking 
if (!params.hpo) {exit 1, "HPO ID(s) not specified"}
if (!params.ref_assembly) {exit 1, "Reference assembly not specified"}
if (!params.sex) {exit 1, "Sex not specified"}
if (!(params.ref_assembly.toUpperCase().trim() in ["GRCH37", "GRCH38"])) {exit 1, "Reference assembly not recognized [GRCh37, GRCh38]"}
if (!(params.sex.toUpperCase().trim() in ["FEMALE", "MALE", "UNKNOWN"])) {exit 1, "Sex not recognized [Female, Male, Unknown]"}

// pipeline "sink" directory is namespaced 
// analysis themselves are futher namespaced with the hash of the inputs (yaml,)
analysis_id = params.analysis.toInteger()
analysis_dir = "${params.dir}/patient-${params.patient}/analysis-${params.analysis}"
engine = new groovy.text.GStringTemplateEngine()

// generate the exomiser input YAML file from the paramaters specified 
// check all HPO ids 
parsed_hpo = params.hpo.tokenize(",").collect{"\'${it.trim()}\'"}.sort()
invalid_hpo = parsed_hpo.findAll{!(it ==~ /'HP:\d{7}'/)}
if (!invalid_hpo.isEmpty()) {exit 1, "Invalid HPO ID(s) detected: $invalid_hpo"}

def ex_assembly = ["GRCH37":"hg19", "GRCH38":"hg38"]
def ex_config_params = [:]
ex_config_params['vcf'] = "$analysis_dir/raw.vcf"
ex_config_params['output_prefix'] = "\$PWD/$prefix_ex1"
ex_config_params['hpo'] = parsed_hpo.join(",")
ex_config_params['ref_assembly'] = ex_assembly[params.ref_assembly.toUpperCase().trim()]

def exomiser_config = engine.createTemplate(
     new File("$baseDir/templates/exomiser_1.yml.template")
).make(ex_config_params).toString()

// Configure Clinvar Annotation (VCFAnno)
// ------------------------------------------------------------------------
// generate the clinvar toml for VCFAnno to annotated the result 
// of Exomiser output (rare.vcf)
def clinvar_params = [:]
if (params.ref_assembly.toUpperCase().trim() == "GRCH38") {
    clinvar_params["clinvar"] = clinvar_grch38
} else {
    clinvar_params["clinvar"] = clinvar_grch37
}

def clinvar_toml = engine.createTemplate(
    new File("$baseDir/templates/clinvar.toml.template")
).make(clinvar_params).toString()

// Configure Filter Paramters 
// ------------------------------------------------------------------------
// generate filters.yml from filters.yml.template
// 
def filter_params = [:]
filter_params['obo'] = "$obo"
filter_params['annotation'] = "$annotation"
filter_params['annotation_disease'] = "$annotation_disease"

def filter_config = engine.createTemplate(
    new File("$baseDir/templates/filters.yml.template")
).make(filter_params).toString()

// Add Phenotype from Pipeline 
// ------------------------------------------------------------------------
// Submit a HPO normalized phenotype to the analysis via GraphQL.
// Requires a JWT auth token to be make request 
def add_phenotype = {String token, int analysis_id, String hpo_id -> 
    patient_id = params.patient.toInteger()

    ((Boolean) new URL("${graphql_api}").openConnection().with({
        payload = """ 
            |{"query": "mutation {addPhenotype(
            |patient_id:${patient_id},
            |user_defined:\\"\\",
            |hpo_id:\\"${hpo_id}\\",
            |parent_analysis_id:${analysis_id},
            |created_by:GENOMEDIVER){id}}"}
        """
        .stripMargin()
        .replaceAll("[\n\r]", "")
        .trim() 

        requestMethod = 'POST'
        doOutput = true 
        setRequestProperty('Authorization', "Bearer ${token}")
        setRequestProperty('Content-Type', 'application/json')
        setRequestProperty('Accept', 'application/json')
        setRequestProperty('Cache-Control', 'no-cache')
        outputStream.write(payload.getBytes("UTF-8"))

        // TODO: GraphQL violations should be parsed
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

genes_tsv = "${prefix_ex1}.genes.tsv"
variants_tsv = "${prefix_ex1}.variants.tsv"

// Run Exomiser on Inputs (VCF, HPO)
// ------------------------------------------------------------------------
// sent outputs into the 'ex_result' channel 
// configurations are sent to the 'channel' to be saved into 
// the patient/analysis directory 
// 
process analysis {
    tag             'exomiser'
    errorStrategy   'finish'
    memory          '16 GB'
    time            '8 h'
    cpus            4

    publishDir path:"$analysis_dir", mode: "copy", overwrite: true
    
    input:
        file ("$variants_tsv") from Channel.fromPath("/opt/diver/data/$variants_tsv")
        file ("$genes_tsv") from Channel.fromPath("/opt/diver/data/$genes_tsv")
        
    output:
        file("$rare") into ex_result_vcf 
        file("$exomiser_yml") into exomiser_conf
        file("$genes_tsv") into genes_tsv_channel
        file("$variants_tsv") into variants_tsv_channel

    script:
    """ 
    #!/bin/bash
    echo "$exomiser_config" > $exomiser_yml
    ln -s ${vcf_file} $raw
    cp ${vcf_file} $rare
    """
}

// Sort VCF (using PicardTools) 
// ------------------------------------------------------------------------
// - Rare sorted VCF is used in the later analysis 
// 
process sort {
    tag             'picard'
    errorStrategy   'finish'
    memory          '4 GB'
    time            '30 m'

    publishDir path:"$analysis_dir", mode: "copy", overwrite: true

    input:
        file("$rare") from ex_result_vcf 

    output:
        file("$rare_sorted") into sorted_vcf 
    
    script:
    """
    #!/bin/bash
    java -jar $picard FixVcfHeader I=$rare O=$rare_fixed
    java -jar $picard SortVcf I=$rare_fixed O=$rare_sorted
    """
}

// Annotated the VCF with Clinvar (using VCFAnno)
// ------------------------------------------------------------------------
// TOML is the actual mapping of values and needs to be generated 
// from templates (requires reference)
// LUA is the utilities class used by VCFAnno 
process annotation {
    tag             'vcfanno/clinvar'
    errorStrategy   'finish'
    memory          '4 GB'
    time            '30 m'
    
    publishDir path:"$analysis_dir", mode: "copy", overwrite: true

    input: 
        file("$rare_sorted") from sorted_vcf 

    output:
        file("$rare_annotated") into annotated_vcf 
        file("$vcfanno_clinvar_toml") into toml_publish 
        file("$rare_sorted") into sorted_vcf_output 

    script:
    """
    #!/bin/bash
    echo '$clinvar_toml' > $vcfanno_clinvar_toml
    $vcfanno -p 4 -lua $vcfanno_clinvar_lua $vcfanno_clinvar_toml $rare_sorted > $rare_annotated
    """
}

// Variant Prioritization Filter 
// ------------------------------------------------------------------------
process filter_one {
    tag             'variant'
    errorStrategy   'finish'
    memory          '8 GB'
    time            '30 m'

    publishDir path:"$analysis_dir", mode: "copy", overwrite: true 

    input:
        file ("$rare_annotated") from annotated_vcf
        file ("$variants_tsv") from variants_tsv_channel
  
    output: 
        file ("$rare_annotated_filtered") into filter_one_result  
        file ("$filter_yml") into filter_settings

    script:
    """
    #!/bin/bash 
    echo "$filter_config" > $filter_yml
    $filter f1 \
    --filter_config $filter_yml \
    --tsv $variants_tsv \
    --input $rare_annotated \
    --output $rare_annotated_filtered
    """
}

// Phenotype Prioritization Filter 
// ------------------------------------------------------------------------
process filter_two {
    tag             'phenotype'
    errorStrategy   'finish'
    memory          '8 GB'
    time            '30 m'
    publishDir path:"$analysis_dir", mode: "copy", overwrite: true 

    input:
        file ("$rare_annotated_filtered") from filter_one_result 
        file ("$filter_yml") from filter_settings
        file ("$exomiser_yml") from exomiser_conf
        file ("$genes_tsv") from genes_tsv_channel 
        
    output:
        file ("distinct_phenotypes.csv") into filter_two_csv_result 
        file ("distinct_phenotypes.txt") into filter_two_txt_result
        file ("filter_two.txt") into filter_two_results 
        file ("$exomiser_yml")  into exomiser_conf_result
        file ("$filter_yml") into filter_settings_result

    // 1) Update analysis              (COMPLETE) 
    // 2) Add resulting phenotypes     ()
    // TODO: would feel a little safer if it were a "TRANSACTION"

    script:
    """
    #!/bin/bash
    $filter f2 \
    --filter_config $filter_yml \
    --exomiser_config $exomiser_yml \
    --tsv $genes_tsv \
    --sex ${params.sex.toUpperCase()} \
    --input $rare_annotated_filtered \
    --output distinct_phenotypes.csv > filter_two.txt

    # ------------------------------------------------------------------------
    # Build an easily traversable file of only normalized HPO IDs 
    # ------------------------------------------------------------------------
    cat distinct_phenotypes.csv | awk -F, '{print \$2}' | tail -n +2 |grep -v "^NA" | uniq > distinct_phenotypes.txt
    """
}

workflow.onComplete = {
    log.info("complete analysis (1) - reporting results")
}


// Workflow Completion 
// ------------------------------------------------------------------------
workflow.onComplete = {
    
    // Login as the administrator using credentials store in nextflow config  
    JWT_TOKEN = ((String) new URL(login_api).openConnection().with({
        requestMethod = 'POST'
        doOutput = true
        setRequestProperty('Content-Type', 'application/json')
        outputStream.write(file(pipeline_credentials).text.getBytes("UTF-8"))
        (getResponseCode() == 200) ? getHeaderField('Set-Authorization') : null
    }))

    // 1) Add phenotypes results generated from the pipeline
    // 2) Update analysis status to either COMPLETE or ERROR 
    if (workflow.success) {
        set_analysis_status(JWT_TOKEN, analysis_id, "COMPLETE")
        
        file("$analysis_dir/distinct_phenotypes.txt")
            .readLines().each{
                phenotype_added = add_phenotype(JWT_TOKEN, analysis_id, it.trim())

                // HTTP Failure 
                // - attempt to set analysis to "ERROR" throw exception
                // - TODO: GraphQL exceptions return 200 SUCCESS, need to address that 
                if (!phenotype_added) {
                    set_analysis_status(JWT_TOKEN, analysis_id, "ERROR")
                    throw new Exception("Add Phenotype Failed, setting pipeline to ERROR")
                }
            }
    
        set_analysis_status(JWT_TOKEN, analysis_id, "DONE")
    } else {
        set_analysis_status(JWT_TOKEN, analysis_id, "ERROR")
    }
        
    // Logout, just to be hygienic 
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