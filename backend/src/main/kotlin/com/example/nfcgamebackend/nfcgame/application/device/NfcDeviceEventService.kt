package com.example.nfcgamebackend.nfcgame.application.device

import com.example.nfcgamebackend.nfcgame.api.dto.DeviceEventRequest
import com.example.nfcgamebackend.nfcgame.api.dto.DeviceEventResponse
import com.example.nfcgamebackend.nfcgame.api.dto.DeviceProvisioningResponse
import com.example.nfcgamebackend.nfcgame.api.dto.DeviceRequest
import com.example.nfcgamebackend.nfcgame.api.dto.DeviceUiHints
import com.example.nfcgamebackend.nfcgame.api.dto.MoneyTransferRequest
import com.example.nfcgamebackend.nfcgame.api.dto.ScreenModel
import com.example.nfcgamebackend.nfcgame.application.NfcGameMapper
import com.example.nfcgamebackend.nfcgame.application.publicapi.NfcPublicQueryService
import com.example.nfcgamebackend.nfcgame.application.session.SessionStateMachineService
import com.example.nfcgamebackend.nfcgame.application.settings.NfcSettingsService
import com.example.nfcgamebackend.nfcgame.application.sound.NfcSoundLibraryService
import com.example.nfcgamebackend.nfcgame.domain.CardStatus
import com.example.nfcgamebackend.nfcgame.domain.CardType
import com.example.nfcgamebackend.nfcgame.domain.EventType
import com.example.nfcgamebackend.nfcgame.domain.NfcLanguage
import com.example.nfcgamebackend.nfcgame.domain.ScreenType
import com.example.nfcgamebackend.nfcgame.domain.SessionStatus
import com.example.nfcgamebackend.nfcgame.persistence.entity.NfcMoneyTransaction
import com.example.nfcgamebackend.nfcgame.persistence.entity.NfcSessionEvent
import com.example.nfcgamebackend.nfcgame.persistence.repository.NfcCardRepository
import com.example.nfcgamebackend.nfcgame.persistence.entity.NfcDevice
import com.example.nfcgamebackend.nfcgame.persistence.repository.NfcDeviceRepository
import com.example.nfcgamebackend.nfcgame.persistence.repository.NfcGameSessionRepository
import com.example.nfcgamebackend.nfcgame.persistence.repository.NfcMoneyTransactionRepository
import com.example.nfcgamebackend.nfcgame.persistence.repository.NfcPlayerRepository
import com.example.nfcgamebackend.nfcgame.persistence.repository.NfcSessionAccountRepository
import com.example.nfcgamebackend.nfcgame.persistence.repository.NfcSessionEventRepository
import com.example.nfcgamebackend.nfcgame.persistence.repository.NfcSessionTeamMemberRepository
import com.example.nfcgamebackend.nfcgame.persistence.repository.NfcSessionTeamRepository
import com.example.nfcgamebackend.nfcgame.security.DeviceAuthenticator
import com.example.nfcgamebackend.repositories.AppUserRepository
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.http.HttpStatus
import org.springframework.messaging.simp.SimpMessagingTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionSynchronization
import org.springframework.transaction.support.TransactionSynchronizationManager
import org.springframework.web.server.ResponseStatusException
import java.security.SecureRandom

