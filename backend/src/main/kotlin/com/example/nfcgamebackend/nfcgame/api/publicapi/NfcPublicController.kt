package com.example.nfcgamebackend.nfcgame.api.publicapi

import com.example.nfcgamebackend.nfcgame.application.publicapi.NfcPublicQueryService
import com.example.nfcgamebackend.nfcgame.api.dto.GameNightStartRequest
import com.example.nfcgamebackend.nfcgame.api.dto.GameRatingRequest
import com.example.nfcgamebackend.nfcgame.api.dto.SoundRatingRequest
import com.example.nfcgamebackend.nfcgame.api.dto.SoundUpdateRequest
import com.example.nfcgamebackend.nfcgame.application.sound.NfcSoundLibraryService
import com.example.nfcgamebackend.security.AuthenticatedUser
import jakarta.validation.Valid
import org.springframework.core.io.ByteArrayResource
import org.springframework.http.CacheControl
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestAttribute
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile
import java.util.UUID

@RestController
@RequestMapping("/api/public")
class NfcPublicController(
    private val publicQueryService: NfcPublicQueryService,
    private val soundLibraryService: NfcSoundLibraryService,
) {
    @GetMapping("/sessions/active")
    fun activeSession(@RequestAttribute(name = "authenticatedUser", required = false) user: AuthenticatedUser?) =
        publicQueryService.getActiveSession(user?.id)

    @GetMapping("/sessions/{sessionId}")
    fun session(
        @PathVariable sessionId: UUID,
        @RequestAttribute(name = "authenticatedUser", required = false) user: AuthenticatedUser?,
    ) = publicQueryService.getSession(sessionId, user?.id)

    @PostMapping("/sessions/{sessionId}/finish")
    fun finishSession(
        @PathVariable sessionId: UUID,
        @RequestAttribute(name = "authenticatedUser", required = false) user: AuthenticatedUser?,
    ) = publicQueryService.finishSession(sessionId, user?.id)

    @GetMapping("/sessions/{sessionId}/timeline")
    fun timeline(
        @PathVariable sessionId: UUID,
        @RequestAttribute(name = "authenticatedUser", required = false) user: AuthenticatedUser?,
    ) = publicQueryService.getTimeline(sessionId, user?.id)

    @GetMapping("/leaderboard")
    fun leaderboard(@RequestAttribute(name = "authenticatedUser", required = false) user: AuthenticatedUser?) =
        publicQueryService.getLeaderboard(user?.id)

    @GetMapping("/game-nights/active")
    fun activeGameNight(@RequestAttribute(name = "authenticatedUser", required = false) user: AuthenticatedUser?) =
        publicQueryService.getActiveGameNight(user?.id)

    @GetMapping("/game-nights")
    fun gameNights(@RequestAttribute(name = "authenticatedUser", required = false) user: AuthenticatedUser?) =
        publicQueryService.listGameNights(user?.id)

    @GetMapping("/game-nights/{gameNightId}")
    fun gameNight(
        @PathVariable gameNightId: UUID,
        @RequestAttribute(name = "authenticatedUser", required = false) user: AuthenticatedUser?,
    ) = publicQueryService.getGameNight(gameNightId, user?.id)

    @PostMapping("/game-nights")
    fun startGameNight(
        @Valid @RequestBody request: GameNightStartRequest,
        @RequestAttribute(name = "authenticatedUser", required = false) user: AuthenticatedUser?,
    ) = publicQueryService.startGameNight(request, user?.id)

    @PostMapping("/game-nights/{gameNightId}/finish")
    fun finishGameNight(
        @PathVariable gameNightId: UUID,
        @RequestAttribute(name = "authenticatedUser", required = false) user: AuthenticatedUser?,
    ) = publicQueryService.finishGameNight(gameNightId, user?.id)

    @GetMapping("/players/{playerId}/stats")
    fun playerStats(
        @PathVariable playerId: UUID,
        @RequestAttribute(name = "authenticatedUser", required = false) user: AuthenticatedUser?,
    ) = publicQueryService.getPlayerStats(playerId, user?.id)

    @GetMapping("/players")
    fun players(@RequestAttribute(name = "authenticatedUser", required = false) user: AuthenticatedUser?) =
        publicQueryService.listPlayers(user?.id)

    @GetMapping("/players/{playerId}/image")
    fun playerImage(
        @PathVariable playerId: UUID,
        @RequestAttribute(name = "authenticatedUser", required = false) user: AuthenticatedUser?,
    ): ResponseEntity<ByteArray> = publicQueryService.getPlayerImage(playerId, user?.id)

    @GetMapping("/games")
    fun games(@RequestAttribute(name = "authenticatedUser", required = false) user: AuthenticatedUser?) =
        publicQueryService.listGames(user?.id)

    @GetMapping("/games/public")
    fun publicGames(@RequestAttribute(name = "authenticatedUser", required = false) user: AuthenticatedUser?) =
        publicQueryService.listPublicGames(user?.id)

    @PostMapping("/games/{gameId}/library")
    fun addPublicGameToLibrary(@PathVariable gameId: UUID) =
        publicQueryService.addPublicGameToLibrary(gameId)

    @PostMapping("/games/{gameId}/rating")
    fun ratePublicGame(
        @PathVariable gameId: UUID,
        @Valid @RequestBody request: GameRatingRequest,
        @RequestAttribute(name = "authenticatedUser", required = false) user: AuthenticatedUser?,
    ) = publicQueryService.ratePublicGame(gameId, request, user?.id)

    @GetMapping("/games/{gameId}/image")
    fun gameImage(
        @PathVariable gameId: UUID,
        @RequestAttribute(name = "authenticatedUser", required = false) user: AuthenticatedUser?,
    ): ResponseEntity<ByteArray> = publicQueryService.getGameImage(gameId, user?.id)

    @GetMapping("/games/{gameId}/stats")
    fun gameStats(
        @PathVariable gameId: UUID,
        @RequestAttribute(name = "authenticatedUser", required = false) user: AuthenticatedUser?,
    ) = publicQueryService.getGameStats(gameId, user?.id)

    @GetMapping("/sounds")
    fun sounds() = soundLibraryService.listMySounds()

    @GetMapping("/sounds/options")
    fun soundOptions() = soundLibraryService.listMySoundOptions()

    @GetMapping("/sounds/public")
    fun publicSounds(@RequestAttribute(name = "authenticatedUser", required = false) user: AuthenticatedUser?) =
        soundLibraryService.listPublicSounds(user?.id)

    @PostMapping("/sounds/upload", consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
    fun uploadSound(
        @RequestParam("file") file: MultipartFile,
        @RequestParam("name", required = false) name: String?,
    ) = soundLibraryService.upload(file, name)

    @PutMapping("/sounds/{soundId}")
    fun updateSound(
        @PathVariable soundId: UUID,
        @Valid @RequestBody request: SoundUpdateRequest,
    ) = soundLibraryService.update(soundId, request)

    @PostMapping("/sounds/{soundId}/audio", consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
    fun replaceSoundAudio(
        @PathVariable soundId: UUID,
        @RequestParam("file") file: MultipartFile,
        @RequestParam("name", required = false) name: String?,
    ) = soundLibraryService.replaceAudio(soundId, file, name)

    @DeleteMapping("/sounds/{soundId}")
    fun deleteSound(@PathVariable soundId: UUID) = soundLibraryService.delete(soundId)

    @PostMapping("/sounds/{soundId}/publish")
    fun publishSound(@PathVariable soundId: UUID) = soundLibraryService.publish(soundId)

    @PostMapping("/sounds/{soundId}/unpublish")
    fun unpublishSound(@PathVariable soundId: UUID) = soundLibraryService.unpublish(soundId)

    @PostMapping("/sounds/{soundId}/library")
    fun addPublicSoundToLibrary(@PathVariable soundId: UUID) =
        soundLibraryService.addPublicSoundToLibrary(soundId)

    @PostMapping("/sounds/{soundId}/rating")
    fun ratePublicSound(
        @PathVariable soundId: UUID,
        @Valid @RequestBody request: SoundRatingRequest,
        @RequestAttribute(name = "authenticatedUser", required = false) user: AuthenticatedUser?,
    ) = soundLibraryService.ratePublicSound(soundId, request, user?.id)

    @GetMapping("/sounds/{soundId}/audio.wav", produces = ["audio/wav"])
    fun soundAudio(
        @PathVariable soundId: UUID,
        @RequestAttribute(name = "authenticatedUser", required = false) user: AuthenticatedUser?,
    ): ResponseEntity<ByteArrayResource> {
        val bytes = soundLibraryService.publicAudio(soundId, user?.id)
        return ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .contentType(MediaType.valueOf("audio/wav"))
            .contentLength(bytes.size.toLong())
            .body(ByteArrayResource(bytes))
    }

    @GetMapping("/history")
    fun history(@RequestAttribute(name = "authenticatedUser", required = false) user: AuthenticatedUser?) =
        publicQueryService.getHistory(user?.id)
}
