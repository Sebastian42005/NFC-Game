package com.example.nfcgamebackend.nfcgame.application.sound

import com.example.nfcgamebackend.nfcgame.api.dto.DeviceSoundMetadataResponse
import com.example.nfcgamebackend.nfcgame.api.dto.SoundRatingRequest
import com.example.nfcgamebackend.nfcgame.api.dto.SoundResponse
import com.example.nfcgamebackend.nfcgame.api.dto.SoundUpdateRequest
import com.example.nfcgamebackend.nfcgame.application.admin.NfcAdminService
import com.example.nfcgamebackend.nfcgame.domain.GamePublicationStatus
import com.example.nfcgamebackend.nfcgame.persistence.entity.NfcDeviceSoundCommand
import com.example.nfcgamebackend.nfcgame.persistence.entity.NfcSound
import com.example.nfcgamebackend.nfcgame.persistence.entity.NfcSoundRating
import com.example.nfcgamebackend.nfcgame.persistence.repository.NfcDeviceSoundCommandRepository
import com.example.nfcgamebackend.nfcgame.persistence.repository.NfcDeviceRepository
import com.example.nfcgamebackend.nfcgame.persistence.repository.NfcSoundRatingRepository
import com.example.nfcgamebackend.nfcgame.persistence.repository.NfcSoundRepository
import com.example.nfcgamebackend.nfcgame.security.DeviceAuthenticator
import org.springframework.http.HttpStatus
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.multipart.MultipartFile
import org.springframework.web.server.ResponseStatusException
import java.io.File
import java.nio.file.Files
import java.time.Instant
import java.util.UUID
import kotlin.io.path.createTempDirectory

