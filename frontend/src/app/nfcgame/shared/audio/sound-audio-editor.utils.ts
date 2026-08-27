export type TrimHandle = 'start' | 'end';

export const MIN_TRIM_SECONDS = 0.08;

export function browserAudioContext(existing?: AudioContext | null): AudioContext {
  if (existing && existing.state !== 'closed') return existing;

  const AudioContextConstructor =
    window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextConstructor) {
    throw new Error('AudioContext is not supported.');
  }

  return new AudioContextConstructor();
}

export async function decodeAudioBlob(blob: Blob, context: AudioContext): Promise<AudioBuffer> {
  if (context.state === 'suspended') {
    await context.resume();
  }
  return context.decodeAudioData(await blob.arrayBuffer());
}

export function createTrimmedBuffer(
  context: AudioContext,
  source: AudioBuffer,
  startSeconds: number,
  endSeconds: number,
): AudioBuffer {
  const startFrame = Math.floor(startSeconds * source.sampleRate);
  const endFrame = Math.min(source.length, Math.ceil(endSeconds * source.sampleRate));
  const frameCount = Math.max(1, endFrame - startFrame);
  const trimmedBuffer = context.createBuffer(source.numberOfChannels, frameCount, source.sampleRate);

  for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
    const samples = source.getChannelData(channel).subarray(startFrame, endFrame);
    trimmedBuffer.copyToChannel(samples, channel);
  }

  return trimmedBuffer;
}

export function encodeWav(buffer: AudioBuffer): Blob {
  const channelCount = buffer.numberOfChannels;
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const dataSize = buffer.length * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let frame = 0; frame < buffer.length; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = clamp(buffer.getChannelData(channel)[frame] ?? 0, -1, 1);
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }

  return new Blob([view], { type: 'audio/wav' });
}

export function waveformPeaks(buffer: AudioBuffer, width: number): number[] {
  const peaks: number[] = [];
  const channelCount = buffer.numberOfChannels;
  const samplesPerPixel = Math.max(1, Math.floor(buffer.length / width));

  for (let pixel = 0; pixel < width; pixel += 1) {
    const start = pixel * samplesPerPixel;
    const end = Math.min(buffer.length, start + samplesPerPixel);
    let peak = 0;

    for (let channel = 0; channel < channelCount; channel += 1) {
      const samples = buffer.getChannelData(channel);
      for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
        peak = Math.max(peak, Math.abs(samples[sampleIndex] ?? 0));
      }
    }

    peaks.push(peak);
  }

  return peaks;
}

export function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00.0';
  const clampedSeconds = Math.max(0, seconds);
  const minutes = Math.floor(clampedSeconds / 60);
  const remainingSeconds = clampedSeconds - minutes * 60;
  return `${minutes}:${remainingSeconds.toFixed(1).padStart(4, '0')}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}
