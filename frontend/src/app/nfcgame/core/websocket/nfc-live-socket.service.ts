import { Injectable, NgZone, inject } from '@angular/core';
import { Observable, Subject, share } from 'rxjs';
import { apiOrigin } from '../api/nfc-api-url';

interface TopicMessage<T> {
  topic: string;
  body: T;
}

@Injectable({ providedIn: 'root' })
export class NfcLiveSocketService {
  private readonly zone = inject(NgZone);
  private socket: WebSocket | null = null;
  private readonly messages$ = new Subject<TopicMessage<unknown>>();
  private readonly sharedMessages$ = this.messages$.pipe(share());
  private connected = false;
  private subscriptions = new Set<string>();
  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;
  private heartbeatTimer: number | null = null;
  private pendingFrameChunk = '';
  private readonly socketUrlCandidates = this.buildSocketUrlCandidates();
  private candidateIndex = 0;

  topic<T>(topic: string): Observable<T> {
    this.ensureConnected();
    this.subscribeTopic(topic);

    return new Observable<T>((observer) => {
      const subscription = this.sharedMessages$.subscribe((message) => {
        if (message.topic === topic) {
          observer.next(message.body as T);
        }
      });
      return () => subscription.unsubscribe();
    });
  }

  private ensureConnected() {
    if (this.socket || this.reconnectTimer !== null) {
      return;
    }
    const socketUrl = this.socketUrlCandidates[this.candidateIndex];
    this.socket = new WebSocket(socketUrl);
    this.socket.onopen = () => {
      this.sendFrame('CONNECT', { 'accept-version': '1.2', host: window.location.host });
    };
    this.socket.onmessage = (event) => this.zone.run(() => this.handleFrameChunk(String(event.data)));
    this.socket.onclose = () => {
      const previousCandidate = this.candidateIndex;
      this.connected = false;
      this.socket = null;
      this.stopHeartbeat();
      this.rotateCandidate(previousCandidate);
      this.scheduleReconnect();
    };
    this.socket.onerror = () => this.socket?.close();
  }

  private subscribeTopic(topic: string) {
    if (this.subscriptions.has(topic)) {
      return;
    }
    this.subscriptions.add(topic);
    this.trySubscribe(topic);
  }

  private trySubscribe(topic: string) {
    if (!this.socket || !this.connected) {
      return;
    }
    this.sendFrame('SUBSCRIBE', {
      id: `sub-${this.topicId(topic)}`,
      destination: topic,
    });
  }

  private handleFrameChunk(chunk: string) {
    this.pendingFrameChunk += chunk;
    const rawFrames = this.pendingFrameChunk.split('\0');
    this.pendingFrameChunk = rawFrames.pop() ?? '';

    for (const frame of rawFrames) {
      const normalizedFrame = frame.replace(/\r/g, '');
      if (!normalizedFrame.trim()) {
        continue;
      }

      const [headerPart, bodyPart = ''] = normalizedFrame.split('\n\n');
      const lines = headerPart.split('\n');
      const command = lines.shift()?.trim();
      const headers = Object.fromEntries(
        lines.map((line) => {
          const separator = line.indexOf(':');
          if (separator < 0) {
            return [line, ''];
          }
          return [line.slice(0, separator), line.slice(separator + 1)];
        }),
      );

      if (command === 'CONNECTED') {
        this.connected = true;
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        for (const topic of this.subscriptions) {
          this.trySubscribe(topic);
        }
        continue;
      }
      if (command === 'MESSAGE') {
        const topic = headers['destination'];
        if (!topic) {
          continue;
        }
        try {
          this.messages$.next({ topic, body: JSON.parse(bodyPart) });
        } catch {
          // Ignore malformed payloads to keep the socket alive.
        }
      }
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        return;
      }
      this.socket.send('\n');
    }, 15000);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer !== null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer !== null) {
      return;
    }
    const delay = Math.min(10000, 500 * 2 ** this.reconnectAttempts);
    this.reconnectAttempts++;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.ensureConnected();
    }, delay);
  }

  private rotateCandidate(previousCandidate: number) {
    if (this.connected) {
      return;
    }
    if (this.socketUrlCandidates.length <= 1) {
      return;
    }
    if (this.candidateIndex !== previousCandidate) {
      return;
    }
    this.candidateIndex = (this.candidateIndex + 1) % this.socketUrlCandidates.length;
  }

  private buildSocketUrlCandidates() {
    const defaultBase = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;
    const configuredBase = apiOrigin
      ? apiOrigin.replace(/^http/, 'ws')
      : defaultBase;

    const candidates = [
      `${configuredBase}/api/ws/nfc`,
      `${configuredBase}/ws/nfc`,
      `${defaultBase}/api/ws/nfc`,
      `${defaultBase}/ws/nfc`,
    ];

    return Array.from(new Set(candidates));
  }

  private topicId(topic: string) {
    return topic.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  private sendFrame(command: string, headers: Record<string, string>, body = '') {
    const headerLines = Object.entries(headers).map(([key, value]) => `${key}:${value}`);
    this.socket?.send(`${command}\n${headerLines.join('\n')}\n\n${body}\0`);
  }
}
