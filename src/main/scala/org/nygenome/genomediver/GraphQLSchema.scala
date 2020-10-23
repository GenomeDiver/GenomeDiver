package org.nygenome.genomediver

// JOOQ
import org.joda.time.DateTime
import org.joda.time.format.ISODateTimeFormat
import org.nygenome.genomediver.context.GraphQLContext
import org.nygenome.genomediver.models._
import org.nygenome.genomediver.validation._

// Sangria! (GraphQL)
import sangria.execution.deferred._
import sangria.macros.derive.ReplaceField
import sangria.ast
import sangria.marshalling.DateSupport

// Sangria: import all Schema related Objects.
// Aliasing some objects to avoid confusion with Scala
// ----------------------------------------------------
import sangria.schema.{
  InterfaceType   => GqlInterface,
  StringType      => GqlString,
  Argument        => GqlArgument,
  Field           => GqlField,
  BooleanType     => GqlBoolean,
  LongType        => GqlLong,
  FloatType       => GqlFloat,
  ListInputType   => GqlListInput,
  ListType        => GqlList,
  ObjectType      => GqlObject,
  OptionType      => GqlOption,
  OptionInputType => GqlOptionInput,
  Schema          => GqlSchema,
  fields          => gqlFields,
  ScalarType      => GqlScalar,
  EnumType        => GqlEnum,
  EnumValue       => GqlEnumV
}
import sangria.macros.derive
import sangria.macros.derive._

object GraphQLSchema {

  /* --------------------------------------------------------------
   Definitions

  - phenotypes      (Sangria) a deferred mechanism to avoid N+1 queries
  - PhenotypeType   (GraphQL Schema Definition) the public GraphQL/Sangria definition for Phenotype
  - PatientType     (GraphQL Schema Definition) the public GraphQL/Sangria definition for Patient

  * Schema IS what is exposed, wraps other objects and context functions
  * PhenotypeType is really just a derivation of the case class as specified in the models
  * PatientType is a little more interesting as contains a one-to-many relationship with phenotypes

  --------------------------------------------------------------- */

  // Query arguments
  val id = GqlArgument("patient_id", GqlOptionInput(GqlListInput(GqlLong)))
  var mrn = GqlArgument("patient_mrn", GqlOptionInput(GqlListInput(GqlString)))
  val genes = GqlArgument("genes", GqlOptionInput(GqlListInput(GqlString)))
  val hpo_ids = GqlArgument("hpo_ids", GqlOptionInput(GqlListInput(GqlString)))
  val search_term = GqlArgument("search_term", GqlString)
  val disease_id  = GqlArgument("disease_id", GqlListInput(GqlString))

  // Root Interface for supporting tables with "id" in their fields
  val IdentifiableType = GqlInterface(
    "Identifiable",
    gqlFields[GraphQLContext, Identifiable](GqlField("id", GqlLong, resolve = _.value.id))
  )

  lazy val CategoryEnum = GqlEnum(
    "CategoryEnum", Some("Confidence of Phenotype association"),
    List(
      GqlEnumV("UNASSIGNED", value = "UNASSIGNED",   description = Some("Unassigned confidence in phenotype association")),
      GqlEnumV("PRESENT",    value = "PRESENT",      description = Some("High confidence in phenotype association")),
      GqlEnumV("ABSENT",     value = "ABSENT",       description = Some("Not confident in association")),
      GqlEnumV("UNKNOWN",    value = "UNKNOWN",      description = Some("Unknown confidence in association"))
    )
  )

  lazy val EntityEnum = GqlEnum(
    "EntityEnum", Some("Roles which can report phenotype"),
    List(
      GqlEnumV("LAB",         value = "LAB",          description = Some("Laboratory User")),
      GqlEnumV("CAREGIVER",   value = "CAREGIVER",    description = Some("Clinic User")),
      GqlEnumV("GENOMEDIVER", value = "GENOMEDIVER",  description = Some("Program User"))
    )
  )

  lazy val AnalysisEnum = GqlEnum(
    "AnalysisEnum", Some("Valid Pipelines that can be ran on the patient"),
    List(
      GqlEnumV("FIRST_RUN",   value = "FIRST_RUN",    description = Some("Variant Prioritized Run & Filter. Results in recommended phenotypes")),
      GqlEnumV("SECOND_RUN",  value = "SECOND_RUN",   description = Some("Refined Run. Results in recommended variants"))
    )
  )

