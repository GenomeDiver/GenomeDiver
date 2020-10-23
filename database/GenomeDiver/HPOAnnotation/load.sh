



#!/bin/bash

# ----------------------------------------------------------------
# LOAD HPO (Gene to Phenotypes)
# ----------------------------------------------------------------
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null && pwd )"
DATA_SOURCE=""
DOWNLOAD=$DIR/download/genes_phenotype.txt
TAB=$DIR/download/genes_phenotype.tab
TEMPLATE=$DIR/db/hpo_gene2pheno.template
OUTPUT=$DIR/sql/hpo_gene2pheno.generated.pgsql

printf "+ Loading in HPO Annotations (Genes to Phenotypes)\n"
printf "*********************************************************** \n"
mkdir -p $DIR/download $DIR/sql

# Download the latest gene_to_phenotype annotations
wget http://compbio.charite.de/jenkins/job/hpo.annotations/lastSuccessfulBuild/artifact/util/annotation/genes_to_phenotype.txt -O $DOWNLOAD

# Fix Header of HPO Annotations so file is tab delimited
perl -p -i -e 's/#Format: //g if $. == 1' $DOWNLOAD
perl -p -i -e 's/<tab>/\t/g if $. == 1' $DOWNLOAD
perl -p -i -e 's/-/_/g if $. == 1' $DOWNLOAD
cut -f1,2,3,4 $DOWNLOAD > $TAB

# Generate SQL from template and newly generated data file
sed -e "s/%DIR%/${TAB//\//\\/}/g" $TEMPLATE > $OUTPUT

# run generated template
psql -d genome_diver --quiet -f $OUTPUT

printf "Done! \n\n"
