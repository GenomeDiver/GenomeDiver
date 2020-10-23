package org.nygenome.genomediver
import org.nygenome.genomediver.config.ConfigObj
import com.zaxxer.hikari.{ HikariConfig, HikariDataSource }
import org.jooq.{DSLContext, SQLDialect}
import org.jooq.impl.DSL

package object db {

  // [ Read / Wite ] Connection Pool
  // ---------------------------------------------------------------------------
  val config:HikariConfig = {
    val c = new HikariConfig()
    c.setDriverClassName("org.postgresql.Driver")
    c.setJdbcUrl(ConfigObj().getString("genome_diver.databaseURL"))
    c.setUsername(ConfigObj().getString("genome_diver.databaseUser"))
    c.setPassword(ConfigObj().getString("genome_diver.databasePassword"))
    c.setMinimumIdle(ConfigObj().getInt("genome_diver.dbPoolMin"))
    c.setMaximumPoolSize(ConfigObj().getInt("genome_diver.dbPoolMax"))

    // turn autocommit off,. not good for transactions. each
    // statement is automatically committed which is problematic for writes / errors
    c.setAutoCommit(false)
    c
  }

  // [ Read-Only ] Connection Pool
  // ---------------------------------------------------------------------------
  val config_read:HikariConfig = {
    val r = new HikariConfig()
    r.setDriverClassName("org.postgresql.Driver")
    r.setJdbcUrl(ConfigObj().getString("genome_diver.databaseURL"))
    r.setUsername(ConfigObj().getString("genome_diver.databaseUser"))
    r.setPassword(ConfigObj().getString("genome_diver.databasePassword"))
    r.setMinimumIdle(ConfigObj().getInt("genome_diver.dbPoolMinRead"))
    r.setMaximumPoolSize(ConfigObj().getInt("genome_diver.dbPoolMaxRead"))

    // read only settings
    r.setReadOnly(true)
    r.setAutoCommit(true)
    r
  }

  val orm: DSLContext                  = DSL.using(new HikariDataSource(config),      SQLDialect.POSTGRES)
  val orm_read:DSLContext              = DSL.using(new HikariDataSource(config_read), SQLDialect.POSTGRES)
}

// Autocommit => false
// https://stackoverflow.com/questions/38579231/hikaricp-select-queries-execute-roll-back-due-to-dirty-commit-state-on-close
// https://groups.google.com/forum/?hl=en-GB#!topic/hikari-cp/g0VPuCW-OPA

// Let's try using a production grade connection pool..
// https://groups.google.com/forum/#!topic/jooq-user/sRS40xro7nc
// https://github.com/tarugo07/akka-hikari-sample/blob/master/src/main/scala/com/example/DataSource.scala