  lazy val ReferenceEnum = GqlEnum(
    "ReferenceEnum", Some("Supported reference assembly"),
    List(
      GqlEnumV("GRCH37",  value = "GRCH37",     description = Some("GRCh37 reference (hg19)")),
      GqlEnumV("GRCH38",  value = "GRCH38",     description = Some("GRCh38 reference (hg38)"))
    )
  )

  lazy val SexEnum = GqlEnum(
    "SexEnum", Some("Sequenced Sex"),
    List(
      GqlEnumV("FEMALE",   value = "FEMALE",    description = Some("Patient is Female")),
      GqlEnumV("MALE",     value = "MALE",      description = Some("Patient is Male")),
      GqlEnumV("UNKNOWN",  value = "UNKNOWN",   description = Some("Patient Sex is Unknown/Unspecified"))
    )
  )

  lazy val AnalysisStatusEnum = GqlEnum(
    "AnalysisStatusEnum", Some("Valid Pipeline statuses"),
    List(
      GqlEnumV("CREATED",   value = "CREATED",   description = Some("Analysis has been created. Awaiting inputs to be committed.")),
      GqlEnumV("QUEUED",    value = "QUEUED",    description = Some("Analysis inputs have been committed. Analysis is now queued for run.")),
      GqlEnumV("RUNNING",   value = "RUNNING",   description = Some("Analysis is running. The scheduler will be actively monitoring for changes.")),
      GqlEnumV("COMPLETE",  value = "COMPLETE",  description = Some("Analysis has successfully completed. Awaiting outputs to be committed.")),
      GqlEnumV("DONE",      value = "DONE",      description = Some("Outputs of a completed analysis run has been committed.")),
      GqlEnumV("CONFIRMED", value = "CONFIRMED", description = Some("Analysis has been confirmed by the caregiver")),
      GqlEnumV("REANALYSIS",value = "REANALYSIS",description = Some("Reanalysis has been requested by the caregiver")),
      GqlEnumV("DISABLED",  value = "DISABLED",  description = Some("Analysis has been disabled (usually via manual intervention")),
      GqlEnumV("ERROR",     value = "ERROR",     description = Some("Analysis is halted at after an unrecoverable error"))
    )
  )

  lazy val DateTimeType: GqlScalar[DateTime] = GqlScalar[DateTime]("DateTime",
    coerceOutput = (d, caps) =>
      if (caps.contains(DateSupport)) d.toDate
      else ISODateTimeFormat.dateTime().print(d),
    coerceUserInput = {
      case s: String => parseDate(s)
      case _ ⇒ Left(DateCoercionViolation)
    },
    coerceInput = {
      case ast.StringValue(s, _, _, _, _) => parseDate(s)
      case _ ⇒ Left(DateCoercionViolation)
    })

  // Institution associations are the basis of authorization between the user
  // and the patient.
  lazy val InstitutionType: GqlObject[Unit, Institution] =
  derive.deriveObjectType[Unit, Institution](
    Interfaces(IdentifiableType),
    ObjectTypeDescription("Institution"),
    AddFields(
      GqlField(
        "users",
        GqlList(SuccinctUserType),
        description = Option("Users belonging to institution"),
        resolve = c => userFetcher.deferRelSeq(usersForInstitutionRel, c.value.id)
      )
    )
  )

  // Patient definition with commonly joined entities as attributes
  lazy val PatientType: GqlObject[Unit, Patient] =
    derive.deriveObjectType[Unit, Patient](
      Interfaces(IdentifiableType),
      ObjectTypeDescription("Patient"),
      AddFields(
        GqlField(
          "phenotypes",
          GqlList(PhenotypeType),
          description = Option("List of phenotypes for patient"),
          resolve = c => phenotypesFetcher.deferRelSeq(phenotypesByPatientRel, c.value.id)
        ),
        GqlField(
          "case",
          GqlList(CaseType),
          description = Option("Current cases associated with the patient"),
          resolve = c => caseFetcher.deferRelSeq(caseByPatientRel, c.value.id)
        ),
        GqlField(
          "institutions",
          GqlList(InstitutionType),
          description = Option("List of institutions associated with the patient"),
          resolve = c => institutionsFetcher.deferRelSeq(institutionsForPatientRel, c.value.id)
        )
      ),
      ReplaceField("date_of_birth", GqlField("date_of_birth", DateTimeType, resolve = c => c.value.date_of_birth)),
      ReplaceField("date_of_report", GqlField("date_of_report", DateTimeType, resolve = c => c.value.date_of_report))
    )

