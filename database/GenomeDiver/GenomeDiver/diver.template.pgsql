SET client_min_messages TO WARNING;

-- GENOME DIVER: Database Schema
-- =========================================================================================
CREATE SCHEMA IF NOT EXISTS gd;


-- Institution Table
-- =========================================================================================
CREATE TABLE gd.institution (
    id                         BIGSERIAL     PRIMARY KEY,
    type                       TEXT          NOT NULL CHECK(type <> ''),
    name                       TEXT          NOT NULL CHECK(name <> ''),
    active                     BOOLEAN       NOT NULL DEFAULT TRUE
);

-- User Table
-- =========================================================================================
CREATE TABLE gd.user (
    id                         BIGSERIAL     PRIMARY KEY,
    username                   TEXT          NOT NULL UNIQUE            CHECK (username <> ''),
    first_name                 TEXT          NOT NULL                   CHECK (first_name <> ''),
    last_name                  TEXT          NOT NULL                   CHECK (last_name <> ''),
    mobile                     TEXT          NOT NULL DEFAULT '',
    role                       TEXT          DEFAULT 'UNKNOWN',
    active                     BOOLEAN       NOT NULL DEFAULT TRUE,
    email                      TEXT          NOT NULL UNIQUE            CHECK (email <> ''),
    password                   TEXT          NOT NULL,
    registration_status        TEXT,
    forgotten_status           TEXT,
    registration_time          timestamp,
    forgotten_time             timestamp
);

-- Patient Table
-- =========================================================================================
CREATE TABLE gd.patient (
    id                         BIGSERIAL    PRIMARY KEY,
    first_name_enc             TEXT         NOT NULL            CHECK(first_name_enc <> ''),
    last_name_enc              TEXT         NOT NULL            CHECK(last_name_enc <> ''),
    sex                        TEXT         NOT NULL            DEFAULT 'UNKNOWN',
    mrn_id_enc                 TEXT         NOT NULL            CHECK(mrn_id_enc <> ''),
    physician_first_name       TEXT         NOT NULL            CHECK(physician_first_name <> ''),
    physician_last_name        TEXT         NOT NULL            CHECK(physician_last_name <> ''),
    physician_email            TEXT         DEFAULT             '',
    gc_first_name              TEXT         DEFAULT             '',
    gc_last_name               TEXT         DEFAULT             '',
    gc_email                   TEXT         DEFAULT             '',
    date_of_birth              date         NOT NULL            CHECK(date_of_birth < date_of_report),
    date_of_report             date         NOT NULL            CHECK(date_of_report > date_of_birth),
    status                     TEXT         NOT NULL            DEFAULT 'CREATED',
    active                     BOOLEAN      NOT NULL            DEFAULT TRUE,
    UNIQUE                     (first_name_enc, last_name_enc, mrn_id_enc)
);

CREATE TABLE gd.patient_history (
    db_op                      TEXT         NOT NULL,
    time                       timestamp    NOT NULL,
    patient_id                 BIGSERIAL                        REFERENCES gd.patient(id),
    first_name_enc             TEXT         NOT NULL            CHECK(first_name_enc <> ''),
    last_name_enc              TEXT         NOT NULL            CHECK(last_name_enc <> ''),
    mrn_id_enc                 TEXT         NOT NULL            CHECK(mrn_id_enc <> ''),
    physician_first_name       TEXT         NOT NULL            CHECK(physician_first_name <> ''),
    physician_last_name        TEXT         NOT NULL            CHECK(physician_last_name <> ''),
    physician_email            TEXT         DEFAULT             '',
    gc_first_name              TEXT         DEFAULT             '',
    gc_last_name               TEXT         DEFAULT             '',
    gc_email                   TEXT         DEFAULT             '',
    date_of_birth              date         NOT NULL            CHECK(date_of_birth < date_of_report),
    date_of_report             date         NOT NULL            CHECK(date_of_report > date_of_birth),
    status                     TEXT         NOT NULL            DEFAULT 'CREATED',
    active                     BOOLEAN      NOT NULL            DEFAULT TRUE
);

CREATE OR REPLACE FUNCTION process_patient_history() RETURNS TRIGGER AS $patient_history$
    BEGIN
        IF (TG_OP = 'UPDATE') THEN
            INSERT INTO gd.patient_history SELECT 'U', NOW(), NEW.id, NEW.first_name_enc, NEW.last_name_enc, NEW.mrn_id_enc,
            NEW.physician_first_name, NEW.physician_last_name, NEW.physician_email,
            NEW.gc_first_name, NEW.gc_last_name, new.gc_email,
            NEW.date_of_birth,NEW.date_of_report, NEW.status, NEW.active;
            RETURN NEW;
        ELSIF (TG_OP = 'INSERT') THEN
            INSERT INTO gd.patient_history SELECT 'I', NOW(), NEW.id, NEW.first_name_enc, NEW.last_name_enc, NEW.mrn_id_enc,
            NEW.physician_first_name, NEW.physician_last_name, NEW.physician_email,
            NEW.gc_first_name, NEW.gc_last_name, new.gc_email,
            NEW.date_of_birth, NEW.date_of_report, NEW.status, NEW.active;
            RETURN NEW;
        END IF;
        RETURN NULL;
    END;
