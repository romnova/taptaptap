class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private backgroundPaused = false;
  private ambientEnabled = true;
  private ambientRunning = false;
  private ambientTimer: number | null = null;
  private ambientGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private chordStep = 0;

  public setMuted(muted: boolean): void {
    this.muted = muted;
    this.updateAmbientState();
  }

  public setBackgroundPaused(paused: boolean): void {
    this.backgroundPaused = paused;
    if (paused) {
      this.stopAmbientLoop();
      if (this.ctx && this.ctx.state === 'running') {
        void this.ctx.suspend();
      }
    } else {
      if (this.ctx && this.ctx.state === 'suspended' && !this.muted) {
        void this.ctx.resume();
      }
      this.updateAmbientState();
    }
  }

  public setAmbientEnabled(enabled: boolean): void {
    this.ambientEnabled = enabled;
    this.updateAmbientState();
  }

  public unlockAudio(): void {
    const ctx = this.ensureCtx(true);
    if (ctx && this.ambientEnabled && !this.muted && !this.backgroundPaused && !this.ambientRunning) {
      this.startAmbientLoop();
    }
  }

  private ensureCtx(force = false): AudioContext | null {
    if ((this.muted || this.backgroundPaused) && !force) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended' && !this.backgroundPaused) {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private updateAmbientState(): void {
    if (!this.ctx) return;
    if (this.muted || this.backgroundPaused || !this.ambientEnabled) {
      this.stopAmbientLoop();
    } else if (!this.ambientRunning) {
      this.startAmbientLoop();
    }
  }

  private startAmbientLoop(): void {
    const ctx = this.ctx;
    if (!ctx || this.ambientRunning || this.muted || !this.ambientEnabled) return;
    this.ambientRunning = true;

    if (!this.ambientGain) {
      this.ambientGain = ctx.createGain();
      this.ambientGain.gain.value = 0.045;
      this.ambientGain.connect(ctx.destination);
    } else {
      this.ambientGain.gain.setTargetAtTime(0.045, ctx.currentTime, 0.4);
    }

    // PS2 Cozy Lounge Chord Progression (Fmaj9 -> Em7 -> Dm9 -> Cmaj9)
    const chords = [
      [174.61, 220.0, 261.63, 329.63, 392.0], // Fmaj9
      [164.81, 196.0, 246.94, 293.66, 392.0], // Em7
      [146.83, 174.61, 220.0, 261.63, 329.63], // Dm9
      [130.81, 164.81, 196.0, 246.94, 293.66], // Cmaj9
    ];

    const playChord = () => {
      if (!this.ambientRunning || !this.ctx || !this.ambientGain) return;
      const now = this.ctx.currentTime;
      const chord = chords[this.chordStep % chords.length];
      this.chordStep++;

      chord.forEach((freq, idx) => {
        if (!this.ctx || !this.ambientGain) return;
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const env = this.ctx.createGain();

        osc.type = idx === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, now);
        // Gentle chorus detune for warm PS2 pad feel
        osc.detune.setValueAtTime((idx % 2 === 0 ? 1 : -1) * 4, now);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(820, now);

        env.gain.setValueAtTime(0.0001, now);
        env.gain.linearRampToValueAtTime(idx === 0 ? 0.24 : 0.14, now + 0.85);
        env.gain.exponentialRampToValueAtTime(0.001, now + 4.3);

        osc.connect(filter);
        filter.connect(env);
        env.connect(this.ambientGain);
        osc.start(now);
        osc.stop(now + 4.4);
      });

      // Soft ambient bell pluck
      const bellFreq = chord[2 + (this.chordStep % 3)] * 2;
      const bellOsc = this.ctx.createOscillator();
      const bellGain = this.ctx.createGain();
      bellOsc.type = 'sine';
      bellOsc.frequency.setValueAtTime(bellFreq, now + 1.4);
      bellGain.gain.setValueAtTime(0.0001, now + 1.4);
      bellGain.gain.linearRampToValueAtTime(0.11, now + 1.45);
      bellGain.gain.exponentialRampToValueAtTime(0.0001, now + 3.1);
      bellOsc.connect(bellGain);
      bellGain.connect(this.ambientGain);
      bellOsc.start(now + 1.4);
      bellOsc.stop(now + 3.2);
    };

    playChord();
    this.ambientTimer = window.setInterval(playChord, 4000);
  }

  private stopAmbientLoop(): void {
    this.ambientRunning = false;
    if (this.ambientTimer !== null) {
      window.clearInterval(this.ambientTimer);
      this.ambientTimer = null;
    }
    if (this.ambientGain && this.ctx) {
      this.ambientGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.2);
    }
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer;
    const len = Math.floor(ctx.sampleRate * 0.12);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  public playSoapSlice(): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Crisp ASMR soap-shave bandpass noise
    const src = ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2400, now);
    filter.frequency.exponentialRampToValueAtTime(1100, now + 0.08);
    filter.Q.value = 1.8;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.045, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.1);
  }

  public playPopBlock(step = 0): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const scale = [392, 440, 523.25, 587.33, 659.25];
    const freq = scale[step % scale.length];

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 0.75, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.15, now + 0.04);

    gain.gain.setValueAtTime(0.055, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  public playPickup(): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.08);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.095);
  }

  public playDrop(): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.08);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.095);
  }

  public playMerge(newLevel: number, combo = 1): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const comboBoost = Math.min(combo - 1, 6);
    const baseFreq = 392 * Math.pow(1.05946, Math.min(newLevel + comboBoost, 16));
    const intervals = [1, 1.25, 1.5, 2];

    intervals.forEach((ratio, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + idx * 0.042;
      osc.type = idx === intervals.length - 1 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(baseFreq * ratio, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.085, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.24);
    });
  }

  public playMeow(level = 1): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    const pitch = Math.max(360, 680 - level * 22);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(pitch * 0.85, now);
    osc.frequency.exponentialRampToValueAtTime(pitch * 1.18, now + 0.08);
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.78, now + 0.22);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1600, now);
    filter.Q.setValueAtTime(2.5, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.055, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  public playMouseSqueak(): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    [1200, 1580].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + i * 0.06;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.35, t + 0.05);
      gain.gain.setValueAtTime(0.06, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.08);
    });
  }

  public playCoin(): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    [987.77, 1318.51].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + i * 0.045;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.06, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.15);
    });
  }

  public playWheelTick(): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(660, now);
    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.035);
  }

  public playFever(): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + idx * 0.06;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, t);
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.34);
    });
  }
}

export const soundEngine = new SoundEngine();
