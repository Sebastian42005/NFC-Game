package com.example.nfcgamebackend.dto

data class AuthMeResponse(
    val authenticated: Boolean,
    val username: String? = null,
    val role: String? = null,
)
