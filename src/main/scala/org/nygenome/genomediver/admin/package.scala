package org.nygenome.genomediver

// Scala
import scala.language.postfixOps
import scala.collection.JavaConverters._
import scala.reflect.io.File
import scala.util.Random

// Akka HTTP
import akka.http.scaladsl.server.{AuthorizationFailedRejection, Route, ValidationRejection}
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server.Directives.{delete => http_delete, get => http_get, post => http_post, put => http_put}
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import spray.json.{JsObject, JsString, JsValue}

// JOOQ
import org.jooq.impl.DSL
import org.jooq.impl.DSL.currentTimestamp

// GenomeDiver (Server, Models)
import org.nygenome.genomediver.Server.{logger, auditSystem => auditor, ver, reqSession, defaultHeader, htmlHeader}
import org.nygenome.genomediver.db.Tables.{INSTITUTION, USER, USER_MEMBERSHIP, HIPAA_AUDIT}
import org.nygenome.genomediver.db.{orm, orm_read}
import org.nygenome.genomediver.models._
import org.nygenome.genomediver.models.JsonProtocol._
import org.nygenome.genomediver.requests.{InstitutionAdd, UserRegistration, UserRemove}
import org.nygenome.genomediver.validation.{isEmailValid, isUsernameValid, isValidInstitution, isValidUserRole}

// Auditing
import org.nygenome.genomediver.actors.Audit._

/* -------------------------------------------------------------------------------------------------
 ADMINISTRATIVE ENDPOINTS (Only users w/ role ADMIN can access)

 - GET /institution        : Returns a the current list of institutions (either LAB, CLINIC)
 - PUT /institution        : Adds an institution to the current list - name, type
 - GET /users              : Returns a list of institutions with their associated users
 - DELETE /user            : "Removes a user"; Essentially sets their status to inactive.
 - PUT /user               : Create a user, also registers users to an institution
 - GET /audit              : Administrative audit log of database activities
---------------------------------------------------------------------------------------------------- */

