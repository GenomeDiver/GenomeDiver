#!/bin/bash

# ----------------------------------------------------------------
# LOAD HPO (Disease to Phenotypes)
# ----------------------------------------------------------------
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null && pwd )"
TAB=$DIR/download/phenotype.hpoa
TEMPLATE=$DIR/db/hpo_disease.template
OUTPUT=$DIR/sql/hpo_disease.generated.pgsql

printf "+ Loading in HPO Annotations (Disease to Phenotypes)\n"
printf "*********************************************************** \n"
mkdir -p $DIR/download $DIR/sql

# Download Annotations
wget http://compbio.charite.de/jenkins/job/hpo.annotations.current/lastSuccessfulBuild/artifact/current/phenotype.hpoa -O $TAB

# Fix Header (remove comment and format header to valid csv)
sed -i '' -e '/^[ \t]*#/d' $TAB

# Generate SQL from template and newly generated data file
sed -e "s/%DIR%/${TAB//\//\\/}/g" $TEMPLATE > $OUTPUT

# run generated template
psql -d genome_diver --quiet -f $OUTPUT

printf "Done! \n\n"