package com.example.nfcgamebackend.nfcgame.api.websocket

import com.example.nfcgamebackend.security.AppSecurityProperties
import org.springframework.context.annotation.Configuration
import org.springframework.messaging.simp.config.MessageBrokerRegistry
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker
import org.springframework.web.socket.config.annotation.StompEndpointRegistry
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer

@Configuration
@EnableWebSocketMessageBroker
class NfcWebSocketConfig(
    private val securityProperties: AppSecurityProperties,
) : WebSocketMessageBrokerConfigurer {
    override fun configureMessageBroker(registry: MessageBrokerRegistry) {
        registry.enableSimpleBroker("/topic")
        registry.setApplicationDestinationPrefixes("/app")
    }

    override fun registerStompEndpoints(registry: StompEndpointRegistry) {
        val allowedOrigins = securityProperties.allowedOrigins.toTypedArray()

        registry.addEndpoint("/ws/nfc").setAllowedOrigins(*allowedOrigins)
        registry.addEndpoint("/ws/nfc").setAllowedOrigins(*allowedOrigins).withSockJS()
        registry.addEndpoint("/api/ws/nfc").setAllowedOrigins(*allowedOrigins)
        registry.addEndpoint("/api/ws/nfc").setAllowedOrigins(*allowedOrigins).withSockJS()
    }
}
