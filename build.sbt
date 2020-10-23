// expects SCALA_ENV to be set to production | development | staging
// set up in diver.service file

name := "genome-diver"
version := "0.1.2-beta"
description := "Application to prioritize variants using phenotype information (HPO)"
maintainer:= "Kevin Shi <kshi@nygenome.org>"
packageSummary := "Genome Diver"
packageDescription := description.value
scalaVersion := "2.12.12"

// https://stackoverflow.com/questions/41372978/unknown-artifact-not-resolved-or-indexed-error-for-scalatest
ThisBuild / useCoursier := false

// force JDK to 1.8
scalacOptions ++= Seq("-unchecked", "-deprecation", "-feature", "-target:jvm-1.8")
javacOptions  ++= Seq("-source", "1.8", "-target", "1.8", "-Xlint")
initialize := {
  val _ = initialize.value
  val required = "1.8"
  val current  = sys.props("java.specification.version")
  assert(current == required, s"Unsupported JDK: java.specification.version $current != $required")
}

// official repositories
resolvers += "Sonatype Releases" at "https://oss.sonatype.org/content/repositories/releases/"
resolvers += Resolver.sonatypeRepo("snapshots")

// custom libraries (external jars)
unmanagedBase := baseDirectory.value / "lib"

// sbt packaging to rpm, docker, graal ...
enablePlugins(JavaServerAppPackaging)
// enablePlugins(LinuxPlugin)

// JOOQ code generation plugin
enablePlugins(JooqCodegen)

// JOOQ code generation configuration
jooqVersion := "3.12.4"
jooqOrganization := "org.jooq"
autoJooqLibrary := true
jooqCodegenStrategy := CodegenStrategy.IfAbsent
jooqCodegenConfig := baseDirectory.value / "src" / "main" / "resources" / "jooq-codegen.xml"

// Security (TSec)
val tsecV = "0.2.1"
libraryDependencies ++= Seq(
  "io.github.jmcardon" %% "tsec-common" % tsecV,
  "io.github.jmcardon" %% "tsec-cipher-bouncy" % tsecV
)

libraryDependencies ++= Seq(
  "org.bouncycastle"    % "bcprov-jdk15on"        % "1.66",
  "com.github.t3hnar"   %% "scala-bcrypt"         % "4.3.0",
  "joda-time"           % "joda-time"             % "2.10.6",
  "com.typesafe"        % "config"                % "1.4.0",
  "ch.qos.logback"      % "logback-classic"       % "1.2.3" % Runtime,
  "com.typesafe.scala-logging" %% "scala-logging" % "3.9.2",
  "com.zaxxer"           % "HikariCP"             % "3.4.5",
  "org.jooq"            %% "jooq-scala"           % "3.12.4",
  "org.sangria-graphql" %% "sangria"              % "2.0.0",
  "org.sangria-graphql" %% "sangria-spray-json"   % "1.0.2",
  "com.typesafe.akka"   %% "akka-actor-typed"     % "2.6.9",
  "com.typesafe.akka"   %% "akka-stream-typed"    % "2.6.9",
  "com.typesafe.akka"   %% "akka-http"            % "10.2.1",
  "com.typesafe.akka"   %% "akka-http-caching"    % "10.2.1",
  "com.typesafe.akka"   %% "akka-http-spray-json" % "10.2.1",
  "ch.megard"           %% "akka-http-cors"       % "1.1.0",
  "com.softwaremill.akka-http-session" %% "core"  % "0.5.11",
  "com.softwaremill.akka-http-session" %% "jwt"   % "0.5.11",
  "org.postgresql"      %  "postgresql"           % "42.2.16",
  "org.postgresql"      %  "postgresql"           % "42.2.16" % "jooq",
  "org.scalatest"       %% "scalatest"            % "3.2.2"  % Test
)

// TODO ScalaCheck?
envVars in Test := Map("PROJECT_ENV" -> "test")

// Build Parameters
rpmVendor := "typesafe"
name in Linux := name.value
linuxPackageMappings in Rpm := linuxPackageMappings.value

// Shell Exit
fork in Test := true
cancelable in Global := true
