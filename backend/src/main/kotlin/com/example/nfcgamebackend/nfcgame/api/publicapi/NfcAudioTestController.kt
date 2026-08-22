package com.example.nfcgamebackend.nfcgame.api.publicapi

import com.example.nfcgamebackend.nfcgame.application.device.NfcAudioTestService
import org.springframework.core.io.ByteArrayResource
import org.springframework.http.CacheControl
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile

@RestController
@RequestMapping("/api/public/nfc-game/audio-test")
class NfcAudioTestController(
    private val audioTestService: NfcAudioTestService,
) {
    @PostMapping("/upload", consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
    fun upload(@RequestParam("file") file: MultipartFile) = audioTestService.upload(file)

    @GetMapping("/status")
    fun status() = audioTestService.publicStatus()

    @GetMapping("/latest.wav", produces = ["audio/wav"])
    fun latestWav(): ResponseEntity<ByteArrayResource> {
        val bytes = audioTestService.latestWavBytes()
        return ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .contentType(MediaType.valueOf("audio/wav"))
            .contentLength(bytes.size.toLong())
            .body(ByteArrayResource(bytes))
    }
}