  // An API exposed USER type with authentication fields removed
  lazy val SuccinctUserType: GqlObject[Unit, SuccinctUser] =
    derive.deriveObjectType[Unit, SuccinctUser](
      Interfaces(IdentifiableType),
      ExcludeFields("id"),
      ObjectTypeDescription("Genome Diver User")
    )

  // Case is a container for analysis; it has limited fields (name, active)
  // largely an organizational ("folder") concept for the analysis.
  lazy val CaseType: GqlObject[Unit, Case] =
    derive.deriveObjectType[Unit, Case](
    Interfaces(IdentifiableType),
    ObjectTypeDescription("Case"),
    AddFields(
      GqlField(
        "analysis",
        GqlList(AnalysisType),
        description = Option("Current analyses associated with the patient"),
        resolve = c => analysisFetcher.deferRelSeq(analysisByCaseRel, c.value.id)
      )
    ),
    ExcludeFields("patient_id", "active")
  )

  lazy val AnalysisType: GqlObject[Unit, Analysis] =
    derive.deriveObjectType[Unit, Analysis](
      Interfaces(IdentifiableType),
      ObjectTypeDescription("Analysis"),
      AddFields(
        GqlField(
          "phenotypes",
          GqlList(PhenotypeType),
          description = Option("Phenotypes associated with the analysis"),
          resolve = c => analysisPhenotypeFetcher.deferRelSeq(phenotypesForAnalysisRel, c.value.id)
        ),
        GqlField(
          "input",
          GqlList(AnalysisInputType),
          description = Option("Input for Analysis"),
          resolve = c => analysisInputFetcher.deferRelSeq(analysisInputByAnalysisRel, c.value.id)
        ),
        GqlField(
          "disease_associations",
          GqlList(DiseaseAssociationType),
          description = Option("Diseases associated with the analysis"),
          resolve = c => diseaseAssocFetcher.deferRelSeq(diseaseAssocByAnalysisRel, c.value.id)
        ),
        GqlField(
          "variant_associations",
          GqlList(VariantAssociationType),
          description = Option("Variants associated with the analysis"),
          resolve = c => variantAssocFetcher.deferRelSeq(variantAssocByAnalysisRel, c.value.id)
        ),
      ),
      ExcludeFields("case_id")
    )

  lazy val SuccinctAnalysisType: GqlObject[Unit, SuccinctAnalysis] =
    derive.deriveObjectType[Unit, SuccinctAnalysis](
      Interfaces(IdentifiableType),
      ObjectTypeDescription("Succinct Analysis Format")
    )

  lazy val AnalysisInputType: GqlObject[Unit, AnalysisInput] =
    derive.deriveObjectType[Unit, AnalysisInput](
      Interfaces(IdentifiableType),
      ObjectTypeDescription("Analysis Input Information"),
      ExcludeFields("analysis_id")
    )

  // Create the Phenotype Schema Definition
  lazy val PhenotypeType: GqlObject[Unit, Phenotype] =
    derive.deriveObjectType[Unit, Phenotype](
      Interfaces(IdentifiableType),
      ExcludeFields("patient_id"),
      ObjectTypeDescription("Phenotype"),
      AddFields(
        GqlField(
          "of_analysis",
          GqlList(SuccinctAnalysisType),
          description = Option("Current Analysis associated with phenotype"),
          resolve = c => phenotypeAnalysisFetcher.deferRelSeq(analysisForPhenotypeRel, c.value.id)
        )
      )
    )

  lazy val VariantAssociationType: GqlObject[Unit, VariantAssociation] =
    derive.deriveObjectType[Unit, VariantAssociation](
      Interfaces(IdentifiableType),
      ObjectTypeDescription("Variant and Gene associated with the analysis")
    )

  lazy val DiseaseAssociationType: GqlObject[Unit, DiseaseAssociation] =
    derive.deriveObjectType[Unit, DiseaseAssociation](
      Interfaces(IdentifiableType),
      ObjectTypeDescription("Diseases associated with the analysis")
    )

