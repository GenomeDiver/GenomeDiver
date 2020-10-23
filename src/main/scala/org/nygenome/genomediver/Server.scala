/*    TODO: Embed Google Analytics - scratch that, doing some black magic with dataframes.
      TODO: (minor) More Aggressive Security Checks / Tests (somewhat done, need more work)
*/

package org.nygenome.genomediver

// Scala
import akka.http.scaladsl.model.headers.RawHeader

import scala.language.postfixOps
import com.typesafe.scalalogging.Logger

// Akka-HTTP, Routing DSL
import akka.http.scaladsl.Http
import akka.http.scaladsl.server.{Directive0, Directive1, StandardRoute, ValidationRejection}
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.model.StatusCodes._
import akka.http.scaladsl.model.{ContentTypes, HttpEntity, HttpResponse}
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server.Directives.{post => http_post}
import akka.http.scaladsl.server.{ExceptionHandler, RejectionHandler, Route}
import spray.json._

// Authentication
import com.softwaremill.session.SessionDirectives._
import com.softwaremill.session.SessionOptions._
import com.softwaremill.session._
import org.json4s.JValue
import org.nygenome.genomediver.session_models.Session
import org.nygenome.genomediver.session_management.ConcurrentRefreshTokenStorage
import ch.megard.akka.http.cors.scaladsl.CorsDirectives._

// Akka Actors
import akka.actor.typed.scaladsl.adapter._
import akka.actor.typed.ActorSystem
// import akka.stream.typed.scaladsl.ActorMaterializer
import akka.stream.Materializer
import org.nygenome.genomediver.actors.Main
import scala.concurrent.duration._
import actors._
import org.nygenome.genomediver.actors.Audit

// HTTP Routes
import org.nygenome.genomediver.admin._
import org.nygenome.genomediver.auth._
import org.nygenome.genomediver.vcf._

object Server extends App {

  val logger = Logger("GenomeDiver")
  val ver = "1.01"

  // Akka-HTTP Setup (requires an UNTYPED actorSystem)
  implicit val actorSystem = ActorSystem(Main(), "genome-diver-server")
  implicit val materializer: Materializer = Materializer.createMaterializer(actorSystem)
  implicit val scheduler = actorSystem.scheduler
  import actorSystem.executionContext

  logger.info("Initializing Genome Diver ... ")

  // Start the supervisor actor ("Main")
  actorSystem ! "start"

  // Start the auth system
  val authSystem = ActorSystem(Authorization.actor, "authorization")

  // Start the audit
  val auditSystem = ActorSystem(Audit.actor, "auditor")

  /* -----------------------------------------------------------------------------------------------------

      JWT Session Setup [https://github.com/softwaremill/akka-http-session]
        - Randomized key at every startup; essentially the session refreshes if app is ever down
        - Setup in-memory token storage for the session, again tokens are lost if app goes down
        - Setup the session manager, with session serializer and JWT encoder.

        * token expiration is one week by default (in config)

  ------------------------------------------------------------------------------------------------------- */
  val session_config: SessionConfig = SessionConfig.default(SessionUtil.randomServerSecret())
  implicit val serializer: SessionSerializer[Session, JValue] = JValueSessionSerializer.caseClass[Session]
  implicit val encoder: JwtSessionEncoder[Session] = new JwtSessionEncoder[Session]
  implicit val manager: SessionManager[Session] = new SessionManager(session_config)

  // Storage of session information to memory
  implicit val refreshTokenStorage: RefreshTokenStorage[Session] = new ConcurrentRefreshTokenStorage[Session] {
    def log(msg: String): Unit = logger.info(msg)
  }

  // Configure Sessions [Json Web Tokens] to use Headers instead of relying on Cookies
  // JWT tokens are managed by the frontend (localStorage...)
  val methodSession = usingHeaders

  // Establish session related directives and methods used in routing.
  def setAppSession(v: Session): Directive0 = setSession(refreshable, methodSession, v)
  def reqSession:Directive1[Session] = requiredSession(refreshable, methodSession)
  def invSession:Directive0 = invalidateSession(refreshable, methodSession)

