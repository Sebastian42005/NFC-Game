import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import {
  ActiveSessionDto,
  DeviceClaimRequest,
  DeviceEventRequest,
  DeviceEventResponse,
  DeviceDto,
  DeviceProvisioningDto,
  DeviceRequest,
  GameStatsDto,
  GameTemplateDto,
  LeaderboardEntryDto,
  NfcSettingsDto,
  NfcSettingsRequest,
  PlayerDto,
  PlayerStatsDto,
  SessionDetailDto,
  SessionTimelineEventDto,
  SoundDto,
} from '../../shared/models/nfc-game.models';
import { buildApiUrl, resolveBackendAssetUrl } from './nfc-api-url';

const apiBase = buildApiUrl('/public');
const deviceApiBase = buildApiUrl('/device');

@Injectable({ providedIn: 'root' })
export class NfcPublicApiService {
  private readonly http = inject(HttpClient);

  activeSession() {
    return this.http.get<ActiveSessionDto | null>(`${apiBase}/sessions/active`).pipe(map((session) => session ? resolveSessionImageUrls(session) : null));
  }

  session(sessionId: string) {
    return this.http.get<SessionDetailDto>(`${apiBase}/sessions/${encodeURIComponent(sessionId)}`).pipe(map(resolveSessionImageUrls));
  }

  finishSession(sessionId: string) {
    return this.http
      .post<SessionDetailDto>(`${apiBase}/sessions/${encodeURIComponent(sessionId)}/finish`, {})
      .pipe(map(resolveSessionImageUrls));
  }

  timeline(sessionId: string) {
    return this.http.get<SessionTimelineEventDto[]>(
      `${apiBase}/sessions/${encodeURIComponent(sessionId)}/timeline`,
    );
  }

  leaderboard() {
    return this.http.get<LeaderboardEntryDto[]>(`${apiBase}/leaderboard`).pipe(map((entries) => entries.map(resolveLeaderboardImageUrl)));
  }

  players() {
    return this.http.get<PlayerDto[]>(`${apiBase}/players`).pipe(map((players) => players.map(resolvePlayerImageUrl)));
  }

  playerStats(playerId: string) {
    return this.http.get<PlayerStatsDto>(`${apiBase}/players/${encodeURIComponent(playerId)}/stats`);
  }

  games() {
    return this.http.get<GameTemplateDto[]>(`${apiBase}/games`).pipe(map((games) => games.map(resolveGameImageUrl)));
  }

  publicGames() {
    return this.http.get<GameTemplateDto[]>(`${apiBase}/games/public`).pipe(map((games) => games.map(resolveGameImageUrl)));
  }

  addPublicGameToLibrary(gameId: string) {
    return this.http.post<GameTemplateDto>(`${apiBase}/games/${encodeURIComponent(gameId)}/library`, {}).pipe(map(resolveGameImageUrl));
  }

  ratePublicGame(gameId: string, rating: number) {
    return this.http.post<GameTemplateDto>(`${apiBase}/games/${encodeURIComponent(gameId)}/rating`, { rating }).pipe(map(resolveGameImageUrl));
  }

  gameStats(gameId: string) {
    return this.http.get<GameStatsDto>(`${apiBase}/games/${encodeURIComponent(gameId)}/stats`);
  }

  history() {
    return this.http.get<SessionDetailDto[]>(`${apiBase}/history`).pipe(map((sessions) => sessions.map(resolveSessionImageUrls)));
  }

  accountDevices() {
    return this.http.get<DeviceDto[]>(`${apiBase}/account/devices`);
  }

  claimDevice(request: DeviceClaimRequest) {
    return this.http.post<DeviceDto>(`${apiBase}/account/devices/claim`, request);
  }

  settings() {
    return this.http.get<NfcSettingsDto>(`${apiBase}/settings`);
  }

  updateSettings(request: NfcSettingsRequest) {
    return this.http.put<NfcSettingsDto>(`${apiBase}/settings`, request);
  }

  playSettingsTestSound() {
    return this.http.post<NfcSettingsDto>(`${apiBase}/settings/test-sound`, {});
  }

