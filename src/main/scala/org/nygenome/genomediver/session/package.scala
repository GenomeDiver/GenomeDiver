// TODO (minor, if time permits) investigate on improving session_management. TrieMap performance?

package org.nygenome.genomediver

import scala.collection.concurrent.TrieMap
import scala.concurrent.Future
import scala.concurrent.duration.Duration
import com.softwaremill.session.{RefreshTokenData, RefreshTokenLookupResult, RefreshTokenStorage}

package object session_models {
    case class Session(id:Long, username:String, role:String)
}

package object session_management {
    trait ConcurrentRefreshTokenStorage[T] extends RefreshTokenStorage[T] {
        case class Store(session:T, tokenHash: String, expires: Long)

        private val _store = TrieMap[String, Store]()

        def store: Map[String, Store] = _store.toMap

        override def lookup(selector:String) = {
            Future.successful {
                _store.get(selector).map(s => RefreshTokenLookupResult[T](s.tokenHash, s.expires, () => s.session))
            }
        }

        override def store(data: RefreshTokenData[T]) = {
            Future.successful(
                _store.put(data.selector, Store(data.forSession, data.tokenHash, data.expires))
            )
        }

        override def remove(selector: String) = {
            Future.successful(_store.remove(selector))
        }

        override def schedule[S](after: Duration)(op: => Future[S]) = {
            op
            Future.successful(())
        }

        def log(msg: String) : Unit
    }
}