  // https://github.com/sangria-graphql/sangria-relay/issues/3
  lazy val HPOOntologyType: GqlObject[Unit, HPOOntology] =
    derive.deriveObjectType[Unit, HPOOntology](
      Interfaces(IdentifiableType),
      ExcludeFields("id"),
      ObjectTypeDescription("HPO Ontology Search"),
      ReplaceField("description", GqlField("description", GqlOption(GqlString), resolve = c => c.value.description))
      // ReplaceField("genes", GqlField("genes", GqlOption(GqlString), resolve = c => c.value.genes))
    )

  lazy val HPOGenePhenoType:GqlObject[Unit, HPOGeneToPhenotype] =
    derive.deriveObjectType[Unit, HPOGeneToPhenotype](
      Interfaces(IdentifiableType),
      ExcludeFields("id"),
      ObjectTypeDescription("HPO Annotation (Gene to Phenotype)")
    )

  lazy val HPOAnnotationDiseaseType: GqlObject[Unit, HPOAnnotationDisease] =
    derive.deriveObjectType[Unit, HPOAnnotationDisease](
      Interfaces(IdentifiableType),
      ExcludeFields("id"),
      ObjectTypeDescription("HPO Annotation (Disease) Search")
    )

  lazy val DiseaseGeneType: GqlObject[Unit, DiseaseGeneMap] =
    derive.deriveObjectType[Unit, DiseaseGeneMap]()

  // establish relationship of phenotype to patient via "patient id"
  // "For" ~ many-to-many
  // "By"  ~ one-many

  private val phenotypesByPatientRel      = Relation[Phenotype, Long]("byPatient", p => Seq(p.patient_id))
  private val analysisInputByAnalysisRel  = Relation[AnalysisInput, Long]("byAnalysis", a => Seq(a.analysis_id))
  private val caseByPatientRel            = Relation[Case, Long]("byPatient", p => Seq(p.patient_id))
  private val analysisByCaseRel           = Relation[Analysis, Long]("byCase", p => Seq(p.case_id))
  private val variantAssocByAnalysisRel   = Relation[VariantAssociation, Long]("byAnalysis", a => Seq(a.analysis_id))
  private val diseaseAssocByAnalysisRel   = Relation[DiseaseAssociation, Long]("byAnalysis", a => Seq(a.analysis_id))
  private val institutionsForPatientRel   = Relation[Institution, (Seq[Long], Institution), Long]("PatientInstitutions", _._1, _._2)
  private val usersForInstitutionRel      = Relation[SuccinctUser, (Seq[Long], SuccinctUser), Long]("InstitutionUser", _._1, _._2)
  private val analysisForPhenotypeRel     = Relation[SuccinctAnalysis, (Seq[Long], SuccinctAnalysis), Long]("PhenotypeAnalysis", _._1, _._2)
  private val phenotypesForAnalysisRel    = Relation[Phenotype, (Seq[Long], Phenotype), Long]("AnalysisPhenotype", _._1, _._2)

  private val phenotypesFetcher = Fetcher.relCaching(
    (ctx: GraphQLContext, ids: Seq[Long]) => ctx.phenotypes(ids),
    (ctx: GraphQLContext, ids: RelationIds[Phenotype]) => ctx.phenotypesByPatient(ids(phenotypesByPatientRel))
  )

  private val caseFetcher = Fetcher.relCaching(
    (ctx: GraphQLContext, ids: Seq[Long]) => ctx.cases(ids),
    (ctx: GraphQLContext, ids: RelationIds[Case]) => ctx.caseByPatient(ids(caseByPatientRel))
  )

  private val analysisFetcher = Fetcher.relCaching(
    (ctx: GraphQLContext, ids: Seq[Long]) => ctx.analysis(ids),
    (ctx: GraphQLContext, ids: RelationIds[Analysis]) => ctx.analysisByCase(ids(analysisByCaseRel))
  )

  private val analysisInputFetcher = Fetcher.relCaching(
    (ctx: GraphQLContext, ids: Seq[Long]) => ctx.analysisInput(ids),
    (ctx: GraphQLContext, ids: RelationIds[AnalysisInput]) => ctx.analysisInputByAnalysis(ids(analysisInputByAnalysisRel))
  )

  private val variantAssocFetcher = Fetcher.relCaching(
    (ctx: GraphQLContext, ids: Seq[Long]) => ctx.variantAssociations(ids),
    (ctx: GraphQLContext, ids: RelationIds[VariantAssociation]) => ctx.variantAssociationsByAnalysis(ids(variantAssocByAnalysisRel))
  )

