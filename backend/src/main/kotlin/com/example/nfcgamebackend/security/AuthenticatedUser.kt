package com.example.nfcgamebackend.security

data class AuthenticatedUser(
    val id: Long,
    val username: String,
    val role: String,
)
