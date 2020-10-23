#!/bin/bash
printf "Bootstrapping Genome Diver Schema on Postgres...\n\n"
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null && pwd )"

# hack! deployed service only, access to dropdb, createdb
PATH="$PATH:/usr/pgsql-11/bin/"

# Kick all users - need to add/remove schema
printf "+ Kicking Existing Users and Reloading DB \n"
printf "*********************************************************** \n"
psql -d genome_diver --quiet -f $DIR/GenomeDiver/kickusers.pgsql

# Reload Database and re-create all tables
printf "+ Building GenomeDiver Schema \n"
printf "*********************************************************** \n"
dropdb  genome_diver
createdb genome_diver
psql -d genome_diver --quiet -f $DIR/GenomeDiver/diver.pgsql
printf "Done!\n\n"

# Load HPO ontology
bash $DIR/HPOOntology/load.sh

# load HPO annotations (gene to phenotype) references ontology
bash $DIR/HPOAnnotation/load.sh

# load HPO annotations (disease to phenotype) references ontology
bash $DIR/HPODiseases/load.sh