package object admin {

  val getInstitution: Route = (http_get & path("institution")) {
    reqSession { session => respondWithDefaultHeaders(defaultHeader) {
      if (session.role != "ADMIN") {
        reject(AuthorizationFailedRejection)
      } else {
        auditor ! Audit(session.username, None, "ADMIN_VIEW_INSTITUTION", s"Admin viewing institutions" )
        complete(
          orm_read.select(INSTITUTION.ID, INSTITUTION.TYPE, INSTITUTION.NAME, INSTITUTION.ACTIVE)
            .from(INSTITUTION).fetchInto(classOf[Institution])
            .asScala.toList
        )
      }
    }}
  }

  val putInstitution: Route = (http_put & path("institution")) {
    reqSession { session => respondWithDefaultHeaders(defaultHeader) {
      if (session.role != "ADMIN") {
        reject(AuthorizationFailedRejection)
      } else {
        entity(as[JsValue]) { requestJSON => {
          lazy val r: InstitutionAdd = requestJSON.convertTo[InstitutionAdd]
          lazy val db_check: Boolean = !orm.fetchExists(orm.selectOne().from(INSTITUTION).where(INSTITUTION.NAME.eq(r.name.trim)).and(INSTITUTION.TYPE.eq(r.`type`.trim)))
          lazy val route: Route = { ctx =>

            // database insert + audit
            orm.transaction(db_ctx => {
              DSL.using(db_ctx).insertInto(INSTITUTION, INSTITUTION.TYPE, INSTITUTION.NAME)
                .values(Seq(r.`type`.trim(), r.name.trim()).asJavaCollection)
                .returning(Seq(INSTITUTION.ID, INSTITUTION.TYPE, INSTITUTION.NAME, INSTITUTION.ACTIVE).asJavaCollection)
                .fetchOne().into(classOf[Institution])
            })
            auditor ! Audit(session.username, None, "CREATE_INSTITUTION", s"Creating institution")
            ctx.complete(JsObject(
              "status" -> JsString("ok"),
              "message" -> JsString(s"Institution: [${r.name}] added.")
            ))
          }

          // input validations
          (validate(Set("LAB", "CLINIC") contains r.`type`.trim(), "Institution must be of type LAB or CLINIC") &
            validate(r.name.trim().length < 256, "Institution name is too long") &
            validate(isValidInstitution(r.name trim), "Institution name is invalid") &
            validate(db_check, s"Institution with name and type: (${r.name}, ${r.`type`}) already exists.")) {
            route
          }
        }}
      }
    }}
  }

  val getUsers: Route = (http_get & path("users")) {
    reqSession { session => respondWithDefaultHeaders(defaultHeader) {
      if (session.role != "ADMIN") {
        reject(AuthorizationFailedRejection)
      } else {
        auditor ! Audit(session.username, None, "GET_USERS", s"Adming viewing users")

        // Returns Institution-Users (excluding admin users)
          complete(
            orm_read.select(INSTITUTION.NAME.as("institution"), USER.ID, USER.FIRST_NAME,
              USER.LAST_NAME, USER.USERNAME, USER.ROLE, USER.ACTIVE, USER.MOBILE, USER.EMAIL)
              .from(INSTITUTION).join(USER_MEMBERSHIP)
              .on(INSTITUTION.ID.eq(USER_MEMBERSHIP.INSTITUTION_ID))
              .join(USER).on(USER_MEMBERSHIP.USER_ID.eq(USER.ID))
              .where(USER.ACTIVE.eq(true).and(USER.ROLE.ne("ADMIN")))
              .fetchInto(classOf[InstitutionUser])
              .asScala.toList
          )
        }
    }}
  }

  val deleteUser: Route = (http_delete & path("user")) {
    reqSession { session => respondWithDefaultHeaders(defaultHeader) {
      if (session.role != "ADMIN") {
        reject(AuthorizationFailedRejection)

      } else {
        entity(as[JsValue]) { requestJSON => {
          val r: UserRemove = requestJSON.convertTo[UserRemove]

          // delete user and audit
          orm.transaction(ctx => {
            DSL.using(ctx).update(USER)
              .set[java.lang.Boolean](USER.ACTIVE, false)
              .where(USER.USERNAME.eq(r.username trim)
                .and(USER.ROLE.ne("ADMIN")))
              .returning(
                USER.ID, USER.USERNAME, USER.FIRST_NAME,
                USER.LAST_NAME, USER.ROLE, USER.ACTIVE)
              .fetchOne()
          })

          auditor ! Audit(session.username, None, "DELETE_USER", s"Admin deleting user: ${r.username.trim}")
          complete(JsObject(
            "status" -> JsString("ok"),
            "message" -> JsString(s"User: ${r.username} deleted.")
          ))
        }}
      }
    }}
  }

  val putUser: Route = (http_put & path("user")) {
    reqSession { session => respondWithDefaultHeaders(defaultHeader) {
      if (session.role != "ADMIN") {
        reject(AuthorizationFailedRejection)

      } else {

        entity(as[JsValue]) { requestJSON => {
          lazy val r: UserRegistration = requestJSON.convertTo[UserRegistration]
          lazy val db_check: Boolean = !orm.fetchExists(orm.selectOne().from(USER).where(USER.USERNAME.eq(r.username.trim()).or(USER.EMAIL.eq(r.email.trim()))))
          lazy val route: Route = { ctx =>

            // In email conversations, this is the "One Time Password"
            val registration_token = Random.alphanumeric take 32 mkString

            // transactions wraps two inserts
            // 1) insert user with options
            // 2) insert relationship user->institution

            var registration_error: Option[String] = None
            orm.transaction(db_ctx => {
              logger.info(s"register user [started]: ${r.username}, $registration_token")

              // inserting user
              val inserted_user = DSL.using(db_ctx)
                .insertInto(USER, USER.USERNAME, USER.FIRST_NAME, USER.LAST_NAME, USER.MOBILE, USER.ROLE, USER.EMAIL, USER.PASSWORD, USER.REGISTRATION_STATUS, USER.REGISTRATION_TIME)
                .values(Seq(r.username, r.first_name, r.last_name, r.mobile, r.role, r.email, "", registration_token, currentTimestamp()).asJavaCollection)
                .returning(Seq(USER.ID, USER.USERNAME, USER.ROLE, USER.ACTIVE).asJavaCollection)
                .fetch().into(classOf[User]).asScala.toList.headOption

              // associating membership for user
              inserted_user match {
                case Some(user: User) =>
                  logger.info(s"associating ${user.username} with inst. ${r.institution_id}")

                  DSL.using(db_ctx).insertInto(USER_MEMBERSHIP, USER_MEMBERSHIP.INSTITUTION_ID, USER_MEMBERSHIP.USER_ID, USER_MEMBERSHIP.STATUS)
                    .values(Seq(r.institution_id, user.id, "").asJavaCollection)
                    .execute()

                  auditor ! Audit(session.username, None, "ADD_USER", s"Admin adding user: ${user.username.trim}")
                  auditor ! Audit(session.username, None, "ASSOCIATE_MEMBERSHIP", s"Admin associating user: ${user.username.trim} institution:${r.institution_id}")

                  File("/tmp/gd_confirmation.txt").appendAll(s"${r.email}\t$registration_token\n")
                case _ => registration_error = Option("Registration Not Accepted [User]")
              }
            })

            registration_error match {
              case Some(message: String) =>
                ctx.reject(ValidationRejection(message))

              case _ =>
                ctx.complete(JsObject(
                  "status" -> JsString("ok"),
                  "message" -> JsString("Registration acknowledged. Awaiting email confirmation")
                ))

            }
          }

          (validate(isUsernameValid(r.username), "username is invalid") &
            validate(isEmailValid(r.email), "email is not valid") &
            validate(isValidUserRole(r.role), "Invalid role for [User] expected [LAB_USER, CAREGIVER, ADMIN]") &
            validate(db_check, "username or email already exists")) {
            route
          }
        }
        }
      }
    }}
  }

  val audit: Route = (http_get & path("audit")) {
    reqSession { session => respondWithDefaultHeaders(defaultHeader) {
      if (session.role != "ADMIN") {
        reject(AuthorizationFailedRejection)
      } else {
        auditor ! Audit(session.username, None, "VIEW_AUDIT", s"Admin viewing audit")

        // TODO: not efficient, should be paginated
        complete(orm.select(HIPAA_AUDIT.asterisk)
          .from(HIPAA_AUDIT).fetchInto(classOf[HIPPAAudit]).asScala.toList
        )
      }
    }}
  }

  val version: Route = (get & pathPrefix("version")) {
    respondWithDefaultHeaders(defaultHeader) {
      complete(ver)
    }
  }

  val catch_all: Route =  (get) {
      // React should take over the routing when lab/caregiver is specified
      (pathEndOrSingleSlash | pathPrefix("lab" | "caregiver")) {
        respondWithDefaultHeaders(htmlHeader) {
          getFromResource("build/index.html")
        }
      } ~ {
        // caching is active on static assets - index.html references
        // {hash}.{js,css} and so forth in the static folder
        //respondWithDefaultHeaders(htmlHeader) {
          getFromResourceDirectory("build")
        //}
      }
  }
}


