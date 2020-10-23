This repository contains the backend and frontend 
code for Genome Diver, a tool for variant prioritization 
using HPO phenotypes and genotypes. 

### Installation
- - -
Server requires installation Postgres 11+, Nextflow, and Java 8
- Postgres is required to store user info, patient data, analysis runs and a searchable copy of 
the HPO ontology. 
- Nextflow is required to run the analysis on the submitted variant and phenotype information.
- Analysis pipelines require an installation of Exomiser, Picard, VCFAnno, and Clinvar
- GenomeDiver filters are located in a separate project. 

### Usage 
- - -
- Server application started by sbt via *sbt run* or *sbt reStart* 


### Configuration 
- - -
- Server configuration is largely specified by *resources/application.conf* 
- Database scripts are located in the *database* directory which facilitates 
the loading of HPO ontology and annotations. 
- Example Nextflow configurations are included in the *nextflow/<env>* directory
- Default Exomiser configuations as well as adjustable parameters for filters 
are located in *nextflow/templates* directory

### Roadmap
- - - 
- Migrate away from custom filters and use Exomiser 12 
- For phenotype recommendation LIRICAL should be used 
