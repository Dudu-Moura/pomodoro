import { store } from './store';

interface ToneOpts {
  freq: number;
  type?: OscillatorType;
  dur?: number;
  gain?: number;
  attack?: number;
  delay?: number;
  glideTo?: number;
  detune?: number;
  filter?: { type: BiquadFilterType; freq: number; q?: number };
  pan?: number;
}

interface NoiseOpts {
  dur?: number;
  gain?: number;
  delay?: number;
  type?: BiquadFilterType;
  freq?: number;
  q?: number;
  sweepTo?: number;
}

/** Sintetizador leve em Web Audio — nenhum arquivo de áudio externo. */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** barramento separado para a camada de ambiente contínua */
  private ambient: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;

  private ensure(): AudioContext | null {
    if (!store.state.settings.soundOn) return null;
    return this.boot();
  }

  /** Cria o contexto independentemente do estado de `soundOn` (o volume é que zera). */
  private boot(): AudioContext | null {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.ambient = this.ctx.createGain();
      this.ambient.gain.value = 0;
      // compressor no barramento de ambiente: várias camadas contínuas somadas
      // não podem estourar nem brigar com os efeitos pontuais
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -24;
      comp.knee.value = 20;
      comp.ratio.value = 6;
      comp.attack.value = 0.05;
      comp.release.value = 0.4;
      this.ambient.connect(comp);
      comp.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.applyVolumes();
    return this.ctx;
  }

  /** Reaplica os volumes de efeitos e ambiente a partir das configurações. */
  applyVolumes(): void {
    const s = store.state.settings;
    if (this.master) this.master.gain.value = s.soundOn ? s.volume * 0.6 : 0;
    if (this.ambient && this.ctx) {
      const target = s.soundOn && s.ambience ? s.volume * s.ambienceVolume * 0.5 : 0;
      this.ambient.gain.setTargetAtTime(target, this.ctx.currentTime, 0.25);
    }
  }

  /** Contexto e destino do ambiente — usados pelo AmbienceManager. */
  ambientBus(): { ctx: AudioContext; out: GainNode } | null {
    const ctx = this.boot();
    if (!ctx || !this.ambient) return null;
    return { ctx, out: this.ambient };
  }

  /** Buffer de ruído branco reaproveitado por efeitos e ambiente. */
  noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (!this.noiseBuf) {
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    }
    return this.noiseBuf;
  }

  /** Chamar num gesto do usuário para destravar o áudio no navegador. */
  unlock(): void { this.ensure(); }

  get now(): number { return this.ctx?.currentTime ?? 0; }

  tone(o: ToneOpts): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const dur = o.dur ?? 0.25;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.glideTo), t0 + dur);
    if (o.detune) osc.detune.value = o.detune;

    const g = ctx.createGain();
    const peak = Math.max(0.0001, o.gain ?? 0.2);
    const atk = o.attack ?? 0.008;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    let node: AudioNode = osc;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filter.type;
      f.frequency.value = o.filter.freq;
      f.Q.value = o.filter.q ?? 1;
      node.connect(f);
      node = f;
    }
    if (o.pan !== undefined && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = o.pan;
      node.connect(p);
      node = p;
    }
    node.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  noise(o: NoiseOpts = {}): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    this.noiseBuffer(ctx);
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const dur = o.dur ?? 0.3;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;

    const f = ctx.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.frequency.setValueAtTime(o.freq ?? 900, t0);
    if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.sweepTo), t0 + dur);
    f.Q.value = o.q ?? 1;

    const g = ctx.createGain();
    const peak = Math.max(0.0001, o.gain ?? 0.12);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  chord(freqs: number[], opts: Omit<ToneOpts, 'freq'> = {}): void {
    freqs.forEach((f, i) => this.tone({ ...opts, freq: f, delay: (opts.delay ?? 0) + i * 0.045 }));
  }

  /** Drone contínuo curto (usado em sobrecarga / colapso). */
  rumble(dur = 1.4, gain = 0.22): void {
    this.tone({ freq: 90, glideTo: 32, type: 'sawtooth', dur, gain, filter: { type: 'lowpass', freq: 320, q: 4 } });
    this.noise({ dur, gain: gain * 0.5, type: 'lowpass', freq: 500, sweepTo: 90 });
  }
}

export const audio = new AudioEngine();