  val defaultHeader = RawHeader("Cache-Control", "no-store")
  val htmlHeader    = RawHeader("Cache-Control", "no-store")

  // Collect Routes (production / development)
  val route: Route = System.getenv("SCALA_ENV") match {
    case "production" => version ~ audit  ~
          getInstitution ~ putInstitution ~
          getUsers ~ deleteUser ~ putUser ~ upload_vcf ~
          login ~ logout ~ currentUser ~ rememberUser ~ confirmUser ~
          resetUser ~ forgotUser ~ (http_post & path("graphql")) {
          reqSession {session =>
            entity(as[JsValue]) { requestJSON =>
              respondWithDefaultHeaders(defaultHeader) {
                GraphQLServer.endpoint(requestJSON, session, authSystem, auditSystem)
              }
            }
          }
        }  ~ catch_all

    // --- route
    case _ => cors() {version ~ audit  ~
          getInstitution ~ putInstitution ~
          getUsers ~ deleteUser ~ putUser ~ upload_vcf ~
          login ~ logout ~ currentUser ~ rememberUser ~ confirmUser ~
          resetUser ~ forgotUser ~ (http_post & path("graphql")) {

          reqSession {session =>
            entity(as[JsValue]) { requestJSON =>
              respondWithDefaultHeaders(defaultHeader) {
                // ----- DEBUG SESSION
                //val debug_session:Session = Session(3, "nygc_lab", "LAB_USER")
                //val debug_session:Session = Session(4, "sinai_user", "CAREGIVER")
                // GraphQLServer.endpoint(requestJSON, debug_session, authSystem, auditSystem)
                // ----- DEBUG SESSION

                GraphQLServer.endpoint(requestJSON, session, authSystem, auditSystem)
              }
            }
          }
        }  ~ catch_all ~
          (get & path("console")) {getFromResource("graphiql.html")}
      }
  }

  /* ----------------------------------------------------------------------------------------------------
    Akka Handlers: Rejection/Exception
    - Essentially wrap HTTP Rejections/Validation/Errors into a presentable JSON format
  ---------------------------------------------------------------------------------------------------- */
  def internalServerError(error: Exception): StandardRoute =
    complete((InternalServerError, JsObject("error" -> JsString(error.getMessage))))

  implicit def rejectionHandler: RejectionHandler =
    RejectionHandler.newBuilder()
      .handle {
        case ValidationRejection(message: String, _) =>
          complete(HttpResponse(BadRequest, entity = message))
      }
      .result()
      .mapRejectionResponse {
        case res@HttpResponse(_, _, ent: HttpEntity.Strict, _) =>
          val message = ent.data.utf8String.replaceAll("\"", """\"""")
          // res.copy(entity = HttpEntity(ContentTypes.`application/json`, s"""{"error": "$message"}"""))
          res.withEntity(HttpEntity(ContentTypes.`application/json`, s"""{"error": "$message"}"""))
        case x => x
      }

  implicit def exceptionHandler: ExceptionHandler =
    ExceptionHandler {
      case error: DeserializationException => internalServerError(error)
      case error: NoSuchElementException => internalServerError(error)
      case error: Exception => internalServerError(error)
    }

  // Finally, bind routes to port 8080, and add a hook for
  //Http()(actorSystemUntyped).bindAndHandle(route, "0.0.0.0", 8080)
  Http()(actorSystem).newServerAt("0.0.0.0",8080).bind(route)
  scala.sys.addShutdownHook(() -> shutdown())

  // Shutdown all actor systems
  def shutdown(): Unit = {
    logger.info("Shutting down... ")
    Seq(authSystem, auditSystem, actorSystem).foreach {
      case sys: ActorSystem[_] =>
        sys.terminate()
        scala.concurrent.Await.result(sys.whenTerminated, 10 seconds)
    }
  }
}

// https://github.com/OlegIlyenko/sangria-auth-example
// https://graphql.org/learn/authorization/