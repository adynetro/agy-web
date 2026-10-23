// Antigravity (agy) Web UI Application
class AgyApp {
  constructor() {
    this.conversations = [];
    this.activeConversationId = null;
    this.messages = [];
    this.models = [];
    this.channels = [];
    this.systemInfo = null;
    
    this.selectedModel = 'gemini-3.8-flash-high';
    this.selectedEffort = 'high';
    this.selectedMode = 'auto';
    this.selectedCwd = '';
    
    this.isGenerating = false;
    this.ws = null;
    this.currentAssistantMessage = null;
    this.autoScrollConsole = true;
    this.bannerTimerInterval = null;
    this.turnStartTime = null;

    // Model & Token Telemetry State
    this.telemetry = {
      modelName: 'Gemini 3.8 Flash (High)',
      inputTokens: 0,
      outputTokens: 0,
      thinkingTokens: 0,
      cacheReadTokens: 0,
      totalTokens: 0,
      lastDuration: 0,
    };
    this.autoApprove = true;
    
    // DOM Elements
    this.dom = {
      sidebar: document.querySelector('.sidebar'),
      btnSidebarToggle: document.getElementById('btn-sidebar-toggle'),
      btnSidebarClose: document.getElementById('btn-sidebar-close'),
      sidebarBackdrop: document.getElementById('sidebar-backdrop'),
      convList: document.getElementById('conv-list'),
      chatScroll: document.getElementById('chat-scroll'),
      chatInner: document.getElementById('chat-inner'),
      welcomeView: document.getElementById('welcome-view'),
      promptInput: document.getElementById('prompt-input'),
      btnSend: document.getElementById('btn-send'),
      btnAbort: document.getElementById('btn-abort'),
      btnNewChat: document.getElementById('btn-new-chat'),
      modelSelect: document.getElementById('model-select'),
      effortSelect: document.getElementById('effort-select'),
      modeSelect: document.getElementById('mode-select'),
      cwdInput: document.getElementById('cwd-input'),
      convTitle: document.getElementById('conv-title'),
      discordPill: document.getElementById('discord-pill'),
      discordStatusText: document.getElementById('discord-status-text'),
      discordIndicator: document.getElementById('discord-indicator'),
      settingsDiscordDot: document.getElementById('settings-discord-dot'),
      btnChannels: document.getElementById('btn-channels'),
      btnSettings: document.getElementById('btn-settings'),
      btnSystem: document.getElementById('btn-system'),
      btnRefreshSystem: document.getElementById('btn-refresh-system'),
      btnThemeToggle: document.getElementById('btn-theme-toggle'),
      themeIcon: document.getElementById('theme-icon'),
      themeLabel: document.getElementById('theme-label'),
      welcomeGreeting: document.getElementById('welcome-greeting'),
      
      // System Resources Elements (CPU, RAM, Storage)
      meterCpuVal: document.getElementById('meter-cpu-val'),
      meterCpuBar: document.getElementById('meter-cpu-bar'),
      meterRamVal: document.getElementById('meter-ram-val'),
      meterRamBar: document.getElementById('meter-ram-bar'),
      meterDiskVal: document.getElementById('meter-disk-val'),
      meterDiskBar: document.getElementById('meter-disk-bar'),
      microCpuAscii: document.getElementById('micro-cpu-ascii'),
      microRamAscii: document.getElementById('micro-ram-ascii'),
      btnToggleQuota: document.getElementById('btn-toggle-quota'),
      btnToggleAutoApprove: document.getElementById('btn-toggle-autoapprove'),
      deckChipAutoApprove: document.getElementById('deck-chip-autoapprove'),
      deckChipStop: document.getElementById('deck-chip-stop'),
      deckChipBtw: document.getElementById('deck-chip-btw'),
      sidebarSessionCount: document.getElementById('sidebar-session-count'),
      headerCpuVal: document.getElementById('header-cpu-val'),
      headerRamVal: document.getElementById('header-ram-val'),
      headerDiskVal: document.getElementById('header-disk-val'),

      // Quota Elements
      meterQuotaVal: document.getElementById('meter-quota-val'),
      meterQuotaSubVal: document.getElementById('meter-quota-sub-val'),
      meterQuotaBar: document.getElementById('meter-quota-bar'),
      meterQuotaReset: document.getElementById('meter-quota-reset'),
      meterWeeklyQuotaVal: document.getElementById('meter-weekly-quota-val'),
      meterWeeklyQuotaBar: document.getElementById('meter-weekly-quota-bar'),
      headerQuotaVal: document.getElementById('header-quota-val'),
      headerQuotaPill: document.getElementById('header-quota-pill'),
      btnRefreshQuota: document.getElementById('btn-refresh-quota'),

      // Usage Tabs & Panels
      tabBtnSystem: document.getElementById('tab-btn-system'),
      tabBtnQuota: document.getElementById('tab-btn-quota'),
      tabBtnBoth: document.getElementById('tab-btn-both'),
      panelSystem: document.getElementById('panel-system'),
      panelQuota: document.getElementById('panel-quota'),

      // Token Usage Telemetry Elements
      meterInputVal: document.getElementById('meter-input-val'),
      meterInputBar: document.getElementById('meter-input-bar'),
      meterOutputVal: document.getElementById('meter-output-val'),
      meterOutputBar: document.getElementById('meter-output-bar'),
      meterThinkingVal: document.getElementById('meter-thinking-val'),
      meterThinkingBar: document.getElementById('meter-thinking-bar'),
      meterCacheVal: document.getElementById('meter-cache-val'),
      meterCacheBar: document.getElementById('meter-cache-bar'),
      telemetryTotalVal: document.getElementById('telemetry-total-val'),
      headerTokensVal: document.getElementById('header-tokens-val'),
      headerLatencyVal: document.getElementById('header-latency-val'),

      // Live Action Status Banner Elements
      liveCliBanner: document.getElementById('live-cli-banner'),
      liveBannerAction: document.getElementById('live-banner-action'),
      liveBannerTimer: document.getElementById('live-banner-timer'),

      // Live CLI Console Drawer Elements
      btnHeaderCli: document.getElementById('btn-header-cli'),
      cliConsoleDrawer: document.getElementById('cli-console-drawer'),
      cliConsoleHeader: document.getElementById('cli-console-header'),
      cliConsoleBody: document.getElementById('cli-console-body'),
      cliLiveIndicator: document.getElementById('cli-live-indicator'),
      cliStepIndicator: document.getElementById('cli-step-indicator'),
      btnCliToggle: document.getElementById('btn-cli-toggle'),
      btnCliAutoscroll: document.getElementById('btn-cli-autoscroll'),
      btnCliCopy: document.getElementById('btn-cli-copy'),
      btnCliClear: document.getElementById('btn-cli-clear'),

      // Modals
      modalSettings: document.getElementById('modal-settings'),
      modalChannels: document.getElementById('modal-settings'),
      modalSystem: document.getElementById('modal-settings'),

      // Process Manager & Output Modals
      btnHeaderProcesses: document.getElementById('btn-header-processes'),
      processesCountBadge: document.getElementById('processes-count-badge'),
      modalProcesses: document.getElementById('modal-processes'),
      btnRefreshProcesses: document.getElementById('btn-refresh-processes'),
      procAutoRefreshToggle: document.getElementById('proc-auto-refresh-toggle'),
      processesList: document.getElementById('processes-list'),
      procStatTotal: document.getElementById('proc-stat-total'),
      procStatActive: document.getElementById('proc-stat-active'),

      modalProcessOutput: document.getElementById('modal-process-output'),
      procOutputTitle: document.getElementById('proc-output-title'),
      procOutputSubtitle: document.getElementById('proc-output-subtitle'),
      procOutputTerminal: document.getElementById('proc-output-terminal'),
      btnProcOutputSteer: document.getElementById('btn-proc-output-steer'),
      btnProcOutputAttach: document.getElementById('btn-proc-output-attach'),
      btnProcOutputStop: document.getElementById('btn-proc-output-stop'),

      // /btw Steering Elements
      btnBtw: document.getElementById('btn-btw'),
      btnBannerBtw: document.getElementById('btn-banner-btw'),
      modalQuickBtw: document.getElementById('modal-quick-btw'),
      btwModalInput: document.getElementById('btw-modal-input'),
      btwInterruptToggle: document.getElementById('btw-interrupt-toggle'),
      btnSubmitBtw: document.getElementById('btn-submit-btw'),
    };

    this.processes = [];
    this.activeViewingPid = null;
    this.activeSteeringConvId = null;

    this.branding = null;
    this.currentTheme = 'dark';
    this.init();
  }

  async init() {
    this.initTheme();
    this.updateGreeting();
    this.bindEvents();
    this.setupMarkdown();
    await this.fetchBranding();
    await this.fetchInitialSettings();
    await this.fetchModels();
    await this.fetchChannels();
    await this.fetchConversations();
    await this.fetchSystemMetrics();
    await this.fetchQuotaMetrics();
    await this.fetchProcesses();
    this.updateModelTelemetryUI();
    
    // Auto-poll channels status every 10s
    setInterval(() => this.fetchChannels(), 10000);
    // Auto-poll system status every 4s
    setInterval(() => this.fetchSystemMetrics(), 4000);
    // Auto-poll quota limits every 45s
    setInterval(() => this.fetchQuotaMetrics(), 45000);
    // Auto-poll processes every 3s
    setInterval(() => {
      this.fetchProcesses();
      if (this.activeViewingPid && this.dom.modalProcessOutput && this.dom.modalProcessOutput.style.display === 'flex') {
        this.refreshProcessOutput(this.activeViewingPid);
      }
      if (!this.isGenerating && this.dom.cliConsoleDrawer && !this.dom.cliConsoleDrawer.classList.contains('collapsed') && this.processes.length > 0) {
        this.followActiveProcessOutput();
      }
    }, 3000);
  }

  initTheme() {
    const saved = localStorage.getItem('agy_theme');
    const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    const theme = saved || (prefersLight ? 'light' : 'dark');
    this.setTheme(theme);
  }

  setTheme(theme) {
    this.currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('agy_theme', theme);
    const themeColorMeta = document.getElementById('theme-color-meta');
    if (themeColorMeta) {
      themeColorMeta.setAttribute('content', theme === 'light' ? '#f8f9fc' : '#0d0e12');
    }
    if (this.dom.themeIcon && this.dom.themeLabel) {
      if (theme === 'light') {
        this.dom.themeIcon.textContent = '🌙';
        this.dom.themeLabel.textContent = 'Dark';
      } else {
        this.dom.themeIcon.textContent = '☀️';
        this.dom.themeLabel.textContent = 'Light';
      }
    }
  }

  toggleTheme() {
    const next = this.currentTheme === 'light' ? 'dark' : 'light';
    this.setTheme(next);
  }

  openSidebar() {
    if (this.dom.sidebar) this.dom.sidebar.classList.add('open');
    if (this.dom.sidebarBackdrop) this.dom.sidebarBackdrop.classList.add('active');
  }

  closeSidebar() {
    if (this.dom.sidebar) this.dom.sidebar.classList.remove('open');
    if (this.dom.sidebarBackdrop) this.dom.sidebarBackdrop.classList.remove('active');
  }

  toggleSidebar() {
    if (!this.dom.sidebar) return;
    if (this.dom.sidebar.classList.contains('open')) {
      this.closeSidebar();
    } else {
      this.openSidebar();
    }
  }

  updateGreeting() {
    if (!this.dom.welcomeGreeting) return;
    const hour = new Date().getHours();
    let greeting = 'Good evening';
    if (hour >= 5 && hour < 12) {
      greeting = 'Good morning';
    } else if (hour >= 12 && hour < 18) {
      greeting = 'Good afternoon';
    }
    this.dom.welcomeGreeting.textContent = greeting;
  }

  setupMarkdown() {
    if (window.marked) {
      marked.setOptions({
        breaks: true,
        gfm: true,
        highlight: function(code, lang) {
          if (window.hljs) {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            return hljs.highlight(code, { language }).value;
          }
          return code;
        }
      });
    }
  }