$patient_history$ LANGUAGE plpgsql;

CREATE TRIGGER patient_history AFTER UPDATE OR INSERT OR DELETE ON gd.patient
FOR EACH ROW EXECUTE FUNCTION process_patient_history();


-- Analysis Table
-- =========================================================================================

CREATE TABLE gd.case (
    id                         BIGSERIAL    PRIMARY KEY,
    patient_id                 BIGSERIAL    REFERENCES gd.patient(id),
    name                       TEXT         NOT NULL            CHECK(name <> ''),
    active                     BOOLEAN      DEFAULT TRUE
);

CREATE TABLE gd.analysis (
    id                         BIGSERIAL    PRIMARY KEY,
    case_id                    BIGSERIAL    REFERENCES gd.case(id),
    time_started               timestamp    NOT NULL            DEFAULT now(),
    time_completed             timestamp,
    pipeline                   TEXT         NOT NULL            CHECK(pipeline <> ''),
    status                     TEXT         NOT NULL            DEFAULT 'CREATED',
    comment                    TEXT         NOT NULL            DEFAULT ''
);

--- the traversal of a dependencies is essentially a "Dive"
CREATE TABLE gd.analysis_graph (
    parent                      BIGSERIAL    REFERENCES gd.analysis(id),
    child                       BIGSERIAL    REFERENCES gd.analysis(id)
);

CREATE TABLE gd.analysis_input (
    id                          BIGSERIAL   PRIMARY KEY,
    analysis_id                 BIGSERIAL   REFERENCES gd.analysis(id),
    name                        TEXT        NOT NULL,
    value                       TEXT        NOT NULL
);

CREATE TABLE gd.analysis_status_history (
    analysis_id                 BIGSERIAL   REFERENCES gd.analysis(id),
    time                        timestamp   NOT NULL,
    status                      TEXT        NOT NULL
);

CREATE OR REPLACE FUNCTION process_analysis_history() RETURNS TRIGGER AS $analysis_history$
    BEGIN
        IF (TG_OP = 'UPDATE') OR (TG_OP = 'INSERT') THEN
            INSERT INTO gd.analysis_status_history (analysis_id, time, status)
            VALUES (NEW.id, now(), NEW.status);
            RETURN NEW;
        END IF;
        RETURN NULL;
    END;
$analysis_history$ LANGUAGE plpgsql;

CREATE TRIGGER analysis_history AFTER UPDATE OR INSERT ON gd.analysis
FOR EACH ROW EXECUTE FUNCTION process_analysis_history();


-- Phenotypes in one-to-many Relationship with Patient
-- =========================================================================================

CREATE TABLE gd.phenotype (
    id                         BIGSERIAL   PRIMARY KEY,
    patient_id                 BIGSERIAL   REFERENCES gd.patient(id),
    created_by                 TEXT        NOT NULL DEFAULT 'UNKNOWN',
    important                  BOOLEAN     DEFAULT FALSE,
    category                   TEXT        NOT NULL DEFAULT 'UNASSIGNED',
    user_defined               TEXT        NOT NULL,
    hpo_id                     TEXT        NOT NULL,
    hpo_term                   TEXT        NOT NULL
);

CREATE TABLE gd.phenotype_history (
   db_op                       TEXT        NOT NULL,
   time                        timestamp   NOT NULL,
   phenotype_id                BIGSERIAL   REFERENCES gd.phenotype(id) ON DELETE CASCADE,
   created_by                  TEXT        NOT NULL DEFAULT 'UNKNOWN',
   important                   BOOLEAN     DEFAULT FALSE,
   category                    TEXT        NOT NULL DEFAULT 'UNKNOWN',
   user_defined                TEXT        NOT NULL,
   hpo_id                      TEXT        NOT NULL
);

CREATE OR REPLACE FUNCTION process_phenotype_history() RETURNS TRIGGER AS $phenotype_history$
    BEGIN
        IF (TG_OP = 'INSERT') THEN
            INSERT INTO gd.phenotype_history
            SELECT 'I', now(), NEW.id, NEW.created_by, NEW.important, NEW.category, NEW.user_defined, NEW.hpo_id;
            RETURN NEW;
        ELSIF (TG_OP = 'UPDATE') THEN
            INSERT INTO gd.phenotype_history
            SELECT 'U', now(), NEW.id, NEW.created_by, NEW.important, NEW.category, NEW.user_defined, NEW.hpo_id;
            RETURN NEW;
        END IF;
        RETURN NULL;
    END;
$phenotype_history$ LANGUAGE plpgsql;

CREATE TRIGGER phenotype_history AFTER INSERT OR UPDATE OR DELETE on gd.phenotype
FOR EACH ROW EXECUTE FUNCTION process_phenotype_history();


