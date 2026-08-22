package com.example.nfcgamebackend.nfcgame.application.device

import com.example.nfcgamebackend.nfcgame.security.DeviceAuthenticator
import com.fasterxml.jackson.databind.ObjectMapper
import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.multipart.MultipartFile
import org.springframework.web.server.ResponseStatusException
import java.io.File
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.time.Instant
import kotlin.io.path.createDirectories
import kotlin.io.path.createTempDirectory
import kotlin.io.path.exists

@Service
class NfcAudioTestService(
    private val objectMapper: ObjectMapper,
    private val deviceAuthenticator: DeviceAuthenticator,
) {
    private val logger = LoggerFactory.getLogger(javaClass)

    data class AudioTestStatus(
        val available: Boolean,
        val version: Long,
        val hasNewAudio: Boolean,
        val audioUrl: String?,
        val uploadedAt: String?,
        val originalFilename: String?,
        val sizeBytes: Long,
        val lastPlayedAt: String?,
        val lastPlayedDeviceId: String?,
    )

    private data class StoredAudioTestMetadata(
        val version: Long = 0,
        val uploadedAt: String? = null,
        val originalFilename: String? = null,
        val sizeBytes: Long = 0,
        val lastPlayedAt: String? = null,
        val lastPlayedDeviceId: String? = null,
    )

    private val storageDir: Path = Path.of(System.getProperty("user.dir"), "data", "nfc-audio-test")
    private val latestWavPath: Path = storageDir.resolve("latest.wav")
    private val metadataPath: Path = storageDir.resolve("metadata.json")

    @Synchronized
    fun upload(file: MultipartFile): AudioTestStatus {
        require(!file.isEmpty) { "File is empty" }

        ensureStorageDirectory()

        val current = readMetadata()
        val nextVersion = current.version + 1
        val workDir = createTempDirectory("nfc-audio-test-upload-").toFile()
        val inputExt = guessExt(file.originalFilename ?: "", file.contentType ?: "")
        val inputFile = File(workDir, "input.$inputExt")
        val outputFile = File(workDir, "latest.wav")

        try {
            file.inputStream.use { input ->
                inputFile.outputStream().use { output -> input.copyTo(output) }
            }

            convertToMonoWav(inputFile, outputFile)
            Files.copy(outputFile.toPath(), latestWavPath, StandardCopyOption.REPLACE_EXISTING)

            val metadata = StoredAudioTestMetadata(
                version = nextVersion,
                uploadedAt = Instant.now().toString(),
                originalFilename = file.originalFilename,
                sizeBytes = Files.size(latestWavPath),
                lastPlayedAt = null,
                lastPlayedDeviceId = null,
            )
            writeMetadata(metadata)
            return toStatus(metadata, null)
        } finally {
            inputFile.delete()
            outputFile.delete()
            workDir.delete()
        }
    }

    @Synchronized
    fun publicStatus(): AudioTestStatus = toStatus(readMetadata(), null)

    @Synchronized
    fun deviceStatus(deviceId: String, deviceKey: String, knownVersion: Long?): AudioTestStatus {
        deviceAuthenticator.authenticate(deviceId, deviceKey)
        return toStatus(readMetadata(), knownVersion)
    }

    @Synchronized
    fun latestWavBytes(): ByteArray {
        val metadata = readMetadata()
        if (!metadata.available()) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "No audio test file uploaded yet")
        }
        return Files.readAllBytes(latestWavPath)
    }

    @Synchronized
    fun acknowledge(deviceId: String, deviceKey: String, version: Long): AudioTestStatus {
        val device = deviceAuthenticator.authenticate(deviceId, deviceKey)
        val metadata = readMetadata()
        if (!metadata.available()) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "No audio test file uploaded yet")
        }
        if (version != metadata.version) {
            return toStatus(metadata, version)
        }

        val updated = metadata.copy(
            lastPlayedAt = Instant.now().toString(),
            lastPlayedDeviceId = device.name,
        )
        writeMetadata(updated)
        return toStatus(updated, version)
    }

    private fun ensureStorageDirectory() {
        storageDir.createDirectories()
    }

    private fun readMetadata(): StoredAudioTestMetadata {
        ensureStorageDirectory()
        if (!metadataPath.exists()) return StoredAudioTestMetadata()
        return try {
            objectMapper.readValue(metadataPath.toFile(), StoredAudioTestMetadata::class.java)
        } catch (exception: Exception) {
            val corruptedTarget = storageDir.resolve("metadata-corrupt-${System.currentTimeMillis()}.json")
            runCatching {
                Files.move(metadataPath, corruptedTarget, StandardCopyOption.REPLACE_EXISTING)
            }
            logger.warn("Ignoring corrupt NFC audio test metadata at {}", metadataPath, exception)
            StoredAudioTestMetadata()
        }
    }

    private fun writeMetadata(metadata: StoredAudioTestMetadata) {
        ensureStorageDirectory()
        val tempPath = storageDir.resolve("metadata.json.tmp")
        objectMapper.writerWithDefaultPrettyPrinter().writeValue(tempPath.toFile(), metadata)
        Files.move(tempPath, metadataPath, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
    }

    private fun toStatus(metadata: StoredAudioTestMetadata, knownVersion: Long?): AudioTestStatus {
        val available = metadata.available()
        return AudioTestStatus(
            available = available,
            version = metadata.version,
            hasNewAudio = knownVersion?.let { available && metadata.version > it } ?: false,
            audioUrl = if (available) "/api/public/nfc-game/audio-test/latest.wav?v=${metadata.version}" else null,
            uploadedAt = metadata.uploadedAt,
            originalFilename = metadata.originalFilename,
            sizeBytes = metadata.sizeBytes,
            lastPlayedAt = metadata.lastPlayedAt,
            lastPlayedDeviceId = metadata.lastPlayedDeviceId,
        )
    }

    private fun StoredAudioTestMetadata.available(): Boolean =
        version > 0 && sizeBytes > 0 && latestWavPath.exists()

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

        val process = ProcessBuilder(command)
            .redirectErrorStream(true)
            .start()

        val log = process.inputStream.bufferedReader().readText()
        val code = process.waitFor()

        if (code != 0) {
            output.delete()
            throw IllegalStateException("ffmpeg failed ($code): $log")
        }
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
}
