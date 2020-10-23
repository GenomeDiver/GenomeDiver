package org.nygenome.genomediver

// Scala, Java
import scala.language.postfixOps
import akka.util.Timeout
import scala.concurrent.Future
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.io.File
import java.nio.file.{Files, Path, Paths, StandardCopyOption}

// Akka HTTP
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import akka.http.scaladsl.server.Directives.{post => http_post, _}
import akka.http.scaladsl.server.directives.FileInfo
import akka.http.scaladsl.server.{AuthorizationFailedRejection, Route, ValidationRejection}
import spray.json.{JsObject, JsString}

// Genome Diver (Routing, Models, ...)
import org.nygenome.genomediver.Server.reqSession
import org.nygenome.genomediver.config.ConfigObj

// Actor (auth)
import org.nygenome.genomediver.actors.Authorization._
import akka.actor.typed.scaladsl.AskPattern._
import org.nygenome.genomediver.Server.authSystem
import org.nygenome.genomediver.session_models.Session
import scala.concurrent.duration._
import scala.concurrent.Await

package object vcf {
  val upload_vcf:Route = path("upload" / "vcf" / """(\d+)""".r) {
    patient_id => http_post { reqSession { session:Session => extractRequestContext {ctx =>

      /*  File Uploads are not part of the GraphQL spec. While there are ways to enable it the solutions
          all appear to be fairly hacky and I'm not trusting it for potentially large files. */

      // Actor implicits that need to be defined
      val timeout_duration = 5 seconds
      implicit val ec: scala.concurrent.ExecutionContext = scala.concurrent.ExecutionContext.global
      implicit val timeout: Timeout = timeout_duration
      implicit val scheduler = authSystem.scheduler

      // Only authenticated & authorized ("LAB") users can upload VCF
      val rol_perm:Future[AuthResponse] = authSystem.ask(ref => PermissionRole(session.id, "LAB_USER", ref))
      val pat_perm:Future[AuthResponse] = authSystem.ask(ref => PermissionPatient(session.id, patient_id.toInt, ref))

      // both requests (role:LAB, user->patient) passing
      val authorized:Future[Boolean] = rol_perm.flatMap{
        case r if (r.authorized) => pat_perm.flatMap{
          case p if (p.authorized) => Future.successful(true)
          case _ => Future.successful(false)}
        case _ => Future.successful(false)}

      // awaiting (blocking) only on authorization
      Await.result(authorized, timeout_duration) match {
        case true => withSizeLimit(5368709120L) {
          def tempDestination(fileInfo: FileInfo): File = File.createTempFile(fileInfo.fileName, ".tmp")
          storeUploadedFile("vcf", tempDestination) {
            case (metadata, file) =>
              metadata.fileName.endsWith(".vcf") || metadata.fileName.endsWith(".vcf.gz") match {

                case true =>
                  val data_directory = Paths.get(s"${ConfigObj().getString("genome_diver.data_directory")}")
                  val patient_working_dir: Path = Paths.get(s"${data_directory.toAbsolutePath}/patient-${patient_id}")

                  // create patient directory if it does not exist
                  if (!Files.exists(data_directory)) Files.createDirectory(data_directory)
                  if (!Files.exists(patient_working_dir)) Files.createDirectory(patient_working_dir)

                  // transfer temp file to ultimate destination
                  // eliminate punctuation
                  // eliminate spaces
                  val destFileName = DateTimeFormatter.ofPattern(s"yyyyMMdd-HHmmss")
                    .format(LocalDateTime.now) + "_" + metadata.fileName
                      .replaceAll(" ", "_")
                      //.replaceAll(raw"""([\p{Punct}&&[^.]]|\b\p{IsLetter}{1,2}\b)\s*""", "")

                  // copy to destination is to replace the existing file.
                  val destFile = patient_working_dir.resolve(destFileName)
                  Files.copy(file.toPath, destFile, StandardCopyOption.REPLACE_EXISTING)
                  file.delete()

                  // vcf_namespace is important as it pins down the vcf used in analysis
                  complete(JsObject(
                    "status" -> JsString(s"success"),
                    "message" -> JsString(s"Successful upload of ${destFileName}"),
                    "vcf_namespace" -> JsString(s"${destFileName}")
                  ))

                case false => reject(ValidationRejection("Filename must be .vcf or vcf.gz"))
              }
          }
        }
        case _ => reject(AuthorizationFailedRejection)}
    }}}}}

// https://leapgraph.com/graphql-file-uploads