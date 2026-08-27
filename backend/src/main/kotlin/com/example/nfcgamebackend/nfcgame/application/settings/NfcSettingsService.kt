package com.example.nfcgamebackend.nfcgame.application.settings

import com.example.nfcgamebackend.nfcgame.api.dto.NfcSettingsRequest
import com.example.nfcgamebackend.nfcgame.api.dto.NfcSettingsResponse
import com.example.nfcgamebackend.nfcgame.domain.NfcDisplayTimeout
import com.example.nfcgamebackend.nfcgame.domain.NfcLanguage
import com.example.nfcgamebackend.nfcgame.domain.NfcThemeMode
import com.example.nfcgamebackend.nfcgame.persistence.entity.NfcAccountSettings
import com.example.nfcgamebackend.nfcgame.persistence.repository.NfcAccountSettingsRepository
import com.example.nfcgamebackend.nfcgame.security.DeviceAuthenticator
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

@Service
class NfcSettingsService(
    private val settingsRepository: NfcAccountSettingsRepository,
    private val deviceAuthenticator: DeviceAuthenticator,
) {
    @Transactional
    fun getSettings(accountId: Long): NfcSettingsResponse =
        toResponse(settingsForAccount(accountId))

    @Transactional
    fun updateSettings(accountId: Long, request: NfcSettingsRequest): NfcSettingsResponse {
        val settings = settingsForAccount(accountId)
        settings.accentColor = normalizeHexColor(request.accentColor)
        settings.themeMode = request.themeMode
        settings.language = request.language
        settings.displayBrightness = request.displayBrightness.coerceIn(0, 100)
        settings.displayTimeout = request.displayTimeout
        settings.deviceVolume = request.deviceVolume.coerceIn(0, 100)
        settings.soundsEnabled = request.soundsEnabled
        bumpSettingsVersion(settings)
        return toResponse(settingsRepository.save(settings))
    }

    @Transactional
    fun requestTestSound(accountId: Long): NfcSettingsResponse {
        val settings = settingsForAccount(accountId)
        settings.testSoundVersion = nextVersion(settings.testSoundVersion)
        return toResponse(settingsRepository.save(settings))
    }

    @Transactional
    fun acknowledgeTestSound(deviceId: String, deviceKey: String, version: Long): NfcSettingsResponse {
        val device = deviceAuthenticator.authenticate(deviceId, deviceKey)
        val accountId = device.accountId ?: return toResponse(defaultSettings())
        val settings = settingsForAccount(accountId)

        if (version > 0 && settings.testSoundVersion <= version) {
            settings.testSoundVersion = 0
        }

        return toResponse(settingsRepository.save(settings))
    }

    @Transactional
    fun getDeviceSettings(deviceId: String, deviceKey: String): NfcSettingsResponse {
        val device = deviceAuthenticator.authenticate(deviceId, deviceKey)
        val accountId = device.accountId ?: return toResponse(defaultSettings())
        return toResponse(settingsForAccount(accountId))
    }

    @Transactional(readOnly = true)
    fun languageForAccount(accountId: Long?): NfcLanguage =
        accountId?.let { settingsRepository.findByAccountId(it)?.language } ?: NfcLanguage.DE

    private fun settingsForAccount(accountId: Long): NfcAccountSettings =
        settingsRepository.findByAccountId(accountId) ?: settingsRepository.save(
            defaultSettings().apply { this.accountId = accountId },
        )

    private fun defaultSettings() = NfcAccountSettings()

    private fun bumpSettingsVersion(settings: NfcAccountSettings) {
        settings.settingsVersion = nextVersion(settings.settingsVersion)
    }

    private fun nextVersion(current: Long): Long = maxOf(Instant.now().toEpochMilli(), current + 1)

    private fun normalizeHexColor(color: String): String = color.trim().uppercase()

    private fun toResponse(settings: NfcAccountSettings): NfcSettingsResponse =
        NfcSettingsResponse(
            accentColor = settings.accentColor,
            themeMode = settings.themeMode,
            effectiveTheme = if (settings.themeMode == NfcThemeMode.LIGHT) NfcThemeMode.LIGHT else NfcThemeMode.DARK,
            language = settings.language,
            displayBrightness = settings.displayBrightness.coerceIn(0, 100),
            displayTimeout = settings.displayTimeout,
            displayTimeoutSeconds = settings.displayTimeout.seconds(),
            deviceVolume = settings.deviceVolume.coerceIn(0, 100),
            soundsEnabled = settings.soundsEnabled,
            settingsVersion = settings.settingsVersion,
            testSoundVersion = settings.testSoundVersion,
            updatedAt = settings.updatedAt,
        )

    private fun NfcDisplayTimeout.seconds(): Int? =
        when (this) {
            NfcDisplayTimeout.NEVER -> null
            NfcDisplayTimeout.ONE_MINUTE -> 60
            NfcDisplayTimeout.FIVE_MINUTES -> 5 * 60
            NfcDisplayTimeout.TEN_MINUTES -> 10 * 60
        }
}
