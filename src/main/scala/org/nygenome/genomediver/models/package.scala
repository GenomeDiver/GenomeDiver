package org.nygenome.genomediver

import org.joda.time.DateTime
import sangria.execution.deferred.HasId
import spray.json._
import DefaultJsonProtocol._

package object models {

  // Identifiable is required for models Sangria/GraphQL, models must have an `id` attribute
  trait Identifiable {val id: Long}

  object Identifiable {implicit def hasId[T <: Identifiable]: HasId[T, Long] = HasId(_.id)}

  case class Institution(
      id:Long,
      `type`:String,
      name:String,
      active:Boolean)
  extends Identifiable

  case class User(
      id:Long,
      username:String,
      first_name:String,
      last_name:String,
      mobile:String,
      role:String,
      active:Boolean,
      email:String,
      password:String,
      registration_status:String,
      forgotten_status:String,
      registration_time:String,
      forgotten_time:String)
  extends Identifiable

  // add in a status new -> lab - caregiver
  case class Patient(
      id: Long,
      first_name_enc: String,
      last_name_enc: String,
      sex: String,
      mrn_id_enc: String,
      physician_first_name: String,
      physician_last_name: String,
      physician_email:String,
      gc_first_name:String,
      gc_last_name:String,
      gc_email:String,
      date_of_birth: DateTime,
      date_of_report: DateTime,
      status: String,
      active: Boolean)
    extends Identifiable

  // User class actually contains a lot of password related fields, no need to model them
  // if they are not returned or displayed, again strive for minimal representation instead of generality
  case class SuccinctUser(
       id:Long,
       username:String,
       first_name:String,
       last_name:String,
       role:String, active:Boolean)
  extends Identifiable

  // A convenience class for the presentation of Institution joined w/ User
  case class InstitutionUser(
      institution:String,
      id:Long,
      first_name:String,
      last_name:String,
      username:String,
      role:String,
      active:String,
      mobile:String,
      email:String)

  case class SuccintAudit(
     table_name:String,
     action_tstamp:String,
     action:String)

  case class HPOOntology(
      id: Long,
      hpo_id: String,
      name: String,
      description: String,
      search_dist: Double)
  extends Identifiable

  case class HPOGeneToPhenotype(
      id: Long,
      entrez_gene_id: Long,
      entrez_gene_symbol: String,
      hpo_term: String,
      hpo_id: String)
  extends Identifiable

  case class HPOAnnotationDisease(
      id:Long,
      disease_id:String,
      disease_name:String,
   ) extends Identifiable

  case class Case(
     id: Long,
     patient_id:Long,
     name: String,
     active: Boolean)
    extends Identifiable

  case class AnalysisInternal( id: Long, case_id:Long, time_started:Long,
     time_completed:Long, pipeline:String, status:String, comment:String) extends Identifiable

  case class Analysis(
     id: Long,
     case_id:Long,
     time_started:Long,
     time_completed:Long,
     pipeline:String,
     status:String,
     comment:String,
     parent:Long = 0)
  extends Identifiable

  case class SuccinctAnalysis(
     id: Long,
     pipeline:String,
     status:String,
     parent:Long = 0)
  extends Identifiable

  case class HIPPAAudit(
     username:String,
     patient_id:Option[Long],
     action:String,
     value:String,
     action_tstamp:Long)

  case class AnalysisInput(
     id:Long,
     analysis_id:Long,
     name:String,
     value:String)
  extends Identifiable

  case class Phenotype(
      id: Long,
      patient_id: Long,
      created_by: String,
      important: Boolean,
      category: String,
      user_defined: String,
      hpo_id: String,
      hpo_term:String)
  extends Identifiable

  case class DiseaseGeneMap(
     disease:String,
     selected:String,
     gene:String,
     combined_score:Double,
     delta_combined_score:Double
   )

  // context should be LAB | CAREGIVER | AUTOMATION (Exomiser results)
  case class VariantAssociation(
     id:Long,
     analysis_id:Long,
     hgvs_variant:String,
     zygosity:String,
     variant_effect:String,
     gene:String,
     diseases:String,
     gene_pheno_score:Double,
     combined_score:Double,
     delta_combined_score:Double)
  extends Identifiable

  case class DiseaseAssociation(
    id:Long,
    analysis_id:Long,
    disease:String)
  extends Identifiable

  object JsonProtocol {
    import org.nygenome.genomediver.requests._
    implicit def listJsonWriter[T : JsonWriter]: RootJsonWriter[List[T]] = new RootJsonWriter[List[T]] {
      def write(list: List[T]): JsArray = JsArray(list.map(_.toJson).toVector)
    }

    implicit val HIPPAAuditFormat           = jsonFormat5(HIPPAAudit)
    implicit val InstitutionFormat          = jsonFormat4(Institution)
    implicit val InstitutionAddFormat       = jsonFormat2(InstitutionAdd)
    implicit val institutionUserFormat      = jsonFormat9(InstitutionUser)
    implicit val UserFormat                 = jsonFormat6(SuccinctUser)
    implicit val UserRemoveFormat           = jsonFormat1(UserRemove)
    implicit val AuditFormat                = jsonFormat3(SuccintAudit)
    implicit val UserRegistrationFormat     = jsonFormat7(UserRegistration)
    implicit val CredentialsFormat          = jsonFormat2(CredentialsSubmit)
    implicit val institutionSpecificFormat  = jsonFormat1(InstitutionSpecific)
  }
}

package object conversion {
  import java.sql.Date
  import org.jooq.Converter

  // java.sql.date <--> JodaDateTime
  class JodaDateTimeConverter extends Converter[Date, DateTime] {
    def from(databaseObject:Date) : DateTime = {
      new DateTime(databaseObject)
    }
    def to (userObject:DateTime) : Date = {
      new Date(userObject.getMillis)
    }
    def fromType():Class[Date] = {
      classOf[Date]
    }
    def toType():Class[DateTime] = {
      classOf[DateTime]
    }
  }
}

// https://medium.com/@stijnvermeeren.be/implicit-resolution-in-scala-an-example-with-spray-json-2de66e508e5a