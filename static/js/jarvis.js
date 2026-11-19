/**
 * J.A.R.V.I.S. Tactical Holographic Voice Interface for Antigravity (agy-web)
 * Real-time Speech-to-Text, Audio-Reactive Arc Reactor Canvas, and Text-to-Speech
 */

class JarvisVoiceOverlay {
  constructor(app) {
    this.app = app;
    this.isOpen = false;
    this.isListening = false;
    this.isSpeaking = false;
    this.isThinking = false;
    this.continuousMode = localStorage.getItem('jarvis_continuous') !== 'false';
    this.autoSpeakChat = localStorage.getItem('jarvis_auto_speak_chat') !== 'false';
    this.audioUnlocked = false;

    // Speech Recognition & Synthesis
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.hasRecognition = !!SpeechRec;
    this.recognition = SpeechRec ? new SpeechRec() : null;
    this.speechSynth = window.speechSynthesis;
    this.selectedVoice = null;
    this.voicePitch = parseFloat(localStorage.getItem('jarvis_pitch')) || 0.94;
    this.voiceRate = parseFloat(localStorage.getItem('jarvis_rate')) || 1.05;
    this.ttsEngine = localStorage.getItem('jarvis_tts_engine') || 'auto'; // 'auto' | 'cloud' | 'web_speech'
    this.recognitionLanguage = localStorage.getItem('jarvis_rec_lang') || 'ro-RO';
    this.customGreeting = localStorage.getItem('jarvis_greeting') || '';
    this.availableVoices = [];
    this.audioPlayer = null; // For Cloud Natural TTS playback

    // Web Audio API Visualizer & Sound FX
    this.audioCtx = null;
    this.analyser = null;
    this.micStream = null;
    this.freqData = null;
    this.timeData = null;
    this.audioSource = null;
    this.currentAudioLevel = 0;

    // Animation & Canvas
    this.canvas = null;
    this.ctx = null;
    this.animFrameId = null;
    this.rotationAngle = 0;
    this.pulsePhase = 0;
    this.state = 'idle'; // 'idle' | 'listening' | 'thinking' | 'speaking'

    // Dialogue State
    this.silenceTimer = null;
    this.currentTranscript = '';
    this.activeSpeechChunks = [];
    this.currentChunkIndex = 0;

    // DOM references
    this.dom = {};

    this.init();
  }

  init() {
    this.cacheDom();
    this.initCanvas();
    this.initSpeechRecognition();
    this.initSpeechSynthesis();
    this.initEventListeners();
    this.initKeyboardShortcuts();
    this.initAudioUnlockListeners();
    this.updateVoiceToggleUI();
  }

  initAudioUnlockListeners() {
    const unlock = () => {
      this.unlockAudio();
    };
    window.addEventListener('pointerdown', unlock, { once: true, passive: true });
    window.addEventListener('keydown', unlock, { once: true, passive: true });
    window.addEventListener('touchstart', unlock, { once: true, passive: true });
  }

  unlockAudio() {
    this.ensureAudioContext();
    if (this.audioUnlocked) return;
    this.audioUnlocked = true;

    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      try { this.audioCtx.resume(); } catch (e) {}
    }

    if (this.speechSynth) {
      try {
        if (this.speechSynth.paused) {
          this.speechSynth.resume();
        }
        const silent = new SpeechSynthesisUtterance(' ');
        silent.volume = 0.01;
        silent.rate = 10;
        this.speechSynth.speak(silent);
      } catch (e) {}
    }

