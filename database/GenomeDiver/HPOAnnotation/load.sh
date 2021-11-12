



#!/bin/bash

# ----------------------------------------------------------------
# LOAD HPO (Gene to Phenotypes)
# ----------------------------------------------------------------
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null && pwd )"
DATA_SOURCE=""
DOWNLOAD=$DIR/download/genes_phenotype.txt
TEMPLATE=$DIR/db/hpo_gene2pheno.template

printf "+ Loading in HPO Annotations (Genes to Phenotypes)\n"
printf "*********************************************************** \n"
mkdir -p $DIR/download $DIR/sql

# Download the latest gene_to_phenotype annotations
wget http://purl.obolibrary.org/obo/hp/hpoa/genes_to_phenotype.txt -O $DOWNLOAD

# Fix Header of HPO Annotations so file is tab delimited
perl -p -i -e 's/#Format: //g if $. == 1' $DOWNLOAD
perl -p -i -e 's/<tab>/\t/g if $. == 1' $DOWNLOAD
perl -p -i -e 's/-/_/g if $. == 1' $DOWNLOAD

# run generated template for the first 4 columns
cut -f1,2,3,4 $DOWNLOAD \
 | psql -d genome_diver --quiet -f $TEMPLATE

printf "Done! \n\n"
