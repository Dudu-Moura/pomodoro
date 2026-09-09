import { audio } from './audio';
import { store } from './store';
import type { Phase, ThemeId } from './types';

export interface DroneOpts {
  freq: number;
  type?: OscillatorType;
  gain: number;
  detune?: number;
  pan?: number;
  filter?: { type: BiquadFilterType; freq: number; q?: number };
}

export interface BedOpts {
  gain: number;
  type?: BiquadFilterType;
  freq?: number;
  q?: number;
  pan?: number;
}

/** Controle de uma camada contínua já tocando. */
export interface Layer {
  /** volume alvo, com rampa suave (sem estalos) */
  setGain(v: number): void;
  setFreq(v: number): void;
  setFilter(v: number): void;
  readonly detune: AudioParam | null;
  readonly gainParam: AudioParam;
}

export interface AmbienceKit {
  /** oscilador contínuo */
  drone(o: DroneOpts): Layer;
  /** ruído filtrado contínuo (vento, ventoinha, chiado) */
  bed(o: BedOpts): Layer;
  /** oscilador lento modulando um parâmetro (respiração, batimento, vibrato).
   *  Devolve o parâmetro de taxa, para acelerar a modulação conforme a sessão avança. */
  lfo(target: AudioParam, rate: number, depth: number, center?: number): AudioParam | null;
  /** evento esparso: roda `fn` a cada intervalo aleatório entre min e max segundos */
  every(min: number, max: number, fn: (state: AmbienceState) => void): void;
  /** chamado sempre que o estado do timer muda (a cada segundo enquanto roda) */
  onState(fn: (state: AmbienceState) => void): void;
}

export interface AmbienceState {
  running: boolean;
  progress: number;
  phase: Phase;
}

/** Um tema descreve sua paisagem sonora montando camadas neste kit. */
export type AmbienceSpec = (kit: AmbienceKit) => void;

const RAMP = 0.6;

class AmbienceManager {
  private themeId: ThemeId | null = null;
  private stops: (() => void)[] = [];
  private timers: number[] = [];
  private stateFns: ((s: AmbienceState) => void)[] = [];
  private state: AmbienceState = { running: false, progress: 0, phase: 'focus' };
  private live = false;

  private teardown(): void {
    for (const stop of this.stops) stop();
    for (const id of this.timers) window.clearTimeout(id);
    this.stops = [];
    this.timers = [];
    this.stateFns = [];
    this.live = false;
  }

  /** (Re)monta a paisagem do tema. Silencioso até haver um gesto do usuário. */
  build(themeId: ThemeId, spec: AmbienceSpec): void {
    this.teardown();
    this.themeId = themeId;
    const bus = audio.ambientBus();
    if (!bus) return;
    const { ctx, out } = bus;

    const layer = (node: AudioScheduledSourceNode, gain: GainNode, target: number,
                   freqParam: AudioParam | null, filter: BiquadFilterNode | null,
                   detune: AudioParam | null): Layer => {
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.setTargetAtTime(target, ctx.currentTime, RAMP);
      node.start();
      this.stops.push(() => {
        gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.2);
        window.setTimeout(() => { try { node.stop(); } catch { /* já parado */ } }, 700);
      });
      return {
        setGain: (v) => gain.gain.setTargetAtTime(Math.max(0.0001, v), ctx.currentTime, RAMP),
        setFreq: (v) => freqParam?.setTargetAtTime(Math.max(1, v), ctx.currentTime, RAMP),
        setFilter: (v) => filter?.frequency.setTargetAtTime(Math.max(20, v), ctx.currentTime, RAMP),
        detune,
        gainParam: gain.gain,
      };
    };

    const chain = (source: AudioNode, o: { filter?: DroneOpts['filter']; pan?: number }): { gain: GainNode; filter: BiquadFilterNode | null } => {
      let node = source;
      let filter: BiquadFilterNode | null = null;
      if (o.filter) {
        filter = ctx.createBiquadFilter();
        filter.type = o.filter.type;
        filter.frequency.value = o.filter.freq;
        filter.Q.value = o.filter.q ?? 1;
        node.connect(filter);
        node = filter;
      }
      if (o.pan !== undefined && ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = o.pan;
        node.connect(p);
        node = p;
      }
      const gain = ctx.createGain();
      node.connect(gain);
      gain.connect(out);
      return { gain, filter };
    };

    const kit: AmbienceKit = {
      drone: (o) => {
        const osc = ctx.createOscillator();
        osc.type = o.type ?? 'sine';
        osc.frequency.value = o.freq;
        if (o.detune) osc.detune.value = o.detune;
        const { gain, filter } = chain(osc, o);
        return layer(osc, gain, o.gain, osc.frequency, filter, osc.detune);
      },
      bed: (o) => {
        const src = ctx.createBufferSource();
        src.buffer = audio.noiseBuffer(ctx);
        src.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = o.type ?? 'lowpass';
        f.frequency.value = o.freq ?? 800;
        f.Q.value = o.q ?? 1;
        src.connect(f);
        let node: AudioNode = f;
        if (o.pan !== undefined && ctx.createStereoPanner) {
          const p = ctx.createStereoPanner();
          p.pan.value = o.pan;
          node.connect(p);
          node = p;
        }
        const gain = ctx.createGain();
        node.connect(gain);
        gain.connect(out);
        return layer(src, gain, o.gain, null, f, null);
      },
      lfo: (target, rate, depth, center) => {
        const osc = ctx.createOscillator();
        osc.frequency.value = rate;
        const amp = ctx.createGain();
        amp.gain.value = depth;
        osc.connect(amp);
        amp.connect(target);
        if (center !== undefined) target.setValueAtTime(center, ctx.currentTime);
        osc.start();
        this.stops.push(() => { try { osc.stop(); } catch { /* já parado */ } });
        return osc.frequency;
      },
      every: (min, max, fn) => {
        const schedule = (): void => {
          const wait = (min + Math.random() * (max - min)) * 1000;
          const id = window.setTimeout(() => {
            if (store.state.settings.soundOn && store.state.settings.ambience) fn(this.state);
            schedule();
          }, wait);
          this.timers.push(id);
        };
        schedule();
      },
      onState: (fn) => {
        this.stateFns.push(fn);
        fn(this.state);
      },
    };

    spec(kit);
    this.live = true;
    this.push();
  }

  private push(): void {
    for (const fn of this.stateFns) fn(this.state);
  }

  /** Alimentado pelos eventos do timer. */
  update(running: boolean, progress: number, phase: Phase): void {
    this.state = { running, progress, phase };
    if (this.live) this.push();
  }

  get currentTheme(): ThemeId | null { return this.themeId; }
  get isLive(): boolean { return this.live; }

  stop(): void { this.teardown(); }
}

export const ambience = new AmbienceManager();
