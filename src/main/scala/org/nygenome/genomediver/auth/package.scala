// TODO add throttling to prevent dictionary attacks

package org.nygenome.genomediver

// Scala
import org.nygenome.genomediver.Server.defaultHeader

import scala.language.postfixOps
import scala.collection.JavaConverters._
import scala.compat.java8.OptionConverters._
import scala.compat.java8.FutureConverters._
import scala.reflect.io.File
import scala.util.Random

// Akka HTTP
import akka.http.scaladsl.server.{AuthorizationFailedRejection, Route, ValidationRejection}
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server.Directives.{get => http_get, post => http_post}
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import spray.json.{JsObject, JsString, JsValue}

// JOOQ
import org.jooq.impl.DSL
import org.jooq.impl.DSL.{currentTimestamp, timestamp, value}

// Genome Diver (Models, Routing)
import org.nygenome.genomediver.Server.{invSession, logger, auditSystem => auditor, reqSession, setAppSession}
import org.nygenome.genomediver.config.ConfigObj
import org.nygenome.genomediver.db.Tables.{INSTITUTION, USER, USER_MEMBERSHIP}
import org.nygenome.genomediver.db.{orm, orm_read}
import org.nygenome.genomediver.models.{InstitutionUser, SuccinctUser, User}
import org.nygenome.genomediver.models.JsonProtocol._
import org.nygenome.genomediver.requests.CredentialsSubmit
import org.nygenome.genomediver.session_models.Session
import org.nygenome.genomediver.validation.{isEmailValid, isPasswordValid, isUsernameValid, isValidToken}

// Crypto, Auditing
import com.github.t3hnar.bcrypt._
import org.nygenome.genomediver.actors.Audit._

/* ----------------------------------------------------------------------------------------------------
  NON-ADMINISTRATIVE ENDPOINTS

 - POST /user/login    (grants JWT auth token)     : User login endpoint. Accepts username/password and returns an auth token in the response header.
 - POST /user/logout   (requires JWT auth token)   : User logout endpoint. In order for the user to be logged out it needs to token.
 - GET  /user/current  (requires JWT auth token)   : The "whoami" command. Returns the username of the current logged in user
 - POST /user/confirm  (uses OTP)                  : User confirmation of registration initiated by an administrative user. sends OTP as well as his/her own password.
 - POST /user/forgot   (uses email and username)   : User has forgotten his/her password. username and email is required to trigger an "re-confirmation" step
 - POST /user/reset    (uses OTP)                  : User uses the /user/forgot token to reset his/her password
 - POST /graphql       (requires JWT auth token)   : Endpoint that accepts GraphQL queries against patients / phenotypes and so forth as defined in the query specification
----------------------------------------------------------------------------------------------------- */

