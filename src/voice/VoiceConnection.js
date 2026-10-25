import { EventEmitter } from 'node:events';
import { YapinError, ErrorCodes } from '../errors/index.js';

/**
 * The bot in a voice call. One audio track out; the bot hears nobody.
 *
 *   const connection = await server.voice.connect(channel);
 *   await connection.play('music/song.mp3');          // ffmpeg decodes files, URLs and streams
 *   connection.pause(); connection.resume(); connection.setVolume(0.5); connection.stop();
 *   await connection.leave();
 *
 * Events: 'start' (input), 'finish' (input), 'error' (error), 'disconnect'.
 */
export class VoiceConnection extends EventEmitter {
  constructor(manager, { rtc, room, source, track, ticket, keys, serverId, channelId, sampleRate, channels }) {
    super();
    Object.defineProperty(this, 'manager', { value: manager });
    Object.defineProperty(this, 'rtc', { value: rtc });
    this.room = room;
    this.source = source;
    this.track = track;
    this.serverId = serverId;
    this.channelId = channelId;
    this.sampleRate = sampleRate;
    this.channels = channels;
    /** Calls are end-to-end encrypted; yapin.js handed our key out. */
    this.e2ee = Boolean(ticket.e2ee);
    /** The bot joined muted (no Speak permission, or a moderator muted it). */
    this.muted = Boolean(ticket.voice_muted);
    this.volume = 1;
    this.paused = false;
    this.playing = null;
    this.destroyed = false;
    this._keys = keys;
    this._abort = null;
    this._resume = null;
  }

  get client() {
    return this.manager.client;
  }

  get server() {
    return this.client.servers.cache.get(this.serverId) ?? null;
  }

  get channel() {
    return this.client.channels.cache.get(this.channelId) ?? null;
  }

  /** 0 (silent) to 2 (twice as loud). */
  setVolume(volume) {
    this.volume = Math.max(0, Math.min(2, Number(volume) || 0));
    return this;
  }

  pause() {
    this.paused = true;
    return this;
  }

  resume() {
    this.paused = false;
    this._resume?.();
    this._resume = null;
    return this;
  }

  /** Stops what's playing; play() resolves as if it had finished. */
  stop() {
    this._abort?.abort();
    this.resume();
    return this;
  }

  /**
   * Plays raw audio: 16-bit little-endian PCM at the connection's sample rate and channel count
   * (48 kHz stereo by default), from a Readable stream or any async iterable of Buffers.
   */
  async playPCM(input, { signal } = {}) {
    if (this.destroyed) throw new YapinError(ErrorCodes.VoiceUnavailable, 'This voice connection was closed');
    this.stop();
    const controller = new AbortController();
    this._abort = controller;
    signal?.addEventListener('abort', () => controller.abort(), { once: true });
    const samples = this.sampleRate / 100;
    const frameBytes = samples * this.channels * 2;
    const { AudioFrame } = this.rtc;
    this.playing = input;
    this.emit('start', input);
    let pending = Buffer.alloc(0);
    try {
      for await (const chunk of input) {
        pending = pending.length ? Buffer.concat([pending, chunk]) : Buffer.from(chunk);
        while (pending.length >= frameBytes) {
          if (controller.signal.aborted) return;
          if (this.paused) await new Promise((resolve) => { this._resume = resolve; });
          if (controller.signal.aborted) return;
          // A fresh ArrayBuffer is always 2-byte aligned, unlike a slice of Node's buffer pool.
          const pcm = new Int16Array(pending.buffer.slice(pending.byteOffset, pending.byteOffset + frameBytes));
          if (this.volume !== 1) {
            for (let i = 0; i < pcm.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, pcm[i] * this.volume));
          }
          pending = pending.subarray(frameBytes);
          await this.source.captureFrame(new AudioFrame(pcm, this.sampleRate, this.channels, samples));
        }
      }
      if (!controller.signal.aborted) await this.source.waitForPlayout?.();
    } catch (error) {
      if (!controller.signal.aborted) {
        this.emit('error', error);
        throw error;
      }
    } finally {
      if (this._abort === controller) {
        this._abort = null;
        this.playing = null;
      }
      this.emit('finish', input);
      if (typeof input?.destroy === 'function') input.destroy();
    }
  }

  /**
   * Plays anything ffmpeg can read: a file path, an http(s) URL, or a Readable stream (piped in).
   * Needs ffmpeg on the PATH (or pass `ffmpeg: '/path/to/ffmpeg'`). `seek` in seconds;
   * `args` adds ffmpeg input options (like ['-re']).
   * Only play audio you have the rights to (see docs/voice.md).
   */
  async play(input, { ffmpeg = 'ffmpeg', seek, args = [], signal } = {}) {
    const { spawn } = await import('node:child_process');
    const fromStream = typeof input === 'object' && typeof input?.pipe === 'function';
    const ffArgs = [
      '-loglevel', 'error',
      ...(seek ? ['-ss', String(seek)] : []),
      ...args,
      '-i', fromStream ? 'pipe:0' : String(input),
      '-f', 's16le', '-ar', String(this.sampleRate), '-ac', String(this.channels),
      'pipe:1',
    ];
    const ff = spawn(ffmpeg, ffArgs, { stdio: [fromStream ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    let stderr = '';
    ff.stderr.on('data', (d) => { stderr += d; });
    const spawned = new Promise((resolve, reject) => {
      ff.once('spawn', resolve);
      ff.once('error', (e) => reject(e.code === 'ENOENT'
        ? new YapinError(ErrorCodes.VoiceUnavailable, 'ffmpeg was not found: install it (https://ffmpeg.org) or pass { ffmpeg: "/path/to/ffmpeg" }')
        : e));
    });
    await spawned;
    if (fromStream) {
      input.pipe(ff.stdin);
      ff.stdin.on('error', () => {});
    }
    try {
      await this.playPCM(ff.stdout, { signal });
    } finally {
      if (ff.exitCode === null) ff.kill('SIGKILL');
    }
    if (ff.exitCode && ff.exitCode !== 0 && stderr && !signal?.aborted) {
      throw new Error(`ffmpeg failed: ${stderr.trim().split('\n').pop()}`);
    }
  }

  /** Leaves the call. */
  async leave() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stop();
    this._keys?.stop();
    this.manager.connections.delete(this.serverId);
    try {
      await this.room.disconnect();
    } finally {
      this.emit('disconnect');
    }
  }

  disconnect() {
    return this.leave();
  }

  _remoteDisconnect() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stop();
    this._keys?.stop();
    this.manager.connections.delete(this.serverId);
    this.emit('disconnect');
  }
}