  private val diseaseAssocFetcher = Fetcher.relCaching(
    (ctx: GraphQLContext, ids: Seq[Long]) => ctx.diseaseAssociations(ids),
    (ctx: GraphQLContext, ids: RelationIds[DiseaseAssociation]) => ctx.diseaseAssociationsByAnalysis(ids(diseaseAssocByAnalysisRel))
  )

  private val institutionsFetcher = Fetcher.relCaching(
    (ctx: GraphQLContext, ids: Seq[Long]) => ctx.institutions(ids),
    (ctx: GraphQLContext, ids: RelationIds[Institution]) => ctx.institutionsForPatient(ids(institutionsForPatientRel))
  )

  private val phenotypeAnalysisFetcher = Fetcher.relCaching(
    (ctx: GraphQLContext, ids: Seq[Long]) => ctx.succinctAnalysis(ids),
    (ctx: GraphQLContext, ids: RelationIds[SuccinctAnalysis]) => ctx.analysisForPhenotype(ids(analysisForPhenotypeRel))
  )

  private val analysisPhenotypeFetcher = Fetcher.relCaching(
    (ctx:GraphQLContext, ids:Seq[Long]) => ctx.phenotypes(ids),
    (ctx:GraphQLContext, ids:RelationIds[Phenotype]) => ctx.phenotypeForAnalysis(ids(phenotypesForAnalysisRel))
  )

  private val userFetcher = Fetcher.relCaching(
    (ctx: GraphQLContext, ids: Seq[Long]) => ctx.succinctUsers(ids),
    (ctx: GraphQLContext, ids: RelationIds[SuccinctUser]) => ctx.succinctUsersForInstitution(ids(usersForInstitutionRel))
  )

  // Bind defined Fetchers to DeferredResolver
  val Resolver: DeferredResolver[GraphQLContext] = DeferredResolver.fetchers(
    phenotypesFetcher, caseFetcher, analysisFetcher, phenotypeAnalysisFetcher, analysisPhenotypeFetcher,
    analysisInputFetcher, institutionsFetcher, variantAssocFetcher, diseaseAssocFetcher, userFetcher)

  /* -------------------------------------------------------------
   Query Section
      - entities that can be queried.
   --------------------------------------------------------------- */
  lazy val query: GqlObject[GraphQLContext, Unit] =
    GqlObject(
      name = "Query",
      fields = gqlFields[GraphQLContext, Unit](
        GqlField(
          name = "institutions",
          fieldType = GqlList(InstitutionType),
          description = Option("Shows a list of institutions [Auth Required]"),
          resolve = cc => cc.ctx.institutions()
        ),
        GqlField(
          name = "patients",
          fieldType = GqlList(PatientType),
          arguments = List(id, mrn),
          description = Option("Shows a list of patients [Auth Required]"),
          resolve = cc => cc.ctx.patients(cc.arg(id), cc.arg(mrn))
        ),
        GqlField(
          name = "analysis",
          fieldType = GqlList(AnalysisType),
          arguments = List(patientId, analysisId),
          description = Option("Shows a specific analysis for a patient [Auth Required]"),
          resolve = cc => cc.ctx.analysisDetail(cc.arg(patientId), cc.arg(analysisId))
        ),
        GqlField(
          name = "disease_gene",
          fieldType = GqlList(DiseaseGeneType),
          arguments = List(patientId, analysisId),
          description = Option("Show Disease to Genes for an analysis [Auth Required]"),
          resolve = cc => cc.ctx.disease_gene_map(cc.arg(patientId), cc.arg(analysisId))
        ),
        GqlField(
          name = "hpo_ontology",
          fieldType = GqlList(HPOOntologyType),
          arguments = List(search_term),
          description = Option("HPO Ontology Search [Public Information]"),
          resolve = cc => cc.ctx.ontology(cc.arg(search_term))
        ),
        GqlField(
          name="hpo_gene_phenotype",
          fieldType = GqlList(HPOGenePhenoType),
          arguments = List(genes, hpo_ids),
          description = Option("HPO terminology (Gene => Phenotype) [Public Information]"),
          resolve = cc => cc.ctx.gene_phenotype(cc.arg(genes), cc.arg(hpo_ids))
        ),
        GqlField(
          name = "hpo_disease",
          fieldType = GqlList(HPOAnnotationDiseaseType),
          arguments = List(disease_id),
          description = Option("HPO Annotations (Disease) [Public Information]"),
          resolve = cc => cc.ctx.disease_annotation(cc.arg(disease_id))
        )
      )
    )
  /* -------------------------------------------------------------
    Mutation Section
        - createPatient: insert a [Patient] into the database
        - addPhenotype: insert a [Phenotype[ into the database
          depends on patient_id

        * JOOQ depends on POSTGRES: RETURNING for the response row,
          this is an interesting point as Sangria *expects* the ORM
          to return the SQL INSERT to return the row. This may not
          be supported on all databases.
   -------------------------------------------------------------- */

