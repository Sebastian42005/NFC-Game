package com.example.nfcgamebackend.nfcgame.api.device

import com.example.nfcgamebackend.nfcgame.api.dto.DeviceEventRequest
import com.example.nfcgamebackend.nfcgame.api.dto.DeviceEventResponse
import com.example.nfcgamebackend.nfcgame.api.dto.DeviceProvisioningResponse
import com.example.nfcgamebackend.nfcgame.api.dto.DeviceRequest
import com.example.nfcgamebackend.nfcgame.api.dto.DeviceSoundAckRequest
import com.example.nfcgamebackend.nfcgame.application.device.NfcAudioTestService
import com.example.nfcgamebackend.nfcgame.application.device.NfcDeviceEventService
import com.example.nfcgamebackend.nfcgame.application.device.NfcFirmwareUpdateService
import com.example.nfcgamebackend.nfcgame.application.settings.NfcSettingsService
import com.example.nfcgamebackend.nfcgame.application.sound.NfcSoundLibraryService
import org.springframework.core.io.ByteArrayResource
import org.springframework.http.CacheControl
import jakarta.validation.Valid
import org.springframework.core.io.Resource
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.servlet.support.ServletUriComponentsBuilder
import java.util.UUID

@RestController
@RequestMapping("/api/device")
class NfcDeviceController(
    private val deviceEventService: NfcDeviceEventService,
    private val firmwareUpdateService: NfcFirmwareUpdateService,
    private val audioTestService: NfcAudioTestService,
    private val soundLibraryService: NfcSoundLibraryService,
    private val settingsService: NfcSettingsService,
) {
    data class AudioAckRequest(val version: Long)

    @PostMapping("/events")
    fun handleEvent(@Valid @RequestBody request: DeviceEventRequest): DeviceEventResponse =
        deviceEventService.handleEvent(request)

    @PostMapping("/register")
    fun registerDevice(@Valid @RequestBody request: DeviceRequest): DeviceProvisioningResponse =
        deviceEventService.registerDevice(request)

    @GetMapping("/sessions/{sessionId}/screen")
    fun currentScreen(
        @PathVariable sessionId: UUID,
        @RequestHeader("X-Device-Id") deviceId: String,
        @RequestHeader("X-Device-Key") deviceKey: String,
    ): DeviceEventResponse = deviceEventService.currentScreen(deviceId, deviceKey, sessionId)

    @GetMapping("/firmware/latest/manifest")
    fun firmwareManifest(
        @RequestHeader("X-Device-Id") deviceId: String,
        @RequestHeader("X-Device-Key") deviceKey: String,
        @RequestHeader("X-Firmware-Version", required = false) firmwareVersionHeader: String?,
        @RequestParam("currentVersion", required = false) currentVersion: String?,
    ) = firmwareUpdateService.manifest(
        deviceId = deviceId,
        deviceKey = deviceKey,
        currentVersion = currentVersion ?: firmwareVersionHeader,
        firmwareUrl = ServletUriComponentsBuilder
            .fromCurrentContextPath()
            .path("/api/device/firmware/latest/bin")
            .toUriString(),
    )

    @GetMapping("/firmware/latest/bin", produces = [MediaType.APPLICATION_OCTET_STREAM_VALUE])
    fun firmwareBinary(
        @RequestHeader("X-Device-Id") deviceId: String,
        @RequestHeader("X-Device-Key") deviceKey: String,
    ): ResponseEntity<Resource> {
        val firmware = firmwareUpdateService.firmware(deviceId, deviceKey)

        return ResponseEntity.ok()
            .contentType(MediaType.APPLICATION_OCTET_STREAM)
            .contentLength(firmware.size)
            .header("x-MD5", firmware.md5)
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"${firmware.fileName}\"")
            .body(firmware.resource)
    }

    @GetMapping("/audio-test/latest/metadata")
    fun audioTestMetadata(
        @RequestHeader("X-Device-Id") deviceId: String,
        @RequestHeader("X-Device-Key") deviceKey: String,
        @RequestParam("knownVersion", required = false) knownVersion: Long?,
    ) = audioTestService.deviceStatus(deviceId, deviceKey, knownVersion)

    @PostMapping("/audio-test/latest/ack")
    fun acknowledgeAudioTest(
        @RequestHeader("X-Device-Id") deviceId: String,
        @RequestHeader("X-Device-Key") deviceKey: String,
        @RequestBody request: AudioAckRequest,
    ) = audioTestService.acknowledge(deviceId, deviceKey, request.version)

    @GetMapping("/audio-test/latest.wav", produces = ["audio/wav"])
    fun audioTestLatestWav(
        @RequestHeader("X-Device-Id") deviceId: String,
        @RequestHeader("X-Device-Key") deviceKey: String,
    ): ResponseEntity<ByteArrayResource> {
        val bytes = audioTestService.deviceLatestWavBytes(deviceId, deviceKey)
        return ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .contentType(MediaType.valueOf("audio/wav"))
            .contentLength(bytes.size.toLong())
            .body(ByteArrayResource(bytes))
    }

    @GetMapping("/sounds/latest/metadata")
    fun latestSoundMetadata(
        @RequestHeader("X-Device-Id") deviceId: String,
        @RequestHeader("X-Device-Key") deviceKey: String,
        @RequestParam("knownVersion", required = false) knownVersion: Long?,
    ) = soundLibraryService.latestDeviceSound(deviceId, deviceKey, knownVersion)

    @GetMapping("/sounds/{soundId}/audio.wav", produces = ["audio/wav"])
    fun deviceSoundAudio(
        @PathVariable soundId: UUID,
        @RequestHeader("X-Device-Id") deviceId: String,
        @RequestHeader("X-Device-Key") deviceKey: String,
    ): ResponseEntity<ByteArrayResource> {
        val bytes = soundLibraryService.deviceAudio(deviceId, deviceKey, soundId)
        return ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .contentType(MediaType.valueOf("audio/wav"))
            .contentLength(bytes.size.toLong())
            .body(ByteArrayResource(bytes))
    }

    @PostMapping("/sounds/latest/ack")
    fun acknowledgeSound(
        @RequestHeader("X-Device-Id") deviceId: String,
        @RequestHeader("X-Device-Key") deviceKey: String,
        @RequestBody request: DeviceSoundAckRequest,
    ) = soundLibraryService.acknowledgeDeviceSound(deviceId, deviceKey, request.version)

    @GetMapping("/settings")
    fun settings(
        @RequestHeader("X-Device-Id") deviceId: String,
        @RequestHeader("X-Device-Key") deviceKey: String,
    ) = settingsService.getDeviceSettings(deviceId, deviceKey)

    @GetMapping("/health")
    fun health() = deviceEventService.health()
}
