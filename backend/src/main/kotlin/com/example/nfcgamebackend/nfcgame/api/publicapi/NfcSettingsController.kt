package com.example.nfcgamebackend.nfcgame.api.publicapi

import com.example.nfcgamebackend.nfcgame.api.dto.NfcSettingsRequest
import com.example.nfcgamebackend.nfcgame.application.settings.NfcSettingsService
import com.example.nfcgamebackend.security.AuthenticatedUser
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestAttribute
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

@RestController
@RequestMapping("/api/public/settings")
class NfcSettingsController(
    private val settingsService: NfcSettingsService,
) {
    @GetMapping
    fun settings(
        @RequestAttribute(name = "authenticatedUser", required = false) user: AuthenticatedUser?,
    ) = settingsService.getSettings(userAccountId(user))

    @PutMapping
    fun updateSettings(
        @RequestAttribute(name = "authenticatedUser", required = false) user: AuthenticatedUser?,
        @Valid @RequestBody request: NfcSettingsRequest,
    ) = settingsService.updateSettings(userAccountId(user), request)

    @PostMapping("/test-sound")
    fun playTestSound(
        @RequestAttribute(name = "authenticatedUser", required = false) user: AuthenticatedUser?,
    ) = settingsService.requestTestSound(userAccountId(user))

    private fun userAccountId(user: AuthenticatedUser?): Long =
        user?.id ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Login required")
}
