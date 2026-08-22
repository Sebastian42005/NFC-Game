package com.example.nfcgamebackend.repositories

import com.example.nfcgamebackend.entities.AppRole
import com.example.nfcgamebackend.entities.AppUser
import org.springframework.data.jpa.repository.JpaRepository

interface AppUserRepository : JpaRepository<AppUser, Long> {
    fun findByUsername(username: String): AppUser?
    fun findAllByOrderByIdAsc(): List<AppUser>
    fun findFirstByRoleOrderByIdAsc(role: AppRole): AppUser?
}
