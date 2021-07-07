#!/bin/bash

# ----------------------------------------------------------------
# LOAD HPO (Disease to Phenotypes)
# ----------------------------------------------------------------
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null && pwd )"
TAB=$DIR/download/phenotype.hpoa
TEMPLATE=$DIR/db/hpo_disease.template

printf "+ Loading in HPO Annotations (Disease to Phenotypes)\n"
printf "*********************************************************** \n"
mkdir -p $DIR/download $DIR/sql

# Download Annotations
wget http://purl.obolibrary.org/obo/hp/hpoa/phenotype.hpoa -O $TAB

# Fix Header (remove comment and format header to valid csv)
# then send to psql to load the database using the template
sed -e '/^[ \t]*#/d' $TAB \
 | psql -d genome_diver --quiet -f $TEMPLATE 

printf "Done! \n\n"