package object auth {

  val login:Route = (http_post & path("user" / "login")) {
    entity(as[JsValue]) { requestJSON => {
      val r = requestJSON.convertTo[CredentialsSubmit]
      val hashed_password = r.password.bcryptBounded(ConfigObj().getString("genome_diver.bSalt"))
      val used_username:Option[String] = isEmailValid(r.username) match {
        case true =>
          orm.transactionResult(ctx => {
          DSL.using(ctx).select(USER.USERNAME)
          .from(USER)
          .where(USER.EMAIL.eq(r.username))
          .fetchOptionalInto(classOf[String]).asScala
        })
        case false => Option(r.username)
      }

      used_username match {
        case Some(username:String) if (isUsernameValid(username)) =>
          logger.info(s"login attempt of user: ${username}")
          auditor ! Audit(used_username.get, None, "LOGIN_USER", s"logging in ${username}" )

          // If hash password
          val hashed_password = r.password.bcryptBounded(ConfigObj().getString("genome_diver.bSalt"))
          val fetched_user: Option[SuccinctUser] =
            orm.transactionResult(ctx => {
              DSL.using(ctx).select(USER.ID, USER.USERNAME, USER.FIRST_NAME, USER.LAST_NAME,
                USER.ROLE, USER.ACTIVE)
                .from(USER)
                .where(USER.USERNAME.eq(username)
                  .and(USER.PASSWORD.eq(hashed_password))
                  .and(USER.ACTIVE.eq(true))
                ).fetchOptionalInto(classOf[SuccinctUser]).asScala
            })

          // if user found then successful login
          fetched_user match {
            case Some(u: SuccinctUser) =>
              setAppSession(Session(u.id, u.username, u.role)) {
                logger.info(s"logging in ${u.username}: ${u.role}")

                respondWithDefaultHeaders(defaultHeader) {
                  complete(
                    JsObject(
                      "status" -> JsString("ok"),
                      "username" -> JsString(u.username),
                      "role" -> JsString(u.role)
                    )
                  )
                }
              }
            case None => reject(ValidationRejection("Invalid username or password"))
          }
        case _ => reject(ValidationRejection("Invalid username or password"))
      }
    }}
  }

  val logout:Route = (http_post & path("user" / "logout")) {
    reqSession { session =>
      respondWithDefaultHeaders(defaultHeader) {
        invSession { ctx =>
          logger.info(s"logging out ${session.username}: ${session.role}")
          auditor ! Audit(session.username, None, "LOGOUT_USER", s"logging out ${session.username}")
          ctx.complete(JsObject("status" -> JsString("ok")))
        }
      }
    }
  }

  val currentUser:Route = (http_get & path("user" / "current")) {
    reqSession { session =>
      respondWithDefaultHeaders(defaultHeader) {
        complete(JsObject(
          "status" -> JsString("ok"),
          "username" -> JsString(session.username),
          "role" -> JsString(session.role)
        ))
      }
    }
  }

  // * endpoint takes in the Refresh-Token instead of an JWT token
  // issues a new JWT token in Set-Authorization Header
  val rememberUser = (http_post & path("user" / "remember")) {
    reqSession { session =>
      respondWithDefaultHeaders(defaultHeader) {
        complete(JsObject(
          "status" -> JsString("ok"),
          "username" -> JsString(session.username),
          "role" -> JsString(session.role)
        ))
      }
    }
  }

  val confirmUser:Route = (http_post & path("user" / "confirm")) {
      entity(as[JsValue]) { requestJSON => {
        respondWithDefaultHeaders(defaultHeader) {


        lazy val JsObject(fields) = requestJSON
        lazy val JsString(requested_password) = fields("password")
        lazy val JsString(confirm_token) = fields("confirm_token")
        lazy val route: Route = { ctx =>

          // TODO: add in timestamp difference constraint
          val affected: Option[User] = orm.transactionResult(ctx => {
            DSL.using(ctx).update(USER)
            .set(USER.REGISTRATION_STATUS, "CONFIRMED")
            .set(USER.REGISTRATION_TIME, timestamp("NULL"))
            .set(USER.PASSWORD, requested_password.bcryptBounded(ConfigObj().getString("genome_diver.bSalt")))
            .where(USER.REGISTRATION_STATUS.eq(confirm_token))
            .returning.fetch.into(classOf[User])
            .asScala.toList.headOption
          })

          affected match {
            case Some(user: User) => {
              auditor ! Audit(user.username, None, "CONFIRM_USER", s"confirming user: ${user.username}")
              ctx.complete(JsObject(
                "status" -> JsString("ok"),
                "message" -> JsString("Confirmation Accepted")
              ))
            }
            case _ => ctx.reject(ValidationRejection("Confirmation Not Accepted"))
          }
        }

        (validate(isValidToken(confirm_token), "Confirmation Not Accepted: Token is Malformed") &
          validate(isPasswordValid(requested_password), "Confirmation Not Accepted: Password does not satify complexity requirement (8+ characters)")) {
          route
        }
      }}
    }
  }

  val resetUser:Route = (http_post & path("user" / "reset")) {
      // requires username similar to confirmation
      entity(as[JsValue]) { requestJSON => {
        val JsObject(fields) = requestJSON
        val JsString(password) = fields("password")
        val JsString(reset_token) = fields("reset_token")
        val hashed_password = password.bcryptBounded(ConfigObj().getString("genome_diver.bSalt"))

        val reset_users: Option[User] = orm.transactionResult(ctx => {
          DSL.using(ctx)
            .update(USER)
            .set(USER.PASSWORD, hashed_password)
            .set(USER.FORGOTTEN_STATUS, value(null, classOf[String]))
            .set(USER.FORGOTTEN_TIME, timestamp("NULL"))
            .where(USER.FORGOTTEN_STATUS.eq(reset_token))
            .returning.fetch.into(classOf[User])
            .asScala.toList.headOption})

        // TODO: timestamp difference constraint

        reset_users match {
          case Some(user: User) => {
            logger.info(s"${user.username} reset password")
            auditor ! Audit(user.username, None, "RESET_PASS_USER", s"reset user password: ${user.username}")

            respondWithDefaultHeaders(defaultHeader) {
              complete(JsObject(
                "status" -> JsString("ok"),
                "message" -> JsString("Password Reset")
              ))
            }
          }
          case _ => reject(ValidationRejection("Reset Password Not Accepted"))
        }
      }
    }
  }

  val forgotUser:Route = (http_post & path("user" / "forgot")) {
    entity(as[JsValue]) { requestJSON => {
        // set forgot status and time
        val JsObject(fields) = requestJSON
        val JsString(email) = fields("email")

        // TODO: remove this nonsense ... (artifact from Persistence code)
        val JsString(base_url) = fields("base_url")
        // val base_url = ConfigObj().getString("genome_diver.frontend_domain")

        val forgot_token = Random.alphanumeric take 32 mkString
        val forgot_users: Option[User] = orm.transactionResult(ctx => {
          DSL.using(ctx)
          .update(USER)
          .set(USER.FORGOTTEN_STATUS, forgot_token)
          .set(USER.FORGOTTEN_TIME, currentTimestamp())
          .where(USER.EMAIL.eq(email).and(USER.ACTIVE.eq(true)))
          .returning.fetch.into(classOf[User])
          .asScala.toList.headOption})

        forgot_users match {
          case Some(user: User) => {
            File("/tmp/gd_forgot.txt").appendAll(s"${user.username}\t$email\t$base_url\t$forgot_token\n")
            logger.info(s"{$user.username} forget password; sending email to: $email")
            auditor ! Audit(user.username, None, "FORGOT_USER", s"forgot user password: ${user.username}")

            respondWithDefaultHeaders(defaultHeader) {
              complete(JsObject(
                "status" -> JsString("ok"),
                "message" -> JsString("Please check your email for a link to reset your credentials")
              ))
            }
          }
          case _ => reject(ValidationRejection("Forgot Password Not Accepted"))
        }
      }
    }
  }

}