  bindEvents() {
    // Send message on Enter (without Shift)
    this.dom.promptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const text = this.dom.promptInput.value.trim();
        if (!text) return;

        if (this.isGenerating) {
          // If model is currently generating, Enter sends a /btw steering instruction!
          const cleanBtw = text.startsWith('/btw') ? text.replace(/^\/btw\s*/, '') : text;
          this.sendBtwSteering(cleanBtw);
          this.dom.promptInput.value = '';
          this.dom.promptInput.style.height = 'auto';
        } else {
          this.sendMessage();
        }
      }
    });

    // Auto-resize input
    this.dom.promptInput.addEventListener('input', () => {
      this.dom.promptInput.style.height = 'auto';
      this.dom.promptInput.style.height = Math.min(this.dom.promptInput.scrollHeight, 200) + 'px';
    });

    this.dom.btnSend.addEventListener('click', () => this.sendMessage());
    this.dom.btnAbort.addEventListener('click', () => this.abortTurn());
    this.dom.btnNewChat.addEventListener('click', () => this.startNewChat());

    // Command Deck Quick Action Chips
    document.querySelectorAll('.deck-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const cmd = chip.getAttribute('data-cmd');
        if (cmd === '/diff') {
          this.dom.promptInput.value = 'Show git diff and uncommitted changes across the workspace';
          this.sendMessage();
        } else if (cmd === '/undo') {
          this.dom.promptInput.value = 'Revert the last file edits made in this workspace';
          this.sendMessage();
        } else if (cmd === '/stop') {
          this.abortTurn();
        }
      });
    });

    if (this.dom.deckChipAutoApprove) {
      this.dom.deckChipAutoApprove.addEventListener('click', () => this.toggleAutoApprove());
    }
    if (this.dom.btnToggleAutoApprove) {
      this.dom.btnToggleAutoApprove.addEventListener('click', () => this.toggleAutoApprove());
    }
    if (this.dom.deckChipBtw) {
      this.dom.deckChipBtw.addEventListener('click', () => this.openQuickBtwModal());
    }
    if (this.dom.btnToggleQuota) {
      if (localStorage.getItem('agy_quota_panel_open') === 'true' && this.dom.panelQuota) {
        this.dom.panelQuota.style.display = 'flex';
      }
      this.dom.btnToggleQuota.addEventListener('click', () => {
        const p = this.dom.panelQuota;
        if (p) {
          const isClosed = p.style.display === 'none' || !p.style.display;
          p.style.display = isClosed ? 'flex' : 'none';
          localStorage.setItem('agy_quota_panel_open', isClosed ? 'true' : 'false');
        }
      });
    }

    // Auto-expanding textarea
    if (this.dom.promptInput) {
      this.dom.promptInput.addEventListener('input', () => {
        this.dom.promptInput.style.height = 'auto';
        this.dom.promptInput.style.height = Math.min(180, Math.max(24, this.dom.promptInput.scrollHeight)) + 'px';
      });
    }

    // Process Manager Button
    if (this.dom.btnHeaderProcesses) {
      this.dom.btnHeaderProcesses.addEventListener('click', () => {
        if (this.dom.modalProcesses && this.dom.modalProcesses.style.display === 'flex') {
          this.closeProcessesModal();
        } else {
          this.openProcessesModal();
        }
      });
    }
    if (this.dom.btnRefreshProcesses) {
      this.dom.btnRefreshProcesses.addEventListener('click', () => this.fetchProcesses());
    }

    // /btw Steering Buttons
    if (this.dom.btnBtw) {
      this.dom.btnBtw.addEventListener('click', () => this.openQuickBtwModal());
    }
    if (this.dom.btnBannerBtw) {
      this.dom.btnBannerBtw.addEventListener('click', () => this.openQuickBtwModal());
    }
    if (this.dom.btnSubmitBtw) {
      this.dom.btnSubmitBtw.addEventListener('click', () => this.submitQuickBtw());
    }

    // Process Output Modal Buttons
    if (this.dom.btnProcOutputSteer) {
      this.dom.btnProcOutputSteer.addEventListener('click', () => {
        this.openQuickBtwModal(null, this.activeViewingPid);
      });
    }
    if (this.dom.btnProcOutputAttach) {
      this.dom.btnProcOutputAttach.addEventListener('click', () => {
        if (this.activeViewingPid) {
          const proc = this.processes.find(p => p.pid === this.activeViewingPid);
          if (proc && proc.conversation_id) {
            this.attachToConversation(proc.conversation_id);
            this.dom.modalProcessOutput.style.display = 'none';
          }
        }
      });
    }
    if (this.dom.btnProcOutputStop) {
      this.dom.btnProcOutputStop.addEventListener('click', async () => {
        if (this.activeViewingPid && confirm(`Stop process PID ${this.activeViewingPid}?`)) {
          await this.stopProcess(this.activeViewingPid);
          this.dom.modalProcessOutput.style.display = 'none';
        }
      });
    }

    this.dom.modelSelect.addEventListener('change', (e) => {
      this.selectedModel = e.target.value;
      this.telemetry.modelName = e.target.options[e.target.selectedIndex]?.text || e.target.value;
      this.updateModelTelemetryUI();
    });

    this.dom.effortSelect.addEventListener('change', (e) => {
      this.selectedEffort = e.target.value;
    });

    this.dom.modeSelect.addEventListener('change', (e) => {
      this.selectedMode = e.target.value;
    });

    this.dom.cwdInput.addEventListener('change', (e) => {
      this.selectedCwd = e.target.value.trim();
    });

    // Quick suggestion cards
    document.querySelectorAll('.suggestion-card').forEach(card => {
      card.addEventListener('click', () => {
        const prompt = card.getAttribute('data-prompt');
        if (prompt) {
          this.dom.promptInput.value = prompt;
          this.sendMessage();
        }
      });
    });

    // Theme toggle button
    if (this.dom.btnThemeToggle) {
      this.dom.btnThemeToggle.addEventListener('click', () => this.toggleTheme());
    }

    // CLI Console Controls
    if (this.dom.btnHeaderCli) {
      this.dom.btnHeaderCli.addEventListener('click', () => this.toggleCliConsole());
    }
    if (this.dom.btnCliToggle) {
      this.dom.btnCliToggle.addEventListener('click', () => this.toggleCliConsole());
    }
    if (this.dom.cliConsoleHeader) {
      this.dom.cliConsoleHeader.addEventListener('click', (e) => {
        if (!e.target.closest('.cli-console-actions')) {
          this.toggleCliConsole();
        }
      });
    }
    if (this.dom.btnCliAutoscroll) {
      this.dom.btnCliAutoscroll.addEventListener('click', () => this.toggleCliAutoScroll());
    }
    if (this.dom.btnCliCopy) {
      this.dom.btnCliCopy.addEventListener('click', () => this.copyCliConsole());
    }
    if (this.dom.btnCliClear) {
      this.dom.btnCliClear.addEventListener('click', () => this.clearCliConsole());
    }

    // Usage Panel Tabs (System vs Quota & Tokens vs All)
    if (this.dom.tabBtnSystem && this.dom.tabBtnQuota && this.dom.tabBtnBoth) {
      this.dom.tabBtnSystem.addEventListener('click', () => {
        this.dom.tabBtnSystem.classList.add('active');
        this.dom.tabBtnQuota.classList.remove('active');
        this.dom.tabBtnBoth.classList.remove('active');
        if (this.dom.panelSystem) this.dom.panelSystem.style.display = 'flex';
        if (this.dom.panelQuota) this.dom.panelQuota.style.display = 'none';
      });

      this.dom.tabBtnQuota.addEventListener('click', () => {
        this.dom.tabBtnSystem.classList.remove('active');
        this.dom.tabBtnQuota.classList.add('active');
        this.dom.tabBtnBoth.classList.remove('active');
        if (this.dom.panelSystem) this.dom.panelSystem.style.display = 'none';
        if (this.dom.panelQuota) this.dom.panelQuota.style.display = 'flex';
      });

      this.dom.tabBtnBoth.addEventListener('click', () => {
        this.dom.tabBtnSystem.classList.remove('active');
        this.dom.tabBtnQuota.classList.remove('active');
        this.dom.tabBtnBoth.classList.add('active');
        if (this.dom.panelSystem) this.dom.panelSystem.style.display = 'flex';
        if (this.dom.panelQuota) this.dom.panelQuota.style.display = 'flex';
      });
    }

    // Quota Refresh Trigger
    if (this.dom.btnRefreshQuota) {
      this.dom.btnRefreshQuota.addEventListener('click', () => this.fetchQuotaMetrics(true));
    }
    if (this.dom.headerQuotaPill) {
      this.dom.headerQuotaPill.addEventListener('click', () => {
        this.fetchQuotaMetrics(true);
      });
    }

    // Settings Modal Tabs Switching
    const settingsTabs = document.querySelectorAll('.settings-tab-btn');
    settingsTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetTab = tab.getAttribute('data-tab');
        if (targetTab) this.switchSettingsTab(targetTab);
      });
    });

    if (this.dom.btnRefreshSystem) {
      this.dom.btnRefreshSystem.addEventListener('click', () => this.loadSystemInfoForm());
    }

    if (this.dom.btnSettings) {
      this.dom.btnSettings.addEventListener('click', () => this.openSettingsModal('tab-general'));
    }
    if (this.dom.btnChannels) {
      this.dom.btnChannels.addEventListener('click', () => this.openSettingsModal('tab-discord'));
    }
    if (this.dom.discordPill) {
      this.dom.discordPill.addEventListener('click', () => this.openSettingsModal('tab-discord'));
    }
    if (this.dom.btnSystem) {
      this.dom.btnSystem.addEventListener('click', () => this.openSettingsModal('tab-host'));
    }

    // Mobile Sidebar Drawer Controls
    if (this.dom.btnSidebarToggle) {
      this.dom.btnSidebarToggle.addEventListener('click', () => this.toggleSidebar());
    }
    if (this.dom.btnSidebarClose) {
      this.dom.btnSidebarClose.addEventListener('click', () => this.closeSidebar());
    }
    if (this.dom.sidebarBackdrop) {
      this.dom.sidebarBackdrop.addEventListener('click', () => this.closeSidebar());
    }

    // Touch swipe left on sidebar to dismiss drawer on mobile
    if (this.dom.sidebar) {
      let touchStartX = 0;
      let touchStartY = 0;
      this.dom.sidebar.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches[0]) {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
        }
      }, { passive: true });
      this.dom.sidebar.addEventListener('touchend', (e) => {
        if (e.changedTouches && e.changedTouches[0]) {
          const deltaX = touchStartX - e.changedTouches[0].clientX;
          const deltaY = Math.abs(touchStartY - e.changedTouches[0].clientY);
          // If swiped horizontally to the left by > 45px and not a vertical scroll
          if (deltaX > 45 && deltaY < 60) {
            this.closeSidebar();
          }
        }
      }, { passive: true });
    }

    // Global Escape key to dismiss sidebar drawer and modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeSidebar();
        document.querySelectorAll('.modal-overlay').forEach(modal => {
          modal.style.display = 'none';
        });
      }
    });

    // Dismiss modal on backdrop overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.style.display = 'none';
          if (overlay.id === 'modal-processes' && this.dom.btnHeaderProcesses) {
            this.dom.btnHeaderProcesses.classList.remove('modal-open');
          }
        }
      });
    });

    // Modal Close buttons
    document.querySelectorAll('.btn-close-modal, .btn-modal-cancel').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal-overlay');
        if (modal) {
          modal.style.display = 'none';
          if (modal.id === 'modal-processes' && this.dom.btnHeaderProcesses) {
            this.dom.btnHeaderProcesses.classList.remove('modal-open');
          }
        }
      });
    });

    // Discord save button
    document.getElementById('btn-save-discord').addEventListener('click', () => this.saveDiscordConfig());
    // Settings save button
    document.getElementById('btn-save-settings').addEventListener('click', () => this.saveSettings());

    // Custom Branding handlers
    document.getElementById('btn-save-branding')?.addEventListener('click', () => this.saveBranding());
    document.getElementById('btn-reset-branding')?.addEventListener('click', () => this.resetBranding());

    ['brand-prefix-input', 'brand-name-input', 'brand-badge-input', 'brand-title-input', 'brand-tagline-input', 'brand-logo-input'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => this.updateBrandingPreview());
    });

    const colorPicker = document.getElementById('brand-color-picker');
    const colorHex = document.getElementById('brand-color-hex');
    if (colorPicker && colorHex) {
      colorPicker.addEventListener('input', (e) => {
        colorHex.value = e.target.value.toUpperCase();
        this.updateBrandingPreview();
      });
      colorHex.addEventListener('input', (e) => {
        if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
          colorPicker.value = e.target.value;
          this.updateBrandingPreview();
        }
      });
    }

    document.querySelectorAll('.swatch-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const c = btn.getAttribute('data-color');
        if (colorPicker) colorPicker.value = c;
        if (colorHex) colorHex.value = c.toUpperCase();
        this.updateBrandingPreview();
      });
    });

    const logoFileInput = document.getElementById('brand-logo-file-input');
    if (logoFileInput) {
      logoFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.uploadBrandingLogo(e.target.files[0]);
        }
      });
    }
  }

  // --- API Calls ---

  async fetchInitialSettings() {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const s = await res.json();
        if (s.default_cwd) {
          this.selectedCwd = s.default_cwd;
          if (this.dom.cwdInput) this.dom.cwdInput.value = s.default_cwd;
        }
        if (s.default_model) {
          this.selectedModel = s.default_model;
          if (this.dom.modelSelect) this.dom.modelSelect.value = s.default_model;
        }
        if (s.default_effort) {
          this.selectedEffort = s.default_effort;
          if (this.dom.effortSelect) this.dom.effortSelect.value = s.default_effort;
        }
        if (s.default_mode) {
          this.selectedMode = s.default_mode;
          if (this.dom.modeSelect) this.dom.modeSelect.value = s.default_mode;
        }
        if (s.dangerously_skip_permissions !== undefined) {
          this.autoApprove = !!s.dangerously_skip_permissions;
          this.updateAutoApproveUI();
        }
      }
    } catch (e) {
      console.warn('Failed to load initial settings:', e);
    }
  }

  async fetchModels() {
    try {
      const res = await fetch('/api/models');
      this.models = await res.json();
      this.dom.modelSelect.innerHTML = '';
      this.models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.name;
        if (m.id === this.selectedModel) opt.selected = true;
        this.dom.modelSelect.appendChild(opt);
      });
    } catch (e) {
      console.error('Failed to fetch models:', e);
    }
  }

  async fetchChannels() {
    try {
      const res = await fetch('/api/channels');
      this.channels = await res.json();
      
      const discord = this.channels.find(c => c.id === 'discord');
      if (discord) {
        if (this.dom.discordStatusText) {
          if (discord.status === 'online' && discord.bot_user) {
            this.dom.discordStatusText.textContent = `Discord: @${discord.bot_user}`;
          } else {
            this.dom.discordStatusText.textContent = `Discord: ${discord.status.toUpperCase()}`;
          }
        }
        if (this.dom.discordIndicator) {
          this.dom.discordIndicator.className = `status-indicator ${discord.status}`;
        }
        const settingsDot = document.getElementById('settings-discord-dot');
        if (settingsDot) {
          settingsDot.className = `status-indicator ${discord.status}`;
        }
      }
    } catch (e) {
      console.error('Failed to fetch channels:', e);
    }
  }

  async fetchConversations() {
    try {
      const res = await fetch('/api/conversations');
      this.conversations = await res.json();
      this.renderConversationList();
    } catch (e) {
      console.error('Failed to fetch conversations:', e);
    }
  }

  async loadConversation(convId) {
    if (this.isGenerating) return;
    if (window.innerWidth <= 768) {
      this.closeSidebar();
    }
    this.activeConversationId = convId;
    this.renderConversationList();

    try {
      const res = await fetch(`/api/conversations/${convId}`);
      if (!res.ok) throw new Error('Not found');
      const data = await res.json();
      
      this.dom.convTitle.textContent = data.title || 'Conversation';
      this.messages = data.messages || [];
      this.renderChatMessages();
      this.connectWebSocket(convId);

      if (data.usage) {
        this.telemetry.inputTokens = data.usage.input_tokens || 0;
        this.telemetry.outputTokens = data.usage.output_tokens || 0;
        this.telemetry.thinkingTokens = data.usage.thinking_tokens || 0;
        this.telemetry.cacheReadTokens = data.usage.cache_read_tokens || 0;
        this.telemetry.totalTokens = data.usage.total_tokens || (this.telemetry.inputTokens + this.telemetry.outputTokens);
        this.updateModelTelemetryUI();
      } else {
        this.telemetry.inputTokens = 0;
        this.telemetry.outputTokens = 0;
        this.telemetry.thinkingTokens = 0;
        this.telemetry.cacheReadTokens = 0;
        this.telemetry.totalTokens = 0;
        this.updateModelTelemetryUI();
      }
    } catch (e) {
      console.error('Error loading conversation:', e);
    }
  }

  startNewChat() {
    if (this.isGenerating) return;
    if (window.innerWidth <= 768) {
      this.closeSidebar();
    }
    this.activeConversationId = null;
    this.messages = [];
    this.dom.convTitle.textContent = 'New Conversation';
    this.telemetry.inputTokens = 0;
    this.telemetry.outputTokens = 0;
    this.telemetry.thinkingTokens = 0;
    this.telemetry.cacheReadTokens = 0;
    this.telemetry.totalTokens = 0;
    this.telemetry.lastDuration = 0;
    this.updateModelTelemetryUI();
    this.renderConversationList();
    this.renderChatMessages();
    this.connectWebSocket(null);
  }

  async deleteConversation(convId, e) {
    if (e) e.stopPropagation();
    if (!confirm('Are you sure you want to delete this conversation?')) return;
    try {
      // Optimistically remove from state and UI immediately
      this.conversations = (this.conversations || []).filter(c => c.id !== convId);
      this.renderConversationList();
      if (this.activeConversationId === convId) {
        this.startNewChat();
      }

      await fetch(`/api/conversations/${convId}`, { method: 'DELETE' });
      await this.fetchConversations();
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  }

  // --- WebSocket & Turn Execution ---

  connectWebSocket(convId) {
    if (this.ws) {
      try { this.ws.close(); } catch(e) {}
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const path = convId ? `/ws/chat/${convId}` : '/ws/chat';
    const wsUrl = `${proto}//${window.location.host}${path}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleStreamEvent(data);
      } catch (err) {
        console.error('WebSocket JSON parse error:', err);
      }
    };

    this.ws.onerror = (err) => console.error('WebSocket error:', err);
    this.ws.onclose = () => {
      // Reconnect on new action if needed
    };
  }

  sendMessage() {
    const prompt = this.dom.promptInput.value.trim();
    if (!prompt) return;

    if (this.isGenerating || prompt.startsWith('/btw')) {
      const cleanBtw = prompt.startsWith('/btw') ? prompt.replace(/^\/btw\s*/, '') : prompt;
      this.sendBtwSteering(cleanBtw);
      this.dom.promptInput.value = '';
      this.dom.promptInput.style.height = 'auto';
      return;
    }

    this.dom.promptInput.value = '';
    this.dom.promptInput.style.height = 'auto';

    // Add User message immediately to UI
    this.messages.push({
      role: 'user',
      content: prompt,
      timestamp: new Date().toISOString()
    });

    // Create placeholder for Assistant message
    this.currentAssistantMessage = {
      role: 'assistant',
      content: '',
      thinking: '',
      tool_calls: [],
      isStreaming: true,
      timestamp: new Date().toISOString()
    };
    this.messages.push(this.currentAssistantMessage);

    this.renderChatMessages();
    this.setGenerating(true);
    this.startLiveBanner();

    this.appendCliLog({
      level: 'info',
      message: `[USER] > ${prompt}`,
      timestamp: Date.now() / 1000
    });

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.connectWebSocket(this.activeConversationId);
      // Wait for open
      this.ws.onopen = () => this.sendPromptPayload(prompt);
    } else {
      this.sendPromptPayload(prompt);
    }
  }

  sendPromptPayload(prompt) {
    const payload = {
      type: 'prompt',
      prompt: prompt,
      conversation_id: this.activeConversationId,
      model: this.selectedModel,
      effort: this.selectedEffort,
      mode: this.selectedMode,
      cwd: this.selectedCwd,
    };
    this.ws.send(JSON.stringify(payload));
  }

  handleStreamEvent(data) {
    const type = data.type || data.event;

    if (type === 'btw_ack' || type === 'btw_injected') {
      const steerMsg = data.message || 'Steering hint sent to agent';
      this.appendBtwMessage(steerMsg, data.interrupted);
      this.updateLiveBannerAction(`⚡ /btw steered: "${steerMsg.slice(0, 38)}..."`);
      this.appendCliLog({
        level: 'warn',
        message: `[STEER /btw] > ${steerMsg}${data.interrupted ? ' (SIGINT issued to stuck tool)' : ''}`,
        timestamp: Date.now() / 1000
      });
      return;
    }

    if (type === 'init') {
      if (data.conversation_id) {
        this.activeConversationId = data.conversation_id;
        this.fetchConversations();
      }
      if (data.model) {
        this.telemetry.modelName = data.model;
        this.updateModelTelemetryUI();
      }
    } else if (type === 'cli_log') {
      this.appendCliLog(data);
    } else if (type === 'token') {
      if (data.usage) {
        this.telemetry.inputTokens = data.usage.input_tokens || this.telemetry.inputTokens;
        this.telemetry.outputTokens = data.usage.output_tokens || this.telemetry.outputTokens;
        this.telemetry.thinkingTokens = data.usage.thinking_tokens || this.telemetry.thinkingTokens;
        this.telemetry.cacheReadTokens = data.usage.cache_read_tokens || this.telemetry.cacheReadTokens;
        this.telemetry.totalTokens = data.usage.total_tokens || (this.telemetry.inputTokens + this.telemetry.outputTokens);
        this.updateModelTelemetryUI();
      }
      if (data.delta) {
        this.updateLiveBannerAction('✍ Generating response...');
      }
      if (this.currentAssistantMessage) {
        this.currentAssistantMessage.content += (data.delta || '');
        this.updateStreamingMessageUI();
      }
    } else if (type === 'tool') {
      if (data.state === 'ACTIVE') {
        const actionText = data.summary ? `⚡ ${data.tool_name} › ${data.summary}` : `⚡ Running ${data.tool_name}...`;
        this.updateLiveBannerAction(actionText);
        this.updateDynamicActionButton('executing', data.tool_name);
      } else if (data.state === 'DONE') {
        const dur = data.duration_seconds ? ` in ${data.duration_seconds.toFixed(2)}s` : '';
        this.updateLiveBannerAction(`✔ Completed ${data.tool_name}${dur}`);
        this.updateDynamicActionButton('thinking');
      }

      if (this.currentAssistantMessage) {
        const existing = this.currentAssistantMessage.tool_calls.find(
          t => t.name === data.tool_name && t.state === 'ACTIVE'
        );
        if (existing) {
          existing.state = data.state;
          if (data.tool_info && data.tool_info.output) {
            existing.output = data.tool_info.output;
          }
          if (data.summary) existing.summary = data.summary;
          if (data.duration_seconds) existing.duration_seconds = data.duration_seconds;
        } else {
          this.currentAssistantMessage.tool_calls.push({
            name: data.tool_name,
            summary: data.summary,
            args: data.tool_info ? data.tool_info.parameters : {},
            output: data.tool_info ? data.tool_info.output : null,
            state: data.state || 'ACTIVE',
            duration_seconds: data.duration_seconds,
          });
        }
        this.updateStreamingMessageUI();
      }
    } else if (type === 'result') {
      this.stopLiveBanner();
      if (data.usage) {
        this.telemetry.inputTokens = data.usage.input_tokens || this.telemetry.inputTokens;
        this.telemetry.outputTokens = data.usage.output_tokens || this.telemetry.outputTokens;
        this.telemetry.thinkingTokens = data.usage.thinking_tokens || this.telemetry.thinkingTokens;
        this.telemetry.cacheReadTokens = data.usage.cache_read_tokens || this.telemetry.cacheReadTokens;
        this.telemetry.totalTokens = data.usage.total_tokens || (this.telemetry.inputTokens + this.telemetry.outputTokens);
      }
      if (data.duration_seconds) {
        this.telemetry.lastDuration = data.duration_seconds;
      }
      this.updateModelTelemetryUI();

      if (this.currentAssistantMessage) {
        this.currentAssistantMessage.isStreaming = false;
        if (data.response && !this.currentAssistantMessage.content) {
          this.currentAssistantMessage.content = data.response;
        }
        this.currentAssistantMessage.usage = data.usage;
        this.currentAssistantMessage.duration_seconds = data.duration_seconds;
      }
      this.setGenerating(false);
      this.renderChatMessages();
      this.fetchConversations();
      this.fetchQuotaMetrics(true);
      this.fetchSystemMetrics();
    } else if (type === 'error') {
      this.stopLiveBanner();
      if (this.currentAssistantMessage) {
        this.currentAssistantMessage.isStreaming = false;
        this.currentAssistantMessage.content += `\n\n⚠️ **Error:** ${data.error}`;
      }
      this.setGenerating(false);
      this.renderChatMessages();
    } else if (type === 'aborted') {
      this.stopLiveBanner();
      if (this.currentAssistantMessage) {
        this.currentAssistantMessage.isStreaming = false;
        this.currentAssistantMessage.content += `\n\n*(Execution aborted)*`;
      }
      this.setGenerating(false);
      this.renderChatMessages();
    }
  }

  async abortTurn() {
    this.stopLiveBanner();
    if (!this.isGenerating || !this.activeConversationId) return;
    try {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'abort' }));
      } else {
        await fetch(`/api/abort/${this.activeConversationId}`, { method: 'POST' });
      }
    } catch (e) {
      console.error('Failed to abort:', e);
    }
  }

  setGenerating(val) {
    this.isGenerating = val;
    this.dom.btnSend.style.display = val ? 'none' : 'flex';
    this.dom.btnAbort.style.display = val ? 'flex' : 'none';
    if (this.dom.btnBtw) {
      this.dom.btnBtw.style.display = val ? 'inline-flex' : 'none';
    }
    // Always keep prompt input interactive so user can type /btw
    this.dom.promptInput.disabled = false;
    if (val) {
      this.dom.promptInput.placeholder = 'Model is executing... Type /btw <hint> or press Enter to steer';
    } else {
      this.dom.promptInput.placeholder = 'Type instructions or prompts... (Shift+Enter for newline)';
      this.currentAssistantMessage = null;
      this.dom.promptInput.focus();
    }
  }

  // --- Rendering UI ---

  formatRelativeTime(dateInput) {
    if (!dateInput) return '';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diffSec < 60) return 'just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    if (diffSec < 172800) return 'yesterday';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  formatAsciiMeter(percent, slots = 8) {
    const clamped = Math.max(0, Math.min(100, percent || 0));
    const filled = Math.round((clamped / 100) * slots);
    const empty = slots - filled;
    return `[ ${'▰'.repeat(filled)}${'▱'.repeat(empty)} ]`;
  }

  async toggleAutoApprove() {
    this.autoApprove = !this.autoApprove;
    this.updateAutoApproveUI();
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dangerously_skip_permissions: this.autoApprove })
      });
    } catch (e) {
      console.warn('Failed to persist auto-approve setting:', e);
    }
  }

  updateAutoApproveUI() {
    const chip = document.getElementById('deck-chip-autoapprove');
    const pill = document.getElementById('btn-toggle-autoapprove');
    if (chip) {
      chip.classList.toggle('active', this.autoApprove);
      const label = chip.querySelector('.chip-label');
      if (label) label.textContent = this.autoApprove ? 'Auto-Approve' : 'Manual Approval';
    }
    if (pill) {
      pill.classList.toggle('active', this.autoApprove);
      const text = pill.querySelector('.pill-text');
      if (text) text.textContent = `Auto-Approve: ${this.autoApprove ? 'ON' : 'OFF'}`;
    }
  }

  updateDynamicActionButton(state, toolName = '') {
    if (!this.dom.btnSend) return;
    const label = this.dom.btnSend.querySelector('.action-text');
    const spinner = this.dom.btnSend.querySelector('.action-spinner');
    const icon = this.dom.btnSend.querySelector('.send-icon');

    this.dom.btnSend.className = 'btn-send dynamic-action-btn';

    if (state === 'thinking') {
      this.dom.btnSend.classList.add('btn-thinking');
      if (label) label.textContent = 'Thinking...';
      if (spinner) spinner.style.display = 'inline-block';
      if (icon) icon.style.display = 'none';
    } else if (state === 'executing') {
      this.dom.btnSend.classList.add('btn-executing');
      const cleanName = (toolName || 'tool').replace(/_/g, ' ');
      if (label) label.textContent = `Executing ${cleanName}...`;
      if (spinner) spinner.style.display = 'inline-block';
      if (icon) icon.style.display = 'none';
    } else {
      if (label) label.textContent = 'Send';
      if (spinner) spinner.style.display = 'none';
      if (icon) { icon.style.display = 'inline'; icon.textContent = '↑'; }
    }
  }

  renderConversationList() {
    this.dom.convList.innerHTML = '';
    const countBadge = document.getElementById('sidebar-session-count');
    if (countBadge) countBadge.textContent = this.conversations.length;

    if (this.conversations.length === 0) {
      this.dom.convList.innerHTML = '<div style="padding: 12px; font-size: 12px; color: var(--text-muted); text-align: center;">No active sessions</div>';
      return;
    }

    this.conversations.forEach(conv => {
      const item = document.createElement('div');
      item.className = 'conv-item' + (conv.id === this.activeConversationId ? ' active' : '');
      item.onclick = () => this.loadConversation(conv.id);

      const content = document.createElement('div');
      content.className = 'conv-item-content';

      const title = document.createElement('div');
      title.className = 'conv-item-title';
      title.textContent = conv.title || 'Conversation Session';

      const tagsRow = document.createElement('div');
      tagsRow.className = 'session-tags-row';

      const branchTag = document.createElement('span');
      branchTag.className = 'session-branch-tag';
      branchTag.innerHTML = `<span>⑂</span> <span>${this.escapeHtml(conv.branch || 'main')}</span>`;

      const relTime = document.createElement('span');
      relTime.className = 'session-relative-time';
      relTime.textContent = this.formatRelativeTime(conv.updated_at);

      const turnsTag = document.createElement('span');
      turnsTag.className = 'session-relative-time';
      turnsTag.textContent = `• ${conv.step_count || 0} turns`;

      tagsRow.appendChild(branchTag);
      tagsRow.appendChild(relTime);
      tagsRow.appendChild(turnsTag);

      content.appendChild(title);
      content.appendChild(tagsRow);

      const delBtn = document.createElement('button');
      delBtn.className = 'conv-item-delete';
      delBtn.title = 'Delete Conversation';
      delBtn.innerHTML = '✕';
      delBtn.onclick = (e) => this.deleteConversation(conv.id, e);

      item.appendChild(content);
      item.appendChild(delBtn);
      this.dom.convList.appendChild(item);
    });
  }

  renderChatMessages() {
    if (this.messages.length === 0) {
      this.dom.welcomeView.style.display = 'flex';
      this.dom.chatInner.querySelectorAll('.message-row, .message-row-btw').forEach(e => e.remove());
      return;
    }

    this.dom.welcomeView.style.display = 'none';
    this.dom.chatInner.querySelectorAll('.message-row, .message-row-btw').forEach(e => e.remove());

    this.messages.forEach(msg => {
      const row = this.createMessageRowElement(msg);
      this.dom.chatInner.appendChild(row);
    });

    this.scrollToBottom();
  }

  isReadTool(name) {
    if (!name) return false;
    const n = name.toLowerCase();
    return n.includes('read_') || n.includes('view_file') || n.includes('list_dir') ||
           n.includes('search_files') || n.includes('cat') || n.includes('grep') ||
           n.includes('head') || n.includes('tail') || n.includes('file_search');
  }

  isWriteTool(name) {
    if (!name) return false;
    const n = name.toLowerCase();
    return n.includes('write_') || n.includes('edit_') || n.includes('replace_') ||
           n.includes('patch') || n.includes('sed_') || n.includes('save_file');
  }

  isCommandTool(name) {
    if (!name) return false;
    const n = name.toLowerCase();
    return n.includes('run_command') || n.includes('exec') || n.includes('shell') || n.includes('terminal');
  }

  groupToolCalls(toolCalls) {
    const groups = [];
    let currentBatch = [];

    const flushBatch = () => {
      if (currentBatch.length === 1) {
        groups.push({ type: 'single', tool: currentBatch[0] });
      } else if (currentBatch.length > 1) {
        groups.push({ type: 'batch_reads', tools: [...currentBatch] });
      }
      currentBatch = [];
    };

    toolCalls.forEach(tc => {
      if (this.isReadTool(tc.name)) {
        currentBatch.push(tc);
      } else {
        flushBatch();
        groups.push({ type: 'single', tool: tc });
      }
    });
    flushBatch();
    return groups;
  }

  createReasoningBlockElement(thinking, duration, usage) {
    const block = document.createElement('div');
    block.className = 'reasoning-block';

    const durText = duration ? ` • ${duration.toFixed(1)}s` : '';
    const tokText = (usage && usage.thinking_tokens) ? ` (${usage.thinking_tokens.toLocaleString()} tokens)` : '';

    const header = document.createElement('div');
    header.className = 'reasoning-header';
    header.innerHTML = `
      <div class="reasoning-title-group">
        <span class="reasoning-icon">💭</span>
        <span>Reasoning Chain${durText}${tokText}</span>
      </div>
      <span class="reasoning-toggle-arrow">▼</span>
    `;

    const body = document.createElement('div');
    body.className = 'reasoning-body';
    body.style.display = 'none';
    body.textContent = thinking;

    header.onclick = () => {
      const isClosed = body.style.display === 'none';
      body.style.display = isClosed ? 'block' : 'none';
      block.classList.toggle('open', isClosed);
    };

    block.appendChild(header);
    block.appendChild(body);
    return block;
  }

  createBatchReadsElement(tools) {
    const card = document.createElement('div');
    card.className = 'batch-reads-card';

    let totalDur = 0;
    tools.forEach(t => {
      if (t.duration_seconds) totalDur += t.duration_seconds;
    });
    const durStr = totalDur > 0 ? ` • ${Math.round(totalDur * 1000)}ms` : '';

    const header = document.createElement('div');
    header.className = 'batch-reads-header';
    header.innerHTML = `
      <div class="batch-reads-title">
        <span class="batch-arrow">▸</span>
        <span>Analyzed ${tools.length} context files (click to expand)${durStr}</span>
      </div>
      <span class="batch-reads-badge">${tools.length} READS</span>
    `;

    const list = document.createElement('div');
    list.className = 'batch-checklist';
    list.style.display = 'none';

    tools.forEach((t) => {
      const row = document.createElement('div');
      row.className = 'batch-check-row';

      const path = (t.args && (t.args.Path || t.args.AbsolutePath || t.args.TargetFile)) || t.summary || 'context file';
      const lines = (t.args && t.args.StartLine && t.args.EndLine) ? `#L${t.args.StartLine}-${t.args.EndLine}` : '';
      const dur = t.duration_seconds ? `${Math.round(t.duration_seconds * 1000)}ms` : 'done';

      row.innerHTML = `
        <div class="batch-check-left">
          <span class="batch-check-icon">✔</span>
          <span class="batch-file-path" title="${this.escapeHtml(path)}">${this.escapeHtml(path)}</span>
          ${lines ? `<span class="batch-line-range">${lines}</span>` : ''}
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="action-duration">${dur}</span>
          <button class="batch-peek-btn" title="Peek content">Inspect</button>
        </div>
      `;

      const peekBtn = row.querySelector('.batch-peek-btn');
      const peekBox = document.createElement('div');
      peekBox.className = 'batch-file-peek-content';
      peekBox.style.display = 'none';
      peekBox.textContent = t.output || '(File read completed with empty output)';

      peekBtn.onclick = (e) => {
        e.stopPropagation();
        const open = peekBox.style.display !== 'none';
        peekBox.style.display = open ? 'none' : 'block';
        peekBtn.textContent = open ? 'Inspect' : 'Hide';
      };

      list.appendChild(row);
      list.appendChild(peekBox);
    });

    header.onclick = () => {
      const isOpen = list.style.display !== 'none';
      list.style.display = isOpen ? 'none' : 'flex';
      card.classList.toggle('open', !isOpen);
    };

    card.appendChild(header);
    card.appendChild(list);
    return card;
  }

  createDiffViewer(path, args, output) {
    const container = document.createElement('div');
    container.className = 'diff-view-container';

    let target = (args && args.Target) || '';
    let replacement = (args && args.Replacement) || '';
    if (!target && args && args.Content) {
      replacement = args.Content;
    }

    const targetLines = target ? target.split('\n') : [];
    const repLines = replacement ? replacement.split('\n') : [];

    const delCount = targetLines.length;
    const addCount = repLines.length;

    let tableHtml = '<div class="diff-table">';
    tableHtml += `
      <div class="diff-line line-chunk">
        <span class="diff-marker">@@</span>
        <span class="diff-content">@@ -1,${delCount || 1} +1,${addCount || 1} @@ ${this.escapeHtml(path)}</span>
      </div>
    `;

    targetLines.forEach((line, i) => {
      tableHtml += `
        <div class="diff-line line-del">
          <span class="diff-gutter">${i + 1}</span>
          <span class="diff-marker">-</span>
          <span class="diff-content">${this.escapeHtml(line)}</span>
        </div>
      `;
    });

    repLines.forEach((line, i) => {
      tableHtml += `
        <div class="diff-line line-add">
          <span class="diff-gutter">${i + 1}</span>
          <span class="diff-marker">+</span>
          <span class="diff-content">${this.escapeHtml(line)}</span>
        </div>
      `;
    });

    tableHtml += '</div>';

    container.innerHTML = `
      <div class="diff-toolbar">
        <span class="diff-path">${this.escapeHtml(path || 'file')}</span>
        <div class="diff-stats">
          ${addCount ? `<span class="diff-stat-add">+${addCount}</span>` : ''}
          ${delCount ? `<span class="diff-stat-del">-${delCount}</span>` : ''}
        </div>
      </div>
      ${tableHtml}
    `;

    return container;
  }

  createTerminalOutput(cmd, output, isDone, duration) {
    const container = document.createElement('div');
    container.className = 'terminal-card-output';

    const isError = output && (output.includes('Command exited with code 1') || output.includes('exit status 1'));
    const exitBadge = isDone ?
      (isError ? '<span class="action-status-pill status-error">✕ exit 1</span>' : '<span class="action-status-pill status-success">✔ exit 0</span>') :
      '<span class="action-status-pill status-running">⚡ running</span>';

    container.innerHTML = `
      <div class="terminal-titlebar">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div class="terminal-dots">
            <span class="terminal-dot dot-red"></span>
            <span class="terminal-dot dot-yellow"></span>
            <span class="terminal-dot dot-green"></span>
          </div>
          <span class="terminal-cmd-display">$ ${this.escapeHtml(cmd)}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          ${exitBadge}
          <button class="batch-peek-btn btn-copy-terminal" title="Copy output">Copy</button>
        </div>
      </div>
      <pre class="terminal-text-block"><code>${this.escapeHtml(output || '(executing command...)')}</code></pre>
    `;

    const copyBtn = container.querySelector('.btn-copy-terminal');
    if (copyBtn) {
      copyBtn.onclick = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(output || cmd).then(() => {
          copyBtn.textContent = 'Copied!';
          setTimeout(() => copyBtn.textContent = 'Copy', 1500);
        });
      };
    }

    return container;
  }

  createActionCardElement(tc) {
    const card = document.createElement('div');
    const isDone = tc.state === 'DONE' || tc.output !== null;

    let category = 'cat-read';
    let iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>'; // FileSearch default

    if (this.isWriteTool(tc.name)) {
      category = 'cat-write';
      iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>'; // FileDiff
    } else if (this.isCommandTool(tc.name)) {
      category = 'cat-cmd';
      iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>'; // Terminal
    }

    card.className = `action-card ${category}`;

    const durMs = tc.duration_seconds ?
      (tc.duration_seconds < 1 ? `${Math.round(tc.duration_seconds * 1000)}ms` : `${tc.duration_seconds.toFixed(2)}s`) :
      (isDone ? 'done' : 'active');

    // Status pill determination
    let statusPill = '';
    const outputStr = tc.output || '';
    const isExitErr = outputStr.includes('Command exited with code 1') || outputStr.includes('exit status 1') || tc.state === 'ERROR';

    if (this.isCommandTool(tc.name)) {
      if (!isDone) {
        statusPill = '<span class="action-status-pill status-running">⚡ running</span>';
      } else if (isExitErr) {
        statusPill = '<span class="action-status-pill status-error">✕ exit 1</span>';
      } else {
        statusPill = '<span class="action-status-pill status-success">✔ exit 0</span>';
      }
    } else {
      if (!isDone) {
        statusPill = '<span class="action-status-pill status-running">⚡ running</span>';
      } else {
        statusPill = '<span class="action-status-pill status-success">✔ done</span>';
      }
    }

    const targetDesc = (tc.args && (tc.args.Path || tc.args.AbsolutePath || tc.args.CommandLine || tc.args.TargetFile)) || tc.summary || '';

    const header = document.createElement('div');
    header.className = 'action-header';
    header.innerHTML = `
      <div class="action-title-group">
        <span class="action-icon">${iconSvg}</span>
        <span class="action-name">${this.escapeHtml(tc.name)}</span>
        ${targetDesc ? `<span class="action-target" title="${this.escapeHtml(targetDesc)}">${this.escapeHtml(targetDesc)}</span>` : ''}
      </div>
      <div class="action-meta-right">
        <span class="action-duration">${durMs}</span>
        ${statusPill}
      </div>
    `;

    const body = document.createElement('div');
    body.className = 'action-body';
    body.style.display = isDone ? 'none' : 'block';

    if (this.isWriteTool(tc.name)) {
      body.appendChild(this.createDiffViewer(targetDesc, tc.args, tc.output));
    } else if (this.isCommandTool(tc.name)) {
      const cmd = (tc.args && tc.args.CommandLine) || targetDesc || 'run_command';
      body.appendChild(this.createTerminalOutput(cmd, tc.output, isDone, durMs));
    } else {
      const pre = document.createElement('pre');
      pre.className = 'terminal-text-block';
      pre.textContent = tc.output || (isDone ? '(Completed with empty output)' : '(Reading file...)');
      body.appendChild(pre);
    }

    header.onclick = () => {
      const isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : 'block';
      card.classList.toggle('open', !isOpen);
    };

    card.appendChild(header);
    card.appendChild(body);
    return card;
  }

  createMessageRowElement(msg) {
    if (msg.role === 'btw') {
      const row = document.createElement('div');
      row.className = 'message-row-btw';
      const interruptBadge = msg.interrupt ? '<span class="btw-badge-tag" style="border-color: #ef4444; color: #f87171;">INTERRUPTED</span>' : '';
      row.innerHTML = `
        <div class="btw-card">
          <div class="btw-header">
            <span class="btw-glow">⚡</span>
            <span>/btw Steering Instruction</span>
            <span class="btw-badge-tag">DELIVERED</span>
            ${interruptBadge}
            <span style="margin-left: auto; font-size: 10px; font-weight: normal; color: rgba(251, 191, 36, 0.7);">${new Date(msg.timestamp || Date.now()).toLocaleTimeString()}</span>
          </div>
          <div class="btw-body">${this.escapeHtml(msg.content)}</div>
        </div>
      `;
      return row;
    }

    const row = document.createElement('div');
    row.className = `message-row ${msg.role}`;

    const avatar = document.createElement('div');
    avatar.className = `avatar ${msg.role}`;
    if (msg.role === 'user') {
      avatar.textContent = '👤';
    } else {
      avatar.innerHTML = '<img src="/static/assets/antigravity-mark.svg" class="avatar-antigravity-img" alt="AGY" />';
    }

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    // Agent Reasoning Block (Chain of thought with quote style)
    if (msg.thinking && msg.thinking.trim()) {
      bubble.appendChild(this.createReasoningBlockElement(msg.thinking, msg.duration_seconds, msg.usage));
    }

    // Tool Calls with Smart Batch Aggregation & Semantic Categorization
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      const toolGroups = this.groupToolCalls(msg.tool_calls);
      toolGroups.forEach(group => {
        if (group.type === 'batch_reads') {
          bubble.appendChild(this.createBatchReadsElement(group.tools));
        } else if (group.type === 'single') {
          bubble.appendChild(this.createActionCardElement(group.tool));
        }
      });
    }

    // Message text
    if (msg.role === 'user') {
      const textEl = document.createElement('div');
      textEl.className = 'message-text markdown-body';
      textEl.textContent = msg.content;
      bubble.appendChild(textEl);
    } else {
      if (msg.content) {
        const textEl = document.createElement('div');
        textEl.className = 'message-text markdown-body';
        try {
          textEl.innerHTML = marked.parse(msg.content);
          this.attachCopyCodeButtons(textEl);
        } catch (e) {
          textEl.textContent = msg.content;
        }
        bubble.appendChild(textEl);
      } else if (msg.isStreaming) {
        const textEl = document.createElement('div');
        textEl.className = 'message-text markdown-body';
        textEl.innerHTML = '<span class="streaming-pulse"></span>';
        bubble.appendChild(textEl);
      }
    }

    // Metadata footer
    if (msg.usage || msg.duration_seconds) {
      const metaEl = document.createElement('div');
      metaEl.className = 'message-meta';
      const duration = msg.duration_seconds ? `${msg.duration_seconds.toFixed(1)}s` : '';
      const tokens = msg.usage ? `${msg.usage.output_tokens || 0} tokens` : '';
      metaEl.textContent = [duration, tokens].filter(Boolean).join(' • ');
      bubble.appendChild(metaEl);
    }

    row.appendChild(avatar);
    row.appendChild(bubble);
    return row;
  }

  updateStreamingMessageUI() {
    // Only update the last message row
    const rows = this.dom.chatInner.querySelectorAll('.message-row.assistant');
    if (rows.length === 0) return;
    const lastRow = rows[rows.length - 1];

    if (this.currentAssistantMessage) {
      const replacement = this.createMessageRowElement(this.currentAssistantMessage);
      lastRow.replaceWith(replacement);
      this.scrollToBottom();
    }
  }

  attachCopyCodeButtons(container) {
    container.querySelectorAll('pre').forEach(pre => {
      if (pre.querySelector('.btn-copy-code')) return;
      const btn = document.createElement('button');
      btn.className = 'btn-copy-code';
      btn.textContent = 'Copy';
      btn.onclick = () => {
        const code = pre.querySelector('code');
        navigator.clipboard.writeText(code ? code.innerText : pre.innerText).then(() => {
          btn.textContent = 'Copied!';
          setTimeout(() => btn.textContent = 'Copy', 2000);
        });
      };
      pre.appendChild(btn);
    });
  }

  scrollToBottom() {
    this.dom.chatScroll.scrollTop = this.dom.chatScroll.scrollHeight;
  }

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Unified Settings, Discord & Host Specs Modal Logic ---

  switchSettingsTab(tabId) {
    const tabs = document.querySelectorAll('.settings-tab-btn');
    const contents = document.querySelectorAll('.settings-tab-content');
    tabs.forEach(t => {
      if (t.getAttribute('data-tab') === tabId) {
        t.classList.add('active');
      } else {
        t.classList.remove('active');
      }
    });
    contents.forEach(c => {
      if (c.id === tabId) {
        c.classList.add('active');
      } else {
        c.classList.remove('active');
      }
    });
    if (tabId === 'tab-host') {
      this.loadSystemInfoForm();
    } else if (tabId === 'tab-branding') {
      this.loadBrandingForm();
    }
  }

  async openSettingsModal(activeTab = 'tab-general') {
    this.closeSidebar();
    if (this.dom.modalSettings) {
      this.dom.modalSettings.style.display = 'flex';
      this.switchSettingsTab(activeTab);
    }
    await Promise.all([
      this.loadSettingsForm(),
      this.loadDiscordForm(),
      this.loadBrandingForm(),
      this.loadSystemInfoForm()
    ]);
  }

  async openChannelsModal() {
    this.openSettingsModal('tab-discord');
  }

  async openSystemModal() {
    this.openSettingsModal('tab-host');
  }

  async loadSettingsForm() {
    try {
      const res = await fetch('/api/settings');
      const s = await res.json();
      const elModel = document.getElementById('settings-model');
      const elEffort = document.getElementById('settings-effort');
      const elMode = document.getElementById('settings-mode');
      const elCwd = document.getElementById('settings-cwd');
      const elSkip = document.getElementById('settings-skip-permissions');

      if (elModel && s.default_model !== undefined) elModel.value = s.default_model;
      if (elEffort && s.default_effort !== undefined) elEffort.value = s.default_effort;
      if (elMode && s.default_mode !== undefined) elMode.value = s.default_mode;
      if (elCwd && s.default_cwd !== undefined) elCwd.value = s.default_cwd;
      if (elSkip && s.dangerously_skip_permissions !== undefined) elSkip.checked = s.dangerously_skip_permissions;
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
  }

  async loadDiscordForm() {
    try {
      const res = await fetch('/api/settings');
      const s = await res.json();
      const elToggle = document.getElementById('discord-enable-toggle');
      const elToken = document.getElementById('discord-token-input');
      const elPrefix = document.getElementById('discord-prefix-input');
      const elChannels = document.getElementById('discord-channels-input');
      const elAutothread = document.getElementById('discord-autothread-toggle');

      if (elToggle) elToggle.checked = !!s.discord_enabled;
      if (elToken) {
        elToken.placeholder = s.discord_bot_token_set ? `Configured (${s.discord_bot_token_masked})` : 'Enter Discord Bot Token';
        elToken.value = '';
      }
      if (elPrefix) elPrefix.value = s.discord_prefix || '!agy';
      if (elChannels) elChannels.value = (s.discord_allowed_channels || []).join(', ');
      if (elAutothread) elAutothread.checked = !!s.discord_auto_thread;

      // Status card
      const chRes = await fetch('/api/channels');
      const channels = await chRes.json();
      const discord = channels.find(c => c.id === 'discord');
      const statusBox = document.getElementById('discord-live-status');
      if (discord && statusBox) {
        statusBox.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div>
              <span class="status-indicator ${discord.status}"></span>
              <strong>Discord Bot:</strong> <span style="text-transform:uppercase; font-weight:700;">${discord.status}</span>
            </div>
            ${discord.status === 'online' ? '<span class="brand-badge" style="background:rgba(0,185,92,0.15); color:var(--success);">ACTIVE</span>' : '<span class="brand-badge" style="background:rgba(252,65,61,0.15); color:var(--danger);">STOPPED</span>'}
          </div>
          <div style="font-size:13px; line-height:1.6; color:var(--text-secondary);">
            <strong>Bot User:</strong> ${discord.bot_user ? '@' + discord.bot_user : 'None'}<br>
            <strong>Connected Servers:</strong> ${discord.guilds || 0}<br>
            <strong>Tracked Threads:</strong> ${discord.tracked_threads || 0}
            ${discord.last_error ? `<br><span style="color:var(--danger)"><strong>Error:</strong> ${this.escapeHtml(discord.last_error)}</span>` : ''}
          </div>
        `;
      }
    } catch (e) {
      console.error('Failed to load discord info:', e);
    }
  }

  async loadSystemInfoForm() {
    const content = document.getElementById('system-info-content');
    if (!content) return;
    try {
      const res = await fetch('/api/system');
      const sys = await res.json();
      const cpuPct = sys.cpu ? sys.cpu.percent.toFixed(1) : 'N/A';
      const load1 = sys.cpu ? sys.cpu.load_1m : 'N/A';
      const load5 = sys.cpu ? sys.cpu.load_5m : 'N/A';
      const load15 = sys.cpu ? sys.cpu.load_15m : 'N/A';
      const memPct = sys.memory ? sys.memory.percent : 'N/A';
      const diskPct = sys.disk ? sys.disk.percent : 'N/A';

      content.innerHTML = `
        <div style="font-family: var(--font-mono); font-size: 13.5px; line-height: 1.8;">
          <strong>⚡ CPU Usage:</strong> ${cpuPct}% (${sys.cores} cores, Load: ${load1}, ${load5}, ${load15})<br>
          <strong>🧠 Memory (RAM):</strong> ${memPct}% (${sys.memory ? sys.memory.used_mb : 0} MB used of ${sys.memory ? sys.memory.total_mb : 0} MB)<br>
          <strong>💾 Disk Storage:</strong> ${diskPct}% (${sys.disk ? sys.disk.used_gb : 0} GB used of ${sys.disk ? sys.disk.total_gb : 0} GB)<br>
          <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 8px 0;">
          <strong>Host OS:</strong> ${sys.os || 'Linux'}<br>
          <strong>Python:</strong> ${sys.python || 'N/A'}<br>
          <strong>Antigravity Binary:</strong> ${sys.agy_bin || 'N/A'}<br>
        </div>
      `;
    } catch (e) {
      content.innerHTML = `<span style="color:var(--danger)">Error loading system specs: ${this.escapeHtml(String(e))}</span>`;
    }
  }

  async saveDiscordConfig() {
    const elToggle = document.getElementById('discord-enable-toggle');
    const elToken = document.getElementById('discord-token-input');
    const elPrefix = document.getElementById('discord-prefix-input');
    const elChannels = document.getElementById('discord-channels-input');
    const elAutothread = document.getElementById('discord-autothread-toggle');

    const enabled = elToggle ? elToggle.checked : false;
    const token = elToken ? elToken.value.trim() : '';
    const prefix = elPrefix ? elPrefix.value.trim() : '';
    const channelsStr = elChannels ? elChannels.value.trim() : '';
    const autoThread = elAutothread ? elAutothread.checked : false;

    const allowed_channels = channelsStr ? channelsStr.split(',').map(s => s.trim()).filter(Boolean) : [];

    const payload = {
      enabled,
      prefix: prefix || '!agy',
      allowed_channels,
      auto_thread: autoThread,
    };
    if (token) payload.token = token;

    try {
      const res = await fetch('/api/channels/discord/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        alert('Discord configuration updated successfully!');
        if (this.dom.modalSettings) this.dom.modalSettings.style.display = 'none';
        this.fetchChannels();
      }
    } catch (e) {
      alert('Error updating Discord config: ' + e);
    }
  }

  async saveSettings() {
    const elModel = document.getElementById('settings-model');
    const elEffort = document.getElementById('settings-effort');
    const elMode = document.getElementById('settings-mode');
    const elCwd = document.getElementById('settings-cwd');
    const elSkip = document.getElementById('settings-skip-permissions');

    const payload = {
      default_model: elModel ? elModel.value : 'gemini-3.8-flash-high',
      default_effort: elEffort ? elEffort.value : 'high',
      default_mode: elMode ? elMode.value : 'auto',
      default_cwd: elCwd ? elCwd.value : '',
      dangerously_skip_permissions: elSkip ? elSkip.checked : true,
    };
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      alert('Settings saved!');
      if (this.dom.modalSettings) this.dom.modalSettings.style.display = 'none';
    } catch (e) {
      alert('Error saving settings: ' + e);
    }
  }

  // --- Custom Branding System ---

  hexToRgba(hex, alpha = 1) {
    if (!hex) return `rgba(49, 134, 255, ${alpha})`;
    let c = hex.replace('#', '');
    if (c.length === 3) {
      c = c.split('').map(x => x + x).join('');
    }
    const num = parseInt(c, 16);
    if (isNaN(num)) return `rgba(49, 134, 255, ${alpha})`;
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  async fetchBranding() {
    try {
      const res = await fetch('/api/branding');
      if (res.ok) {
        const data = await res.json();
        this.branding = data;
        this.applyBranding(data);
        return;
      }
    } catch (e) {
      console.warn('Failed to fetch /api/branding, checking settings fallback:', e);
    }

    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const s = await res.json();
        this.branding = {
          brand_prefix: s.brand_prefix !== undefined ? s.brand_prefix : 'Google',
          brand_name: s.brand_name !== undefined ? s.brand_name : 'Antigravity',
          brand_badge: s.brand_badge !== undefined ? s.brand_badge : 'AGY 2.0',
          brand_title: s.brand_title !== undefined ? s.brand_title : 'Google Antigravity (agy)',
          brand_tagline: s.brand_tagline !== undefined ? s.brand_tagline : 'Autonomous AI agent for your homelab infrastructure. Monitor system health, manage containers, audit networks, and maintain server reliability.',
          brand_accent_color: s.brand_accent_color || '#3186FF',
          brand_accent_secondary: s.brand_accent_secondary || '#FFE432',
          brand_logo_url: s.brand_logo_url || '',
          brand_favicon_url: s.brand_favicon_url || '/static/assets/favicon.svg',
        };
        this.applyBranding(this.branding);
      }
    } catch (e) {
      console.warn('Failed to fetch fallback settings:', e);
    }
  }

  applyBranding(b) {
    if (!b) return;
    this.branding = b;

    // Document title
    if (b.brand_title) {
      document.title = b.brand_title;
    }

    // Favicon
    if (b.brand_favicon_url) {
      const fav = document.getElementById('app-favicon');
      if (fav) fav.href = b.brand_favicon_url;
    }

    // Sidebar Identity
    const elPrefix = document.getElementById('brand-prefix-text');
    if (elPrefix) elPrefix.textContent = b.brand_prefix || '';

    const elName = document.getElementById('brand-name-text');
    if (elName) elName.textContent = b.brand_name || 'Antigravity';

    const elBadge = document.getElementById('brand-badge-pill');
    if (elBadge) elBadge.textContent = b.brand_badge || 'AGY 2.0';

    // Logos in Sidebar & Header
    const customLogoImg = document.getElementById('sidebar-brand-custom-logo');
    const svgMark = document.getElementById('brand-svg-mark');
    const brandMarkWrapper = document.getElementById('brand-mark-wrapper');
    const headerMiniCustomLogo = document.getElementById('header-mini-custom-logo');
    const headerMiniSvg = document.getElementById('header-mini-svg-mark');
    const welcomeHeroSvg = document.getElementById('welcome-svg-mark');
    const welcomeHeroCustom = document.getElementById('welcome-hero-custom-logo');

    if (b.brand_logo_url) {
      if (brandMarkWrapper) brandMarkWrapper.classList.add('has-custom-logo');
      if (customLogoImg) {
        customLogoImg.src = b.brand_logo_url;
        customLogoImg.style.display = 'block';
      }
      if (svgMark) svgMark.style.display = 'none';
      if (headerMiniCustomLogo) {
        headerMiniCustomLogo.src = b.brand_logo_url;
        headerMiniCustomLogo.style.display = 'block';
      }
      if (headerMiniSvg) headerMiniSvg.style.display = 'none';
      if (welcomeHeroCustom) {
        welcomeHeroCustom.src = b.brand_logo_url;
        welcomeHeroCustom.style.display = 'block';
      }
      if (welcomeHeroSvg) welcomeHeroSvg.style.display = 'none';
    } else {
      if (brandMarkWrapper) brandMarkWrapper.classList.remove('has-custom-logo');
      if (customLogoImg) customLogoImg.style.display = 'none';
      if (svgMark) svgMark.style.display = 'block';
      if (headerMiniCustomLogo) headerMiniCustomLogo.style.display = 'none';
      if (headerMiniSvg) headerMiniSvg.style.display = 'block';
      if (welcomeHeroCustom) welcomeHeroCustom.style.display = 'none';
      if (welcomeHeroSvg) welcomeHeroSvg.style.display = 'block';
    }

    // Welcome Screen Brand Header
    const isDefaultBrand = (!b.brand_prefix || b.brand_prefix === 'Google') && (!b.brand_name || b.brand_name === 'Antigravity');
    const welcomeDark = document.getElementById('welcome-logo-dark');
    const welcomeLight = document.getElementById('welcome-logo-light');
    const welcomeCustom = document.getElementById('welcome-custom-brand');
    const welcomePrefix = document.getElementById('welcome-custom-prefix');
    const welcomeName = document.getElementById('welcome-custom-name');

    if (isDefaultBrand && !b.brand_logo_url) {
      if (welcomeDark) welcomeDark.style.display = '';
      if (welcomeLight) welcomeLight.style.display = '';
      if (welcomeCustom) welcomeCustom.style.display = 'none';
    } else {
      if (welcomeDark) welcomeDark.style.display = 'none';
      if (welcomeLight) welcomeLight.style.display = 'none';
      if (welcomeCustom) {
        welcomeCustom.style.display = 'flex';
        if (welcomePrefix) welcomePrefix.textContent = b.brand_prefix || '';
        if (welcomeName) welcomeName.textContent = b.brand_name || 'Antigravity';
      }
    }

    // Welcome Subtitle / Tagline
    if (b.brand_tagline) {
      const elSubtitle = document.getElementById('welcome-subtitle');
      if (elSubtitle) elSubtitle.textContent = b.brand_tagline;
    }

    // Dynamic Theme Accent Colors
    if (b.brand_accent_color) {
      const color = b.brand_accent_color;
      const root = document.documentElement;
      root.style.setProperty('--accent-primary', color);
      root.style.setProperty('--accent-cyan', color);
      root.style.setProperty('--google-blue', color);
      root.style.setProperty('--border-glow', this.hexToRgba(color, 0.28));
      root.style.setProperty('--accent-light', this.hexToRgba(color, 0.12));
      root.style.setProperty('--accent-glow', `0 0 20px ${this.hexToRgba(color, 0.35)}`);
      root.style.setProperty('--accent-gradient', `linear-gradient(135deg, ${color} 0%, ${this.hexToRgba(color, 0.85)} 100%)`);
    }

    if (b.brand_accent_secondary) {
      document.documentElement.style.setProperty('--google-yellow', b.brand_accent_secondary);
    }
  }

  async loadBrandingForm() {
    try {
      if (!this.branding) {
        const res = await fetch('/api/branding');
        if (res.ok) this.branding = await res.json();
      }
      const b = this.branding || {
        brand_prefix: 'Google',
        brand_name: 'Antigravity',
        brand_badge: 'AGY 2.0',
        brand_title: 'Google Antigravity (agy)',
        brand_tagline: 'Autonomous AI agent for your homelab infrastructure. Monitor system health, manage containers, audit networks, and maintain server reliability.',
        brand_accent_color: '#3186FF',
        brand_accent_secondary: '#FFE432',
        brand_logo_url: '',
        brand_favicon_url: '/static/assets/favicon.svg',
      };

      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val !== undefined && val !== null ? val : '';
      };

      setVal('brand-prefix-input', b.brand_prefix);
      setVal('brand-name-input', b.brand_name);
      setVal('brand-badge-input', b.brand_badge);
      setVal('brand-title-input', b.brand_title);
      setVal('brand-tagline-input', b.brand_tagline);
      setVal('brand-color-picker', b.brand_accent_color || '#3186FF');
      setVal('brand-color-hex', b.brand_accent_color || '#3186FF');
      setVal('brand-logo-input', b.brand_logo_url || '');
      setVal('brand-favicon-input', b.brand_favicon_url || '/static/assets/favicon.svg');

      this.updateBrandingPreview();
    } catch (e) {
      console.error('Failed to load branding form:', e);
    }
  }

  updateBrandingPreview() {
    const prefix = document.getElementById('brand-prefix-input')?.value || '';
    const name = document.getElementById('brand-name-input')?.value || 'Antigravity';
    const badge = document.getElementById('brand-badge-input')?.value || 'AGY 2.0';
    const tagline = document.getElementById('brand-tagline-input')?.value || '';
    const color = document.getElementById('brand-color-hex')?.value || '#3186FF';
    const logoUrl = document.getElementById('brand-logo-input')?.value || '';

    const elPrefix = document.getElementById('preview-prefix-display');
    const elName = document.getElementById('preview-name-display');
    const elBadge = document.getElementById('preview-badge-display');
    const elTagline = document.getElementById('preview-tagline-display');
    const iconBox = document.getElementById('preview-brand-icon-box');
    const svgMark = document.getElementById('preview-svg-mark');
    const customImg = document.getElementById('preview-custom-img');

    if (elPrefix) elPrefix.textContent = prefix;
    if (elName) elName.textContent = name;
    if (elBadge) elBadge.textContent = badge;
    if (elTagline) elTagline.textContent = tagline;

    if (iconBox) {
      iconBox.style.background = this.hexToRgba(color, 0.12);
      iconBox.style.borderColor = this.hexToRgba(color, 0.35);
      iconBox.style.boxShadow = 'none';
    }

    if (logoUrl) {
      if (customImg) {
        customImg.src = logoUrl;
        customImg.style.display = 'block';
      }
      if (svgMark) svgMark.style.display = 'none';
    } else {
      if (customImg) customImg.style.display = 'none';
      if (svgMark) svgMark.style.display = 'block';
      const path = svgMark?.querySelector('path');
      if (path) path.setAttribute('fill', color);
    }

    // Active state on preset swatches
    document.querySelectorAll('.swatch-btn').forEach(btn => {
      const btnColor = btn.getAttribute('data-color');
      if (btnColor && btnColor.toLowerCase() === color.toLowerCase()) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  async saveBranding() {
    const payload = {
      brand_prefix: document.getElementById('brand-prefix-input')?.value || '',
      brand_name: document.getElementById('brand-name-input')?.value || 'Antigravity',
      brand_badge: document.getElementById('brand-badge-input')?.value || 'AGY 2.0',
      brand_title: document.getElementById('brand-title-input')?.value || 'Google Antigravity (agy)',
      brand_tagline: document.getElementById('brand-tagline-input')?.value || '',
      brand_accent_color: document.getElementById('brand-color-hex')?.value || '#3186FF',
      brand_logo_url: document.getElementById('brand-logo-input')?.value || '',
      brand_favicon_url: document.getElementById('brand-favicon-input')?.value || '/static/assets/favicon.svg',
    };

    try {
      let res = await fetch('/api/branding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        // Seamless fallback to /api/settings if server hasn't restarted yet
        res = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      this.applyBranding(data.branding || payload);
      alert('Custom branding saved and applied successfully!');
      if (this.dom.modalSettings) this.dom.modalSettings.style.display = 'none';
    } catch (e) {
      alert('Error saving branding: ' + e);
    }
  }

  resetBranding() {
    const defaults = {
      brand_prefix: 'Google',
      brand_name: 'Antigravity',
      brand_badge: 'AGY 2.0',
      brand_title: 'Google Antigravity (agy)',
      brand_tagline: 'Autonomous AI agent for your homelab infrastructure. Monitor system health, manage containers, audit networks, and maintain server reliability.',
      brand_accent_color: '#3186FF',
      brand_accent_secondary: '#FFE432',
      brand_logo_url: '',
      brand_favicon_url: '/static/assets/favicon.svg',
    };

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val || '';
    };

    setVal('brand-prefix-input', defaults.brand_prefix);
    setVal('brand-name-input', defaults.brand_name);
    setVal('brand-badge-input', defaults.brand_badge);
    setVal('brand-title-input', defaults.brand_title);
    setVal('brand-tagline-input', defaults.brand_tagline);
    setVal('brand-color-picker', defaults.brand_accent_color);
    setVal('brand-color-hex', defaults.brand_accent_color);
    setVal('brand-logo-input', defaults.brand_logo_url);
    setVal('brand-favicon-input', defaults.brand_favicon_url);

    this.updateBrandingPreview();
  }

  async uploadBrandingLogo(file) {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/branding/logo', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (data.brand_logo_url) {
        const logoInput = document.getElementById('brand-logo-input');
        if (logoInput) logoInput.value = data.brand_logo_url;
        this.updateBrandingPreview();
        if (this.branding) this.branding.brand_logo_url = data.brand_logo_url;
        this.applyBranding(this.branding);
      }
    } catch (e) {
      alert('Failed to upload logo: ' + e);
    }
  }

  async fetchSystemMetrics() {
    try {
      const res = await fetch('/api/system');
      if (!res.ok) return;
      const data = await res.json();
      this.systemInfo = data;
      this.updateUsageMetersUI(data);
    } catch (e) {
      console.warn('Telemetry fetch error:', e);
    }
  }

  updateUsageMetersUI(data) {
    if (!data) return;

    // CPU Meter
    if (data.cpu) {
      const cpuPct = Math.max(0, Math.min(100, data.cpu.percent || 0));
      const cpuAscii = this.formatAsciiMeter(cpuPct, 8);
      if (this.dom.microCpuAscii) {
        this.dom.microCpuAscii.textContent = cpuAscii;
      }
      if (this.dom.meterCpuVal) {
        this.dom.meterCpuVal.textContent = `${Math.round(cpuPct)}%`;
      }
      if (this.dom.meterCpuBar) {
        this.dom.meterCpuBar.style.width = `${cpuPct}%`;
      }
      if (this.dom.headerCpuVal) {
        this.dom.headerCpuVal.textContent = `${Math.round(cpuPct)}%`;
      }
    }

    // RAM Meter
    if (data.memory) {
      const memPct = Math.max(0, Math.min(100, data.memory.percent || 0));
      const usedMb = data.memory.used_mb || 0;
      const totalMb = data.memory.total_mb || 1;
      const usedStr = usedMb >= 1024 ? (usedMb / 1024).toFixed(1) + ' GB' : Math.round(usedMb) + ' MB';
      const totalStr = totalMb >= 1024 ? (totalMb / 1024).toFixed(1) + ' GB' : Math.round(totalMb) + ' MB';
      const ramAscii = this.formatAsciiMeter(memPct, 8);

      if (this.dom.microRamAscii) {
        this.dom.microRamAscii.textContent = ramAscii;
      }
      if (this.dom.meterRamVal) {
        this.dom.meterRamVal.textContent = `${usedStr} / ${totalStr}`;
      }
      if (this.dom.meterRamBar) {
        this.dom.meterRamBar.style.width = `${memPct}%`;
      }
      if (this.dom.headerRamVal) {
        this.dom.headerRamVal.textContent = `${Math.round(memPct)}%`;
      }
    }

    // Disk Meter
    if (data.disk) {
      const diskPct = Math.max(0, Math.min(100, data.disk.percent || 0));
      const usedGb = data.disk.used_gb || 0;
      const totalGb = data.disk.total_gb || 1;

      if (this.dom.meterDiskVal) {
        this.dom.meterDiskVal.textContent = `${usedGb} / ${totalGb} GB (${Math.round(diskPct)}%)`;
      }
      if (this.dom.meterDiskBar) {
        this.dom.meterDiskBar.style.width = `${diskPct}%`;
      }
      if (this.dom.headerDiskVal) {
        this.dom.headerDiskVal.textContent = `${Math.round(diskPct)}%`;
      }
    }
  }

  // --- Quota & Telemetry Methods ---

  async fetchQuotaMetrics(force = false) {
    try {
      const url = force ? '/api/quota?refresh=true' : '/api/quota';
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      this.updateQuotaUI(data);
    } catch (e) {
      console.warn('Quota fetch error:', e);
    }
  }

  updateQuotaUI(data) {
    if (!data) return;
    const g5h = data.gemini_5h_percent;
    const gWeekly = data.gemini_weekly_percent;

    // Header Quota Pill
    if (this.dom.headerQuotaVal) {
      this.dom.headerQuotaVal.textContent = typeof g5h === 'number' ? `${g5h}%` : '--%';
    }

    if (this.dom.headerQuotaPill) {
      let title = 'Gemini Quota Remaining';
      if (typeof g5h === 'number') title += ` • 5-Hour: ${g5h}%`;
      if (data.gemini_5h_reset) title += ` (Resets: ${data.gemini_5h_reset})`;
      if (typeof gWeekly === 'number') title += ` • Weekly: ${gWeekly}%`;
      this.dom.headerQuotaPill.title = title;
    }

    // Sidebar 5-Hour Quota Meter Peek & Detail
    if (this.dom.meterQuotaVal) {
      this.dom.meterQuotaVal.textContent = typeof g5h === 'number' ? `${g5h}%` : '--%';
    }
    if (this.dom.meterQuotaSubVal) {
      this.dom.meterQuotaSubVal.textContent = typeof g5h === 'number' ? `${g5h}%` : '--%';
    }
    if (this.dom.meterQuotaBar) {
      const pct = typeof g5h === 'number' ? Math.max(0, Math.min(100, g5h)) : 0;
      this.dom.meterQuotaBar.style.width = `${pct}%`;
      this.dom.meterQuotaBar.classList.remove('meter-bar-high', 'meter-bar-med', 'meter-bar-low');
      if (pct > 50) {
        this.dom.meterQuotaBar.classList.add('meter-bar-low');
      } else if (pct > 20) {
        this.dom.meterQuotaBar.classList.add('meter-bar-med');
      } else {
        this.dom.meterQuotaBar.classList.add('meter-bar-high');
      }
    }
    if (this.dom.meterQuotaReset) {
      if (data.gemini_5h_reset) {
        let resetStr = data.gemini_5h_reset;
        try {
          const d = new Date(resetStr);
          if (!isNaN(d.getTime())) {
            resetStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
          }
        } catch (_) {}
        this.dom.meterQuotaReset.textContent = `Resets at ${resetStr}`;
      } else {
        this.dom.meterQuotaReset.textContent = '';
      }
    }

    // Sidebar Weekly Quota Meter
    if (this.dom.meterWeeklyQuotaVal) {
      this.dom.meterWeeklyQuotaVal.textContent = typeof gWeekly === 'number' ? `${gWeekly}%` : '--%';
    }
    if (this.dom.meterWeeklyQuotaBar) {
      const wpct = typeof gWeekly === 'number' ? Math.max(0, Math.min(100, gWeekly)) : 0;
      this.dom.meterWeeklyQuotaBar.style.width = `${wpct}%`;
    }
  }

  updateModelTelemetryUI() {
    const t = this.telemetry;
    const maxTokensRef = 100000;

    if (this.dom.meterInputVal) {
      this.dom.meterInputVal.textContent = `${t.inputTokens.toLocaleString()} tokens`;
    }
    if (this.dom.meterInputBar) {
      const pct = Math.min(100, Math.max(0, (t.inputTokens / maxTokensRef) * 100));
      this.dom.meterInputBar.style.width = `${pct}%`;
    }

    if (this.dom.meterOutputVal) {
      this.dom.meterOutputVal.textContent = `${t.outputTokens.toLocaleString()} tokens`;
    }
    if (this.dom.meterOutputBar) {
      const pct = Math.min(100, Math.max(0, (t.outputTokens / 8192) * 100));
      this.dom.meterOutputBar.style.width = `${pct}%`;
    }

    if (this.dom.meterThinkingVal) {
      this.dom.meterThinkingVal.textContent = `${t.thinkingTokens.toLocaleString()} tokens`;
    }
    if (this.dom.meterThinkingBar) {
      const pct = Math.min(100, Math.max(0, (t.thinkingTokens / 4096) * 100));
      this.dom.meterThinkingBar.style.width = `${pct}%`;
    }

    if (this.dom.meterCacheVal) {
      this.dom.meterCacheVal.textContent = `${t.cacheReadTokens.toLocaleString()} tokens`;
    }
    if (this.dom.meterCacheBar) {
      const pct = Math.min(100, Math.max(0, (t.cacheReadTokens / maxTokensRef) * 100));
      this.dom.meterCacheBar.style.width = `${pct}%`;
    }

    const total = t.totalTokens || (t.inputTokens + t.outputTokens);
    if (this.dom.telemetryTotalVal) {
      this.dom.telemetryTotalVal.textContent = `${total.toLocaleString()} tokens`;
    }
    if (this.dom.headerTokensVal) {
      const kVal = total >= 1000 ? `${(total / 1000).toFixed(1)}k` : `${total}`;
      this.dom.headerTokensVal.textContent = kVal;
    }

    if (this.dom.headerLatencyVal) {
      this.dom.headerLatencyVal.textContent = t.lastDuration > 0 ? `${t.lastDuration.toFixed(1)}s` : '--';
    }
  }

  // --- Live Action Status Banner ---

  startLiveBanner() {
    this.turnStartTime = Date.now();
    if (this.dom.liveCliBanner) {
      this.dom.liveCliBanner.style.display = 'flex';
    }
    if (this.dom.liveBannerAction) {
      this.dom.liveBannerAction.textContent = '🚀 Initializing Antigravity agent...';
    }
    if (this.dom.cliLiveIndicator) {
      this.dom.cliLiveIndicator.className = 'cli-live-indicator live';
      this.dom.cliLiveIndicator.textContent = 'LIVE';
    }
    if (this.dom.btnHeaderCli) {
      this.dom.btnHeaderCli.classList.add('active');
    }

    if (this.bannerTimerInterval) clearInterval(this.bannerTimerInterval);
    this.bannerTimerInterval = setInterval(() => {
      if (!this.turnStartTime || !this.dom.liveBannerTimer) return;
      const elapsed = ((Date.now() - this.turnStartTime) / 1000).toFixed(1);
      this.dom.liveBannerTimer.textContent = `${elapsed}s`;
    }, 100);
  }

  updateLiveBannerAction(text) {
    if (this.dom.liveBannerAction) {
      this.dom.liveBannerAction.textContent = text;
    }
  }

  stopLiveBanner() {
    if (this.bannerTimerInterval) {
      clearInterval(this.bannerTimerInterval);
      this.bannerTimerInterval = null;
    }
    if (this.dom.liveCliBanner) {
      this.dom.liveCliBanner.style.display = 'none';
    }
    if (this.dom.cliLiveIndicator) {
      this.dom.cliLiveIndicator.className = 'cli-live-indicator idle';
      this.dom.cliLiveIndicator.textContent = 'IDLE';
    }
    if (this.dom.btnHeaderCli && this.dom.cliConsoleDrawer && this.dom.cliConsoleDrawer.classList.contains('collapsed')) {
      this.dom.btnHeaderCli.classList.remove('active');
    }
  }

  // --- Live CLI Console Drawer ---

  toggleCliConsole(forceState) {
    if (!this.dom.cliConsoleDrawer) return;
    const isCollapsed = this.dom.cliConsoleDrawer.classList.contains('collapsed');
    const shouldOpen = forceState !== undefined ? forceState : isCollapsed;

    if (shouldOpen) {
      this.dom.cliConsoleDrawer.classList.remove('collapsed');
      if (this.dom.btnCliToggle) this.dom.btnCliToggle.textContent = '✕ Close';
      if (this.dom.btnHeaderCli) {
        this.dom.btnHeaderCli.classList.add('active');
        this.dom.btnHeaderCli.classList.add('drawer-open');
      }
      if (this.dom.cliConsoleBody) {
        this.dom.cliConsoleBody.scrollTop = this.dom.cliConsoleBody.scrollHeight;
      }
      if (!this.isGenerating && this.processes && this.processes.length > 0) {
        this.followActiveProcessOutput();
      }
    } else {
      this.dom.cliConsoleDrawer.classList.add('collapsed');
      if (this.dom.btnCliToggle) this.dom.btnCliToggle.textContent = '✕ Close';
      if (this.dom.btnHeaderCli) {
        this.dom.btnHeaderCli.classList.remove('drawer-open');
        const hasActiveProcs = (this.processes || []).some(p => p.state === 'R' || p.state === 'S' || p.is_engine_managed);
        if (!this.isGenerating && !hasActiveProcs) {
          this.dom.btnHeaderCli.classList.remove('active');
        }
      }
    }
  }

  toggleCliAutoScroll() {
    this.autoScrollConsole = !this.autoScrollConsole;
    if (this.dom.btnCliAutoscroll) {
      this.dom.btnCliAutoscroll.textContent = this.autoScrollConsole ? '📜 Scroll: ON' : '📜 Scroll: OFF';
      this.dom.btnCliAutoscroll.classList.toggle('active', this.autoScrollConsole);
    }
  }

  clearCliConsole() {
    if (this.dom.cliConsoleBody) {
      this.dom.cliConsoleBody.innerHTML = '<div class="cli-console-welcome">Console logs cleared. Ready for next turn.</div>';
    }
  }

  copyCliConsole() {
    if (!this.dom.cliConsoleBody) return;
    const text = this.dom.cliConsoleBody.innerText;
    navigator.clipboard.writeText(text).then(() => {
      if (this.dom.btnCliCopy) {
        const orig = this.dom.btnCliCopy.textContent;
        this.dom.btnCliCopy.textContent = '✔ Copied!';
        setTimeout(() => this.dom.btnCliCopy.textContent = orig, 1800);
      }
    });
  }

  appendCliLog(data) {
    if (!this.dom.cliConsoleBody) return;

    const welcome = this.dom.cliConsoleBody.querySelector('.cli-console-welcome');
    if (welcome) welcome.remove();

    const lineEl = document.createElement('div');
    const level = data.level || 'info';
    lineEl.className = `cli-log-line ${level}`;

    const now = data.timestamp ? new Date(data.timestamp * 1000) : new Date();
    const timeStr = now.toTimeString().split(' ')[0];

    const timeEl = document.createElement('span');
    timeEl.className = 'cli-log-time';
    timeEl.textContent = timeStr;

    const textEl = document.createElement('span');
    textEl.className = 'cli-log-text';
    textEl.textContent = data.message || '';

    lineEl.appendChild(timeEl);
    lineEl.appendChild(textEl);
    this.dom.cliConsoleBody.appendChild(lineEl);

    if (this.autoScrollConsole) {
      this.dom.cliConsoleBody.scrollTop = this.dom.cliConsoleBody.scrollHeight;
    }
  }

  applyMeterBarClass(barEl, pct) {
    barEl.classList.remove('warning', 'critical');
    if (pct >= 85) {
      barEl.classList.add('critical');
    } else if (pct >= 70) {
      barEl.classList.add('warning');
    }
  }

  // --- Process Manager & /btw Steering Methods ---

  openQuickBtwModal(convId = null, pid = null) {
    if (pid) {
      const p = (this.processes || []).find(x => x.pid === pid);
      if (p && p.conversation_id) {
        this.activeSteeringConvId = p.conversation_id;
      }
    } else if (convId) {
      this.activeSteeringConvId = convId;
    } else {
      this.activeSteeringConvId = this.activeConversationId;
    }

    if (this.dom.modalQuickBtw) {
      this.dom.modalQuickBtw.style.display = 'flex';
      if (this.dom.btwModalInput) {
        this.dom.btwModalInput.value = '';
        setTimeout(() => this.dom.btwModalInput.focus(), 50);
      }
    }
  }

  submitQuickBtw() {
    if (!this.dom.btwModalInput) return;
    const text = this.dom.btwModalInput.value.trim();
    if (!text) return;
    const interrupt = this.dom.btwInterruptToggle ? this.dom.btwInterruptToggle.checked : false;

    this.sendBtwSteering(text, interrupt, this.activeSteeringConvId);
    if (this.dom.modalQuickBtw) {
      this.dom.modalQuickBtw.style.display = 'none';
    }
  }

  async sendBtwSteering(message, interrupt = false, convId = null) {
    const targetConvId = convId || this.activeConversationId;
    if (!targetConvId) {
      alert('No active conversation to steer. Please select or start a session first.');
      return;
    }

    // Try WebSocket if connected
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({
          type: 'btw',
          message: message,
          interrupt: interrupt,
          conversation_id: targetConvId,
        }));
      } catch (e) {
        console.warn('WS send btw failed, falling back to REST:', e);
      }
    }

    // Always also POST to REST endpoint to guarantee delivery
    try {
      const res = await fetch('/api/processes/btw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: targetConvId,
          message: message,
          interrupt: interrupt,
        }),
      });
      const data = await res.json();
      if (data.status === 'injected' || data.status === 'ok') {
        this.appendBtwMessage(message, interrupt);
      }
    } catch (err) {
      console.error('Failed to post /btw steering:', err);
    }
  }

  appendBtwMessage(message, interrupt = false) {
    // Avoid duplicate if already appended recently
    const lastMsg = this.messages[this.messages.length - 1];
    if (lastMsg && lastMsg.role === 'btw' && lastMsg.content === message) {
      return;
    }

    const btwMsg = {
      role: 'btw',
      content: message,
      interrupt: interrupt,
      timestamp: new Date().toISOString(),
    };
    this.messages.push(btwMsg);

    if (this.dom.welcomeView) {
      this.dom.welcomeView.style.display = 'none';
    }

    const row = this.createMessageRowElement(btwMsg);
    this.dom.chatInner.appendChild(row);
    this.scrollToBottom();
  }

  openProcessesModal() {
    if (this.dom.modalProcesses) {
      this.dom.modalProcesses.style.display = 'flex';
      if (this.dom.btnHeaderProcesses) {
        this.dom.btnHeaderProcesses.classList.add('modal-open');
      }
      this.fetchProcesses();
    }
  }

  closeProcessesModal() {
    if (this.dom.modalProcesses) {
      this.dom.modalProcesses.style.display = 'none';
      if (this.dom.btnHeaderProcesses) {
        this.dom.btnHeaderProcesses.classList.remove('modal-open');
      }
    }
  }

  async fetchProcesses() {
    try {
      const res = await fetch('/api/processes');
      if (!res.ok) return;
      const data = await res.json();
      this.processes = Array.isArray(data) ? data : (data.processes || []);

      this.updateProcessesHeaderBadge();

      if (this.dom.modalProcesses && this.dom.modalProcesses.style.display === 'flex') {
        this.renderProcessesList();
      }
    } catch (err) {
      console.warn('Failed to fetch processes:', err);
    }
  }

  updateProcessesHeaderBadge() {
    const activeCount = this.processes.length;
    if (this.dom.procStatTotal) {
      this.dom.procStatTotal.textContent = activeCount;
    }
    const runningCount = this.processes.filter(p => p.state === 'R' || p.state === 'S' || p.is_engine_managed).length;
    if (this.dom.procStatActive) {
      this.dom.procStatActive.textContent = runningCount;
    }

    if (this.dom.processesCountBadge) {
      if (activeCount > 0) {
        this.dom.processesCountBadge.textContent = activeCount;
        this.dom.processesCountBadge.style.display = 'inline-block';
        this.dom.processesCountBadge.classList.add('has-active');
        if (this.dom.btnHeaderProcesses) {
          this.dom.btnHeaderProcesses.classList.add('has-active');
          this.dom.btnHeaderProcesses.classList.add('active');
        }
      } else {
        this.dom.processesCountBadge.style.display = 'none';
        this.dom.processesCountBadge.classList.remove('has-active');
        if (this.dom.btnHeaderProcesses) {
          this.dom.btnHeaderProcesses.classList.remove('has-active');
          this.dom.btnHeaderProcesses.classList.remove('active');
        }
      }
    }

    // Synchronize Follow terminal button with active execution state
    if (this.dom.btnHeaderCli && !this.isGenerating) {
      const isDrawerOpen = this.dom.cliConsoleDrawer && !this.dom.cliConsoleDrawer.classList.contains('collapsed');
      if (runningCount > 0) {
        this.dom.btnHeaderCli.classList.add('active');
        if (this.dom.cliLiveIndicator) {
          this.dom.cliLiveIndicator.className = 'cli-live-indicator live';
          const topProc = this.processes.find(p => p.state === 'R' || p.is_engine_managed) || this.processes[0];
          this.dom.cliLiveIndicator.textContent = `LIVE (${topProc.pid})`;
        }
      } else {
        if (!isDrawerOpen) {
          this.dom.btnHeaderCli.classList.remove('active');
        }
        if (this.dom.cliLiveIndicator) {
          this.dom.cliLiveIndicator.className = 'cli-live-indicator idle';
          this.dom.cliLiveIndicator.textContent = 'IDLE';
        }
      }
    }
  }

  async followActiveProcessOutput() {
    if (this.isGenerating) return;
    if (!this.processes || this.processes.length === 0) return;
    const activeProc = this.processes.find(p => p.state === 'R' || p.is_engine_managed) || this.processes[0];
    if (!activeProc) return;

    try {
      const res = await fetch(`/api/processes/${activeProc.pid}/output?limit=50`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data.lines || data.lines.length === 0) return;

      const welcome = this.dom.cliConsoleBody.querySelector('.cli-console-welcome');
      if (welcome || this.dom.cliConsoleBody.children.length === 0) {
        this.dom.cliConsoleBody.innerHTML = '';
        data.lines.forEach(l => {
          let lvl = 'info';
          if (l.type === 'error' || l.source === 'STDERR') lvl = 'error';
          else if (l.type === 'warning' || l.type === 'warn') lvl = 'warn';

          let msg = l.message || '';
          if (!msg && l.label) {
            msg = `[${l.label}] ${l.content || (l.tool_calls ? JSON.stringify(l.tool_calls) : '')}`;
          }
          if (msg) {
            this.appendCliLog({
              level: lvl,
              message: msg,
              timestamp: l.timestamp ? (new Date(l.timestamp).getTime() / 1000) : undefined,
            });
          }
        });
      }
    } catch (err) {
      console.warn('Failed to follow active process output:', err);
    }
  }

  renderProcessesList() {
    if (!this.dom.processesList) return;
    this.dom.processesList.innerHTML = '';

    if (this.processes.length === 0) {
      this.dom.processesList.innerHTML = `
        <div class="processes-empty-state">
          <div class="processes-empty-icon-circle">
            <span class="processes-empty-icon">⚡</span>
          </div>
          <div class="processes-empty-title">No Active Processes</div>
          <div class="processes-empty-desc">All Google Antigravity processes are currently idle. Interactive CLI sessions or background turns will be detected and monitored here automatically.</div>
        </div>
      `;
      return;
    }

    this.processes.forEach(proc => {
      const card = document.createElement('div');
      card.className = `process-card ${proc.is_engine_managed ? 'engine-managed' : ''}`;

      const stateBadge = proc.state === 'R' 
        ? '<span class="status-badge running"><span class="status-pulse-dot"></span> RUNNING</span>'
        : '<span class="status-badge idle">SLEEPING</span>';

      const managedBadge = proc.is_engine_managed 
        ? '<span class="status-badge managed">MANAGED</span>' 
        : '<span class="status-badge standalone">CLI</span>';

      const title = proc.conversation_title || 'Autonomous CLI Session';
      const promptSnippet = proc.prompt ? `
        <div class="proc-prompt-box">
          <span class="proc-prompt-label">PROMPT</span>
          <span class="proc-prompt-text">${this.escapeHtml(proc.prompt)}</span>
        </div>
      ` : '';

      card.innerHTML = `
        <div class="process-card-header">
          <div class="proc-header-info">
            <span class="proc-pid-pill">PID ${proc.pid}</span>
            <span class="proc-card-title" title="${this.escapeHtml(title)}">${this.escapeHtml(title)}</span>
            ${stateBadge}
            ${managedBadge}
          </div>
          <div class="proc-card-actions">
            <button class="btn-proc-action btn-proc-output" data-pid="${proc.pid}" title="Follow live terminal output">
              <span>💻</span> Follow
            </button>
            <button class="btn-proc-action btn-proc-btw" data-pid="${proc.pid}" data-conv="${proc.conversation_id || ''}">
              <span>⚡</span> /btw
            </button>
            ${proc.conversation_id ? `
            <button class="btn-proc-action btn-proc-attach" data-conv="${proc.conversation_id}">
              <span>🔗</span> Attach
            </button>` : ''}
            <button class="btn-proc-action btn-proc-stop" data-pid="${proc.pid}">
              <span>⏹</span> Stop
            </button>
          </div>
        </div>
        <div class="process-card-body">
          <div class="proc-metrics-grid">
            <div class="proc-metric-cell">
              <span class="proc-metric-label">Memory (RSS)</span>
              <span class="proc-metric-value">${proc.rss_mb} MB</span>
            </div>
            <div class="proc-metric-cell">
              <span class="proc-metric-label">Uptime</span>
              <span class="proc-metric-value">${proc.uptime_str || '0s'}</span>
            </div>
            <div class="proc-metric-cell">
              <span class="proc-metric-label">Model</span>
              <span class="proc-metric-value">${this.escapeHtml(proc.model || 'default')}</span>
            </div>
            <div class="proc-metric-cell">
              <span class="proc-metric-label">Mode / Effort</span>
              <span class="proc-metric-value">${this.escapeHtml(proc.mode || 'auto')} · ${this.escapeHtml(proc.effort || 'default')}</span>
            </div>
          </div>
          <div class="proc-cwd-row">
            <span class="proc-cwd-label">DIR:</span>
            <span class="proc-cwd-path" title="${this.escapeHtml(proc.cwd || '/')}">${this.escapeHtml(proc.cwd || '/')}</span>
          </div>
          ${promptSnippet}
        </div>
      `;

      // Event listeners for card buttons
      const btnOutput = card.querySelector('.btn-proc-output');
      if (btnOutput) {
        btnOutput.addEventListener('click', () => this.openProcessOutputModal(proc.pid, proc));
      }

      const btnBtw = card.querySelector('.btn-proc-btw');
      if (btnBtw) {
        btnBtw.addEventListener('click', () => {
          this.openQuickBtwModal(proc.conversation_id, proc.pid);
        });
      }

      const btnAttach = card.querySelector('.btn-proc-attach');
      if (btnAttach) {
        btnAttach.addEventListener('click', () => {
          this.attachToConversation(proc.conversation_id);
          this.closeProcessesModal();
        });
      }

      const btnStop = card.querySelector('.btn-proc-stop');
      if (btnStop) {
        btnStop.addEventListener('click', async () => {
          if (confirm(`Stop Antigravity process PID ${proc.pid}?`)) {
            await this.stopProcess(proc.pid);
          }
        });
      }

      this.dom.processesList.appendChild(card);
    });
  }

  attachToConversation(convId) {
    if (!convId) return;
    if (convId === this.activeConversationId) {
      return;
    }
    this.loadConversation(convId);
  }

  async openProcessOutputModal(pid, proc = null) {
    this.activeViewingPid = pid;
    if (!proc) {
      proc = (this.processes || []).find(p => p.pid === pid);
    }

    if (this.dom.procOutputTitle) {
      this.dom.procOutputTitle.textContent = `Follow Process (PID ${pid})`;
    }
    if (this.dom.procOutputSubtitle) {
      const convLabel = proc && proc.conversation_title ? `Session: ${proc.conversation_title} | ` : '';
      const cmdPreview = proc && proc.cmdline_str ? proc.cmdline_str.slice(0, 70) : 'agy process';
      this.dom.procOutputSubtitle.textContent = `${convLabel}${cmdPreview}`;
    }

    if (this.dom.modalProcessOutput) {
      this.dom.modalProcessOutput.style.display = 'flex';
    }

    await this.refreshProcessOutput(pid);
  }

  async refreshProcessOutput(pid) {
    if (!pid || !this.dom.procOutputTerminal) return;
    try {
      const res = await fetch(`/api/processes/${pid}/output`);
      if (!res.ok) return;
      const data = await res.json();
      this.renderProcessOutputTerminal(data.lines || []);
    } catch (err) {
      console.warn('Failed to refresh process output:', err);
    }
  }

  renderProcessOutputTerminal(lines) {
    if (!this.dom.procOutputTerminal) return;
    this.dom.procOutputTerminal.innerHTML = '';

    if (!lines || lines.length === 0) {
      this.dom.procOutputTerminal.innerHTML = `
        <div style="color: var(--text-muted); padding: 30px 20px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 8px;">
          <span style="font-size: 24px;">📡</span>
          <span style="font-size: 13px; color: var(--text-secondary);">Waiting for execution telemetry output or transcript steps...</span>
          <span style="font-size: 11.5px; color: var(--text-muted);">As the agent thinks and executes commands, steps will stream here in real time.</span>
        </div>
      `;
      return;
    }

    lines.forEach(l => {
      const stepDiv = document.createElement('div');
      const stepType = (l.type || 'info').toLowerCase();
      let extraClass = '';
      if (stepType === 'user_input') extraClass = 'user-input';
      else if (stepType.includes('tool') || l.tool_calls) extraClass = 'tool-call';
      else if (stepType === 'warning') extraClass = 'warning';
      else if (stepType === 'error') extraClass = 'error';

      stepDiv.className = `proc-output-step ${extraClass}`;

      const headerDiv = document.createElement('div');
      headerDiv.className = 'proc-step-header';
      headerDiv.innerHTML = `
        <span>${this.escapeHtml(l.label || l.type || 'STEP')}</span>
        <span>${l.timestamp ? new Date(l.timestamp).toLocaleTimeString() : ''}</span>
      `;

      const contentDiv = document.createElement('div');
      contentDiv.className = 'proc-step-content';

      if (l.content) {
        contentDiv.textContent = l.content;
      } else if (l.message) {
        contentDiv.textContent = l.message;
      } else if (l.tool_calls && l.tool_calls.length > 0) {
        const tcText = l.tool_calls.map(tc => `${tc.name}(${JSON.stringify(tc.args || {})})`).join('\n');
        contentDiv.textContent = tcText;
      } else if (l.thinking) {
        contentDiv.textContent = `[Thinking]: ${l.thinking}`;
      }

      stepDiv.appendChild(headerDiv);
      stepDiv.appendChild(contentDiv);
      this.dom.procOutputTerminal.appendChild(stepDiv);
    });

    this.dom.procOutputTerminal.scrollTop = this.dom.procOutputTerminal.scrollHeight;
  }

  async stopProcess(pid, force = false) {
    try {
      const res = await fetch(`/api/processes/${pid}/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: force }),
      });
      const data = await res.json();
      this.appendCliLog({
        level: 'warn',
        message: `[PROCESS ${pid}] > ${data.message || 'Stop command issued'}`,
        timestamp: Date.now() / 1000
      });
      await this.fetchProcesses();
    } catch (err) {
      console.error('Failed to stop process:', err);
    }
  }
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  window.app = new AgyApp();
});