  // Create
  val firstNameEncArg = GqlArgument("first_name_enc", GqlString)
  val lastNameEncArg = GqlArgument("last_name_enc", GqlString)
  val sexArg = GqlArgument("sex", GqlString)
  val mrnIDEncArg = GqlArgument("mrn_id_enc", GqlString)
  val labArg = GqlArgument("lab_id", GqlLong)
  val clinicArg = GqlArgument("clinic_id", GqlLong)
  val physicianFirstNameArg = GqlArgument("physician_first_name", GqlString)
  val physicianLastNameArg = GqlArgument("physician_last_name", GqlString)
  val physicianEmailArg = GqlArgument("physician_email", GqlOptionInput(GqlString))
  val gcFirstNameOptArg = GqlArgument("gc_first_name", GqlOptionInput(GqlString))
  val gcLastNameOptArg = GqlArgument("gc_last_name", GqlOptionInput(GqlString))
  val gcEmailOptArg = GqlArgument("gc_email", GqlOptionInput(GqlString))
  val dateOfBirthArg = GqlArgument("date_of_birth", DateTimeType)
  val dateOfReportArg = GqlArgument("date_of_report", DateTimeType)
  val caseArg = GqlArgument("case", GqlString)

  // Edit
  val firstNameEncOptArg = GqlArgument("first_name_enc", GqlOptionInput(GqlString))
  val lastNameEncOptArg = GqlArgument("last_name_enc", GqlOptionInput(GqlString))
  val sexOptArg = GqlArgument("sex", GqlOptionInput(GqlString))
  val mrnIDEncOptArg = GqlArgument("mrn_id_enc", GqlOptionInput(GqlString))
  val physicianFirstNameOptArg = GqlArgument("physician_first_name", GqlOptionInput(GqlString))
  val physicianLastNameOptArg = GqlArgument("physician_last_name", GqlOptionInput(GqlString))
  val physicianEmailOptArg = GqlArgument("physician_email", GqlOptionInput(GqlString))
  val dateOfBirthOptArg = GqlArgument("date_of_birth", GqlOptionInput(DateTimeType))
  val dateOfReportOptArg = GqlArgument("date_of_report", GqlOptionInput(DateTimeType))

  // Phenotype
  val phenotypeId = GqlArgument("phenotype_id", GqlLong)
  val variantAssociationId = GqlArgument("variant_assoc_id", GqlLong)
  val variantAssociationFlag = GqlArgument("caregiver_flag", GqlBoolean)
  val patientId = GqlArgument("patient_id", GqlLong)
  val patientStatus = GqlArgument("status", GqlString)
  val isImportant = GqlArgument("important", GqlOptionInput(GqlBoolean))
  val createdBy = GqlArgument("created_by", EntityEnum)
  val category = GqlArgument("category", GqlOptionInput(CategoryEnum))
  val userDefinedArg = GqlArgument("user_defined", GqlString)
  val hpoIdArg = GqlArgument("hpo_id", GqlString)

  // Case/Analysis
  val caseId = GqlArgument("case_id", GqlLong)
  val caseNameArg = GqlArgument("case_name", GqlString)
  val analysisId = GqlArgument("analysis_id", GqlLong)
  val analysisIdOptional = GqlArgument("parent_analysis_id", GqlOptionInput(GqlLong))
  val analysisComment = GqlArgument("analysis_comment", GqlString)
  val analysisNameArg = GqlArgument("pipeline", AnalysisEnum)
  val analysisStatusArg = GqlArgument("pipeline_status", AnalysisStatusEnum)
  val analysisReferenceArg = GqlArgument("reference", ReferenceEnum)
  val analysisVCFArg = GqlArgument("vcf_name", GqlOptionInput(GqlString))

