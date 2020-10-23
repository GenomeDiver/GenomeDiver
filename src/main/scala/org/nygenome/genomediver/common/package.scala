package org.nygenome.genomediver

// Scala, Logging
import scala.language.postfixOps
import scala.collection.JavaConverters._
import scala.compat.java8.OptionConverters._
import scala.compat.java8.FutureConverters._
import scala.concurrent.duration._
import scala.util.{Failure, Success, Try}
import scala.concurrent.Future
import com.typesafe.config._
import com.typesafe.scalalogging.Logger
import java.util.UUID.nameUUIDFromBytes

// JOOQ
import org.jooq.{Condition, Configuration, Record}
import org.jooq.impl.DSL
import org.joda.time.DateTime

// Actors
import akka.actor.typed.scaladsl.AskPattern._
import sangria.validation.ValueCoercionViolation
import org.nygenome.genomediver.session_models.Session

// Environment dependent config object
package object config {
  object ConfigObj {
    val env = if (System.getenv("SCALA_ENV") == null) "development" else System.getenv("SCALA_ENV")
    private val conf = ConfigFactory.load()
    def apply() = conf.getConfig(env)
  }
}

package object validation {
  case object DateCoercionViolation extends ValueCoercionViolation("Date value expected")

  // was DateTime(s, DateTimeZone.UTC) (ignoring time zones)
  def parseDate(s: String) = Try(new DateTime(s)) match {
    case Success(date) => {Right(date)}
    case Failure(_) => Left(DateCoercionViolation)
  }

  def isValidInstitution(name: String): Boolean = """^[A-Z]([\w]|[- @.&'])*$""".r.findFirstIn(name).isDefined
  def isPasswordValid(password: String): Boolean = """^(((?=.*[a-z])(?=.*[A-Z]))|((?=.*[a-z])(?=.*[0-9]))|((?=.*[A-Z])(?=.*[0-9])))(?=.{8,})""".r.findFirstIn(password).isDefined
  def isEmailValid(email: String): Boolean = """^[-a-z0-9!#$%&'*+/=?^_`{|}~]+(\.[-a-z0-9!#$%&'*+/=?^_`{|}~]+)*@([a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?\.)*(aero|arpa|asia|biz|cat|com|coop|edu|gov|info|int|jobs|mil|mobi|museum|name|net|org|pro|tel|travel|[a-z][a-z])$""".r.findFirstIn(email).isDefined
  def isValidToken(token: String): Boolean = """^\w+$""".r.findFirstMatchIn(token).isDefined
  def isUsernameValid(username: String): Boolean = """^(?=.{3,20}$)(?![_.])(?!.*[_.]{2})[a-zA-Z0-9._]+(?<![_.])$""".r.findFirstMatchIn(username).isDefined
  def isValidUserRole(role: String): Boolean = Set("LAB_USER", "CAREGIVER", "ADMIN") contains role.trim()
  def stripPunctuation(value:String):String = value.replaceAll(raw"""([\p{Punct}&&[^.]]|\b\p{IsLetter}{1,2}\b)\s*""", "").trim
}

// Type enforcing all incoming JSON requests via Rest (similarly to GraphQL Schema)
package object requests {
  case class InstitutionSpecific(name:String)
  case class InstitutionAdd(`type`: String, name:String)
  case class UserRegistration(username:String, mobile:String, first_name:String, last_name:String, email:String, institution_id:Long, role:String)
  case class UserRemove(username:String)
  case class CredentialsSubmit(username:String, password:String)
}

// Errors are defaulted to "Internal Server Error" as to not leak database schema internals.
// Exposing Errors via sangria.execution.UserFacingError allow messaging to escape and to the client.
package object errors {
  import sangria.execution.UserFacingError

  case class MutationError(msg:String) extends Exception(msg) with UserFacingError
  case class NoPermission(msg:String) extends Exception(msg) with UserFacingError
  case class AlreadyExists(msg: String) extends Exception(msg) with UserFacingError
  case class NotExist(msg:String) extends Exception(msg) with UserFacingError
  case class DatabaseError(msg:String) extends Exception(msg) with UserFacingError
}