@Service
class NfcSoundLibraryService(
    private val soundRepository: NfcSoundRepository,
    private val ratingRepository: NfcSoundRatingRepository,
    private val commandRepository: NfcDeviceSoundCommandRepository,
    private val deviceRepository: NfcDeviceRepository,
    private val adminService: NfcAdminService,
    private val deviceAuthenticator: DeviceAuthenticator,
) {
    private val logger = LoggerFactory.getLogger(javaClass)

    fun listMySounds(): List<SoundResponse> {
        val accountId = adminService.currentAccountId()
        return soundRepository.findAllByAccountIdAndActiveTrueOrderByUpdatedAtDesc(accountId)
            .map { toSoundResponse(it, accountId) }
    }

    fun listMySoundOptions(): List<SoundResponse> {
        val accountId = adminService.currentAccountId()
        return soundRepository.findAllByAccountIdAndActiveTrueOrderByNameAsc(accountId)
            .map { toSoundResponse(it, accountId) }
    }

    fun listPublicSounds(accountId: Long?): List<SoundResponse> =
        soundRepository.findAllByPublicationStatusAndActiveTrueOrderByUpdatedAtDesc(GamePublicationStatus.PUBLISHED)
            .map { toSoundResponse(it, accountId) }

    @Transactional
    fun upload(file: MultipartFile, name: String?): SoundResponse {
        if (file.isEmpty) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Sound file is empty")
        }

        val accountId = adminService.currentAccountId()
        val wav = convertToMonoWav(file)
        val cleanName = name?.trim()?.takeIf { it.isNotBlank() }
            ?: file.originalFilename?.substringBeforeLast('.')?.takeIf { it.isNotBlank() }
            ?: "Neuer Sound"

        val sound = soundRepository.save(
            NfcSound().apply {
                this.name = cleanName.take(120)
                this.accountId = accountId
                wavContent = wav
                sizeBytes = wav.size.toLong()
                durationMs = durationMs(wav)
                originalFilename = file.originalFilename
                publicationStatus = GamePublicationStatus.DRAFT
                version = 1
            },
        )
        return toSoundResponse(sound, accountId)
    }

    @Transactional
    fun update(soundId: UUID, request: SoundUpdateRequest): SoundResponse {
        val accountId = adminService.currentAccountId()
        val sound = ownedSound(soundId, accountId)
        sound.name = request.name.trim().take(120)
        sound.version += 1
        return toSoundResponse(soundRepository.save(sound), accountId)
    }

    @Transactional
    fun delete(soundId: UUID) {
        val sound = ownedSound(soundId, adminService.currentAccountId())
        sound.active = false
        sound.publicationStatus = GamePublicationStatus.DRAFT
        soundRepository.save(sound)
    }

    @Transactional
    fun publish(soundId: UUID): SoundResponse {
        val accountId = adminService.currentAccountId()
        val sound = ownedSound(soundId, accountId)
        sound.publicationStatus = GamePublicationStatus.PUBLISHED
        sound.active = true
        return toSoundResponse(soundRepository.save(sound), accountId)
    }

    @Transactional
    fun unpublish(soundId: UUID): SoundResponse {
        val accountId = adminService.currentAccountId()
        val sound = ownedSound(soundId, accountId)
        sound.publicationStatus = GamePublicationStatus.DRAFT
        return toSoundResponse(soundRepository.save(sound), accountId)
    }

    @Transactional
    fun addPublicSoundToLibrary(soundId: UUID): SoundResponse {
        val accountId = adminService.currentAccountId()
        val source = soundRepository.findById(soundId).orElseThrow { notFound("Sound not found") }
        if (!source.active || source.publicationStatus != GamePublicationStatus.PUBLISHED) {
            throw notFound("Sound not found")
        }
        val copy = soundRepository.save(
            NfcSound().apply {
                name = "${source.name} Kopie".take(120)
                this.accountId = accountId
                active = true
                publicationStatus = GamePublicationStatus.DRAFT
                sourceSoundId = requireNotNull(source.id)
                wavContent = source.wavContent
                contentType = source.contentType
                originalFilename = source.originalFilename
                sizeBytes = source.sizeBytes
                durationMs = source.durationMs
                version = 1
            },
        )
        return toSoundResponse(copy, accountId)
    }

    @Transactional
    fun ratePublicSound(soundId: UUID, request: SoundRatingRequest, accountId: Long?): SoundResponse {
        val userAccountId = accountId ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Login required")
        val sound = soundRepository.findById(soundId).orElseThrow { notFound("Sound not found") }
        if (!sound.active || sound.publicationStatus != GamePublicationStatus.PUBLISHED) {
            throw notFound("Sound not found")
        }
        if (sound.accountId == userAccountId) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Own sounds cannot be rated")
        }

        val ratingValue = request.rating.coerceIn(-1, 1)
        if (ratingValue == 0) {
            ratingRepository.deleteBySoundIdAndAccountId(soundId, userAccountId)
        } else {
            val rating = ratingRepository.findBySoundIdAndAccountId(soundId, userAccountId)
                ?: NfcSoundRating().apply {
                    this.soundId = soundId
                    this.accountId = userAccountId
                }
            rating.rating = ratingValue
            ratingRepository.save(rating)
        }
        return toSoundResponse(sound, userAccountId)
    }

    fun publicAudio(soundId: UUID, accountId: Long?): ByteArray {
        val sound = soundRepository.findById(soundId).orElseThrow { notFound("Sound not found") }
        val canRead = sound.accountId == accountId || (sound.active && sound.publicationStatus == GamePublicationStatus.PUBLISHED)
        if (!canRead) throw notFound("Sound not found")
        return sound.wavContent ?: throw notFound("Sound audio not found")
    }

    @Transactional
    fun queueDeviceSound(deviceId: UUID, sessionId: UUID?, soundId: UUID) {
        val sound = soundRepository.findById(soundId).orElse(null) ?: return
        val device = deviceRepository.findById(deviceId).orElse(null) ?: return
        val canPlay = sound.accountId == device.accountId || sound.publicationStatus == GamePublicationStatus.PUBLISHED
        if (!canPlay) {
            logger.warn("NFC sound command skipped: sound {} does not belong to device account {}", soundId, device.accountId)
            return
        }
        if (!sound.active || sound.wavContent == null) {
            logger.warn("NFC sound command skipped: sound {} inactive or missing audio", soundId)
            return
        }
        val latest = commandRepository.findFirstByDeviceIdOrderByVersionDesc(deviceId)
        val nextVersion = maxOf(Instant.now().toEpochMilli(), (latest?.version ?: 0) + 1)
        commandRepository.save(
            NfcDeviceSoundCommand().apply {
                this.deviceId = deviceId
                this.sessionId = sessionId
                this.soundId = soundId
                version = nextVersion
            },
        )
        logger.info("Queued NFC sound {} for device {} with version {}", soundId, deviceId, nextVersion)
    }

    fun latestDeviceSound(deviceId: String, deviceKey: String, knownVersion: Long?): DeviceSoundMetadataResponse {
        val device = deviceAuthenticator.authenticate(deviceId, deviceKey)
        val command = commandRepository.findFirstByDeviceIdOrderByVersionDesc(requireNotNull(device.id))
            ?: return DeviceSoundMetadataResponse(false, 0, false, null, null, null, 0)
        val sound = command.soundId?.let { soundRepository.findById(it).orElse(null) }
        if (sound?.active != true || sound.wavContent == null) {
            return DeviceSoundMetadataResponse(false, command.version, false, null, null, null, 0)
        }
        return DeviceSoundMetadataResponse(
            available = true,
            version = command.version,
            hasNewAudio = knownVersion?.let { command.version > it } ?: true,
            soundId = requireNotNull(sound.id),
            soundName = sound.name,
            audioUrl = "/api/device/sounds/${sound.id}/audio.wav?v=${sound.version}&commandVersion=${command.version}",
            sizeBytes = sound.sizeBytes,
        )
    }

    fun deviceAudio(deviceId: String, deviceKey: String, soundId: UUID): ByteArray {
        val device = deviceAuthenticator.authenticate(deviceId, deviceKey)
        val command = commandRepository.findFirstByDeviceIdOrderByVersionDesc(requireNotNull(device.id))
        if (command?.soundId != soundId) throw notFound("Sound not queued for device")
        val sound = soundRepository.findById(soundId).orElseThrow { notFound("Sound not found") }
        return sound.wavContent ?: throw notFound("Sound audio not found")
    }

    @Transactional
    fun acknowledgeDeviceSound(deviceId: String, deviceKey: String, version: Long): DeviceSoundMetadataResponse {
        val device = deviceAuthenticator.authenticate(deviceId, deviceKey)
        val command = commandRepository.findFirstByDeviceIdOrderByVersionDesc(requireNotNull(device.id))
            ?: return DeviceSoundMetadataResponse(false, 0, false, null, null, null, 0)
        if (command.version == version) {
            command.playedAt = Instant.now()
            commandRepository.save(command)
        }
        return latestDeviceSound(deviceId, deviceKey, version)
    }

    private fun ownedSound(soundId: UUID, accountId: Long): NfcSound =
        soundRepository.findById(soundId).orElseThrow { notFound("Sound not found") }.also {
            if (it.accountId != accountId || !it.active) throw notFound("Sound not found")
        }

    private fun toSoundResponse(sound: NfcSound, accountId: Long?) = SoundResponse(
        id = requireNotNull(sound.id),
        name = sound.name,
        audioUrl = "/api/public/sounds/${sound.id}/audio.wav?v=${sound.version}",
        publicationStatus = sound.publicationStatus,
        likeCount = ratingRepository.countBySoundIdAndRating(requireNotNull(sound.id), 1),
        dislikeCount = ratingRepository.countBySoundIdAndRating(requireNotNull(sound.id), -1),
        myRating = accountId?.let { ratingRepository.findBySoundIdAndAccountId(requireNotNull(sound.id), it)?.rating },
        ownedByCurrentAccount = accountId != null && sound.accountId == accountId,
        sizeBytes = sound.sizeBytes,
        durationMs = sound.durationMs,
        version = sound.version,
        originalFilename = sound.originalFilename,
        createdAt = sound.createdAt,
        updatedAt = sound.updatedAt,
    )

    private fun convertToMonoWav(file: MultipartFile): ByteArray {
        val workDir = createTempDirectory("nfc-sound-upload-").toFile()
        val inputExt = guessExt(file.originalFilename ?: "", file.contentType ?: "")
        val inputFile = File(workDir, "input.$inputExt")
        val outputFile = File(workDir, "sound.wav")
        try {
            file.inputStream.use { input ->
                inputFile.outputStream().use { output -> input.copyTo(output) }
            }
            convertToMonoWav(inputFile, outputFile)
            return Files.readAllBytes(outputFile.toPath())
        } finally {
            inputFile.delete()
            outputFile.delete()
            workDir.delete()
        }
    }

    private fun convertToMonoWav(input: File, output: File) {
        val command = listOf(
            "ffmpeg",
            "-y",
            "-i", input.absolutePath,
            "-vn",
            "-ac", "1",
            "-ar", "16000",
            "-c:a", "pcm_s16le",
            output.absolutePath,
        )
        val process = ProcessBuilder(command).redirectErrorStream(true).start()
        val log = process.inputStream.bufferedReader().readText()
        val code = process.waitFor()
        if (code != 0) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Audio conversion failed: $log")
        }
    }

    private fun durationMs(wav: ByteArray): Long {
        val dataBytes = maxOf(0, wav.size - 44)
        return (dataBytes * 1000L) / (16000L * 2L)
    }

    private fun guessExt(originalName: String, contentType: String): String {
        val lower = originalName.lowercase()
        return when {
            lower.endsWith(".webm") || contentType.contains("webm") -> "webm"
            lower.endsWith(".ogg") || contentType.contains("ogg") -> "ogg"
            lower.endsWith(".wav") || contentType.contains("wav") -> "wav"
            lower.endsWith(".m4a") || contentType.contains("m4a") || contentType.contains("mp4") -> "m4a"
            lower.endsWith(".mp3") || contentType.contains("mpeg") -> "mp3"
            else -> "bin"
        }
    }

    private fun notFound(message: String) = ResponseStatusException(HttpStatus.NOT_FOUND, message)
}