  // Associations
  val variantArg = GqlArgument("variant_hgvs", GqlString)
  val zygosityArg = GqlArgument("zygosity", GqlString)
  val variantEffectArg = GqlArgument("variant_effect", GqlString)
  val geneArg = GqlArgument("gene", GqlString)
  val diseaseArg = GqlArgument("diseases", GqlString)
  val diseaseAssocArg = GqlArgument("disease", GqlString)
  val diseaseId = GqlArgument("disease_id", GqlString)
  val genePhenoScoreArg = GqlArgument("gene_pheno_score", GqlFloat)
  val combinedScoreArg = GqlArgument("combined_score", GqlFloat)
  val deltaCombinedScoreArg = GqlArgument("delta_combined_score", GqlFloat)

  lazy val mutation: GqlObject[GraphQLContext, Unit] =
    GqlObject(
      name = "Mutation",
      fields = gqlFields[GraphQLContext, Unit](
        GqlField(
          name = "createPatient",
          description = Option("Create a patient. [Auth Required]"),
          fieldType = PatientType,
          arguments = firstNameEncArg :: lastNameEncArg :: sexArg :: labArg :: clinicArg :: mrnIDEncArg
            :: physicianFirstNameArg :: physicianLastNameArg :: physicianEmailArg
            :: gcFirstNameOptArg :: gcLastNameOptArg :: gcEmailOptArg
            :: dateOfBirthArg :: dateOfReportArg :: Nil,
          resolve = cc => cc.ctx.createPatient(
            cc.arg(firstNameEncArg), cc.arg(lastNameEncArg), cc.arg(sexArg), cc.arg(labArg), cc.arg(clinicArg),
            cc.arg(mrnIDEncArg), cc.arg(physicianFirstNameArg), cc.arg(physicianLastNameArg), cc.arg(physicianEmailArg),
            cc.arg(gcFirstNameOptArg), cc.arg(gcLastNameOptArg), cc.arg(gcEmailOptArg),
            cc.arg(dateOfBirthArg), cc.arg(dateOfReportArg)
          )
        ),
        GqlField(
          name = "editPatient",
          description = Option("Edit an attribute of a patient. [Auth Required]"),
          fieldType = PatientType,
          arguments = patientId :: firstNameEncOptArg :: sexOptArg :: lastNameEncOptArg :: mrnIDEncOptArg
            :: physicianFirstNameOptArg :: physicianLastNameOptArg :: physicianEmailOptArg
            :: gcFirstNameOptArg :: gcLastNameOptArg :: gcEmailOptArg
            :: dateOfBirthOptArg :: dateOfReportOptArg :: Nil,
          resolve = cc => cc.ctx.editPatient(
            cc.arg(patientId), cc.arg(firstNameEncOptArg), cc.arg(lastNameEncOptArg), cc.arg(sexOptArg),
            cc.arg(mrnIDEncOptArg), cc.arg(physicianFirstNameOptArg), cc.arg(physicianLastNameOptArg), cc.arg(physicianEmailOptArg),
            cc.arg(gcFirstNameOptArg), cc.arg(gcLastNameOptArg), cc.arg(gcEmailOptArg),
            cc.arg(dateOfBirthOptArg), cc.arg(dateOfReportOptArg)
          )
        ),
        GqlField(
          name = "createCase",
          description = Option("Create a case. [Auth Required]"),
          fieldType = CaseType,
          arguments = patientId :: caseNameArg :: Nil,
          resolve = cc => cc.ctx.createCase(
            cc.arg(patientId), cc.arg(caseNameArg)
          )
        ),
        GqlField(
          name = "startAnalysis",
          description = Option("Creates an analysis. [Auth Required]"),
          fieldType = AnalysisType,
          arguments = caseId :: patientId :: analysisNameArg :: analysisReferenceArg :: analysisVCFArg
            :: analysisIdOptional :: Nil,
          resolve = cc => cc.ctx.startAnalysis(
            cc.arg(patientId), cc.arg(caseId), cc.arg(analysisNameArg), cc.arg(analysisReferenceArg),
            cc.arg(analysisVCFArg), cc.arg(analysisIdOptional)
          )
        ),
        GqlField(
          name = "updateAnalysis",
          description = Option("Update the status of an analysis. [Auth Required: ADMIN]"),
          fieldType = AnalysisType,
          arguments = analysisId :: analysisStatusArg :: Nil,
          resolve = cc => cc.ctx.updateAnalysis(
            cc.arg(analysisId), cc.arg(analysisStatusArg)
          )
        ),
        GqlField(
          name = "updateAnalysisConfirm",
          description = Option("Update the status of an analysis to CONFIRMED from DONE"),
          fieldType = AnalysisType,
          arguments = analysisId :: Nil,
          resolve = cc => cc.ctx.updateAnalysisConfirm(
            cc.arg(analysisId)
          )
        ),
        GqlField(
          name = "updateAnalysisRedo",
          description = Option("Update the state of the analysis from CONFIRMED to REANALYSIS"),
          fieldType = AnalysisType,
          arguments = analysisId :: Nil,
          resolve = cc => cc.ctx.updateAnalysisRedo(
            cc.arg(analysisId)
          )
        ),
        GqlField(
          name = "modifyAnalysisComment",
          description = Option("Add/Update a comment for an analysis (Caregiver) [Auth Required]"),
          fieldType = AnalysisType,
          arguments = analysisId :: analysisComment :: Nil,
          resolve = cc => cc.ctx.modifyAnalysisComment(
            cc.arg(analysisId), cc.arg(analysisComment)
          )
        ),
        GqlField(
          name = "addPhenotype",
          description = Option("Create and associate a phenotype to a patient. [Auth Required]"),
          fieldType = PhenotypeType,
          arguments = patientId :: userDefinedArg :: hpoIdArg :: createdBy :: analysisIdOptional :: Nil,
          resolve = cc => cc.ctx.addPhenotype(
            cc.arg(patientId), cc.arg(userDefinedArg), cc.arg(hpoIdArg), cc.arg(createdBy),
            cc.arg(analysisIdOptional)
          )
        ),
        GqlField(
          name = "removePhenotype",
          description = Option("Remove a phenotype from the patient [Auth Required][MUST have no associated analysis]"),
          fieldType = PhenotypeType,
          arguments = phenotypeId :: Nil,
          resolve = cc => cc.ctx.removePhenotype(
            cc.arg(phenotypeId))
        ),
        GqlField(
          name = "modifyPhenotypeAttribute",
          description = Option("Update an attribute of a phenotype. [Auth Required]"),
          fieldType = PhenotypeType,
          arguments = phenotypeId :: isImportant :: category :: Nil,
          resolve = cc => cc.ctx.modifyPhenotypeAttribute(
            cc.arg(phenotypeId), cc.arg(isImportant), cc.arg(category)
          )
        ),
        GqlField(
          name = "addVariantAssociation",
          description = Option("Add a variant with associated gene and implicated diseases [Auth Required]"),
          fieldType = VariantAssociationType,
          arguments = analysisId :: variantArg :: zygosityArg :: variantEffectArg :: geneArg ::
            diseaseArg :: genePhenoScoreArg :: combinedScoreArg :: deltaCombinedScoreArg :: Nil,
          resolve = cc => cc.ctx.addVariantAssociation(
            cc.arg(analysisId), cc.arg(variantArg), cc.arg(zygosityArg), cc.arg(variantEffectArg), cc.arg(geneArg),
            cc.arg(diseaseArg), cc.arg(genePhenoScoreArg), cc.arg(combinedScoreArg), cc.arg(deltaCombinedScoreArg)
          )
        ),
        GqlField(
          name = "addDiseaseAssociation",
          description = Option("Flag a disease in an analysis [Auth Required]"),
          fieldType = DiseaseAssociationType,
          arguments = analysisId :: diseaseAssocArg :: Nil,
          resolve = cc => cc.ctx.addDiseaseAssociation(cc.arg(analysisId), cc.arg(diseaseAssocArg))
        ),
        GqlField(
          name = "removeDiseaseAssociation",
          description = Option("Remove a disease flag in an analysis [Auth Required]"),
          fieldType = DiseaseAssociationType,
          arguments = analysisId :: diseaseAssocArg :: Nil,
          resolve = cc => cc.ctx.removeDiseaseAssociation(cc.arg(analysisId), cc.arg(diseaseAssocArg))
        )
      )
    )

  // Finally assign Constructed Query, Mutation, Subscriptions to the SchemaDefinition
  lazy val SchemaDefinition: GqlSchema[GraphQLContext, Unit] = GqlSchema(query, Some(mutation))
}

// https://doc.akka.io/docs/akka/2.5.3/java/futures.html
// Interesting: https://gist.github.com/marioosh/7c3ee5fed1238c5daf89a4459727f575#file-graphqlschema-scala