package object context {
  import akka.actor.typed.ActorSystem
  import akka.util.Timeout
  import org.nygenome.genomediver.db.Tables._
  import org.nygenome.genomediver.db._
  import org.nygenome.genomediver.models._
  import org.nygenome.genomediver.validation.stripPunctuation
  import org.nygenome.genomediver.actors.Authorization._
  import org.nygenome.genomediver.actors.Audit._

  // global execution context a good idea?
  import scala.concurrent.ExecutionContext.Implicits.global

  case class GraphQLContext(session:Session, auth:ActorSystem[AuthRequest], auditor:ActorSystem[AuditRequest]) {
    implicit val timeout: Timeout = 5 seconds
    implicit val actorScheduler = auth.scheduler
    val logger = Logger("GenomeDiver - API")

    //
    // [QUERY] Ontology and Annotations
    // ----------------------------------------------------------------------------------
    def gene_phenotype(genes: Option[Seq[String]], hpo_ids: Option[Seq[String]]): Future[List[HPOGeneToPhenotype]] = {
      logger.debug("[hpo gene/phenotype annotations (public)]")
      auditor ! Audit(session.username, None, "VIEW_HPO_GENE_ANNOTATION", "Viewing HPO Gene/Phenotype Annotation" )

      val gene_cond: Condition = genes match {
        case Some(g) => DSL.trueCondition().and(HPO_GENE_TO_PHENOTYPE.ENTREZ_GENE_SYMBOL.in(g.asJava))
        case None    => DSL.trueCondition()
      }

      val hpo_cond: Condition = hpo_ids match {
        case Some(h) => DSL.trueCondition().and(HPO_GENE_TO_PHENOTYPE.HPO_ID.in(h.asJava))
        case None    => DSL.trueCondition()
      }

      orm_read.transactionResultAsync(ctx =>
        DSL.using(ctx).select(HPO_GENE_TO_PHENOTYPE.ID, HPO_GENE_TO_PHENOTYPE.ENTREZ_GENE_ID,
        HPO_GENE_TO_PHENOTYPE.ENTREZ_GENE_SYMBOL, HPO_GENE_TO_PHENOTYPE.HPO_TERM, HPO_GENE_TO_PHENOTYPE.HPO_ID)
        .from(HPO_GENE_TO_PHENOTYPE)
        .where(gene_cond).and(hpo_cond)
        .fetchInto(classOf[HPOGeneToPhenotype])
        .asScala.toList).toScala
    }

    def ontology(raw_search_term: String): Future[List[HPOOntology]] = {
      val search_term = stripPunctuation(raw_search_term)
      logger.debug(s"[hpo ontology (public)], ${session.id}, ${session.role}")
      auditor ! Audit(session.username, None, "SEARCH_ONTOLOGY", search_term)

      val prefix:String  = """^(?i)HP:\d{7}$""".r.findFirstIn(raw_search_term.trim) match {
        case Some(hpo) =>
          s"""
             |WITH RECURSIVE initial_search AS (
             |  SELECT *, 10.0 search_dist, 0.0 depth FROM hpo_ont
             |  WHERE hpo_id LIKE '${hpo.toUpperCase}'
             |  LIMIT 1
             |"""

        case None =>
          s"""
             |WITH RECURSIVE initial_search AS ((
             |  SELECT (ontology_initial).*,
             |         1 + (coalesce(ranking_name, 0) +
             |              coalesce(ranking_synonyms, 0) +
             |              coalesce(ranking_description, 0)) as search_dist,
             |         0 depth
             |  FROM (SELECT
             |         ontology_initial,
             |         ts_rank_cd(setweight(name_vector, 'A'),         websearch_to_tsquery('$search_term')) AS ranking_name,
             |         ts_rank_cd(setweight(synonyms_vector, 'C'),     websearch_to_tsquery('$search_term')) AS ranking_synonyms,
             |         ts_rank_cd(setweight(description_vector, 'B'),  websearch_to_tsquery('$search_term')) AS ranking_description
             |       FROM hpo_ont ontology_initial
             |       WHERE hpo_id LIKE 'HP:%'
             |  ) initial_text_search_query
             |  WHERE (ranking_name > 0) OR (ranking_description > 0)
             |  LIMIT 50)
             |  UNION
             |    SELECT hpo_ont.*, 3 search_dist, 0 depth
             |    FROM hpo_ont where name ILIKE '$search_term'
             |  """
      }

      val sql: String = prefix.stripMargin + s"""
           |), tree_canbe AS (
           |  SELECT * FROM initial_search
           |  UNION ALL
           |    SELECT ont_canbe.*, 0.9, tree_canbe.depth + 1 FROM tree_canbe
           |    INNER JOIN hpo_ont_can_be canbe ON tree_canbe.hpo_id = canbe.lid
           |    INNER JOIN hpo_ont ont_canbe ON canbe.rid = ont_canbe.hpo_id
           |), tree_isa AS (
           |  SELECT * FROM tree_canbe
           |  UNION ALL
           |    SELECT ont_isa.*, 0.5, tree_isa.depth + 2 FROM tree_isa
           |    INNER JOIN hpo_ont_is_a isa ON tree_isa.hpo_id = isa.lid
           |    INNER JOIN hpo_ont ont_isa ON isa.rid = ont_isa.hpo_id
           |), summary AS (
           |  SELECT mq.id, mq.hpo_id, mq.name, mq.description,
           |    round(CAST(max(mq.search_dist)/(min(mq.depth + 1)^2) as NUMERIC), 4)  +
           |    round((count(1)/CAST((SELECT COUNT(1) FROM initial_search) AS NUMERIC)), 4)
           |    as search_dist
           |    FROM ( SELECT * FROM tree_isa LIMIT 100) as mq
           |  WHERE mq.name IS NOT NULL AND mq.name <> 'All'
           |  GROUP BY mq.id, mq.hpo_id, mq.name, mq.description)
           |
           |SELECT summary.id, summary.hpo_id, summary.name, summary.description, summary.search_dist
           |--       string_agg(DISTINCT hpo_gene_to_phenotype.entrez_gene_symbol, ', ') as genes
           |FROM summary
           |-- LEFT OUTER JOIN hpo_gene_to_phenotype ON summary.hpo_id = hpo_gene_to_phenotype.hpo_id
           |GROUP BY summary.id, summary.hpo_id, summary.name, summary.description, summary.search_dist
           |ORDER BY search_dist DESC, hpo_id DESC;
        """.stripMargin

      orm_read.transactionResultAsync(ctx =>
        DSL.using(ctx).fetch(sql).into(classOf[HPOOntology]).asScala.toList).toScala
    }

    def disease_annotation(database_id:Seq[String]): Future[List[HPOAnnotationDisease]] = {
      logger.debug(s"[hpo disease annotations (public)]")
      auditor ! Audit(session.username, None, "VIEW_HPO_DISEASE_ANNOTATIONS", "Viewing HPO disease annotations")

      orm_read.transactionResultAsync(ctx =>
        DSL.using(ctx).select(
        DSL.max(HPO_DISEASE.ID).as("id"), HPO_DISEASE.DATABASE_ID, DSL.max(HPO_DISEASE.DISEASE_NAME).as("disease_name"))
        .from(HPO_DISEASE).where(HPO_DISEASE.DATABASE_ID.in(database_id.asJavaCollection))
        .groupBy(HPO_DISEASE.DATABASE_ID)
        .fetchInto(classOf[HPOAnnotationDisease])
        .asScala.toList).toScala
    }

    //
    // [QUERY] Institutions (users)
    // ----------------------------------------------------------------------------------
    def institutions(): Future[List[Institution]] = {
      logger.debug(s"[institutions (active)] ${session.id}, ${session.role}")
      auditor ! Audit(session.username, None, "VIEW_INSTITUTIONS", "Viewing Institutions")

      orm_read.transactionResultAsync(ctx =>
        DSL.using(ctx).select(INSTITUTION.asterisk).from(INSTITUTION)
          // [no-auth (public)]
          //.join(USER_MEMBERSHIP).on(USER_MEMBERSHIP.INSTITUTION_ID.eq(INSTITUTION.ID))
          //.where(USER_MEMBERSHIP.USER_ID.eq(session.id))
          .where(INSTITUTION.ACTIVE.eq(true))
          .fetchInto(classOf[Institution])
          .asScala.toList
      ).toScala
    }

    def institutions(ids: Seq[Long]): Future[List[Institution]] = {
      logger.debug(s"[institutions (ids, active)] ${session.id}, ${session.role}")
      // - HIPAA tracking taken care of above method

      orm_read.transactionResultAsync(ctx =>
        DSL.using(ctx).select(INSTITUTION.asterisk).from(INSTITUTION)
        .join(USER_MEMBERSHIP).on(USER_MEMBERSHIP.INSTITUTION_ID.eq(INSTITUTION.ID))
        .where(USER_MEMBERSHIP.USER_ID.eq(session.id))
        .and(INSTITUTION.ID.in(ids.asJava))
        .and(INSTITUTION.ACTIVE.eq(true))
        .fetchInto(classOf[Institution])
        .asScala.toList).toScala
    }

    def succinctUsers(ids: Seq[Long]): Future[List[SuccinctUser]] = {
      // - no need to hipaa audit, tracked above
      // - only used as institution -> succinct user
      // - no need to auth verify again, similar reason

      logger.debug("[succinct users (no-auth-internal)]")
      orm_read.transactionResultAsync(ctx => {
        DSL.using(ctx).select(USER.ID, USER.USERNAME, USER.ROLE, USER.ACTIVE).from(USER)
          .where(USER.ID.in(ids.asJava))
          .and(USER.ACTIVE.eq(true))
          .fetchInto(classOf[SuccinctUser])
          .asScala.toList
      }).toScala
    }

    def succinctUsersForInstitution(ids: Seq[Long]): Future[List[(Seq[Long], SuccinctUser)]] =  {
      logger.debug("[succinct users (ids, no-auth-internal)]")
      // - no need to hipaa audit, tracked above
      // - only used as institution -> succint user

      orm_read.transactionResultAsync(ctx => {

        val aggregate_user_id = USER_MEMBERSHIP.INSTITUTION_ID.cast(classOf[String])

        val res:List[Record] = DSL.using(ctx).select(
          DSL.groupConcat(aggregate_user_id).as("institution_id"),
          USER.asterisk)
          .from(USER).join(USER_MEMBERSHIP).on(USER_MEMBERSHIP.USER_ID.eq(USER.ID))
          .where(USER_MEMBERSHIP.INSTITUTION_ID.in(ids.asJava).and(USER.ACTIVE.eq(true)))
          .groupBy(USER.ID, USER.USERNAME, USER.ROLE, USER.ACTIVE)
          .fetch().asScala.toList

        // this is kind of dumb, need to refactor
        res.map { record =>
          (record.get("institution_id").toString.split(",").map(_.toLong).toSeq,
            record.into(
              record.field("id"),
              record.field("username"),
              record.field("first_name"),
              record.field("last_name"),
              record.field("role"),
              record.field("active")
            ).into(classOf[SuccinctUser]))
        }
      }).toScala
    }

    // TODO: turn encryption back on for production
    def encryptPatientData(p:Patient):Patient = {p}
    def decryptPatientData(p:Patient):Patient = {
//      p.copy(
//        first_name_enc = p.first_name_enc + " (encrypted field)",
//        last_name_enc  = p.last_name_enc  + " (encrypted field)",
//        mrn_id_enc     = p.mrn_id_enc     + " (encrypted field)"
//      )
      p
    }

    //
    //  [QUERY] Patients (institutions, phenotypes, cases , analysis)
    // ----------------------------------------------------------------------------------
    def patients(ids: Option[Seq[Long]], mrns: Option[Seq[String]]): Future[List[Patient]] = {
      logger.debug(s"[patients (active)], ${session.id}, ${session.role}")
      auditor ! Audit(session.username, None, "VIEW_PATIENT", "Viewing patients")

      // Filter criteria on patient via (ID && MRN)
      val id_cond: Condition = ids match {
        case Some(_ids) => DSL.trueCondition().and(PATIENT.ID.in(_ids.asJava))
        case _ => DSL.trueCondition()
      }
      // (***** AND ***** )
      val mrn_cond: Condition = mrns match {
        case Some(_mrns) => DSL.trueCondition().and(PATIENT.MRN_ID_ENC.in(_mrns.asJava))
        case _ => DSL.trueCondition()
      }

      // Authorization is via patients -> patient_membership -> user_membership -> user
      // Also only active patients are shown
      orm_read.transactionResultAsync(ctx =>
        DSL.using(ctx).selectDistinct(PATIENT.asterisk)
        .from(PATIENT)
        .join(PATIENT_MEMBERSHIP).on(PATIENT_MEMBERSHIP.PATIENT_ID.eq(PATIENT.ID))
        .join(USER_MEMBERSHIP).on(USER_MEMBERSHIP.INSTITUTION_ID.eq(PATIENT_MEMBERSHIP.INSTITUTION_ID))
        .where(PATIENT.ACTIVE.eq(true))
        .and(USER_MEMBERSHIP.USER_ID.eq(session.id))
        .and(id_cond).and(mrn_cond)
        .fetchInto(classOf[Patient])
        .asScala.toList.map{p => decryptPatientData(p)}
      ).toScala

      //.flatMap{list_of:List[Patient] => Future.successful(list_of.map(p => decryptPatientData(p)))}
    }

    def institutionsForPatient(ids: Seq[Long]): Future[List[(Seq[Long], Institution)]] = {
      logger.debug("[patient-institution (ids, no-auth-internal)")
      // - hipaa audit tracked by [patients]

      orm_read.transactionResultAsync(ctx =>
        DSL.using(ctx).select(
        DSL.groupConcat(PATIENT_MEMBERSHIP.PATIENT_ID.cast(classOf[String])).as("patient_id"),
        INSTITUTION.asterisk)
        .from(INSTITUTION).join(PATIENT_MEMBERSHIP).on(PATIENT_MEMBERSHIP.INSTITUTION_ID.eq(INSTITUTION.ID))
        .where(PATIENT_MEMBERSHIP.PATIENT_ID.in(ids.asJava).and(INSTITUTION.ACTIVE.eq(true)))
        .groupBy(INSTITUTION.ID, INSTITUTION.TYPE, INSTITUTION.NAME)
        .fetch().asScala.toList
        .map { record =>
          (record.get("patient_id").toString.split(",").map(_.toLong).toSeq,
            record.into(
              record.field("id"),
              record.field("type"),
              record.field("name"),
              record.field("active")
            ).into(classOf[Institution]))})
        .toScala
    }

    def phenotypes(ids: Seq[Long]): Future[List[Phenotype]]= {
      logger.debug("[patient-phenotypes (no-auth-internal)]")
      // - hipaa audit tracked by [patients]

      orm_read.transactionResultAsync(ctx =>
        DSL.using(ctx).select().from(PHENOTYPE).where(PHENOTYPE.ID.in(ids.asJava))
        .fetchInto(classOf[Phenotype])
        .asScala.toList
      ).toScala
    }

    def phenotypesByPatient(ids: Seq[Long]): Future[List[Phenotype]] = {
      logger.debug("[patient-phenotypes (ids, no-auth-internal)")
      // - hipaa audit tracked by [patients]

      orm_read.transactionResultAsync(ctx =>
        DSL.using(ctx).select().from(PHENOTYPE).where(PHENOTYPE.PATIENT_ID.in(ids.asJava))
        .fetchInto(classOf[Phenotype])
        .asScala.toList
      ).toScala
    }

    def cases(ids:Seq[Long]) : Future[List[Case]] = {
      logger.debug("[patient-case (ids, no-auth-internal)]")
      // hipaa audit tracked by [patients]

      orm_read.transactionResultAsync(ctx =>
        DSL.using(ctx).select().from(CASE)
        .where(CASE.ID.in(ids.asJava)).and(CASE.ACTIVE.eq(true))
        .fetchInto(classOf[Case])
        .asScala.toList).toScala
    }

    def caseByPatient(ids:Seq[Long]): Future[List[Case]] = {
      logger.debug("[patient-case (ids, no-auth-internal)]")
      // hipaa audit tracked by [patients]

      orm_read.transactionResultAsync(ctx =>
        DSL.using(ctx).select().from(CASE).where(CASE.PATIENT_ID.in(ids.asJava))
        .fetchInto(classOf[Case])
        .asScala.toList).toScala
    }

    def analysis(ids:Seq[Long]): Future[List[Analysis]] = {
      logger.debug("[patient-analysis (ids)]")
      // hipaa audit tracked by [patients]

      orm_read.transactionResultAsync(ctx =>
        DSL.using(ctx).select(Seq(ANALYSIS.asterisk(), ANALYSIS_GRAPH.PARENT).asJava)
        .from(ANALYSIS)
        .leftJoin(ANALYSIS_GRAPH).on(ANALYSIS.ID.eq(ANALYSIS_GRAPH.CHILD))
        .where(ANALYSIS.ID.in(ids.asJava))
        .fetchInto(classOf[Analysis])
        .asScala.toList).toScala
    }

    // GraphQL:Query Entry
    def analysisDetail(patient_id:Long, analysis_id:Long) : List[Analysis] = {
      logger.debug(s"[analysis detail] ${session.username} ${session.role}")
      auditor ! Audit(session.username, Some(patient_id), "VIEW_ANALYSIS_DETAIL", "Viewing detailed analysis")

      orm_read.select(Seq(ANALYSIS.asterisk, ANALYSIS_GRAPH.PARENT).asJava)
        .from(ANALYSIS)
        .join(CASE).on(CASE.ID.eq(ANALYSIS.CASE_ID))
        .join(PATIENT).on(PATIENT.ID.eq(CASE.PATIENT_ID))
        .join(PATIENT_MEMBERSHIP).on(PATIENT_MEMBERSHIP.PATIENT_ID.eq(PATIENT.ID))
        .join(USER_MEMBERSHIP).on(USER_MEMBERSHIP.INSTITUTION_ID.eq(PATIENT_MEMBERSHIP.INSTITUTION_ID))
        .leftJoin(ANALYSIS_GRAPH).on(ANALYSIS.ID.eq(ANALYSIS_GRAPH.CHILD))
      .where(PATIENT.ID.eq(patient_id))
      .and(USER_MEMBERSHIP.USER_ID.eq(session.id))
      .and(ANALYSIS.ID.eq(analysis_id))
      .fetchInto(classOf[Analysis])
      .asScala.toList
    }

    def disease_gene_map(patient_id:Long, analysis_id:Long): Future[List[DiseaseGeneMap]] = {
      logger.debug(s"[disease gene map] ${session.username}: ${session.role}")
      auditor ! Audit(session.username, Some(patient_id), "VIEW_DISEASE_RESULTS", "Viewing disease/gene results")

      // difficult to express CTE and aggregation functions in JOOQ.
      // should not be a performance problem as (v) is small (5-10 rows)

      // Permissions (p) of analysis given user & patient are expressed as
      // user -> user_membership -> patient_membership ->
      // patient -> case- > analysis -> variant_associations
      val sql = s"""
         |WITH p AS (SELECT a.id FROM analysis a
         |            JOIN "case" c on a.case_id = c.id
         |            JOIN patient pa on c.patient_id = pa.id
         |            JOIN patient_membership pm on pa.id = pm.patient_id
         |            JOIN user_membership um on pm.institution_id = um.institution_id
         |            WHERE a.id = ${analysis_id} AND pa.id = ${patient_id} AND um.user_id = ${session.id}
         |            LIMIT 1),
         |     v AS (SELECT diseases, gene, combined_score, delta_combined_score FROM variant_association WHERE analysis_id = (SELECT id FROM p)),
         |     a AS (SELECT disease FROM disease_association WHERE analysis_id = (SELECT id FROM p)),
         |     d AS (SELECT DISTINCT d.disease FROM v LEFT JOIN unnest(string_to_array(v.diseases,', ')) d(disease) ON TRUE)
         |
         |SELECT DISTINCT
         |    d.disease,
         |    coalesce(a.disease, '') as selected,
         |    v.gene,
         |    v.combined_score,
         |    v.delta_combined_score
         |FROM d JOIN v ON string_to_array(v.diseases, ', ') @> string_to_array(d.disease, ', ')
         |LEFT JOIN a ON (a.disease = d.disease)
         |ORDER BY v.combined_score DESC, d.disease DESC
         |
         |""".stripMargin

      orm_read.transactionResultAsync(ctx =>
        DSL.using(ctx).fetch(sql)
          .into(classOf[DiseaseGeneMap])
          .asScala.toList
      ).toScala
    }

    def succinctAnalysis(ids:Seq[Long]): Future[List[SuccinctAnalysis]] = {
      logger.debug("[phenotypes-analysis (no-auth-internal)]")
      orm_read.transactionResultAsync(ctx =>
        DSL.using(ctx).select(ANALYSIS.ID, ANALYSIS.PIPELINE, ANALYSIS.STATUS, ANALYSIS_GRAPH.PARENT)
        .from(ANALYSIS)
        .leftJoin(ANALYSIS_GRAPH).on(ANALYSIS.ID.eq(ANALYSIS_GRAPH.CHILD))
        .where(ANALYSIS.ID.in(ids.asJava))
        .fetchInto(classOf[SuccinctAnalysis])
        .asScala.toList).toScala
    }

    def analysisByCase(ids:Seq[Long]): Future[List[Analysis]] = {
      logger.debug("[patient-case-analysis (ids, no-auth-internal]")
      orm_read.transactionResultAsync(ctx =>
        DSL.using(ctx).select(Seq(ANALYSIS.asterisk(), ANALYSIS_GRAPH.PARENT).asJava)
        .from(ANALYSIS)
        .leftJoin(ANALYSIS_GRAPH).on(ANALYSIS.ID.eq(ANALYSIS_GRAPH.CHILD))
        .where(ANALYSIS.CASE_ID.in(ids.asJava))
        .fetchInto(classOf[Analysis])
        .asScala.toList).toScala
    }

    def analysisInput(ids:Seq[Long]) : Future[List[AnalysisInput]] = {
      logger.debug("[patient-analysis-input (no-auth-internal)]")
      orm_read.transactionResultAsync(ctx =>
        DSL.using(ctx).select().from(ANALYSIS_INPUT).where(ANALYSIS_INPUT.ID.in(ids.asJava))
          .fetchInto(classOf[AnalysisInput])
          .asScala.toList).toScala
    }

    def analysisInputByAnalysis(ids:Seq[Long]) : Future[List[AnalysisInput]] = {
      logger.debug("[patient-analysis-input (ids, no-auth-internal)]")
      orm_read.transactionResultAsync(ctx =>
        DSL.using(ctx).select().from(ANALYSIS_INPUT).where(ANALYSIS_INPUT.ANALYSIS_ID.in(ids.asJava))
          .fetchInto(classOf[AnalysisInput])
          .asScala.toList).toScala
    }

    def variantAssociations(ids: Seq[Long]): Future[List[VariantAssociation]] = {
      logger.debug("[patient-analysis-variant_assoc (no-auth-internal)]")
      orm_read.transactionResultAsync(ctx =>
        DSL.using(ctx).select().from(VARIANT_ASSOCIATION)
        .where(VARIANT_ASSOCIATION.ID.in(ids.asJava))
        .fetchInto(classOf[VariantAssociation])
        .asScala.toList).toScala
    }

    def variantAssociationsByAnalysis(ids:Seq[Long]): Future[List[VariantAssociation]] = {
      logger.debug("[patient-analysis-variant_assoc (ids, no-auth-internal)]")
      orm_read.transactionResultAsync(ctx =>
        DSL.using(ctx).select().from(VARIANT_ASSOCIATION)
        .where(VARIANT_ASSOCIATION.ANALYSIS_ID.in(ids.asJava))
        .fetchInto(classOf[VariantAssociation])
        .asScala.toList).toScala
    }

    def diseaseAssociations(ids: Seq[Long]): Future[List[DiseaseAssociation]] = {
      logger.debug("[patient-analysis-disease_assoc (no-auth-internal)]")
      orm_read.transactionResultAsync(ctx =>
        DSL.using(ctx).select().from(DISEASE_ASSOCIATION)
        .where(DISEASE_ASSOCIATION.ID.in(ids.asJava))
        .fetchInto(classOf[DiseaseAssociation])
        .asScala.toList).toScala
    }

    def diseaseAssociationsByAnalysis(ids:Seq[Long]): Future[List[DiseaseAssociation]] = {
      logger.debug("[patient-analysis-disease_assoc (no-auth-internal)]")
      orm_read.transactionResultAsync(ctx =>
        DSL.using(ctx).select().from(DISEASE_ASSOCIATION)
        .where(DISEASE_ASSOCIATION.ANALYSIS_ID.in(ids.asJava))
        .fetchInto(classOf[DiseaseAssociation])
        .asScala.toList).toScala
    }

    def phenotypeForAnalysis(ids:Seq[Long]): Future[List[(Seq[Long], Phenotype)]] = {
      logger.debug("[analysis-phenotype] (ids, no-auth-internal)")
      orm_read.transactionResultAsync(ctx =>
        DSL.using(ctx).select(
          DSL.groupConcat(PHENOTYPE_MEMBERSHIP.ANALYSIS_ID.cast(classOf[String])).as("analysis_id"),
          PHENOTYPE.asterisk)
          .from(PHENOTYPE)
          .join(PHENOTYPE_MEMBERSHIP).on(PHENOTYPE_MEMBERSHIP.PHENOTYPE_ID.eq(PHENOTYPE.ID))
          .where(PHENOTYPE_MEMBERSHIP.ANALYSIS_ID.in(ids.asJava))
          .groupBy(PHENOTYPE.ID, PHENOTYPE.PATIENT_ID, PHENOTYPE.CREATED_BY, PHENOTYPE.IMPORTANT,
            PHENOTYPE.CATEGORY, PHENOTYPE.USER_DEFINED, PHENOTYPE.HPO_ID, PHENOTYPE.HPO_TERM)
          .fetch().asScala.toList
          .map {record =>
            ( record.get("analysis_id").toString.split(",").map(_.toLong).toSeq,
              record.into(
                record.field("id"),
                record.field("patient_id"),
                record.field("created_by"),
                record.field("important"),
                record.field("category"),
                record.field("user_defined"),
                record.field("hpo_id"),
                record.field("hpo_term")
              ).into(classOf[Phenotype]))
          }).toScala
    }

    def analysisForPhenotype(ids:Seq[Long]): Future[List[(Seq[Long], SuccinctAnalysis)]] = {
      logger.debug("[patient-phenotype-analysis (ids, no-auth-internal)")
      orm_read.transactionResultAsync(ctx =>
        DSL.using(ctx).select(
          DSL.groupConcat(PHENOTYPE_MEMBERSHIP.PHENOTYPE_ID.cast(classOf[String])).as("phenotype_id"),
          ANALYSIS.asterisk, ANALYSIS_GRAPH.PARENT)
          .from(ANALYSIS)
          .join(PHENOTYPE_MEMBERSHIP).on(PHENOTYPE_MEMBERSHIP.ANALYSIS_ID.eq(ANALYSIS.ID))
          .leftJoin(ANALYSIS_GRAPH).on(ANALYSIS.ID.eq(ANALYSIS_GRAPH.CHILD))
          .where(PHENOTYPE_MEMBERSHIP.PHENOTYPE_ID.in(ids.asJava))
          .groupBy(ANALYSIS.ID, ANALYSIS.CASE_ID, ANALYSIS.TIME_STARTED,
            ANALYSIS.TIME_COMPLETED, ANALYSIS.PIPELINE, ANALYSIS.STATUS, ANALYSIS_GRAPH.PARENT)
          .fetch().asScala.toList
          .map { record =>
            ( record.get("phenotype_id").toString.split(",").map(_.toLong).toSeq,
              record.into(
                record.field("id"),
                record.field("pipeline"),
                record.field("status"),
                record.field("parent")
              ).into(classOf[SuccinctAnalysis]))})
          .toScala
    }

    // [MUTATION] Patient
    // ----------------------------------------------------------------------------------------------------
    def createPatient(first_name_enc: String, last_name_enc: String, sex:String, lab_id:Long, clinic_id:Long, mrn_id_enc:String,
                      physician_first_name: String, physician_last_name:String, physician_email:Option[String],
                      gc_first_name:Option[String], gc_last_name:Option[String], gc_email:Option[String],
                      date_of_birth: DateTime, date_of_report: DateTime): Future[Patient] = {

      auditor ! Audit(session.username, None, "CREATE_PATIENT", "Create Patient")

      val auth_res: Future[AuthResponse] =
        auth.ask(ref => PermissionRole(session.id, "LAB_USER", ref))

      auth_res.flatMap {
        case a if (a.authorized) => {
          val physician_email_value = physician_email.getOrElse("")
          val gc_first_name_value = gc_first_name.getOrElse("")
          val gc_last_name_value = gc_last_name.getOrElse("")
          val gc_email_value = gc_last_name.getOrElse("")
          //var patient: Option[Patient] = None

          // Validation : (Institution, MRN) must be UNIQUE
          if (orm_read.transactionResult(ctx => {
            DSL.using(ctx).fetchExists(
              DSL.using(ctx).selectOne.from(PATIENT_MEMBERSHIP).join(PATIENT).on(PATIENT_MEMBERSHIP.PATIENT_ID.eq(PATIENT.ID))
                .where(PATIENT_MEMBERSHIP.INSTITUTION_ID.eq(clinic_id)
                  .and(PATIENT.MRN_ID_ENC.eq(mrn_id_enc.trim))
                ))
          })
          ) {
            throw errors.AlreadyExists("MRN ID collision with existing patient")
          }

          // Validation : Unique User
          if (orm_read.transactionResult(ctx => {
            DSL.using(ctx).fetchExists(
              DSL.using(ctx).selectOne.from(PATIENT)
                .where(PATIENT.FIRST_NAME_ENC.eq(first_name_enc.trim)
                  .and(PATIENT.LAST_NAME_ENC.eq(last_name_enc.trim))
                  .and(PATIENT.MRN_ID_ENC.eq(mrn_id_enc.trim))
                ))
          })
          ) {
            throw errors.AlreadyExists("Patient already exists in the system ")
          }

          // (1) Insert Patient into table
          // (2) Insert Patient Relationship - to Lab (Institution)
          // (3) return Patient Relationship - to Clinic (Institution)
          // (4) attribute the patient to the case
          orm.transactionResultAsync(db_ctx => {

            // Creating Patient
            val patient_transaction: Patient = DSL.using(db_ctx)
              .insertInto(PATIENT)
              .values(Seq(DSL.defaultValue(PATIENT.ID), first_name_enc, last_name_enc, sex,
                mrn_id_enc, physician_first_name, physician_last_name, physician_email_value,
                gc_first_name_value, gc_last_name_value, gc_email_value,
                date_of_birth, date_of_report, "CREATED", true).asJavaCollection)
              .returning(PATIENT.asterisk)
              .fetchOne().into(classOf[Patient])

            // Attributing Lab
            DSL.using(db_ctx).insertInto(PATIENT_MEMBERSHIP)
              .columns(PATIENT_MEMBERSHIP.INSTITUTION_ID, PATIENT_MEMBERSHIP.PATIENT_ID)
              .values(lab_id, patient_transaction.id).execute()

            // Attributing Clinic
            DSL.using(db_ctx).insertInto(PATIENT_MEMBERSHIP)
              .columns(PATIENT_MEMBERSHIP.INSTITUTION_ID, PATIENT_MEMBERSHIP.PATIENT_ID)
              .values(clinic_id, patient_transaction.id).execute()

            // Generate Case and Attributing Case
            DSL.using(db_ctx).insertInto(CASE)
              .columns(CASE.NAME, CASE.PATIENT_ID)
              .values(nameUUIDFromBytes(patient_transaction.id.toString.toArray.map(_.toByte)).toString,
                patient_transaction.id).execute()

            patient_transaction
          }).toScala

        }
        case _ => throw errors.NoPermission(s"User ${session.username} does not have the proper role")
      }
    }

    // TODO, currently not being used, no real need to EDIT the patient information
    // Database will log any changes
    // On the Admin can edit the patient for now
    def editPatient(patient_id:Long, first_name_enc:Option[String], last_name_enc: Option[String], sex: Option[String],
                    mrn_id_enc:Option[String], physician_first_name: Option[String], physician_last_name:Option[String],
                    physician_email:Option[String], gc_first_name:Option[String], gc_last_name:Option[String],
                    gc_email:Option[String], date_of_birth:Option[DateTime], date_of_report:Option[DateTime]) : Future[Patient] = {

      auditor ! Audit(session.username, Some(patient_id), "EDIT_PATIENT", "Edited Patient")

      val auth_res: Future[AuthResponse] =
        auth.ask(ref => PermissionRole(session.id, "ADMIN", ref))

      auth_res.flatMap {
        case a if (a.authorized) => {
          // Dynamically construct the UPDATE statement, can use Option..
          val values_pre = (first_name_enc.toList ::: last_name_enc.toList ::: mrn_id_enc.toList :::
            physician_first_name.toList ::: physician_last_name.toList ::: physician_email.toList :::
            gc_first_name.toList ::: gc_last_name.toList ::: gc_email.toList :::
            date_of_birth.toList ::: date_of_report.toList).map(v => DSL.`val`(v))

          val values = DSL.row(values_pre.asJavaCollection)

          val columns = DSL.row(
            Seq(PATIENT.FIRST_NAME_ENC, PATIENT.LAST_NAME_ENC, PATIENT.SEX, PATIENT.MRN_ID_ENC, PATIENT.PHYSICIAN_FIRST_NAME,
              PATIENT.PHYSICIAN_LAST_NAME, PATIENT.PHYSICIAN_EMAIL, PATIENT.GC_FIRST_NAME, PATIENT.GC_LAST_NAME,
              PATIENT.GC_EMAIL, PATIENT.DATE_OF_BIRTH, PATIENT.DATE_OF_REPORT)
              .zip(Seq(first_name_enc, last_name_enc, sex, mrn_id_enc, physician_email, physician_last_name,
                physician_email, date_of_birth, date_of_report).map(option => option.isDefined))
              .filter(tuple => tuple._2)
              .unzip._1.asJavaCollection)

          // make the actual UPDATE
          orm.transactionResultAsync(ctx => {
            if (values_pre.nonEmpty) {
              DSL.using(ctx).update(PATIENT)
                .set(columns, values).where(PATIENT.ID.equal(patient_id))
                .returning(PATIENT.asterisk)
                .fetchOne().into(classOf[Patient])
            } else {
              DSL.using(ctx).select()
                .from(PATIENT).where(PATIENT.ID.equal(patient_id))
                .fetchOne.into(classOf[Patient])
            }
          }).toScala
        }
        case _ => throw errors.NoPermission(s"User ${session.username} does not have the proper role")
      }
    }

    // [MUTATION] Case and Analysis
    // ----------------------------------------------------------------------------------------------------
    def createCase(patient_id:Long, case_name:String): Future[Case] = {
      auditor ! Audit(session.username, Some(patient_id), "CREATE_CASE", case_name)

      val auth_res:Future[AuthResponse] =
        auth.ask(ref => PermissionPatient(session.id, patient_id, ref))

      auth_res.flatMap{
        case a if (a.authorized) => {
          orm.transactionResultAsync(ctx => {
            DSL.using(ctx).insertInto(CASE)
              .columns(CASE.PATIENT_ID, CASE.NAME)
              .values(patient_id, case_name)
              .returning(CASE.asterisk)
              .fetchOne.into(classOf[Case])
            }).toScala
          }
        case _ => throw errors.NoPermission(s"User ${session.username} does not have permission on patient")
      }
    }

    def modifyAnalysisComment(analysis_id:Long, comment:String): Future[Analysis] = {
      auditor ! Audit(session.username, None, "MODIFY_ANALYSIS_COMMENT", comment)

      val auth_res:Future[AuthResponse] =
        auth.ask(ref => PermissionAnalysis(session.id, analysis_id, ref))

      // Future[Permission] => Future[Analysis] => Analysis
      auth_res.flatMap{
        case a if (a.authorized) => {
          orm_read.fetchExists(
            orm_read.select()
              .from(ANALYSIS)
              .where(ANALYSIS.ID.eq(analysis_id))
          ) match {
            case true => orm.transactionResultAsync(ctx => {

              // do the actual UPDATE
              DSL.using(ctx).update(ANALYSIS).set(ANALYSIS.COMMENT, comment)
                .where(ANALYSIS.ID.eq(analysis_id)).execute

              // return full analysis (with parent id)
              DSL.using(ctx).select(Seq(ANALYSIS.asterisk(), ANALYSIS_GRAPH.PARENT).asJava)
                .from(ANALYSIS)
                .leftJoin(ANALYSIS_GRAPH).on(ANALYSIS.ID.eq(ANALYSIS_GRAPH.CHILD))
                .where(ANALYSIS.ID.eq(analysis_id))
                .fetchOneInto(classOf[Analysis])

            }).toScala
            case false => throw errors.NotExist("Analysis does not exist")
        }}
        case _ => throw errors.NoPermission(s"User ${session.username} does not have permission on analysis")
      }
    }

    def startAnalysis(patient_id:Long, case_id:Long, pipeline:String, reference:String, vcf_namespace:Option[String], parent_analysis_id:Option[Long]): Future[Analysis] = {
      auditor ! Audit(session.username, None, "START_ANALYSIS", pipeline)

      val auth_res:Future[AuthResponse] =
        auth.ask(ref => PermissionPatient(session.id, patient_id, ref))

      auth_res.flatMap {
        case a if (a.authorized) => {
          // absorbing phenotypes (to input) is dependent on the existence of a parent analysis
          // if the parent analysis exists then absorb phenotypes from that analysis
          // if the parent analysis does not exist then absorb non-associated phenotypes
          def absorb_input(ctx:Configuration, assoc_pheno:List[Phenotype], ins_analysis_id:Long): Unit = {

            // Require patient (sex) field
            val patient_sex = orm_read.select(PATIENT.SEX)
              .from(PATIENT).where(PATIENT.ID.eq(patient_id))
              .fetchOne.into(classOf[String])

            // 1) Associate Phenotypes to Analysis ID (https://github.com/jOOQ/jOOQ/issues/6604)
            assoc_pheno.foldLeft(
              DSL.using(ctx).insertInto(PHENOTYPE_MEMBERSHIP)
                .columns(PHENOTYPE_MEMBERSHIP.ANALYSIS_ID, PHENOTYPE_MEMBERSHIP.PHENOTYPE_ID)
            )((acc, ph) => {
              acc.values(ins_analysis_id, ph.id)
            }).execute()

            // 2) Convert Phenotypes, Reference, Sex to AnalysisInput
            // 3) Associate to Analysis
            val stmt_input = assoc_pheno.foldLeft(
              DSL.using(ctx).insertInto(ANALYSIS_INPUT)
                .columns(ANALYSIS_INPUT.ANALYSIS_ID, ANALYSIS_INPUT.NAME, ANALYSIS_INPUT.VALUE)
                .values(ins_analysis_id, "Reference", reference)
                .values(ins_analysis_id, "Sex", patient_sex)
            )((acc, ph) => {
              acc.values(ins_analysis_id, "Phenotype", ph.hpo_id)
            })

            // 3) Convert VCF to Analysis Input + Associate to Analysis
            val stmt_input_vcf = vcf_namespace match {
              case Some(vcf) => stmt_input.values(ins_analysis_id, "VCF", vcf)
              case None => stmt_input
            }

            stmt_input_vcf.execute
          }

          // Analysis must be affiliated with a Patient->Case.
          (orm_read.select().from(CASE)
            .where(CASE.ID.eq(case_id)).and(CASE.PATIENT_ID.eq(patient_id))
            .fetchOptionalInto(classOf[Case]).asScala)
          match {
            case Some(c: Case) => {
              orm.transactionResultAsync(ctx => {

                // ANALYSIS -> CREATED
                // ---------------------------------------------------------------------------
                // 1) Insert the analysis (returns AnalysisInternal)
                // 2) Associate to a Case
                // 3) Initial status is CREATED (awaiting input resolution, general setup)
                //
                val inserted_analysis_id: Long = DSL.using(ctx)
                  .insertInto(ANALYSIS)
                  .columns(ANALYSIS.CASE_ID, ANALYSIS.PIPELINE, ANALYSIS.STATUS)
                  .values(case_id, pipeline, "CREATED")
                  .returning(ANALYSIS.asterisk)
                  .fetchOne.into(classOf[AnalysisInternal]).id

                // ANALYSIS -> QUEUED
                // ---------------------------------------------------------------------------
                // 1) Chain analysis from parent (analysis) to child (analysis), If parent is specified
                // 2) Convert Phenotypes, VCF, and Reference to analysis input and associate
                //
                parent_analysis_id match {
                  case Some(pid: Long) =>
                    val parent_analysis_opt: Option[AnalysisInternal] =
                      DSL.using(ctx).select(ANALYSIS.asterisk)
                        .from(ANALYSIS).where(ANALYSIS.ID.eq(pid))
                        .and(ANALYSIS.CASE_ID.eq(c.id))
                        .fetchOptionalInto(classOf[AnalysisInternal])
                        .asScala

                    parent_analysis_opt match {
                      case Some(parent_analysis: AnalysisInternal) =>

                        // chain analysis between parent and child ~ "Dive"
                        // absorb all phenotypes (of patient) / input that are associated w/ parent
                        DSL.using(ctx).insertInto(ANALYSIS_GRAPH)
                          .columns(ANALYSIS_GRAPH.PARENT, ANALYSIS_GRAPH.CHILD)
                          .values(Seq(parent_analysis.id, inserted_analysis_id).asJavaCollection)
                          .execute()

                        // TODO: (Minor) HARDCODING of rule for specifically - Pipeline (2)
                        val pipe_2_cond: Condition = pipeline match {
                          case "SECOND_RUN" =>
                              DSL.trueCondition().and(PHENOTYPE.CATEGORY.eq("PRESENT"))

                          case _ => DSL.trueCondition()
                        }

                        absorb_input(
                          ctx, orm_read.select(PHENOTYPE.asterisk)
                            .from(PHENOTYPE).leftOuterJoin(PHENOTYPE_MEMBERSHIP)
                            .on(PHENOTYPE.ID.eq(PHENOTYPE_MEMBERSHIP.PHENOTYPE_ID))
                            .where(PHENOTYPE_MEMBERSHIP.ANALYSIS_ID.eq(parent_analysis.id))
                            .and(PHENOTYPE.PATIENT_ID.eq(patient_id))
                            .and(pipe_2_cond)
                            .fetchInto(classOf[Phenotype]).asScala.toList,
                          inserted_analysis_id
                        )

                      case None => throw errors.NotExist("Parent Analysis does not exist")
                    }

                  case None =>

                    // no parent analysis therefore assuming analysis is parent
                    // absorbing phenotypes (of patient) / input that are not associated
                    absorb_input(
                      ctx, orm_read.select(PHENOTYPE.asterisk)
                        .from(PHENOTYPE).leftOuterJoin(PHENOTYPE_MEMBERSHIP)
                        .on(PHENOTYPE.ID.eq(PHENOTYPE_MEMBERSHIP.PHENOTYPE_ID))
                        .where(PHENOTYPE_MEMBERSHIP.ANALYSIS_ID.isNull)
                        .and(PHENOTYPE.PATIENT_ID.eq(patient_id))
                        .fetchInto(classOf[Phenotype]).asScala.toList,
                      inserted_analysis_id
                    )
                }

                // Finally, Set ANALYSIS to "QUEUED" from CREATED,
                // which will allow the scheduler to pick up to RUN
                DSL.using(ctx)
                  .update(ANALYSIS).set(ANALYSIS.STATUS, "QUEUED")
                  .where(ANALYSIS.ID.eq(inserted_analysis_id))
                  .execute

                // Return Analysis with (potential) parent analysis id
                DSL.using(ctx).select(Seq(ANALYSIS.asterisk(), ANALYSIS_GRAPH.PARENT).asJava)
                  .from(ANALYSIS).leftJoin(ANALYSIS_GRAPH).on(ANALYSIS.ID.eq(ANALYSIS_GRAPH.CHILD))
                  .where(ANALYSIS.ID.eq(inserted_analysis_id))
                  .fetchOne.into(classOf[Analysis])

              }).toScala
            }
            case None => throw errors.NotExist("Case Not found")
          }
        }
        case _ => throw errors.NoPermission(s"User ${session.username} does not have permission on patient")
      }
    }


    def updateAnalysisFromCaregiver(analysis_id:Long, from_status:String, to_status:String):Future[Analysis] = {

      // Caregiver Only
      val auth_res:Future[AuthResponse] = auth.ask(ref => PermissionRole(session.id, "CAREGIVER", ref))

      // transition status from => to
      auth_res.flatMap {
        case a if (a.authorized) => {
          orm_read.fetchExists(orm_read.select().from(ANALYSIS)
          .where(ANALYSIS.ID.eq(analysis_id))
          .and(ANALYSIS.STATUS.eq(from_status))
        ) match {
          case true =>
          orm.transactionResultAsync(ctx => {
            DSL.using(ctx).update(ANALYSIS)
            .set(ANALYSIS.STATUS, to_status)
            .where(ANALYSIS.ID.eq(analysis_id))
            .execute()

            // return Analysis (with parent connection)
            DSL.using(ctx).select(Seq(ANALYSIS.asterisk(), ANALYSIS_GRAPH.PARENT).asJava)
            .from(ANALYSIS).leftJoin(ANALYSIS_GRAPH).on(ANALYSIS.ID.eq(ANALYSIS_GRAPH.CHILD))
            .where(ANALYSIS.ID.eq(analysis_id))
            .fetchOne.into(classOf[Analysis])
          }).toScala
          case false => throw errors.NotExist("Analysis does not Exist")}
        }
      case _ => throw errors.NoPermission(s"User ${session.username} does not have permission on analysis")
      }
    }

    def updateAnalysisConfirm(analysis_id:Long):Future[Analysis] = {
      auditor ! Audit(session.username, None, "UPDATE_ANALYSIS_CONFIRM", s"Update analysis ${analysis_id} to CONFIRMED")
      updateAnalysisFromCaregiver(analysis_id, "DONE", "CONFIRMED")
    }

    def updateAnalysisRedo(analysis_id:Long):Future[Analysis] = {
      auditor ! Audit(session.username, None, "UPDATE_ANALYSIS_REDO", s"Update analysis ${analysis_id} to REANALYSIS")
      updateAnalysisFromCaregiver(analysis_id, "CONFIRMED", "REANALYSIS")
    }

    def updateAnalysis(analysis_id:Long, status:String) : Future[Analysis] = {
      auditor ! Audit(session.username, None, "UPDATE_ANALYSIS", s"Update analysis ${analysis_id} to ${status}")

      // the user needs to be an admin to update status, this is a stronger
      // authoritative notion of users having access to analysis.
      // users do not dictate the state of the analysis.
      val auth_res:Future[AuthResponse] =
        auth.ask(ref => PermissionRole(session.id, "ADMIN", ref))

      auth_res.flatMap {
        case a if (a.authorized) => {
          orm_read.fetchExists(
            orm_read.select().from(ANALYSIS)
              .where(ANALYSIS.ID.eq(analysis_id))
          ) match {
            case true =>
              orm.transactionResultAsync(ctx => {

                // update status
                val update_status = DSL.using(ctx).update(ANALYSIS)
                  .set(ANALYSIS.STATUS, status)

                // update time completed if the status is done
                val update_status_time = (status match {
                  case "DONE" => update_status.set(ANALYSIS.TIME_COMPLETED, DSL.currentTimestamp)
                  case _ => update_status
                })

                // execute update
                update_status_time
                  .where(ANALYSIS.ID.eq(analysis_id))
                  .execute

                // return Analysis (with parent connection)
                DSL.using(ctx).select(Seq(ANALYSIS.asterisk(), ANALYSIS_GRAPH.PARENT).asJava)
                  .from(ANALYSIS).leftJoin(ANALYSIS_GRAPH).on(ANALYSIS.ID.eq(ANALYSIS_GRAPH.CHILD))
                  .where(ANALYSIS.ID.eq(analysis_id))
                  .fetchOne.into(classOf[Analysis])

              }).toScala

            case false => throw errors.NotExist("Analysis does not Exist")
          }
        }
        case _ => throw errors.NoPermission(s"User ${session.username} does not have permission on analysis")
      }
    }

    // [MUTATION] Phenotypes
    // ----------------------------------------------------------------------------------------------------
    def addPhenotype(patient_id: Long, user_defined: String, hpo_id: String, created_by:String, optional_analysis_id:Option[Long]): Future[Phenotype] = {
      auditor ! Audit(session.username, Some(patient_id), "ADD_PHENOTYPE", hpo_id)

      val auth_res:Future[AuthResponse] =
        auth.ask(ref => PermissionPatient(session.id, patient_id, ref))

      auth_res.flatMap {
        case a if (a.authorized) => {
          // Add Phenotype occurs (default: not important, unknown category)
          //  1) Prior to Analysis(1) when there is no affiliation
          //  2) At the end of Filter (2) and it's affiliated with an analysis

          val membership: Condition = optional_analysis_id match {
            case Some(analysis_id) => DSL.trueCondition().and(PHENOTYPE_MEMBERSHIP.ANALYSIS_ID.eq(analysis_id))
            case None => DSL.trueCondition().and(PHENOTYPE_MEMBERSHIP.ANALYSIS_ID.isNull())
          }

          orm_read.fetchExists(
            orm_read.select().from(PHENOTYPE)
              .leftJoin(PHENOTYPE_MEMBERSHIP)
              .on(PHENOTYPE.ID.eq(PHENOTYPE_MEMBERSHIP.PHENOTYPE_ID))
              .where(PHENOTYPE.HPO_ID.eq(hpo_id))
              .and(PHENOTYPE.PATIENT_ID.eq(patient_id))
              .and(membership)
          ) match {
            case true =>
              throw errors.AlreadyExists("Phenotype already exists for (patient/analysis)")

            case false =>
              val hpo_term = orm_read.select(HPO_ONT.NAME)
                .from(HPO_ONT).where(HPO_ONT.HPO_ID.eq(hpo_id.trim))
                .fetchOne.into(classOf[String])

              orm.transactionResultAsync(ctx => {
                val phenotype = DSL.using(ctx).insertInto(PHENOTYPE)
                  .columns(PHENOTYPE.ID, PHENOTYPE.PATIENT_ID, PHENOTYPE.CREATED_BY, PHENOTYPE.IMPORTANT, PHENOTYPE.CATEGORY,
                    PHENOTYPE.USER_DEFINED, PHENOTYPE.HPO_ID, PHENOTYPE.HPO_TERM)
                  .values(Seq(DSL.defaultValue(PHENOTYPE.ID), patient_id, created_by, false, "UNASSIGNED",
                    user_defined, hpo_id, hpo_term).asJavaCollection)
                  .returning(PHENOTYPE.asterisk)
                  .fetchOne.into(classOf[Phenotype])

                optional_analysis_id match {
                  case Some(analysis_id) =>

                    // Attribute Phenotype to Analysis
                    // - If analysis_id doesn't exist then FK error
                    DSL.using(ctx).insertInto(PHENOTYPE_MEMBERSHIP)
                      .columns(PHENOTYPE_MEMBERSHIP.PHENOTYPE_ID, PHENOTYPE_MEMBERSHIP.ANALYSIS_ID)
                      .values(Seq(phenotype.id, analysis_id).asJavaCollection)
                      .execute()

                  case None => // analysis_id not provided
                }

                phenotype
              }).toScala
          }
        }
        case _ => throw errors.NoPermission(s"User ${session.username} does not have permission on patient")
      }

    }

    def modifyPhenotypeAttribute(phenotype_id: Long, important:Option[Boolean], category:Option[String]): Future[Phenotype] = {
      auditor ! Audit(session.username, None, "MODIFY_PHENOTYPE_ATTRIBUTE",
        s"${phenotype_id} category:${category.getOrElse("-")} important:${important.getOrElse("-")}")

      val auth_res: Future[AuthResponse] =
        auth.ask(ref => PermissionPhenotype(session.id, phenotype_id, ref))

      auth_res.flatMap {
        case a if (a.authorized) => {
          val values_pre = (important.toList ::: category.toList).map(v => DSL.`val`(v))
          val values = DSL.row(values_pre.asJavaCollection)
          val columns = DSL.row(Seq(PHENOTYPE.IMPORTANT, PHENOTYPE.CATEGORY)
            .zip(Seq(important.isDefined, category.isDefined))
            .filter(tuple => tuple._2).unzip._1.asJavaCollection)

          if (values_pre.nonEmpty) {

            // make the actual SQL update on Phenotype
            orm.transactionResultAsync(ctx => {
              DSL.using(ctx).update(PHENOTYPE)
                .set(columns, values)
                .where(PHENOTYPE.ID.equal(phenotype_id))
                .returning(PHENOTYPE.asterisk)
                .fetchOne.into(classOf[Phenotype])
            }).toScala
          } else {

            // identity return; SQL:SELECT the Phenotype
            orm.transactionResultAsync(ctx => {
              DSL.using(ctx).select().from(PHENOTYPE)
                .where(PHENOTYPE.ID.equal(phenotype_id))
                .fetchOne.into(classOf[Phenotype])
            }).toScala
          }
        }
        case _ => throw errors.NoPermission(s"User ${session.username} does not have permission on phenotype")
      }
    }

    def removePhenotype(phenotype_id: Long): Future[Phenotype] = {
      auditor ! Audit(session.username, None, "REMOVE_PHENOTYPE", s"${phenotype_id}")

      val auth_res: Future[AuthResponse] =
        auth.ask(ref => PermissionPhenotype(session.id, phenotype_id, ref))

      auth_res.flatMap {
        case a if (a.authorized) => {
          orm_read.fetchExists(
            orm_read.select().from(PHENOTYPE).where(PHENOTYPE.ID.eq(phenotype_id))
          ) match {
            case true => {
              orm.transactionResultAsync(ctx => {
                DSL.using(ctx).deleteFrom(PHENOTYPE)
                  .where(PHENOTYPE.ID.equal(phenotype_id))
                  .returning(PHENOTYPE.asterisk)
                  .fetchOne.into(classOf[Phenotype])
              }).toScala
            }
            case false => throw errors.NotExist("Phenotype does not exist")
          }
        }
        case _ => throw errors.NoPermission(s"User ${session.username} does not have permission on phenotype")
      }
    }

    // [MUTATION] Variant Associations
    // ----------------------------------------------------------------------------------------------------
    def addVariantAssociation(analysis_id:Long, hgvs_variant:String, zygosity:String, variant_effect:String, gene:String, diseases:String, gene_pheno_score:Double, combined_score:Double, delta_combined_score:Double): Future[VariantAssociation] = {
      auditor ! Audit(session.username, None, "ADD_VARIANT_ASSOC", s"analysis:${analysis_id}")

      val auth_res:Future[AuthResponse] =
        auth.ask(ref => PermissionAnalysis(session.id, analysis_id, ref))

      auth_res.flatMap {
        case a if (a.authorized) => {
          orm_read.fetchExists(orm_read.selectOne().from(ANALYSIS)
            .where(ANALYSIS.ID.eq(analysis_id))

          ) match {
            case true =>

              orm_read.fetchExists(orm_read.selectOne().from(VARIANT_ASSOCIATION)
                  .where(VARIANT_ASSOCIATION.ANALYSIS_ID.eq(analysis_id))
                  .and(VARIANT_ASSOCIATION.HGVS_VARIANT.eq(hgvs_variant))
                  .and(VARIANT_ASSOCIATION.ZYGOSITY.eq(zygosity))
                  .and(VARIANT_ASSOCIATION.VARIANT_EFFECT.eq(variant_effect))
              ) match {

                // variant already associated - return
                case true =>
                  orm_read.transactionResultAsync(ctx =>
                    orm_read.select().from(VARIANT_ASSOCIATION)
                      .where(VARIANT_ASSOCIATION.ANALYSIS_ID.eq(analysis_id))
                      .and(VARIANT_ASSOCIATION.HGVS_VARIANT.eq(hgvs_variant))
                      .and(VARIANT_ASSOCIATION.ZYGOSITY.eq(zygosity))
                      .and(VARIANT_ASSOCIATION.VARIANT_EFFECT.eq(variant_effect))
                      .fetchOne.into(classOf[VariantAssociation])
                  ).toScala

                // variant does not exist attempt to add it
                case false =>
                  orm.transactionResultAsync(ctx => {
                    DSL.using(ctx).insertInto(VARIANT_ASSOCIATION)
                      .columns(VARIANT_ASSOCIATION.ID, VARIANT_ASSOCIATION.ANALYSIS_ID, VARIANT_ASSOCIATION.HGVS_VARIANT,
                        VARIANT_ASSOCIATION.ZYGOSITY, VARIANT_ASSOCIATION.VARIANT_EFFECT, VARIANT_ASSOCIATION.GENE,
                        VARIANT_ASSOCIATION.DISEASES, VARIANT_ASSOCIATION.GENE_PHENO_SCORE, VARIANT_ASSOCIATION.COMBINED_SCORE,
                        VARIANT_ASSOCIATION.DELTA_COMBINED_SCORE
                      )
                      .values(Seq(DSL.defaultValue(VARIANT_ASSOCIATION.ID), analysis_id, hgvs_variant, zygosity,
                        variant_effect, gene, diseases, gene_pheno_score, combined_score, delta_combined_score).asJavaCollection)
                      .returning(VARIANT_ASSOCIATION.asterisk)
                      .fetchOne.into(classOf[VariantAssociation])
                  }).toScala
              }

            case false => throw errors.NotExist("Analysis Not Found")
          }
        }
        case _ => throw errors.NoPermission(s"User ${session.username} does not have permission on analysis")
      }
    }

    // [MUTATION] Disease Associations [Flagging]
    // ----------------------------------------------------------------------------------------------------
    def addDiseaseAssociation(analysis_id:Long, disease:String): Future[DiseaseAssociation] = {
      auditor ! Audit(session.username, None, "ADD_DISEASE_ASSOC", s"analysis:${analysis_id}")

      val auth_res: Future[AuthResponse] =
        auth.ask(ref => PermissionAnalysis(session.id, analysis_id, ref))

      auth_res.flatMap {
        case a if (a.authorized) => {
          if (!orm_read.fetchExists(orm_read.selectOne().from(ANALYSIS)
            .where(ANALYSIS.ID.eq(analysis_id)))) {
            throw errors.NotExist("Analysis does not exist")
          }

          !orm_read.fetchExists(orm_read.selectOne().from(DISEASE_ASSOCIATION)
            .where(DISEASE_ASSOCIATION.ANALYSIS_ID.eq(analysis_id))
            .and(DISEASE_ASSOCIATION.DISEASE.eq(disease)))
          match {
            case true =>
              orm.transactionResultAsync(ctx => {
                DSL.using(ctx).insertInto(DISEASE_ASSOCIATION)
                  .columns(DISEASE_ASSOCIATION.ID, DISEASE_ASSOCIATION.ANALYSIS_ID, DISEASE_ASSOCIATION.DISEASE)
                  .values(Seq(DSL.defaultValue(DISEASE_ASSOCIATION.ID), analysis_id, disease).asJavaCollection)
                  .returning(DISEASE_ASSOCIATION.asterisk)
                  .fetchOne.into(classOf[DiseaseAssociation])
              }).toScala
            case false =>
              orm.transactionResultAsync(ctx => {
                orm_read.select().from(DISEASE_ASSOCIATION)
                  .where(DISEASE_ASSOCIATION.ANALYSIS_ID.eq(analysis_id))
                  .and(DISEASE_ASSOCIATION.DISEASE.eq(disease))
                  .fetchOne.into(classOf[DiseaseAssociation])
              }).toScala
          }
        }
        case _ => throw errors.NoPermission(s"User ${session.username} does not have permission on analysis")
      }
    }

    def removeDiseaseAssociation(analysis_id:Long, disease:String): Future[DiseaseAssociation] = {
      auditor ! Audit(session.username, None, "REMOVE_DISEASE_ASSOC", s"analysis:${analysis_id}")

      val auth_res: Future[AuthResponse] =
        auth.ask(ref => PermissionAnalysis(session.id, analysis_id, ref))

      auth_res.flatMap {
        case a if (a.authorized) => {
          if (!orm_read.fetchExists(orm_read.selectOne().from(ANALYSIS)
            .where(ANALYSIS.ID.eq(analysis_id)))) {
            throw errors.NotExist("Analysis does not exist")
          }
          orm_read.fetchExists(orm_read.selectOne().from(DISEASE_ASSOCIATION)
            .where(DISEASE_ASSOCIATION.ANALYSIS_ID.eq(analysis_id))
            .and(DISEASE_ASSOCIATION.DISEASE.eq(disease)))
          match {
            case true =>
              orm.transactionResultAsync(ctx => {
                DSL.using(ctx).deleteFrom(DISEASE_ASSOCIATION)
                  .where(DISEASE_ASSOCIATION.ANALYSIS_ID.eq(analysis_id))
                  .and(DISEASE_ASSOCIATION.DISEASE.eq(disease))
                  .returning(DISEASE_ASSOCIATION.asterisk)
                  .fetchOne.into(classOf[DiseaseAssociation])
              }).toScala
            case false =>
              orm.transactionResultAsync(ctx => {
                orm_read.select().from(DISEASE_ASSOCIATION)
                  .where(DISEASE_ASSOCIATION.ANALYSIS_ID.eq(analysis_id))
                  .and(DISEASE_ASSOCIATION.DISEASE.eq(disease))
                  .fetchOne.into(classOf[DiseaseAssociation])
              }).toScala
          }
        }
        case _ => throw errors.NoPermission(s"User ${session.username} does not have permission on analysis")
      }
    }

}}

// https://blog.jooq.org/2016/01/14/reactive-database-access-part-3-using-jooq-with-scala-futures-and-actors/
// https://stackoverflow.com/questions/15159842/how-to-start-transaction-and-rollback-with-jooq/24380696
// https://blog.jooq.org/2017/01/16/a-functional-programming-approach-to-dynamic-sql-with-jooq/
// https://www.jooq.org/doc/3.11/manual/sql-building/dynamic-sql/