-- Variant Impact Table
-- =========================================================================================

CREATE TABLE gd.variant_association (
    id                         BIGSERIAL   PRIMARY KEY,
    analysis_id                BIGSERIAL   REFERENCES gd.analysis (id),
    hgvs_variant               TEXT        NOT NULL,
    zygosity                   TEXT        NOT NULL,
    variant_effect             TEXT        NOT NULL,
    gene                       TEXT        NOT NULL,
    diseases                   TEXT        NOT NULL,
    gene_pheno_score           NUMERIC,
    combined_score             NUMERIC,
    delta_combined_score       NUMERIC
  );

-- Disease Association Table
-- =========================================================================================
CREATE TABLE gd.disease_association (
    id                         BIGSERIAL   PRIMARY KEY,
    analysis_id                BIGSERIAL   REFERENCES gd.analysis (id),
    disease                    TEXT        NOT NULL,
    UNIQUE                     (analysis_id, disease)
);

-- Relationship table between Users / Institutions
-- =========================================================================================

CREATE TABLE gd.user_membership (
    user_id                    BIGSERIAL   REFERENCES gd.user(id),
    institution_id             BIGSERIAL   REFERENCES gd.institution(id),
    status                     TEXT        NOT NULL DEFAULT 'UNVERIFIED',
    UNIQUE                     (user_id, institution_id)
);


-- Relationship table between Patients and Institutions
-- =========================================================================================

CREATE TABLE gd.patient_membership (
    patient_id                 BIGSERIAL   REFERENCES gd.patient(id),
    institution_id             BIGSERIAL   REFERENCES gd.institution(id)
);


-- Relationship table between Phenotypes and Analysis
-- =========================================================================================

CREATE TABLE gd.phenotype_membership (
    phenotype_id                BIGSERIAL   REFERENCES gd.phenotype(id) ON DELETE CASCADE,
    analysis_id                 BIGSERIAL   REFERENCES gd.analysis(id)
);


-- Audit Tables
-- =========================================================================================

CREATE TABLE gd.hipaa_audit (
    user_name                  TEXT NOT NULL,
    patient_id                 INTEGER,
    action                     TEXT NOT NULL,
    value                      TEXT,
    action_tstamp              TIMESTAMP WITH TIME zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- Create Indices
-- =========================================================================================

CREATE INDEX pheno_names ON gd.phenotype(hpo_term);
CREATE INDEX pheno_id ON gd.phenotype(hpo_id);
CREATE INDEX pheno_history ON gd.phenotype_history(time);

CREATE INDEX analysis_start ON gd.analysis(time_started);
CREATE INDEX analysis_completed ON gd.analysis(time_completed);
CREATE INDEX analysis_history ON gd.analysis_status_history(time);

CREATE INDEX audit_patients ON gd.hipaa_audit(patient_id);


-- Permissions with respect to database
-- =========================================================================================

REVOKE ALL PRIVILEGES ON DATABASE genome_diver FROM diver;
REVOKE ALL PRIVILEGES ON SCHEMA public FROM diver;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM diver;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM diver;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM diver;

REVOKE ALL PRIVILEGES ON SCHEMA gd FROM diver;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA gd FROM diver;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA gd FROM diver;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA gd FROM diver;

DROP USER diver;
CREATE ROLE diver WITH PASSWORD '<databse password>';

GRANT CONNECT ON DATABASE genome_diver TO diver;
GRANT ALL PRIVILEGES ON DATABASE genome_diver TO diver;
GRANT ALL PRIVILEGES ON SCHEMA gd TO diver;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA gd TO diver;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA gd TO diver;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA gd TO diver;

ALTER ROLE diver WITH LOGIN;
ALTER SCHEMA gd OWNER TO diver;
ALTER ROLE diver SET search_path = gd;

ALTER TABLE gd.patient OWNER TO diver;
ALTER TABLE gd.patient_history OWNER TO diver;
ALTER TABLE gd.phenotype OWNER TO diver;
ALTER TABLE gd.phenotype_membership OWNER TO diver;
ALTER TABLE gd.phenotype_history OWNER TO diver;
ALTER TABLE gd.user OWNER TO diver;
ALTER TABLE gd.institution OWNER TO diver;
ALTER TABLE gd.user_membership OWNER TO diver;
ALTER TABLE gd.patient_membership OWNER TO diver;
ALTER TABLE gd.variant_association OWNER TO diver;
ALTER TABLE gd.disease_association OWNER TO diver;
ALTER TABLE gd.case OWNER TO diver;
ALTER TABLE gd.analysis OWNER TO diver;
ALTER TABLE gd.analysis_graph OWNER TO diver;
ALTER TABLE gd.analysis_input OWNER TO diver;
ALTER TABLE gd.analysis_status_history OWNER TO diver;
ALTER TABLE gd.hipaa_audit OWNER TO diver;
ALTER DATABASE genome_diver OWNER TO diver;