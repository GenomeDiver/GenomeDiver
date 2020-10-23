import os
import sys
import re
import pronto
from pathlib import Path

def get_script_path():
    return os.path.dirname(os.path.realpath(sys.argv[0]))

owl_source = "https://raw.githubusercontent.com/obophenotype/human-phenotype-ontology/master/hp.owl"
owl_file = Path("{}/download/hp.owl".format(get_script_path()))

print ("\nLoading the HPO from Source")
if not Path(owl_file).exists():
    print ("Downloading the HPO file in OWL format")
    os.system("mkdir -p ./download && wget -nc {} -P {}/download"
              .format(owl_source, get_script_path()))
    print ("\tDownload complete")
else:
    print ("\tOntology file exists: {}".format(str(owl_file.resolve())))

print ("\nParsing the HPO Ontology [pronto]")
ont = pronto.Ontology(str(owl_file.resolve()))

print ("\tParsing complete")
print ("\tGenerating Schema")

fh = open("{}/sql/ontology.generated.pgsql".format(get_script_path()), 'w')

fh.write("""
    SET client_min_messages TO WARNING;
    
    DROP TABLE IF EXISTS gd.hpo_ont CASCADE;
    DROP TABLE IF EXISTS gd.hpo_ont_is_a CASCADE;
    DROP TABLE IF EXISTS gd.hpo_ont_can_be CASCADE; 
    
    -- Ontology := Term
    CREATE TABLE gd.hpo_ont (
        id                  BIGSERIAL       PRIMARY KEY,
        hpo_id              text            UNIQUE NOT NULL, 
        name                text            NULL,
        description         text            NULL,
        name_vector         TSVECTOR,
        description_vector  TSVECTOR,
        synonyms_vector     TSVECTOR,
        synonyms            text            NULL
    );
    
    -- Ontology := Term := Relationship('is_a') 
    -- 
    CREATE TABLE gd.hpo_ont_is_a (
        lid                 text            REFERENCES gd.hpo_ont(hpo_id),
        rid                 text            REFERENCES gd.hpo_ont(hpo_id) 
    );
    
    -- Ontology := Term := Relationship('can_be') 
    --
    CREATE TABLE gd.hpo_ont_can_be (
        lid                 text            REFERENCES gd.hpo_ont(hpo_id),
        rid                 text            REFERENCES gd.hpo_ont(hpo_id) 
    );
    
    -- Create Index 
    CREATE UNIQUE INDEX hpo_id_indx ON gd.hpo_ont(hpo_id);
""")

def str_fmt(val):
    val = val.replace('\\n', ' ').replace("'", r"''")
    return "\'{}\'".format(val)

def str_none(val):
    if len(val) == 0:
        return "NULL"
    return str_fmt(val)

# TODO: this is weird, investigate
def strip_brackets(val):
    if val:
        return re.sub("^\[(\'|\")", "", re.sub("(\'|\")\]$", "", val))
    return val

print ("\tBuilding Ontology Terms")
for term in ont:
    # TODO is desc sometimes a list??
    # TODO: figure out synonyms as ARRAY of TEXT
    # https://pronto.readthedocs.io/en/latest/pronto/pronto.Term.html#pronto.Term

    in_query = \
        """ INSERT INTO gd.hpo_ont(hpo_id, name, description, synonyms) VALUES (%s, %s, %s, %s);
        """

    fh.write(in_query % (str_none(term.id),
                         str_none(term.name),
                         str_none(strip_brackets(term.desc)),
                         str_none(', '.join(map(lambda x:x.desc, term.synonyms)))))

# [2nd pass] build all the relationships
print ("\tBuilding Ontology Relationships")
for term in ont:
    for rel in term.relations.keys():
        for rel_term in term.relations[rel]:
            in_query = """INSERT INTO gd.hpo_ont_{} (lid, rid) VALUES (%s, %s);
                       """ .format(rel.obo_name)
            fh.write(in_query % (str_none(term.id), str_none(rel_term.id)))

fh.write(""" 
    UPDATE gd.hpo_ont SET name_vector        = to_tsvector('simple', name);
    UPDATE gd.hpo_ont SET description_vector = to_tsvector('english', description);
    UPDATE gd.hpo_ont SET synonyms_vector    = to_tsvector('simple', synonyms);

    CREATE INDEX name_vector_idx ON gd.hpo_ont USING GIST(name_vector);
    CREATE INDEX description_vector_idx ON gd.hpo_ont USING GIST(description_vector);
    CREATE INDEX synonyms_vector_idx ON gd.hpo_ont USING GIST(synonyms_vector);

    GRANT ALL PRIVILEGES ON SCHEMA gd TO diver;
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA gd TO diver;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA gd TO diver;
    GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA gd TO diver;
    ALTER TABLE gd.hpo_ont OWNER TO diver;
    ALTER TABLE gd.hpo_ont_can_be OWNER TO diver;
    ALTER TABLE gd.hpo_ont_is_a OWNER TO diver;
""")

fh.close()

print ('\n.... Finished !\n')
sys.exit()