@Service
class NfcDeviceEventService(
    private val deviceAuthenticator: DeviceAuthenticator,
    private val stateMachineService: SessionStateMachineService,
    private val eventRepository: NfcSessionEventRepository,
    private val accountRepository: NfcSessionAccountRepository,
    private val moneyTransactionRepository: NfcMoneyTransactionRepository,
    private val cardRepository: NfcCardRepository,
    private val deviceRepository: NfcDeviceRepository,
    private val appUserRepository: AppUserRepository,
    private val sessionRepository: NfcGameSessionRepository,
    private val playerRepository: NfcPlayerRepository,
    private val teamRepository: NfcSessionTeamRepository,
    private val memberRepository: NfcSessionTeamMemberRepository,
    private val publicQueryService: NfcPublicQueryService,
    private val soundLibraryService: NfcSoundLibraryService,
    private val settingsService: NfcSettingsService,
    private val messagingTemplate: SimpMessagingTemplate,
    private val mapper: NfcGameMapper,
    private val objectMapper: ObjectMapper,
) {
    private val activeInputStatuses = listOf(
        SessionStatus.LOBBY,
        SessionStatus.CONFIGURING,
        SessionStatus.BUILDING_TEAMS,
        SessionStatus.READY,
        SessionStatus.RUNNING,
    )
    private val pairingCodeRandom = SecureRandom()

    @Transactional
    fun handleEvent(request: DeviceEventRequest): DeviceEventResponse {
        val device = deviceAuthenticator.authenticate(request.deviceId, request.deviceKey)
        val requestSessionId = parseUuid(request.sessionId)
        val result = when (request.eventType) {
            EventType.CARD_SCANNED,
            EventType.GAME_CARD_SCANNED,
            EventType.PLAYER_CARD_SCANNED,
            -> {
                val cardUid = request.cardUid?.takeIf { it.isNotBlank() }
                    ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "cardUid is required for card scan events")
                stateMachineService.handleCardScan(device, cardUid, request.payload)
            }

            EventType.JOYSTICK_LONG_PRESS,
            EventType.RESET_TRIGGERED,
            -> stateMachineService.handleReset(device)

            else -> {
                val sessionId = requestSessionId
                    ?: device.accountId?.let {
                        sessionRepository.findFirstByAccountIdAndStatusInOrderByCreatedAtDesc(it, activeInputStatuses)?.id
                    }
                    ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "sessionId is required")
                stateMachineService.handleInput(
                    sessionId,
                    request.eventType,
                    request.payload,
                )
            }
        }

        eventRepository.save(
            NfcSessionEvent().apply {
                sessionId = result.session?.id ?: requestSessionId
                deviceId = requireNotNull(device.id)
                eventType = request.eventType
                payloadJson = objectMapper.writeValueAsString(
                    request.payload + mapOf(
                        "cardUid" to request.cardUid,
                        "occurredAt" to request.occurredAt?.toString(),
                        "deviceStateKey" to request.currentStateKey,
                        "timelineMessage" to result.timelineMessage,
                        "popupTitle" to result.popupTitle,
                        "popupText" to result.popupText,
                        "soundId" to result.sound?.soundId?.toString(),
                        "soundName" to result.sound?.name,
                        "soundTarget" to result.sound?.target,
                        "soundUrl" to result.sound?.soundId?.let { "/api/public/sounds/$it/audio.wav" },
                    ),
                )
            },
        )

        val sound = result.sound
        if (sound != null && sound.target in setOf("DEVICE", "BOTH")) {
            soundLibraryService.queueDeviceSound(
                deviceId = requireNotNull(device.id),
                sessionId = result.session?.id ?: requestSessionId,
                soundId = sound.soundId,
            )
        }

        publishSessionUpdatesAfterCommit(result.session?.id)

        val scanFeedback = if (request.eventType in setOf(EventType.CARD_SCANNED, EventType.GAME_CARD_SCANNED, EventType.PLAYER_CARD_SCANNED)) {
            resolveScanFeedback(request.cardUid)
        } else {
            null
        }

        val language = settingsService.languageForAccount(device.accountId)
        return DeviceEventResponse(
            sessionId = result.session?.id,
            status = result.session?.status,
            currentStateKey = result.session?.currentStateKey,
            screen = localizeScreen(result.screen, language),
            effects = result.effects,
            errors = result.errors.map { localizeDeviceText(it, language) },
            scannedCardType = scanFeedback?.cardType,
            scannedPlayerName = scanFeedback?.playerName,
            uiHints = buildUiHints(device, result.session?.id, language),
        )
    }

    fun currentScreen(deviceId: String, deviceKey: String, sessionId: java.util.UUID): DeviceEventResponse {
        val device = deviceAuthenticator.authenticate(deviceId, deviceKey)
        val session = sessionRepository.findById(sessionId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Session not found")
        }
        if (device.accountId != null && session.accountId != device.accountId) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "Session not found")
        }
        val result = stateMachineService.currentScreen(sessionId)
        val language = settingsService.languageForAccount(device.accountId)
        return DeviceEventResponse(
            sessionId = result.session?.id,
            status = result.session?.status,
            currentStateKey = result.session?.currentStateKey,
            screen = localizeScreen(result.screen, language),
            effects = result.effects,
            errors = result.errors.map { localizeDeviceText(it, language) },
            uiHints = buildUiHints(device, result.session?.id, language),
        )
    }

    @Transactional
    fun transferMoney(request: MoneyTransferRequest) {
        val from = accountRepository.findById(request.fromAccountId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Source account not found")
        }
        val to = accountRepository.findById(request.toAccountId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Target account not found")
        }
        if (from.sessionId != request.sessionId || to.sessionId != request.sessionId) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Accounts do not belong to the session")
        }
        if (from.balance < request.amount) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Insufficient balance")
        }
        from.balance = from.balance.subtract(request.amount)
        to.balance = to.balance.add(request.amount)
        accountRepository.save(from)
        accountRepository.save(to)
        moneyTransactionRepository.save(
            NfcMoneyTransaction().apply {
                sessionId = request.sessionId
                fromAccountId = request.fromAccountId
                toAccountId = request.toAccountId
                amount = request.amount
                initiatedByPlayerId = request.initiatedByPlayerId
            },
        )
        publishSessionUpdatesAfterCommit(request.sessionId)
    }

    fun health() = ScreenModel(
        screenType = ScreenType.MESSAGE,
        title = "Device API ok",
        subtitle = "Backend erreichbar",
    )

    fun registerDevice(request: DeviceRequest): DeviceProvisioningResponse {
        val name = request.name.trim()
        val existing = deviceRepository.findByName(name)
        if (existing != null) {
            if (existing.deviceKey != request.deviceKey) {
                throw ResponseStatusException(HttpStatus.CONFLICT, "Device id already exists with another key")
            }
            existing.active = request.active
            if (existing.pairingCode.isNullOrBlank()) {
                existing.pairingCode = generatePairingCode()
            }
            return toProvisioningResponse(deviceRepository.save(existing))
        }
        val device = NfcDevice().apply {
            this.name = name
            deviceKey = request.deviceKey
            pairingCode = generatePairingCode()
            active = request.active
        }
        return toProvisioningResponse(deviceRepository.save(device), createdNow = true)
    }

    private fun generatePairingCode(): String {
        repeat(30) {
            val code = pairingCodeRandom.nextInt(1_000_000).toString().padStart(6, '0')
            if (deviceRepository.findByPairingCode(code) == null) {
                return code
            }
        }
        throw ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not generate pairing code")
    }

    private fun toProvisioningResponse(device: NfcDevice, createdNow: Boolean = false): DeviceProvisioningResponse {
        val account = device.accountId?.let { appUserRepository.findById(it).orElse(null) }
        if (device.accountId != null && account == null) {
            device.accountId = null
            deviceRepository.save(device)
        }

        return DeviceProvisioningResponse(
            id = requireNotNull(device.id),
            name = device.name,
            active = device.active,
            linked = account != null,
            accountUsername = account?.username,
            createdNow = createdNow,
            pairingCode = requireNotNull(device.pairingCode),
            lastSeenAt = device.lastSeenAt,
            createdAt = device.createdAt,
        )
    }

    private fun publishSessionUpdates(sessionId: java.util.UUID?) {
        val rawSession = sessionId?.let { sessionRepository.findById(it).orElse(null) }
        val accountId = rawSession?.accountId
        val active = publicQueryService.getActiveSession(accountId)
        val session = sessionId?.let { runCatching { publicQueryService.getSession(it, accountId) }.getOrNull() }
        messagingTemplate.convertAndSend("/topic/sessions/active", active ?: session ?: mapOf("active" to false))
        if (sessionId != null) {
            if (session != null) {
                messagingTemplate.convertAndSend("/topic/sessions/$sessionId", session)
            }
        }
        messagingTemplate.convertAndSend("/topic/leaderboard", publicQueryService.getLeaderboard(accountId))
        publicQueryService.publishGameNightUpdate(accountId)
    }

    private fun publishSessionUpdatesAfterCommit(sessionId: java.util.UUID?) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            publishSessionUpdates(sessionId)
            return
        }
        TransactionSynchronizationManager.registerSynchronization(
            object : TransactionSynchronization {
                override fun afterCommit() {
                    publishSessionUpdates(sessionId)
                }
            },
        )
    }

    private data class ScanFeedback(
        val cardType: CardType,
        val playerName: String? = null,
    )

    private fun buildUiHints(device: NfcDevice, sessionId: java.util.UUID?, language: NfcLanguage): DeviceUiHints {
        val accountId = device.accountId
        return DeviceUiHints(
            predictions = sessionId
                ?.let { stateMachineService.previewUiPredictions(it) }
                .orEmpty()
                .map { it.copy(screen = localizeScreen(it.screen, language)) },
            allowedPlayerCardUids = allowedPlayerCardUids(accountId, sessionId),
            allowedGameCardUids = allowedGameCardUids(accountId, sessionId),
        )
    }

    private fun localizeScreen(screen: ScreenModel, language: NfcLanguage): ScreenModel =
        screen.copy(
            title = localizeDeviceText(screen.title, language),
            subtitle = screen.subtitle?.let { localizeDeviceText(it, language) },
            lines = screen.lines.map { localizeDeviceText(it, language) },
            menuItems = screen.menuItems.map { it.copy(label = localizeDeviceText(it.label, language)) },
        )

    private fun localizeDeviceText(text: String, language: NfcLanguage): String {
        val normalized = restoreGermanUmlauts(text)
        if (language == NfcLanguage.DE) return normalized

        deviceTranslations[normalized]?.let { return it }
        return normalized
            .replace("Runde ", "Round ")
            .replace(" weitere", " more")
            .replace("Aktuell: ", "Current: ")
            .replace("An ", "To ")
    }

    private fun restoreGermanUmlauts(text: String): String =
        text
            .replace("zurueck", "zurück")
            .replace("Zurueck", "Zurück")
            .replace("unveraendert", "unverändert")
            .replace("auswaehlen", "auswählen")
            .replace("waehlen", "wählen")
            .replace("laeuft", "läuft")
            .replace("fuer", "für")
            .replace("naechste", "nächste")
            .replace("naechstes", "nächstes")
            .replace("Teamgroesse", "Teamgröße")
            .replace("Empfaenger", "Empfänger")
            .replace("Grosse", "Große")
            .replace("uebernimmt", "übernimmt")
            .replace("gehoert", "gehört")

    private val deviceTranslations = mapOf(
        "Karte deaktiviert" to "Card disabled",
        "Diese NFC-Karte ist deaktiviert." to "This NFC card is disabled.",
        "Karte nicht zugewiesen" to "Card not assigned",
        "Bitte im Adminbereich zuweisen." to "Assign it in the admin area.",
        "Bitte im Adminbereich als Spieler- oder Spielkarte zuweisen." to "Assign it as a player or game card in the admin area.",
        "Keine aktive Session" to "No active session",
        "Zuerst eine Spielkarte scannen." to "Scan a game card first.",
        "Spielkarte ohne Spiel" to "Game card without a game",
        "Bitte eine Spielvorlage zuweisen." to "Please assign a game template.",
        "Spiel nicht gefunden" to "Game not found",
        "Die verknüpfte Spielvorlage fehlt." to "The linked game template is missing.",
        "Spiel deaktiviert" to "Game disabled",
        "Diese Spielvorlage ist nicht aktiv." to "This game template is not active.",
        "Spieler fehlt" to "Player missing",
        "Diese Karte ist keinem Spieler zugeordnet." to "This card is not assigned to a player.",
        "Spieler nicht gefunden" to "Player not found",
        "Die Kartenzuordnung ist ungültig." to "The card assignment is invalid.",
        "Aktion nicht erlaubt" to "Action not allowed",
        "Es gibt gerade nichts zurückzusetzen." to "There is nothing to reset right now.",
        "Session zurückgesetzt" to "Session reset",
        "Masterdaten bleiben unverändert." to "Master data stays unchanged.",
        "Bereit" to "Ready",
        "Spielkarte scannen zum Starten" to "Scan a game card to start",
        "Start" to "Start",
        "Spiel läuft" to "Game running",
        "Spielerkarte für Gewinn scannen" to "Scan a player card to award the win",
        "Spielkarte scannt = beenden" to "Scan game card = finish",
        "Spiel beendet" to "Game finished",
        "Ergebnis gespeichert" to "Result saved",
        "Zurückgesetzt" to "Reset",
        "Session wurde beendet" to "Session was ended",
        "Unbekannte Karte" to "Unknown card",
        "Karte wurde gespeichert und kann im Adminbereich zugewiesen werden." to "Card was saved and can be assigned in the admin area.",
        "Spieler scannen" to "Scan players",
        "Team komplett" to "Team complete",
        "Spielkarte starten oder nächstes Team wählen." to "Start with the game card or choose the next team.",
        "Teamgröße wählen" to "Choose team size",
        "Teams fertig: " to "Teams complete: ",
        "Erste Spielerkarte setzt Teamgröße" to "First player card sets team size",
        "Button oder Spielkarte startet das Spiel" to "Button or game card starts the game",
        "Empfänger wählen" to "Choose recipient",
        "Spieler oder Bank" to "Player or bank",
        "Transfer gebucht" to "Transfer booked",
        "Touch: Empfänger antippen" to "Touch: tap recipient",
        "Betrag wählen" to "Choose amount",
        "Kleine Schritte: " to "Small steps: ",
        "Große Schritte: " to "Large steps: ",
        "Touch: Wert setzen übernimmt sofort" to "Touch: setting the value applies immediately",
        "Zahler scannen" to "Scan payer",
        "Karte des zahlenden Spielers scannen" to "Scan the paying player's card",
        "Keine Konten vorhanden." to "No accounts available.",
        "Erst Spieloptionen auswählen." to "Choose game options first.",
        "Spieler nicht im Spiel" to "Player not in game",
        "Dieser Spieler gehört zu keinem Team in der Session." to "This player does not belong to a team in the session.",
        "Zuerst Empfänger auswählen." to "Choose a recipient first.",
        "Zahler und Empfänger sind gleich." to "Payer and recipient are the same.",
        "Nicht genug Guthaben." to "Insufficient balance.",
    )

    private fun allowedPlayerCardUids(accountId: Long?, sessionId: java.util.UUID?): List<String> {
        val playerCards = assignedAccountCards(accountId, CardType.PLAYER)
            .filter { card ->
                val playerId = card.playerId ?: return@filter false
                playerRepository.findById(playerId).orElse(null)?.active == true
            }
        val session = sessionId?.let { sessionRepository.findById(it).orElse(null) }
        if (session?.status != SessionStatus.RUNNING) {
            return playerCards.map { it.cardUid }.distinct()
        }

        val teamIds = teamRepository.findAllBySessionIdOrderByTeamOrderAsc(sessionId).mapNotNull { it.id }
        if (teamIds.isEmpty()) {
            return emptyList()
        }
        val sessionPlayerIds = teamIds
            .flatMap { memberRepository.findAllBySessionTeamId(it) }
            .mapNotNull { it.playerId }
            .toSet()

        return playerCards
            .filter { it.playerId in sessionPlayerIds }
            .map { it.cardUid }
            .distinct()
    }

    private fun allowedGameCardUids(accountId: Long?, sessionId: java.util.UUID?): List<String> {
        val gameCards = assignedAccountCards(accountId, CardType.GAME)
        val gameTemplateId = sessionId
            ?.let { sessionRepository.findById(it).orElse(null) }
            ?.gameTemplateId
        return gameCards
            .filter { gameTemplateId == null || it.gameTemplateId == gameTemplateId }
            .map { it.cardUid }
            .filter { it.isNotBlank() }
            .distinct()
    }

    private fun assignedAccountCards(accountId: Long?, cardType: CardType) =
        accountId
            ?.let {
                cardRepository.findAllByAccountIdAndCardTypeAndStatusOrderByCreatedAtDesc(
                    it,
                    cardType,
                    CardStatus.ASSIGNED,
                )
            }
            .orEmpty()

    private fun resolveScanFeedback(cardUid: String?): ScanFeedback? {
        val normalizedUid = cardUid?.trim()?.uppercase()?.takeIf { it.isNotBlank() } ?: return null
        val card = cardRepository.findByCardUid(normalizedUid) ?: return ScanFeedback(cardType = CardType.UNKNOWN)
        if (card.cardType != CardType.PLAYER) {
            return ScanFeedback(cardType = card.cardType)
        }
        val playerName = card.playerId?.let { playerRepository.findById(it).orElse(null)?.name }
        return ScanFeedback(cardType = CardType.PLAYER, playerName = playerName)
    }

    private fun parseUuid(rawValue: String?): java.util.UUID? =
        rawValue
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
            ?.let { runCatching { java.util.UUID.fromString(it) }.getOrNull() }
}
