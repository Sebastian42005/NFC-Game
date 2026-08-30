package com.example.nfcgamebackend.nfcgame.application.admin

import com.example.nfcgamebackend.nfcgame.api.dto.AdminDeviceSimulationEventRequest
import com.example.nfcgamebackend.nfcgame.api.dto.DeviceEventResponse
import com.example.nfcgamebackend.nfcgame.application.device.NfcDeviceEventService
import com.example.nfcgamebackend.nfcgame.persistence.entity.NfcDevice
import com.example.nfcgamebackend.nfcgame.persistence.repository.NfcDeviceRepository
import com.example.nfcgamebackend.security.AuthenticatedUser
import org.springframework.http.HttpStatus
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException
import java.time.Instant
import java.util.UUID

private const val ADMIN_SIMULATOR_DEVICE_KEY_PREFIX = "admin-simulator-device-key"

@Service
class NfcAdminDeviceSimulatorService(
    private val deviceRepository: NfcDeviceRepository,
    private val deviceEventService: NfcDeviceEventService,
) {
    fun simulateDeviceEvent(request: AdminDeviceSimulationEventRequest): DeviceEventResponse =
        deviceEventService.handleSimulatorEvent(adminSimulatorDevice(), request)

    fun simulatorScreen(sessionId: UUID): DeviceEventResponse =
        deviceEventService.currentScreen(adminSimulatorDevice(), sessionId)

    private fun adminSimulatorDevice(): NfcDevice {
        val accountId = currentAccountId()
        val simulatorName = "Admin Simulator $accountId"
        val simulatorKey = "$ADMIN_SIMULATOR_DEVICE_KEY_PREFIX-$accountId"
        val device = deviceRepository.findByName(simulatorName) ?: NfcDevice().apply {
            name = simulatorName
            deviceKey = simulatorKey
            this.accountId = accountId
        }
        device.deviceKey = simulatorKey
        device.accountId = accountId
        device.active = true
        device.lastSeenAt = Instant.now()
        return deviceRepository.save(device)
    }

    private fun currentAccountId(): Long = currentUser().id

    private fun currentUser(): AuthenticatedUser {
        val principal = SecurityContextHolder.getContext().authentication?.principal
        if (principal is AuthenticatedUser) {
            return principal
        }
        throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Login required")
    }
}
