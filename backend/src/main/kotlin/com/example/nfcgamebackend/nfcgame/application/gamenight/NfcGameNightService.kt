package com.example.nfcgamebackend.nfcgame.application.gamenight

import com.example.nfcgamebackend.nfcgame.api.dto.GameNightResponse
import com.example.nfcgamebackend.nfcgame.api.dto.GameNightStartRequest
import com.example.nfcgamebackend.nfcgame.api.dto.SessionSummaryResponse
import com.example.nfcgamebackend.nfcgame.domain.GameNightScoringSystem
import com.example.nfcgamebackend.nfcgame.domain.GameNightStatus
import com.example.nfcgamebackend.nfcgame.domain.SessionStatus
import com.example.nfcgamebackend.nfcgame.persistence.entity.NfcGameNight
import com.example.nfcgamebackend.nfcgame.persistence.entity.NfcGameSession
import com.example.nfcgamebackend.nfcgame.persistence.repository.NfcGameNightRepository
import com.example.nfcgamebackend.nfcgame.persistence.repository.NfcPlayerRepository
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.time.Duration
import java.time.Instant
import java.util.UUID

@Service
class NfcGameNightService(
    private val gameNightRepository: NfcGameNightRepository,
    private val playerRepository: NfcPlayerRepository,
) {
    fun activeForAccount(accountId: Long?): NfcGameNight? =
        accountId?.let { gameNightRepository.findFirstByAccountIdAndStatusOrderByStartedAtDesc(it, GameNightStatus.ACTIVE) }

    @Transactional
    fun start(accountId: Long?, request: GameNightStartRequest): NfcGameNight {
        val userAccountId = requireAccountId(accountId)
        if (activeForAccount(userAccountId) != null) {
            throw ResponseStatusException(HttpStatus.CONFLICT, "A game night is already running")
        }
        return gameNightRepository.save(
            NfcGameNight().apply {
                this.accountId = userAccountId
                name = request.name?.trim()?.takeIf { it.isNotBlank() }
                scoringSystem = request.scoringSystem
                status = GameNightStatus.ACTIVE
            },
        )
    }

    @Transactional
    fun finish(gameNightId: UUID, accountId: Long?): NfcGameNight {
        val night = requireOwned(gameNightId, accountId)
        if (night.status == GameNightStatus.FINISHED) return night
        night.status = GameNightStatus.FINISHED
        night.endedAt = Instant.now()
        return gameNightRepository.save(night)
    }

    fun requireOwned(gameNightId: UUID, accountId: Long?): NfcGameNight {
        val userAccountId = requireAccountId(accountId)
        return gameNightRepository.findByIdAndAccountId(gameNightId, userAccountId)
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Game night not found")
    }

    fun list(accountId: Long?): List<NfcGameNight> =
        gameNightRepository.findAllByAccountIdOrderByStartedAtDesc(requireAccountId(accountId))

    fun toResponse(
        night: NfcGameNight,
        sessions: List<NfcGameSession>,
        sessionResponses: List<SessionSummaryResponse> = emptyList(),
    ): GameNightResponse {
        val participantIds = sessionResponses
            .flatMap { session -> session.teams.flatMap { team -> team.members.map { it.playerId } } }
            .toSet()
        val winner = winner(night.scoringSystem, sessionResponses)
        val end = night.endedAt ?: Instant.now()
        return GameNightResponse(
            id = requireNotNull(night.id),
            name = night.name,
            scoringSystem = night.scoringSystem,
            status = night.status,
            startedAt = night.startedAt,
            endedAt = night.endedAt,
            durationMinutes = Duration.between(night.startedAt, end).toMinutes().coerceAtLeast(0),
            sessionCount = sessions.size,
            playerCount = participantIds.size,
            winnerPlayerId = winner?.playerId,
            winnerPlayerName = winner?.playerName,
            winnerScore = winner?.score ?: 0,
            sessions = sessionResponses,
        )
    }

    private fun winner(
        scoringSystem: GameNightScoringSystem,
        sessions: List<SessionSummaryResponse>,
    ): WinnerRow? {
        val rows = linkedMapOf<UUID, WinnerRow>()
        for (session in sessions.filter { it.status == SessionStatus.FINISHED && it.result != null }) {
            val winningTeamId = session.result?.winningTeamId
            for (team in session.teams) {
                for (member in team.members) {
                    val row = rows.getOrPut(member.playerId) {
                        WinnerRow(
                            playerId = member.playerId,
                            playerName = member.playerName ?: playerRepository.findById(member.playerId).orElse(null)?.name,
                        )
                    }
                    row.gamesPlayed += 1
                    if (winningTeamId != null && team.id == winningTeamId) row.gamesWon += 1
                    row.totalPoints += team.globalPointsAwarded
                }
            }
        }

        return rows.values
            .filter { it.gamesPlayed > 0 || it.totalPoints > 0 }
            .maxWithOrNull(
                compareBy<WinnerRow> {
                    when (scoringSystem) {
                        GameNightScoringSystem.POINTS -> it.totalPoints
                        GameNightScoringSystem.WINS -> it.gamesWon
                    }
                }.thenBy { it.totalPoints }
                    .thenBy { it.gamesWon }
                    .thenByDescending { it.playerName ?: "" },
            )
            ?.also {
                it.score = when (scoringSystem) {
                    GameNightScoringSystem.POINTS -> it.totalPoints
                    GameNightScoringSystem.WINS -> it.gamesWon
                }
            }
    }

    private fun requireAccountId(accountId: Long?): Long =
        accountId ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Login required")

    private data class WinnerRow(
        val playerId: UUID,
        val playerName: String?,
        var gamesPlayed: Long = 0,
        var gamesWon: Long = 0,
        var totalPoints: Long = 0,
        var score: Long = 0,
    )
}