    try {
      const silentAudio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
      silentAudio.volume = 0.01;
      silentAudio.play().catch(() => {});
    } catch (e) {}
  }

  cacheDom() {
    this.dom.overlay = document.getElementById('jarvis-overlay');
    this.dom.canvas = document.getElementById('jarvis-core-canvas');
    this.dom.statusPill = document.getElementById('jarvis-status-pill');
    this.dom.statusText = document.getElementById('jarvis-status-text');
    this.dom.statusDot = document.getElementById('jarvis-status-dot');
    this.dom.coreTrigger = document.getElementById('jarvis-core-trigger');
    this.dom.coreIcon = document.getElementById('jarvis-core-icon');
    this.dom.coreLabel = document.getElementById('jarvis-core-label');
    this.dom.dialogueCard = document.getElementById('jarvis-dialogue-card');
    this.dom.streamContainer = document.getElementById('jarvis-stream-container');
    this.dom.textInput = document.getElementById('jarvis-text-input');
    this.dom.btnSend = document.getElementById('jarvis-btn-send');
    this.dom.btnMicMain = document.getElementById('jarvis-btn-mic-main');
    this.dom.btnStopSpeech = document.getElementById('jarvis-btn-stop-speech');
    this.dom.btnContinuous = document.getElementById('jarvis-btn-continuous');
    this.dom.btnSettings = document.getElementById('jarvis-btn-settings');
    this.dom.settingsCard = document.getElementById('jarvis-settings-card');
    this.dom.engineSelect = document.getElementById('jarvis-engine-select');
    this.dom.voiceSelect = document.getElementById('jarvis-voice-select');
    this.dom.langSelect = document.getElementById('jarvis-lang-select');
    this.dom.pitchSlider = document.getElementById('jarvis-pitch-slider');
    this.dom.pitchVal = document.getElementById('jarvis-pitch-val');
    this.dom.rateSlider = document.getElementById('jarvis-rate-slider');
    this.dom.rateVal = document.getElementById('jarvis-rate-val');
    this.dom.btnClose = document.getElementById('jarvis-btn-close');
    this.dom.btnHeaderJarvis = document.getElementById('btn-header-jarvis');
    this.dom.btnMicPrompt = document.getElementById('btn-mic-prompt');
    this.dom.btnVoiceToggle = document.getElementById('btn-voice-toggle');
    this.dom.vuContainer = document.getElementById('jarvis-vu-bars');
  }

  initCanvas() {
    this.canvas = this.dom.canvas;
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  resizeCanvas() {
    if (!this.canvas) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const size = Math.min(rect.width, rect.height) || 420;
    this.canvas.width = size * dpr;
    this.canvas.height = size * dpr;
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
    if (this.ctx) {
      this.ctx.scale(dpr, dpr);
    }
  }

  // Web Audio Context & Sound Synthesis
  ensureAudioContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  async setupMicrophoneAnalyser() {
    this.ensureAudioContext();
    if (!this.audioCtx) return;

    if (!this.analyser) {
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 128;
      this.analyser.smoothingTimeConstant = 0.8;
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
      this.timeData = new Uint8Array(this.analyser.frequencyBinCount);
    }

    if (!this.micStream) {
      try {
        this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        this.audioSource = this.audioCtx.createMediaStreamSource(this.micStream);
        this.audioSource.connect(this.analyser);
      } catch (err) {
        console.warn('[J.A.R.V.I.S.] Microphone stream access denied/unavailable for visualizer:', err);
      }
    }
  }

  // Synthesizes authentic Marvel HUD sound effects via Web Audio API oscillators
  playSfx(type) {
    try {
      this.ensureAudioContext();
      if (!this.audioCtx) return;
      const now = this.audioCtx.currentTime;

      if (type === 'call_connect') {
        // High-tech communicator connection tri-tone
        [440, 659.25, 880].forEach((freq, idx) => {
          const osc = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.08);
          gain.gain.setValueAtTime(0.12, now + idx * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.18);
          osc.connect(gain);
          gain.connect(this.audioCtx.destination);
          osc.start(now + idx * 0.08);
          osc.stop(now + idx * 0.08 + 0.18);
        });
      } else if (type === 'powerup') {
        // High-tech ascending chirp
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.18);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.22);
      } else if (type === 'listen') {
        // Double sonar ping
        [0, 0.08].forEach((delay, idx) => {
          const osc = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(idx === 0 ? 980 : 1320, now + delay);
          gain.gain.setValueAtTime(0.12, now + delay);
          gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.09);
          osc.connect(gain);
          gain.connect(this.audioCtx.destination);
          osc.start(now + delay);
          osc.stop(now + delay + 0.09);
        });
      } else if (type === 'transmit') {
        // Command confirmed chirp
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(700, now);
        osc.frequency.linearRampToValueAtTime(1400, now + 0.12);
        gain.gain.setValueAtTime(0.14, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'chime') {
        // Harmonic arrival chime
        [523.25, 659.25, 783.99].forEach((freq, idx) => {
          const osc = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.05);
          gain.gain.setValueAtTime(0.08, now + idx * 0.05);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.25);
          osc.connect(gain);
          gain.connect(this.audioCtx.destination);
          osc.start(now + idx * 0.05);
          osc.stop(now + idx * 0.05 + 0.25);
        });
      } else if (type === 'dismiss') {
        // Descending powerdown
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(660, now);
        osc.frequency.exponentialRampToValueAtTime(220, now + 0.2);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.22);
      }
    } catch (e) {
      // Audio autoplay policy or silent mode fallback
    }
  }

  // Speech Recognition (Speech-to-Text)
  initSpeechRecognition() {
    if (!this.recognition) return;

    this.recognitionLanguage = localStorage.getItem('jarvis_rec_lang') || 'ro-RO';
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;
    this.recognition.lang = this.recognitionLanguage;

    this.recognition.onstart = () => {
      this.isListening = true;
      this.setState('listening');
    };

    this.recognition.onresult = (event) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }

      const activeText = (final || interim).trim();
      if (activeText) {
        this.currentTranscript = activeText;
        this.renderUserStream(activeText, !final);

        // Reset silence detection timer
        clearTimeout(this.silenceTimer);
        this.silenceTimer = setTimeout(() => {
          if (this.currentTranscript && this.isListening) {
            this.transmitDirective(this.currentTranscript);
          }
        }, 1800);
      }
    };

    this.recognition.onerror = (event) => {
      console.warn('[J.A.R.V.I.S.] Speech recognition notice:', event.error);
      if (event.error === 'not-allowed') {
        this.appendStreamSystem('Accesul la microfon a fost refuzat. Vă rugăm să permiteți accesul la microfon sau să scrieți directiva mai jos.');
        this.stopListening();
      }
    };

    this.recognition.onend = () => {
      if (this.isListening && this.isOpen && !this.isSpeaking && !this.isThinking) {
        // Automatically restart speech recognition in active session
        try {
          this.recognition.start();
        } catch (e) {}
      } else {
        this.isListening = false;
        if (this.state === 'listening') {
          this.setState('idle');
        }
      }
    };
  }

  startListening() {
    if (!this.hasRecognition) {
      this.appendStreamSystem('Recunoașterea vocală nu este suportată în acest browser. Puteți scrie comanda mai jos pentru a interacționa cu J.A.R.V.I.S.');
      return;
    }
    if (this.isSpeaking) {
      this.stopSpeaking();
    }
    this.isListening = true;
    this.currentTranscript = '';
    clearTimeout(this.silenceTimer);
    try {
      this.recognition.start();
    } catch (e) {
      // Already running
    }
    this.setState('listening');
    this.playSfx('listen');
  }

  stopListening() {
    this.isListening = false;
    clearTimeout(this.silenceTimer);
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {}
    }
    if (this.state === 'listening') {
      this.setState('idle');
    }
  }

  toggleListening() {
    if (this.isListening) {
      if (this.currentTranscript) {
        this.transmitDirective(this.currentTranscript);
      } else {
        this.stopListening();
      }
    } else {
      this.startListening();
    }
  }

  // Speech Synthesis (Text-to-Speech)
  initSpeechSynthesis() {
    if (!this.speechSynth) return;

    const loadVoices = () => {
      this.availableVoices = this.speechSynth.getVoices() || [];
      this.populateVoiceSelect();
      this.selectedVoice = this.pickBestJarvisVoice();
    };

    loadVoices();
    if (this.speechSynth.onvoiceschanged !== undefined) {
      this.speechSynth.onvoiceschanged = loadVoices;
    }
  }

  pickBestJarvisVoice() {
    if (!this.availableVoices.length) return null;

    // If Romanian recognition language is active, check for high quality Romanian voices
    if (this.recognitionLanguage && this.recognitionLanguage.startsWith('ro')) {
      const roVoice = this.availableVoices.find(v =>
        (v.lang || '').toLowerCase().startsWith('ro') ||
        (v.name || '').toLowerCase().includes('romanian') ||
        (v.name || '').toLowerCase().includes('română') ||
        (v.name || '').toLowerCase().includes('romana')
      );
      if (roVoice) return roVoice;
      return null;
    }

    // Jarvis British sophisticated male voice priorities
    const priorities = [
      'Google UK English Male',
      'Daniel',
      'George',
      'Arthur',
      'Oliver',
      'Ryan',
      'en-GB',
      'British English',
      'English United Kingdom'
    ];

    for (const name of priorities) {
      const match = this.availableVoices.find(v =>
        v.name.includes(name) || (v.lang.includes('en-GB') && v.name.toLowerCase().includes('male'))
      );
      if (match) return match;
    }

    // Fallback: any en-GB voice
    const gb = this.availableVoices.find(v => v.lang.startsWith('en-GB'));
    if (gb) return gb;

    // Fallback: any English male voice
    const enMale = this.availableVoices.find(v =>
      v.lang.startsWith('en') && (v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('guy'))
    );
    if (enMale) return enMale;

    // Fallback: any English voice
    const en = this.availableVoices.find(v => v.lang.startsWith('en'));
    if (en) return en;

    return this.availableVoices[0];
  }

  populateVoiceSelect() {
    if (!this.dom.voiceSelect) return;
    this.dom.voiceSelect.innerHTML = '';
    this.availableVoices.forEach((voice, idx) => {
      const opt = document.createElement('option');
      opt.value = idx;
      opt.textContent = `${voice.name} (${voice.lang})${voice.default ? ' [Default]' : ''}`;
      if (this.selectedVoice && this.selectedVoice.name === voice.name) {
        opt.selected = true;
      }
      this.dom.voiceSelect.appendChild(opt);
    });
  }

  // Pre-cleans markdown text to sound intelligent, clean, and conversational
  cleanTextForSpeech(markdown) {
    if (!markdown) return '';
    let text = markdown;

    // Replace code blocks with concise spoken description
    text = text.replace(/```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```/g, (match, code) => {
      const lines = code.trim().split('\n');
      return lines.length > 3
        ? ' Rezultatul comenzii solicitate este afișat pe ecran. '
        : ` Comandă: ${code.replace(/\n/g, '; ')}. `;
    });

    // Strip inline backticks, bold, italic, strikethrough
    text = text.replace(/`([^`]+)`/g, '$1');
    text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
    text = text.replace(/\*([^*]+)\*/g, '$1');
    text = text.replace(/__([^_]+)__/g, '$1');
    text = text.replace(/_([^_]+)_/g, '$1');

    // Strip markdown links [label](url) -> label
    text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

    // Strip raw URLs
    text = text.replace(/https?:\/\/\S+/g, '');

    // Strip headers #, ##, etc.
    text = text.replace(/^#{1,6}\s+/gm, '');

    // Strip markdown tables (| ... |)
    text = text.replace(/\|(.+)\|/g, '');

    // Strip bullet points and list dashes
    text = text.replace(/^\s*[-*+]\s+/gm, '');
    text = text.replace(/^\s*\d+\.\s+/gm, '');

    // Normalize whitespace
    text = text.replace(/\s+/g, ' ').trim();

    // If conversational response is exceptionally long (> 550 chars), speak the main summary and advise checking screen
    if (text.length > 550) {
      const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
      let summary = '';
      for (const s of sentences) {
        if ((summary + ' ' + s).length > 450) break;
        summary += (summary ? ' ' : '') + s.trim();
      }
      if (!summary) summary = text.slice(0, 400);
      const isRo = this.recognitionLanguage && this.recognitionLanguage.startsWith('ro');
      const tail = isRo
        ? ' Detaliile complete sunt afișate pe ecran.'
        : ' Full details are displayed on screen.';
      text = summary.trim() + tail;
    }

    return text;
  }

  // Divides text into speech chunks <= 160 characters (safely below Google TTS 200 char hard limit)
  splitTextIntoSpeechChunks(text, maxLen = 160) {
    if (!text) return [];
    const rawSentences = text.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g) || [text];
    const chunks = [];

    for (let s of rawSentences) {
      s = s.trim();
      if (!s) continue;
      if (s.length <= maxLen) {
        chunks.push(s);
        continue;
      }
      const subClauses = s.match(/[^,;:—]+[,;:—]+|[^,;:—]+$/g) || [s];
      let current = '';
      for (const c of subClauses) {
        const part = c.trim();
        if (!part) continue;
        if (part.length > maxLen) {
          const words = part.split(/\s+/);
          for (const w of words) {
            if ((current + ' ' + w).trim().length > maxLen) {
              if (current.trim()) chunks.push(current.trim());
              current = w;
            } else {
              current = current ? (current + ' ' + w) : w;
            }
          }
        } else if ((current + ' ' + part).trim().length > maxLen) {
          if (current.trim()) chunks.push(current.trim());
          current = part;
        } else {
          current = current ? (current + ' ' + part) : part;
        }
      }
      if (current.trim()) chunks.push(current.trim());
    }
    return chunks;
  }

  speak(text) {
    if (!text) return;

    this.unlockAudio();
    this.stopSpeaking();
    this.stopListening();
    this.isSpeaking = true;
    this.setState('speaking');
    this.updateVoiceToggleUI();
    this.playSfx('chime');

    const clean = this.cleanTextForSpeech(text);
    if (!clean) {
      this.setState('idle');
      this.updateVoiceToggleUI();
      return;
    }

    this.activeSpeechChunks = this.splitTextIntoSpeechChunks(clean, 160);
    this.currentChunkIndex = 0;

    if (this.activeSpeechChunks.length === 0) {
      this.onSpeechComplete();
      return;
    }

    this.speakNextChunk();
  }

  shouldUseCloudTts() {
    if (this.ttsEngine === 'cloud') return true;
    if (this.ttsEngine === 'web_speech') return false;

    // 'auto' mode: prefer Cloud Natural TTS for authentic pronunciation
    return true;
  }

  speakNextChunk() {
    if (!this.isSpeaking || this.currentChunkIndex >= this.activeSpeechChunks.length) {
      this.onSpeechComplete();
      return;
    }

    const chunk = this.activeSpeechChunks[this.currentChunkIndex];
    this.currentChunkIndex++;

    const useCloud = this.shouldUseCloudTts();

    if (useCloud) {
      this.speakChunkCloud(chunk);
    } else {
      this.speakChunkWebSpeech(chunk);
    }
  }

  speakChunkCloud(chunk) {
    try {
      const isRo = this.recognitionLanguage && this.recognitionLanguage.startsWith('ro');
      const lang = isRo ? 'ro' : 'en';
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=${lang}&client=tw-ob`;

      if (this.audioPlayer) {
        try {
          this.audioPlayer.pause();
          this.audioPlayer.src = '';
        } catch (e) {}
        this.audioPlayer = null;
      }

      const audio = new Audio();
      audio.referrerPolicy = 'no-referrer';
      this.audioPlayer = audio;
      audio.playbackRate = Math.max(0.7, Math.min(1.5, this.voiceRate || 1.0));

      let pulseTimer = null;
      let hasEnded = false;

      const cleanup = () => {
        if (pulseTimer) {
          clearInterval(pulseTimer);
          pulseTimer = null;
        }
      };

      const finishAndNext = () => {
        if (hasEnded) return;
        hasEnded = true;
        cleanup();
        this.speakNextChunk();
      };

      const fallbackToWebSpeech = () => {
        if (hasEnded) return;
        hasEnded = true;
        cleanup();
        console.warn('[J.A.R.V.I.S.] Cloud TTS failed, falling back to Web Speech API for chunk');
        this.speakChunkWebSpeech(chunk);
      };

      audio.onplay = () => {
        pulseTimer = setInterval(() => {
          if (this.isSpeaking) {
            this.currentAudioLevel = 0.55 + Math.random() * 0.4;
          }
        }, 90);
      };

      audio.onended = () => {
        finishAndNext();
      };

      audio.onerror = (e) => {
        console.warn('[J.A.R.V.I.S.] Cloud TTS audio error:', e);
        fallbackToWebSpeech();
      };

      // Set src after referrerpolicy and event listeners
      audio.src = url;

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.warn('[J.A.R.V.I.S.] Audio play was prevented (autoplay policy):', err);
          fallbackToWebSpeech();
        });
      }
    } catch (err) {
      console.warn('[J.A.R.V.I.S.] Cloud TTS exception, falling back to Web Speech API:', err);
      this.speakChunkWebSpeech(chunk);
    }
  }

  speakChunkWebSpeech(chunk) {
    if (!this.speechSynth) {
      this.speakNextChunk();
      return;
    }

    try {
      if (this.speechSynth.paused) {
        this.speechSynth.resume();
      }
    } catch (e) {}

    const isRo = this.recognitionLanguage && this.recognitionLanguage.startsWith('ro');
    const targetLang = isRo ? 'ro-RO' : (this.recognitionLanguage || 'en-US');

    const utter = new SpeechSynthesisUtterance(chunk);
    utter.lang = targetLang;

    // Pick matching voice
    if (this.selectedVoice) {
      const vLang = (this.selectedVoice.lang || '').toLowerCase();
      const matches = isRo ? vLang.startsWith('ro') : vLang.startsWith('en');
      if (matches) {
        utter.voice = this.selectedVoice;
      }
    } else if (isRo) {
      const roVoice = this.availableVoices.find(v => (v.lang || '').toLowerCase().startsWith('ro'));
      if (roVoice) {
        utter.voice = roVoice;
      }
    }

    utter.pitch = this.voicePitch || 1.0;
    utter.rate = this.voiceRate || 1.0;

    let hasEnded = false;
    const endChunk = () => {
      if (hasEnded) return;
      hasEnded = true;
      this.speakNextChunk();
    };

    utter.onstart = () => {
      this.currentAudioLevel = 0.65 + Math.random() * 0.35;
    };

    utter.onend = () => {
      endChunk();
    };

    utter.onerror = (e) => {
      console.warn('[J.A.R.V.I.S.] Utterance error:', e);
      endChunk();
    };

    setTimeout(() => {
      if (!this.isSpeaking) return;
      try {
        if (this.speechSynth.paused) {
          this.speechSynth.resume();
        }
        this.speechSynth.speak(utter);
      } catch (err) {
        console.warn('[J.A.R.V.I.S.] Speech synthesis speak failed:', err);
        endChunk();
      }
    }, 40);
  }

  stopSpeaking() {
    this.isSpeaking = false;
    this.activeSpeechChunks = [];
    this.currentChunkIndex = 0;
    if (this.audioPlayer) {
      try {
        this.audioPlayer.pause();
        this.audioPlayer.src = '';
      } catch (e) {}
      this.audioPlayer = null;
    }
    if (this.speechSynth) {
      try {
        if (this.speechSynth.speaking || this.speechSynth.pending) {
          this.speechSynth.cancel();
        }
      } catch (e) {}
    }
    if (this.state === 'speaking') {
      this.setState('idle');
    }
    this.updateVoiceToggleUI();
    if (this.app) {
      this.app.onJarvisSpeechEnded?.();
    }
  }

  onSpeechComplete() {
    this.isSpeaking = false;
    this.setState('idle');
    this.updateVoiceToggleUI();

    if (this.app) {
      this.app.onJarvisSpeechEnded?.();
    }

    // Continuous dialogue mode: automatically resume listening for follow-up!
    if (this.continuousMode && this.isOpen) {
      setTimeout(() => {
        if (this.isOpen && !this.isSpeaking && !this.isThinking) {
          this.startListening();
        }
      }, 700);
    }
  }

  // Directive Transmission & Execution
  transmitDirective(text) {
    const prompt = (text || '').trim();
    if (!prompt) return;

    // Direct conversational call response for "Salute Chef"
    const normalized = prompt.toLowerCase().replace(/[.,!?;:']/g, '').trim();
    if (['salute chef', 'salut chef', 'salute', 'salutare chef', 'salut sefu', 'salut seful', 'salut jarvis', 'buna chef', 'buna jarvis'].includes(normalized)) {
      this.stopListening();
      this.renderUserStream(prompt, false);
      const reply = "Salutare Chef! Toate sistemele sunt online. Cu ce vă pot fi de folos?";
      this.renderAiStream(reply, false);
      this.speak(reply);
      return;
    }

    this.stopListening();
    this.isThinking = true;
    this.setState('thinking');
    this.playSfx('transmit');

    this.renderUserStream(prompt, false);
    this.renderAiStream('Procesez directiva, Șefu\'...', true);

    // Forward to Antigravity App chat workflow
    if (this.app) {
      if (this.app.dom && this.app.dom.promptInput) {
        this.app.dom.promptInput.value = prompt;
      }
      this.app.sendMessage();
    }
  }

  // Stream Event Hooks from app.js
  onTool(data) {
    if (!this.isOpen) return;
    const toolName = data.tool_name || 'Comandă';
    const summary = data.summary || '';
    const state = data.state || 'ACTIVE';
    if (state === 'ACTIVE') {
      this.appendStreamTool(`⚡ [EXECUTARE] ${toolName} ${summary ? '› ' + summary : ''}`);
    } else if (state === 'DONE') {
      const dur = data.duration_seconds ? ` (${data.duration_seconds.toFixed(2)}s)` : '';
      this.appendStreamTool(`✔ [FINALIZAT] ${toolName}${dur}`);
    }
  }

  onResult(responseText) {
    if (!responseText) return;
    this.isThinking = false;
    if (this.isOpen) {
      this.renderAiStream(responseText, false);
      this.speak(responseText);
    } else if (this.autoSpeakChat) {
      this.speak(responseText);
    }
  }

  onError(errMessage) {
    if (!this.isOpen) return;
    this.isThinking = false;
    const msg = `A intervenit o eroare: ${errMessage}`;
    this.renderAiStream(msg, false);
    this.speak(msg);
  }

  // State Management & Visual Updates
  setState(newState) {
    this.state = newState;
    if (!this.dom.overlay) return;

    this.dom.overlay.classList.remove('idle', 'listening', 'thinking', 'speaking');
    this.dom.overlay.classList.add(newState);

    if (this.dom.btnMicMain) {
      this.dom.btnMicMain.classList.toggle('recording', newState === 'listening');
    }

    if (this.dom.statusText && this.dom.coreLabel) {
      switch (newState) {
        case 'listening':
          this.dom.statusText.textContent = 'ASCULTARE DIRECTIVĂ // MICROFON ACTIV';
          this.dom.coreLabel.textContent = 'ASCULTARE';
          this.dom.coreIcon.textContent = '🎙️';
          break;
        case 'thinking':
          this.dom.statusText.textContent = 'PROCESARE DIRECTIVĂ...';
          this.dom.coreLabel.textContent = 'ANALIZĂ';
          this.dom.coreIcon.textContent = '⚡';
          break;
        case 'speaking':
          this.dom.statusText.textContent = 'J.A.R.V.I.S. RĂSPUNDE // AUDIO ACTIV';
          this.dom.coreLabel.textContent = 'VORBIRE';
          this.dom.coreIcon.textContent = '🔊';
          break;
        case 'idle':
        default:
          this.dom.statusText.textContent = 'STANDBY // GATA DE RECEPȚIE';
          this.dom.coreLabel.textContent = 'ATINGE PT. VORBIRE';
          this.dom.coreIcon.textContent = '✦';
          break;
      }
    }

    if (this.dom.btnStopSpeech) {
      this.dom.btnStopSpeech.style.display = newState === 'speaking' ? 'inline-flex' : 'none';
    }
  }

  // Dialogue Card Rendering
  renderUserStream(text, isInterim) {
    let row = document.getElementById('jarvis-stream-current-user');
    if (!row) {
      row = document.createElement('div');
      row.id = 'jarvis-stream-current-user';
      row.className = 'jarvis-stream-row jarvis-stream-user';
      row.innerHTML = `<span class="jarvis-stream-prefix">TU &gt;</span><span class="jarvis-stream-body"></span>`;
      this.dom.streamContainer.appendChild(row);
    }
    const body = row.querySelector('.jarvis-stream-body');
    if (body) {
      body.textContent = `"${text}"${isInterim ? '...' : ''}`;
    }
    this.scrollDialogueToBottom();
  }

  renderAiStream(text, isThinking) {
    let row = document.getElementById('jarvis-stream-current-ai');
    if (!row) {
      row = document.createElement('div');
      row.id = 'jarvis-stream-current-ai';
      row.className = 'jarvis-stream-row jarvis-stream-ai';
      row.innerHTML = `<span class="jarvis-stream-prefix">J.A.R.V.I.S. &gt;</span><span class="jarvis-stream-body"></span>`;
      this.dom.streamContainer.appendChild(row);
    }
    const body = row.querySelector('.jarvis-stream-body');
    if (body) {
      body.textContent = text;
      body.style.fontStyle = isThinking ? 'italic' : 'normal';
      body.style.color = isThinking ? '#8ab4f8' : '#e0f7ff';
    }
    this.scrollDialogueToBottom();
  }

  appendStreamTool(toolText) {
    const el = document.createElement('div');
    el.className = 'jarvis-stream-tool';
    el.textContent = toolText;
    this.dom.streamContainer.appendChild(el);
    this.scrollDialogueToBottom();
  }

  appendStreamSystem(sysText) {
    const el = document.createElement('div');
    el.className = 'jarvis-stream-row';
    el.style.color = '#f87171';
    el.style.fontSize = '12.5px';
    el.style.fontFamily = 'var(--jarvis-font-tech)';
    el.textContent = `[SYSTEM] ${sysText}`;
    this.dom.streamContainer.appendChild(el);
    this.scrollDialogueToBottom();
  }

  scrollDialogueToBottom() {
    if (this.dom.dialogueCard) {
      this.dom.dialogueCard.scrollTop = this.dom.dialogueCard.scrollHeight;
    }
  }

  // Arc Reactor Canvas 60fps Holographic Animation Loop
  startAnimationLoop() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);

    const render = () => {
      this.drawArcReactor();
      this.animFrameId = requestAnimationFrame(render);
    };
    this.animFrameId = requestAnimationFrame(render);
  }

  stopAnimationLoop() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  drawArcReactor() {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);
    const cx = width / 2;
    const cy = height / 2;
    const baseR = Math.min(width, height) * 0.36;

    ctx.clearRect(0, 0, width, height);

    // Audio Analysis reading
    let audioLevel = 0;
    if (this.analyser && this.isListening) {
      this.analyser.getByteFrequencyData(this.freqData);
      this.analyser.getByteTimeDomainData(this.timeData);
      let sum = 0;
      for (let i = 0; i < this.freqData.length; i++) {
        sum += this.freqData[i];
      }
      audioLevel = sum / (this.freqData.length * 255);
      this.currentAudioLevel = audioLevel;
    } else if (this.isSpeaking) {
      // Harmonic voice pulsation
      this.currentAudioLevel = 0.35 + 0.35 * Math.sin(Date.now() / 80) * Math.cos(Date.now() / 150);
      audioLevel = this.currentAudioLevel;
    } else if (this.isThinking) {
      this.currentAudioLevel = 0.4 + 0.25 * Math.sin(Date.now() / 120);
      audioLevel = this.currentAudioLevel;
    } else {
      this.currentAudioLevel = 0.05 + 0.05 * Math.sin(Date.now() / 600);
      audioLevel = this.currentAudioLevel;
    }

    // Dynamic Colors based on State
    let primaryColor = '#00f0ff';
    let secondaryColor = '#0077ff';
    let glowColor = 'rgba(0, 240, 255, 0.45)';

    if (this.state === 'thinking') {
      primaryColor = '#ffaa00';
      secondaryColor = '#ffd700';
      glowColor = 'rgba(255, 170, 0, 0.45)';
      this.rotationAngle += 0.045; // Faster rotation when analyzing
    } else if (this.state === 'speaking') {
      primaryColor = '#00ffa3';
      secondaryColor = '#00f0ff';
      glowColor = 'rgba(0, 255, 163, 0.45)';
      this.rotationAngle += 0.015;
    } else if (this.state === 'listening') {
      primaryColor = '#00f0ff';
      secondaryColor = '#38bdf8';
      glowColor = 'rgba(0, 240, 255, 0.55)';
      this.rotationAngle += 0.012;
    } else {
      this.rotationAngle += 0.005;
    }

    this.pulsePhase += 0.05;

    // 1. Radial Background Ambient Glow
    const bgGlow = ctx.createRadialGradient(cx, cy, baseR * 0.2, cx, cy, baseR * 1.3);
    bgGlow.addColorStop(0, glowColor);
    bgGlow.addColorStop(0.7, 'rgba(0, 0, 0, 0.05)');
    bgGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = bgGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, baseR * 1.3, 0, Math.PI * 2);
    ctx.fill();

    // 2. Segmented Compass Radar Ring with Ticks
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.rotationAngle);

    const numTicks = 60;
    for (let i = 0; i < numTicks; i++) {
      const angle = (i * Math.PI * 2) / numTicks;
      const isMajor = i % 5 === 0;
      const tickInner = baseR * 0.96;
      const tickOuter = isMajor ? baseR * 1.05 : baseR * 1.01;

      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * tickInner, Math.sin(angle) * tickInner);
      ctx.lineTo(Math.cos(angle) * tickOuter, Math.sin(angle) * tickOuter);
      ctx.strokeStyle = isMajor ? primaryColor : 'rgba(0, 240, 255, 0.25)';
      ctx.lineWidth = isMajor ? 2 : 1;
      ctx.stroke();
    }
    ctx.restore();

    // 3. Audio-Reactive Radial Equalizer Bars
    const numBars = 48;
    for (let i = 0; i < numBars; i++) {
      const angle = (i * Math.PI * 2) / numBars;
      let barHeight = 6;

      if (this.freqData && (this.isListening || this.isSpeaking)) {
        const bin = Math.floor((i / numBars) * (this.freqData.length / 2));
        const val = this.freqData[bin] || 0;
        barHeight = 4 + (val / 255) * baseR * 0.45;
      } else {
        // Procedural breathing wave
        barHeight = 4 + Math.sin(this.pulsePhase + i * 0.3) * (audioLevel * baseR * 0.4);
      }

      const rInner = baseR * 0.85;
      const rOuter = rInner + barHeight;

      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * rInner, cy + Math.sin(angle) * rInner);
      ctx.lineTo(cx + Math.cos(angle) * rOuter, cy + Math.sin(angle) * rOuter);
      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.shadowColor = primaryColor;
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // 4. Counter-Rotating Chevron Bracket Ring
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-this.rotationAngle * 1.4);

    const numChevrons = 6;
    for (let i = 0; i < numChevrons; i++) {
      const a = (i * Math.PI * 2) / numChevrons;
      const r = baseR * 0.72;
      ctx.beginPath();
      ctx.arc(0, 0, r, a - 0.25, a + 0.25);
      ctx.strokeStyle = secondaryColor;
      ctx.lineWidth = 3;
      ctx.shadowColor = secondaryColor;
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.restore();

    // 5. Central Concentric Reactor Core Rings
    ctx.beginPath();
    ctx.arc(cx, cy, baseR * 0.48, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    // 6. Center Energy Heart Pulse
    const heartR = baseR * (0.32 + audioLevel * 0.12);
    const heartGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, heartR);
    heartGlow.addColorStop(0, '#ffffff');
    heartGlow.addColorStop(0.3, primaryColor);
    heartGlow.addColorStop(0.8, secondaryColor);
    heartGlow.addColorStop(1, 'transparent');

    ctx.beginPath();
    ctx.arc(cx, cy, heartR, 0, Math.PI * 2);
    ctx.fillStyle = heartGlow;
    ctx.shadowColor = primaryColor;
    ctx.shadowBlur = 20;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Update bottom VU meter bars if present
    this.updateVuBars(audioLevel);
  }

  updateVuBars(level) {
    if (!this.dom.vuContainer) return;
    const sticks = this.dom.vuContainer.children;
    const count = sticks.length;
    for (let i = 0; i < count; i++) {
      const distFromCenter = Math.abs(i - count / 2) / (count / 2);
      const factor = Math.max(0, 1 - distFromCenter);
      const h = Math.max(4, Math.min(22, level * 28 * factor + Math.random() * 4));
      sticks[i].style.height = `${h}px`;
    }
  }

  // Open & Close Overlay (Voice Call)
  async open(customGreeting = null) {
    if (this.isOpen) return;
    this.isOpen = true;
    this.dom.overlay?.classList.add('active');
    this.dom.btnHeaderJarvis?.classList.add('active');
    this.dom.btnMicPrompt?.classList.add('active');

    this.playSfx('call_connect');
    await this.setupMicrophoneAnalyser();
    this.resizeCanvas();
    this.startAnimationLoop();

    // Spoken call response greeting: "Salute Chef!"
    const defaultRo = "Salutare Chef! Toate sistemele sunt online. Cu ce vă pot fi de folos?";
    const defaultEn = "Salute Chef! Systems online, how can I assist you today?";
    const greeting = customGreeting || this.customGreeting || (
      this.recognitionLanguage && this.recognitionLanguage.startsWith('ro') ? defaultRo : defaultEn
    );
    this.renderAiStream(greeting, false);
    this.speak(greeting);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.stopListening();
    this.stopSpeaking();
    this.stopAnimationLoop();
    this.playSfx('dismiss');

    this.dom.overlay?.classList.remove('active');
    this.dom.btnHeaderJarvis?.classList.remove('active');
    this.dom.btnMicPrompt?.classList.remove('active');
    this.dom.settingsCard?.classList.remove('open');
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  // UI Event Listeners
  initEventListeners() {
    // Header & prompt trigger buttons
    this.dom.btnHeaderJarvis?.addEventListener('click', () => this.toggle());
    this.dom.btnMicPrompt?.addEventListener('click', () => this.toggle());
    this.dom.btnVoiceToggle?.addEventListener('click', () => this.toggleAutoSpeakChat());

    // Close button
    this.dom.btnClose?.addEventListener('click', () => this.close());

    // Center Core trigger: click to start/stop speech recognition
    this.dom.coreTrigger?.addEventListener('click', () => this.toggleListening());
    this.dom.btnMicMain?.addEventListener('click', () => this.toggleListening());

    // Stop Speaking button
    this.dom.btnStopSpeech?.addEventListener('click', () => this.stopSpeaking());

    // Text Fallback input in HUD
    this.dom.btnSend?.addEventListener('click', () => {
      const text = this.dom.textInput.value.trim();
      if (text) {
        this.dom.textInput.value = '';
        this.transmitDirective(text);
      }
    });

    this.dom.textInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const text = this.dom.textInput.value.trim();
        if (text) {
          this.dom.textInput.value = '';
          this.transmitDirective(text);
        }
      }
    });

    // Continuous Mode Toggle
    this.dom.btnContinuous?.addEventListener('click', () => {
      this.continuousMode = !this.continuousMode;
      this.dom.btnContinuous.classList.toggle('active', this.continuousMode);
      this.dom.btnContinuous.textContent = this.continuousMode ? '🔄 Continuu: PORNIT' : '🔄 Continuu: OPRIT';
    });

    // Settings Card Toggle
    this.dom.btnSettings?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.dom.settingsCard?.classList.toggle('open');
    });

    // Settings click away
    document.addEventListener('click', (e) => {
      if (this.dom.settingsCard && !this.dom.settingsCard.contains(e.target) && e.target !== this.dom.btnSettings) {
        this.dom.settingsCard.classList.remove('open');
      }
    });

    // TTS Engine Selection
    if (this.dom.engineSelect) {
      this.dom.engineSelect.value = this.ttsEngine || 'auto';
      this.dom.engineSelect.addEventListener('change', (e) => {
        this.ttsEngine = e.target.value;
        localStorage.setItem('jarvis_tts_engine', this.ttsEngine);
      });
    }

    // Voice Selection
    this.dom.voiceSelect?.addEventListener('change', (e) => {
      const idx = parseInt(e.target.value, 10);
      if (this.availableVoices[idx]) {
        this.selectedVoice = this.availableVoices[idx];
        localStorage.setItem('jarvis_voice_name', this.selectedVoice.name);
      }
    });

    // Recognition Language Selection
    if (this.dom.langSelect) {
      this.dom.langSelect.value = this.recognitionLanguage || 'ro-RO';
      this.dom.langSelect.addEventListener('change', (e) => {
        this.recognitionLanguage = e.target.value;
        localStorage.setItem('jarvis_rec_lang', this.recognitionLanguage);
        if (this.recognition) {
          this.recognition.lang = this.recognitionLanguage;
        }
        this.selectedVoice = this.pickBestJarvisVoice();
      });
    }

    // Pitch Slider
    this.dom.pitchSlider?.addEventListener('input', (e) => {
      this.voicePitch = parseFloat(e.target.value);
      localStorage.setItem('jarvis_pitch', this.voicePitch);
      if (this.dom.pitchVal) this.dom.pitchVal.textContent = this.voicePitch.toFixed(2);
    });

    // Rate Slider
    this.dom.rateSlider?.addEventListener('input', (e) => {
      this.voiceRate = parseFloat(e.target.value);
      localStorage.setItem('jarvis_rate', this.voiceRate);
      if (this.dom.rateVal) this.dom.rateVal.textContent = this.voiceRate.toFixed(2);
    });
  }

  toggleAutoSpeakChat() {
    this.unlockAudio();
    this.autoSpeakChat = !this.autoSpeakChat;
    localStorage.setItem('jarvis_auto_speak_chat', this.autoSpeakChat);
    this.updateVoiceToggleUI();
    if (!this.autoSpeakChat && this.isSpeaking) {
      this.stopSpeaking();
    } else if (this.autoSpeakChat) {
      this.playSfx('chime');
    }
  }

  updateVoiceToggleUI() {
    const btn = this.dom.btnVoiceToggle || document.getElementById('btn-voice-toggle');
    if (!btn) return;
    if (this.autoSpeakChat) {
      btn.classList.add('active');
      btn.classList.remove('muted');
      btn.title = 'Răspunsuri vocale automate (TTS): ACTIVAT (Apasă pentru dezactivare)';
      btn.innerHTML = '<span class="voice-icon">🔊</span>';
    } else {
      btn.classList.remove('active');
      btn.classList.add('muted');
      btn.title = 'Răspunsuri vocale automate (TTS): DEZACTIVAT (Apasă pentru activare)';
      btn.innerHTML = '<span class="voice-icon">🔇</span>';
    }
    if (this.isSpeaking) {
      btn.classList.add('speaking');
    } else {
      btn.classList.remove('speaking');
    }
  }

  // Dynamic Settings Sync from WebUI Settings Modal
  applySettings(s = {}) {
    if (s.autoSpeak !== undefined) {
      this.autoSpeakChat = !!s.autoSpeak;
      localStorage.setItem('jarvis_auto_speak_chat', this.autoSpeakChat);
      this.updateVoiceToggleUI();
    }
    if (s.language) {
      this.recognitionLanguage = s.language;
      localStorage.setItem('jarvis_rec_lang', s.language);
      if (this.recognition) {
        this.recognition.lang = s.language;
      }
      if (this.dom.langSelect) {
        this.dom.langSelect.value = s.language;
      }
    }
    if (s.ttsEngine) {
      this.ttsEngine = s.ttsEngine;
      localStorage.setItem('jarvis_tts_engine', s.ttsEngine);
      if (this.dom.engineSelect) {
        this.dom.engineSelect.value = s.ttsEngine;
      }
    }
    if (s.voiceName) {
      const match = this.availableVoices.find(v => v.name === s.voiceName);
      if (match) this.selectedVoice = match;
      localStorage.setItem('jarvis_voice_name', s.voiceName);
    } else if (s.language) {
      this.selectedVoice = this.pickBestJarvisVoice();
    }
    if (s.pitch !== undefined) {
      this.voicePitch = parseFloat(s.pitch);
      localStorage.setItem('jarvis_pitch', this.voicePitch);
      if (this.dom.pitchSlider) this.dom.pitchSlider.value = this.voicePitch;
      if (this.dom.pitchVal) this.dom.pitchVal.textContent = this.voicePitch.toFixed(2);
    }
    if (s.rate !== undefined) {
      this.voiceRate = parseFloat(s.rate);
      localStorage.setItem('jarvis_rate', this.voiceRate);
      if (this.dom.rateSlider) this.dom.rateSlider.value = this.voiceRate;
      if (this.dom.rateVal) this.dom.rateVal.textContent = this.voiceRate.toFixed(2);
    }
    if (s.continuous !== undefined) {
      this.continuousMode = !!s.continuous;
      localStorage.setItem('jarvis_continuous', this.continuousMode);
      if (this.dom.btnContinuous) {
        this.dom.btnContinuous.classList.toggle('active', this.continuousMode);
        this.dom.btnContinuous.textContent = this.continuousMode ? '🔄 Continuu: PORNIT' : '🔄 Continuu: OPRIT';
      }
    }
    if (s.greeting !== undefined) {
      this.customGreeting = s.greeting;
      localStorage.setItem('jarvis_greeting', this.customGreeting);
    }
    this.populateVoiceSelect();
  }

  // Keyboard Shortcuts (Alt+J, Ctrl+Shift+V, Esc)
  initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Escape to close
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
        return;
      }

      // Alt+J or Ctrl+Shift+V toggles Jarvis voice overlay anywhere
      if ((e.altKey && (e.key === 'j' || e.key === 'J')) || (e.ctrlKey && e.shiftKey && (e.key === 'v' || e.key === 'V'))) {
        e.preventDefault();
        this.toggle();
        return;
      }

      // 'V' key outside any input/textarea toggles voice mode
      if (e.key === 'v' || e.key === 'V') {
        const active = document.activeElement;
        const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
        if (!isInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          this.toggle();
        }
      }
    });
  }
}

// Global attachment
window.JarvisVoiceOverlay = JarvisVoiceOverlay;
