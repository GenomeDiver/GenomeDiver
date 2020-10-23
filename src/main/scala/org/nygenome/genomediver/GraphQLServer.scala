package org.nygenome.genomediver

// Scala
import scala.util.{Failure, Success}
import scala.concurrent.ExecutionContext
import akka.actor.typed.{ActorSystem}
import org.nygenome.genomediver.actors.Audit.AuditRequest
import org.nygenome.genomediver.actors.Authorization.AuthRequest

// Akka
import akka.http.scaladsl.model._
import akka.http.scaladsl.server._
import StatusCodes._
import Directives._
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import spray.json.{JsObject, JsString, JsValue}

// Sangria (GraphQL)
import org.nygenome.genomediver.context.GraphQLContext
import sangria.marshalling.sprayJson._
import sangria.validation.QueryValidator
import sangria.parser.QueryParser
import sangria.ast.Document
import sangria.execution._

// Session Object (for Authentication)
// Authorization resolved in resolver functions
import org.nygenome.genomediver.session_models.Session

object GraphQLServer {
  private def formatError(error: Throwable): JsValue = {
    JsObject("error" -> JsString(error.getMessage))
  }

  // GraphQL Service entry point w/ mandatory session (authentication)
  // auth is the authorization actor system
  // auditor is the HIPAA tracking log
  def endpoint(requestJSON: JsValue, session: Session,
               auth:ActorSystem[AuthRequest],
               auditor:ActorSystem[AuditRequest])(implicit ec: ExecutionContext): Route = {

    val JsObject(fields) = requestJSON
    val JsString(query) = fields("query")

    QueryParser.parse(query) match {
      case Success(queryAst) =>

        val operation = fields.get("operationName") collect {
          case JsString(op) => op
        }

        val vars = fields.get("variables") match {
          case Some(obj: JsObject) => obj
          case _ => JsObject.empty
        }

        // ... all (marshalling) is dependent on SprayJSON
        complete(execute(queryAst, operation, vars, session, auth, auditor))

      case Failure(error) =>
        complete(BadRequest, formatError(error))
    }
  }

  private def execute(query: Document,
                      operation: Option[String],
                      vars: JsObject,
                      session: Session,
                      auth: ActorSystem[AuthRequest],
                      auditor: ActorSystem[AuditRequest]
                     )(implicit ec: ExecutionContext) = {

    // Execute Query according to Schema definitions
    // -------------------------------------------------------------------------------------------
    Executor.execute(
      GraphQLSchema.SchemaDefinition,          // Schema Definition: Query API
      query,                                   // Validated GraphQL Query
      GraphQLContext(session, auth, auditor),  // GraphQLContext (w/ session) binds to ORM
      (),                                      //
      operation,                               // assuming this is query | mutation | subscription
      vars,
      QueryValidator.default,
      GraphQLSchema.Resolver
    ).map(OK -> _).recover {
      case error: QueryAnalysisError => BadRequest -> error.resolveError
      case error: ErrorWithResolver => InternalServerError -> error.resolveError
    }
  }
}

