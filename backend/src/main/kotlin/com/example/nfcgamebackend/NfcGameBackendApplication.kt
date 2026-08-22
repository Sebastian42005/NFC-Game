package com.example.nfcgamebackend

import org.springframework.boot.context.properties.ConfigurationPropertiesScan
import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication
@ConfigurationPropertiesScan
class NfcGameBackendApplication

fun main(args: Array<String>) {
	runApplication<NfcGameBackendApplication>(*args)
}