  registerDevice(request: DeviceRequest) {
    return this.http.post<DeviceProvisioningDto>(`${deviceApiBase}/register`, request);
  }

  sounds() {
    return this.http.get<SoundDto[]>(`${apiBase}/sounds`).pipe(map((sounds) => sounds.map(resolveSoundUrl)));
  }

  soundOptions() {
    return this.http.get<SoundDto[]>(`${apiBase}/sounds/options`).pipe(map((sounds) => sounds.map(resolveSoundUrl)));
  }

  publicSounds() {
    return this.http.get<SoundDto[]>(`${apiBase}/sounds/public`).pipe(map((sounds) => sounds.map(resolveSoundUrl)));
  }

  uploadSound(blob: Blob, filename = 'sound.webm', name?: string) {
    const formData = new FormData();
    formData.append('file', blob, filename);
    if (name?.trim()) formData.append('name', name.trim());
    return this.http.post<SoundDto>(`${apiBase}/sounds/upload`, formData).pipe(map(resolveSoundUrl));
  }

  updateSound(soundId: string, name: string) {
    return this.http.put<SoundDto>(`${apiBase}/sounds/${encodeURIComponent(soundId)}`, { name }).pipe(map(resolveSoundUrl));
  }

  deleteSound(soundId: string) {
    return this.http.delete<void>(`${apiBase}/sounds/${encodeURIComponent(soundId)}`);
  }

  publishSound(soundId: string) {
    return this.http.post<SoundDto>(`${apiBase}/sounds/${encodeURIComponent(soundId)}/publish`, {}).pipe(map(resolveSoundUrl));
  }

  unpublishSound(soundId: string) {
    return this.http.post<SoundDto>(`${apiBase}/sounds/${encodeURIComponent(soundId)}/unpublish`, {}).pipe(map(resolveSoundUrl));
  }

  addPublicSoundToLibrary(soundId: string) {
    return this.http.post<SoundDto>(`${apiBase}/sounds/${encodeURIComponent(soundId)}/library`, {}).pipe(map(resolveSoundUrl));
  }

  ratePublicSound(soundId: string, rating: -1 | 0 | 1) {
    return this.http.post<SoundDto>(`${apiBase}/sounds/${encodeURIComponent(soundId)}/rating`, { rating }).pipe(map(resolveSoundUrl));
  }

  sendDeviceEvent(request: DeviceEventRequest) {
    return this.http.post<DeviceEventResponse>(`${deviceApiBase}/events`, request);
  }

  deviceScreen(deviceId: string, deviceKey: string, sessionId: string) {
    return this.http.get<DeviceEventResponse>(`${deviceApiBase}/sessions/${encodeURIComponent(sessionId)}/screen`, {
      headers: {
        'X-Device-Id': deviceId,
        'X-Device-Key': deviceKey,
      },
    });
  }
}

function resolveGameImageUrl(game: GameTemplateDto): GameTemplateDto {
  return {
    ...game,
    imageUrl: resolveBackendAssetUrl(game.imageUrl),
  };
}

function resolvePlayerImageUrl(player: PlayerDto): PlayerDto {
  return {
    ...player,
    imageUrl: resolveBackendAssetUrl(player.imageUrl),
  };
}

function resolveLeaderboardImageUrl(entry: LeaderboardEntryDto): LeaderboardEntryDto {
  return {
    ...entry,
    imageUrl: resolveBackendAssetUrl(entry.imageUrl),
  };
}

function resolveSessionImageUrls(session: ActiveSessionDto): ActiveSessionDto {
  return {
    ...session,
    gameImageUrl: resolveBackendAssetUrl(session.gameImageUrl),
    teams: session.teams.map((team) => ({
      ...team,
      members: team.members.map((member) => ({
        ...member,
        imageUrl: resolveBackendAssetUrl(member.imageUrl),
      })),
    })),
  };
}

export function resolveSoundUrl(sound: SoundDto): SoundDto {
  return {
    ...sound,
    audioUrl: resolveBackendAssetUrl(sound.audioUrl),
  };
}
