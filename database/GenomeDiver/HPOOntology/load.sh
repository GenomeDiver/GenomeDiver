#!/bin/bash

# ----------------------------------------------------------------
# LOAD HPO (Ontology)
# ----------------------------------------------------------------
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null && pwd )"
OUTPUT=$DIR/sql/ontology.generated.pgsql

printf "+ Loading in HPO Ontology\n"
printf "*********************************************************** \n"
mkdir -p $DIR/download $DIR/sql

printf "Building Ontology (OWL)\n"
python3 -c 'import sys; print (sys.real_prefix)' 2>/dev/null && deactivate
python3 -m venv $DIR/.env
source $DIR/.env/bin/activate
python3 -m pip install --upgrade pip
pip install -r $DIR/requirements.txt
python3  $DIR/build_ontology.py
deactivate

# run generated template
psql -d genome_diver --quiet -f $OUTPUT

printf "Done!\n\n"