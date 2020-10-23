package org.nygenome.genomediver

// Java/Scala
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import scala.language.postfixOps
import scala.concurrent.duration._
import scala.sys.process.{Process, ProcessLogger}
import scala.collection.JavaConverters._
import scala.compat.java8.OptionConverters._

//  Akka
import akka.actor.typed.scaladsl.{AbstractBehavior, ActorContext, Behaviors}
import akka.actor.typed.{ActorRef, Behavior, DispatcherSelector, PostStop}

// --- JOOQ
import org.jooq.impl.DSL
import org.nygenome.genomediver.db.Tables._
import org.nygenome.genomediver.models.{AnalysisInput, AnalysisInternal, Case}
import org.nygenome.genomediver.db.{orm, orm_read}
import org.nygenome.genomediver.config.ConfigObj
import org.nygenome.genomediver.Server.logger


package object actors {

  object Main {
    def apply(): Behavior[String] =
      Behaviors.setup(context => new Main(context))
  }

  class Main(context: ActorContext[String]) extends AbstractBehavior[String](context) {
    override def onMessage(msg: String): Behavior[String] =
      msg match {
        case "start" =>
          val props = DispatcherSelector.fromConfig("blocking-dispatch")

          // spawn the scheduler actor (messages self)
          val schedulerRef = context.spawn(Scheduler.actor, "scheduler", props)
          schedulerRef ! Scheduler.TICK(Map.empty[Long, Process])

          // spawn the audit actor
          // context.spawn(Audit.actor, name = "audit", props)

          Behaviors.same // vs this
      }
  }

  object Scheduler {

      /* -----------------------------------------------------------------------------
        Single Process Scheduler

          - kicks of analysis (QUEUED -> RUNNING)
          - cleans up any detached process (RUNNING -> QUEUED)
          - bottlenecks to (1) process to analysis
          - checks at periodic intervals whether to start a new (Nextflow) process
          - unnecessary if pipeline manager is connected to a cluster manager.

      ----------------------------------------------------------------------------- */
      val PIPELINE_MANAGER_DIR = ConfigObj().getString("genome_diver.pipeline_manager_dir")
      val PIPELINE_MANAGER_EXE = ConfigObj().getString("genome_diver.pipeline_manager_exe")
      val DATA_DIR = ConfigObj().getString("genome_diver.data_directory")
      val TICK_DELAY = 30 seconds

      sealed trait SchedulerOps
        final case object TIMER_KEY
        final case class TICK(processes:Map[Long, Process]) extends SchedulerOps
        final case object GRACEFUL_CLOSE extends SchedulerOps

      sealed trait StatusOps {val enum: String}
        final case object RUNNING extends StatusOps {val enum = "RUNNING"}
        final case object QUEUED extends StatusOps {val enum = "QUEUED"}

      // def cleanup(log: Logger): Unit = { log.info("cleaning up")}

      def get_analysis_list(status:StatusOps) : List[AnalysisInternal] = {
        orm_read.select().from(ANALYSIS)
          .where(ANALYSIS.STATUS.eq(status.enum))
          .fetchInto(classOf[AnalysisInternal]).asScala.toList
      }

      def get_disabled_list(ids:Seq[Long]): List[AnalysisInternal] = {
        orm_read.select().from(ANALYSIS)
          .where(ANALYSIS.STATUS.eq("DISABLED"))
          .and(ANALYSIS.ID.in(ids.asJava))
          .fetchInto(classOf[AnalysisInternal]).asScala.toList
      }

      def get_case(analysis:AnalysisInternal): Option[Case] = {
        orm_read.select().from(CASE)
        .where(CASE.ID.eq(analysis.case_id))
          .limit(1)
        .fetchOptionalInto(classOf[Case]).asScala
      }

      def get_analysis_input(analysis:AnalysisInternal) : List[AnalysisInput] = {
        orm_read.select().from(ANALYSIS_INPUT)
          .where(ANALYSIS_INPUT.ANALYSIS_ID.eq(analysis.id))
          .fetchInto(classOf[AnalysisInput]).asScala.toList
      }

      def set_analysis_status(analysis:AnalysisInternal, status:StatusOps): Unit = {
        orm.transaction(ctx => {
          DSL.using(ctx).update(ANALYSIS).set(ANALYSIS.STATUS, status.enum)
          .where(ANALYSIS.ID.eq(analysis.id))
          .execute()
        })
      }

      def reset_detached_analysis(detached_analysis: List[AnalysisInternal]): Unit = {
        // + Running Analysis  and missing process        (clear sign to reset)
        // + Process Exists    and analysis not running.  (analysis can be concluded)

        // only if RUNNING -> QUEUED (state transition, enforced)
        if (!detached_analysis.isEmpty) {
          orm.transaction(ctx => {
            DSL.using(ctx).update(ANALYSIS).set(ANALYSIS.STATUS, QUEUED.enum)
            .where(ANALYSIS.ID.in(detached_analysis.map(_.id).asJavaCollection))
            .and(ANALYSIS.STATUS.eq(RUNNING.enum))
            .execute()
          })
        }
      }

      val actor = Behaviors.withTimers[SchedulerOps](
        timers => {
          Behaviors
            .receive[SchedulerOps] {
              (context, message) =>
                message match {
                  case TICK(processes:Map[Long, Process]) =>
                    context.log.info("Scanning for (QUEUED/RUNNING) analysis... ")

                    // ACQUIRE QUEUED ANALYSIS
                    // ===============================================================================
                    // 1) Grab all RUNNING States and compare against living processes.
                    // 2) All running analysis must have a corresponding process
                    // 3) Otherwise, reset state to "QUEUED", (assuming a disconnection event occurred)

                    val disabled_analysis = get_disabled_list(processes.keySet.toSeq)
                    val living_processes = processes.foldLeft(Map.empty[Long, Process])(
                      (acc, value) =>
                        value._2.isAlive() match {

                          // process is alive, but is it disabled in the database
                          case true  => {
                            if (disabled_analysis.map(_.id).contains(value._1)) {
                              // kill off process (SIGTERM) - set as DISABLED in database.
                              value._2.destroy()
                              acc
                            } else {
                              acc + (value._1 -> value._2)
                            }
                          }

                          // process is no longer alive
                          case false => {

                            // did the process exit cleanly or error out ?
                            value._2.exitValue() match {
                              case 0 => context.log.info("Process completed successfully (code:0)")
                              case x => context.log.error(s"Process encountered an error (code:${x})")
                            }

                            // processes has updated outside this checkpoint
                            acc
                          }
                        }
                    )

                    // Detached RUNNING revert to QUEUED
                    reset_detached_analysis(
                      get_analysis_list(RUNNING).filter(analysis =>
                        !(living_processes.keySet).contains(analysis.id)
                      )
                    )

                    // KICKOFF (process / db entry / process map)
                    // ===============================================================================
                    // 1) Kick off analysis in the QUEUED state
                    // 2) Hold a map of (analysis_id -> Process)
                    // 3) Set analysis to the RUNNING state
                    // 4) Message map to self (actor)

                    // bottleneck
                    //val queued_analysis = if (living_processes.size == 0) get_analysis_list(QUEUED) else List.empty[AnalysisInternal]
                    val queued_analysis = get_analysis_list(QUEUED)
                    val pipeline_manager_dir = new java.io.File(s"${PIPELINE_MANAGER_DIR}")
                    val process_logger = ProcessLogger(
                      (stdout: String) => logger.debug(stdout),
                      (stderr: String) => logger.error(stderr))

                    val submitted_processes = queued_analysis.foldLeft(Map.empty[Long, Process])(
                      (acc, analysis) => {
                        val input:List[AnalysisInput] = get_analysis_input(analysis)
                        context.log.info(s">> LAUNCHING PIPELINE:\t (${analysis.pipeline})")

                        get_case(analysis) match {
                          case Some(c) =>

                            val parent_analysis:Option[Long] = orm_read
                              .select(ANALYSIS_GRAPH.PARENT).from(ANALYSIS_GRAPH)
                              .where(ANALYSIS_GRAPH.CHILD.eq(analysis.id))
                              .limit(1)
                              .fetchOptionalInto(classOf[Long])
                              .asScala

                            val current_date = DateTimeFormatter
                                .ofPattern(s"yyyyMMdd")
                                .format(LocalDateTime.now)

                            val cmd = Seq(
                              s"${PIPELINE_MANAGER_EXE}", "-q",
                              "-log",               s"${PIPELINE_MANAGER_DIR}/logs/pipeline",
                              "-C",                 s"${PIPELINE_MANAGER_DIR}/nextflow.config",
                              "run",                s"${PIPELINE_MANAGER_DIR}/pipelines/${analysis.pipeline}.nf",
                              "-profile",           "standard",
                              "--dir",              s"${DATA_DIR}",
                              "--patient",          s"${c.patient_id}",
                              "--parent_analysis",  s"${parent_analysis.getOrElse("-")}",
                              "--analysis",         s"${analysis.id}",
                              "--hpo",              input.filter(i => i.name.toUpperCase == "PHENOTYPE").map(_.value).mkString(","),
                              "--vcf",              input.filter(i => i.name.toUpperCase == "VCF").map(_.value).headOption.getOrElse("-"),
                              "--ref_assembly",     input.filter(i => i.name.toUpperCase == "REFERENCE").map(_.value).head,
                              "--sex",              input.filter(i => i.name.toUpperCase == "SEX").map(_.value).head
                            )

                            // kick off process
                            val process = Process(cmd, pipeline_manager_dir).run(process_logger)

                            // set the state in the database
                            set_analysis_status(analysis, RUNNING)

                            // update process map
                            acc + (analysis.id -> process)

                          case None => {
                            // unable to find affiliated case to the analysis
                            acc
                          }
                        }
                      }
                    )

                    // merge monitored process with newly submitted processes into map
                    // send process map to self after some delay.
                    timers.startSingleTimer(
                      TIMER_KEY, TICK(living_processes ++ submitted_processes), TICK_DELAY)

                    Behaviors.same
                  case GRACEFUL_CLOSE => Behaviors.stopped
                }
          }.receiveSignal {
            case (context, PostStop) => Behaviors.stopped
              //{ () => cleanup(context.system.log)}
          }
      })
  }

  object Authorization {
    sealed trait AuthRequest

    // --- Requests
    final case class PermissionPatient(user_id:Long,
     patient_id:Long, respondTo:ActorRef[AuthResponse]
    ) extends AuthRequest

    final case class PermissionAnalysis(user_id:Long,
      analysis_id:Long, respondTo:ActorRef[AuthResponse]
    ) extends AuthRequest

    final case class PermissionPhenotype(user_id:Long,
     phenotype_id:Long, responseTo:ActorRef[AuthResponse]
    ) extends AuthRequest

    final case class PermissionRole(user_id:Long,
     required_role:String, responseTo:ActorRef[AuthResponse]
    ) extends AuthRequest

    // -- Response
    final case class AuthResponse(authorized:Boolean)

    // val AuthServiceKey = ServiceKey[AuthRequest]("AuthService")

    /* ---------------------------------------------------------------------------
      Authorization Actor
      ----------------------------------------------------------------------------- */
    val actor:Behavior[AuthRequest] = Behaviors.setup { ctx =>
      // setup and register as service to the system receptionist
      // ctx.system.receptionist ! Receptionist.Register(AuthServiceKey , ctx.self)

      // receive-response authorization assertions
      Behaviors.receiveMessage[AuthRequest] {

        case PermissionPatient(user_id, patient_id, respondTo) => {
          ctx.log.debug("[permission patient]")
          respondTo ! AuthResponse(orm_read.fetchExists(
            orm_read.selectOne.from(PATIENT)
              .join(PATIENT_MEMBERSHIP).on(PATIENT_MEMBERSHIP.PATIENT_ID.eq(PATIENT.ID))
              .join(USER_MEMBERSHIP).on(USER_MEMBERSHIP.INSTITUTION_ID.eq(PATIENT_MEMBERSHIP.INSTITUTION_ID))
              .where(USER_MEMBERSHIP.USER_ID.eq(user_id))
              .and(PATIENT.ID.eq(patient_id))
          ))
          Behaviors.same
        }

        case PermissionAnalysis(user_id, analysis_id, respondTo) => {
          ctx.log.debug("[permission analysis]")
          respondTo ! AuthResponse(orm_read.fetchExists(
            orm_read.selectOne.from(ANALYSIS)
              .join(CASE).on(ANALYSIS.CASE_ID.eq(CASE.ID))
              .join(PATIENT).on(PATIENT.ID.eq(CASE.PATIENT_ID))
              .join(PATIENT_MEMBERSHIP).on(PATIENT_MEMBERSHIP.PATIENT_ID.eq(PATIENT.ID))
              .join(USER_MEMBERSHIP).on(USER_MEMBERSHIP.INSTITUTION_ID.eq(PATIENT_MEMBERSHIP.INSTITUTION_ID))
              .where(USER_MEMBERSHIP.USER_ID.eq(user_id))
              .and(ANALYSIS.ID.eq(analysis_id))
          ))
          Behaviors.same
        }

        case PermissionPhenotype(user_id, phenotype_id, respondTo) => {
          ctx.log.info("[permission phenotype]]")
          respondTo ! AuthResponse(orm_read.fetchExists(
            orm_read.selectOne.from(PHENOTYPE)
              .join(PATIENT).on(PATIENT.ID.eq(PHENOTYPE.PATIENT_ID))
              .join(PATIENT_MEMBERSHIP).on(PATIENT_MEMBERSHIP.PATIENT_ID.eq(PATIENT.ID))
              .join(USER_MEMBERSHIP).on(USER_MEMBERSHIP.INSTITUTION_ID.eq(PATIENT_MEMBERSHIP.INSTITUTION_ID))
              .where(USER_MEMBERSHIP.USER_ID.eq(user_id))
              .and(PHENOTYPE.ID.eq(phenotype_id))
          ))
          Behaviors.same
        }

        case PermissionRole(user_id, required_role, responseTo) => {
          ctx.log.info("[permission role verify]")
          responseTo ! AuthResponse(orm_read.fetchExists(
            orm_read.selectOne.from(USER)
              .where(USER.ID.eq((user_id)))
              .and(USER.ACTIVE.eq(true))
              .and(USER.ROLE.eq(required_role))
            ))
          Behaviors.same
        }

        }.receiveSignal {
          case (context, PostStop) => Behaviors.stopped
        }
    }
  }

  object Audit {
    sealed trait AuditRequest

    final case class Audit(
      username:String,
      patient_id:Option[Long],
      action:String,
      value:String)
    extends AuditRequest

    // val AuditServiceKey = ServiceKey[AuditRequest]("AuditService")

    val actor:Behavior[AuditRequest] = Behaviors.setup { ctx =>

      // Submit Tracking to Receptionist
      // ctx.system.receptionist ! Receptionist.Register(AuditServiceKey , ctx.self)

      Behaviors.receiveMessage[AuditRequest] {
        case Audit(username, patient_id, action, value) => {
          ctx.log.info("audit")

          patient_id.isDefined match {
            case true => {
              orm.transaction(ctx =>
                DSL.using(ctx).insertInto(HIPAA_AUDIT, HIPAA_AUDIT.USER_NAME,
                  HIPAA_AUDIT.PATIENT_ID, HIPAA_AUDIT.ACTION, HIPAA_AUDIT.VALUE)
                  .values(Seq(username, patient_id.get, action, value).asJavaCollection)
                  .execute()
              )
            }
            case false => {
              orm.transaction(ctx =>
                DSL.using(ctx).insertInto(HIPAA_AUDIT, HIPAA_AUDIT.USER_NAME,
                  HIPAA_AUDIT.ACTION, HIPAA_AUDIT.VALUE)
                .values(Seq(username, action, value).asJavaCollection)
                .execute()
              )
            }
          }
          Behaviors.same
        }
      }.receiveSignal {
        case (context, PostStop) => Behaviors.stopped
      }
    }
  }
}

// https://github.com/johanandren/akka-typed-samples/tree/devdays-vilnius-2018/src/main/scala/com/lightbend/akka/samples/scala
// http://www.smartjava.org/content/akka-typed-actors-exploring-receptionist-pattern/
// https://doc.akka.io/docs/akka/current/typed/actor-discovery.html
// https://doc.akka.io/docs/akka/current/typed/interaction-patterns.html

// * IMPORTANT *
// https://doc.akka.io/docs/akka/current/typed/interaction-patterns.html
// https://alvinalexander.com/scala/akka-actor-how-to-send-message-wait-for-reply-ask
// https://doc.akka.io/docs/akka/current/dispatchers.html#blocking-needs-careful-management
// https://www.scala-lang.org/api/current/scala/sys/process/index.html
// https://contributors.scala-lang.org/t/what-do-we-do-with-scala-sys-process/1473