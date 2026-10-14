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
    
    // DOM Elements
    this.dom = {
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
      btnChannels: document.getElementById('btn-channels'),
      btnSettings: document.getElementById('btn-settings'),
      btnSystem: document.getElementById('btn-system'),
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
      headerCpuVal: document.getElementById('header-cpu-val'),
      headerRamVal: document.getElementById('header-ram-val'),
      headerDiskVal: document.getElementById('header-disk-val'),

      // Quota Elements
      meterQuotaVal: document.getElementById('meter-quota-val'),
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
      modalChannels: document.getElementById('modal-channels'),
      modalSettings: document.getElementById('modal-settings'),
      modalSystem: document.getElementById('modal-system'),
      modalDesignSystem: document.getElementById('modal-design-system'),
      btnDesignKit: document.getElementById('btn-design-kit'),
      btnHeaderDesign: document.getElementById('btn-header-design'),
    };

    this.currentTheme = 'dark';
    this.init();
  }

  async init() {
    this.initTheme();
    this.updateGreeting();
    this.bindEvents();
    this.setupMarkdown();
    await this.fetchInitialSettings();
    await this.fetchModels();
    await this.fetchChannels();
    await this.fetchConversations();
    await this.fetchSystemMetrics();
    await this.fetchQuotaMetrics();
    this.updateModelTelemetryUI();
    
    // Auto-poll channels status every 10s
    setInterval(() => this.fetchChannels(), 10000);
    // Auto-poll system status every 4s
    setInterval(() => this.fetchSystemMetrics(), 4000);
    // Auto-poll quota limits every 45s
    setInterval(() => this.fetchQuotaMetrics(), 45000);
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
        this.sendMessage();
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

    // Quota Refresh & Pill Trigger
    if (this.dom.btnRefreshQuota) {
      this.dom.btnRefreshQuota.addEventListener('click', () => this.fetchQuotaMetrics(true));
    }
    if (this.dom.headerQuotaPill) {
      this.dom.headerQuotaPill.addEventListener('click', () => {
        this.fetchQuotaMetrics(true);
        if (this.dom.tabBtnQuota) this.dom.tabBtnQuota.click();
      });
    }

    // Modal Triggers
    if (this.dom.btnDesignKit) {
      this.dom.btnDesignKit.addEventListener('click', () => this.openDesignSystemModal());
    }
    if (this.dom.btnHeaderDesign) {
      this.dom.btnHeaderDesign.addEventListener('click', () => this.openDesignSystemModal());
    }
    this.setupDesignSystemEvents();

    this.dom.btnChannels.addEventListener('click', () => this.openChannelsModal());
    this.dom.discordPill.addEventListener('click', () => this.openChannelsModal());
    this.dom.btnSettings.addEventListener('click', () => this.openSettingsModal());
    this.dom.btnSystem.addEventListener('click', () => this.openSystemModal());

    // Modal Close buttons
    document.querySelectorAll('.btn-close-modal, .btn-modal-cancel').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal-overlay');
        if (modal) modal.style.display = 'none';
      });
    });

    // Discord save button
    document.getElementById('btn-save-discord').addEventListener('click', () => this.saveDiscordConfig());
    // Settings save button
    document.getElementById('btn-save-settings').addEventListener('click', () => this.saveSettings());
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
        this.dom.discordStatusText.textContent = `Discord: ${discord.status.toUpperCase()}`;
        this.dom.discordIndicator.className = `status-indicator ${discord.status}`;
        if (discord.status === 'online' && discord.bot_user) {
          this.dom.discordStatusText.textContent = `Discord: @${discord.bot_user}`;
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
    if (!prompt || this.isGenerating) return;

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
    const type = data.type;

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
      } else if (data.state === 'DONE') {
        const dur = data.duration_seconds ? ` in ${data.duration_seconds.toFixed(2)}s` : '';
        this.updateLiveBannerAction(`✔ Completed ${data.tool_name}${dur}`);
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
    this.dom.promptInput.disabled = val;
    if (!val) {
      this.currentAssistantMessage = null;
      this.dom.promptInput.focus();
    }
  }

  // --- Rendering UI ---

  renderConversationList() {
    this.dom.convList.innerHTML = '';
    if (this.conversations.length === 0) {
      this.dom.convList.innerHTML = '<div style="padding: 12px; font-size: 12px; color: var(--text-muted); text-align: center;">No conversations yet</div>';
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
      title.textContent = conv.title || 'Conversation';

      const meta = document.createElement('div');
      meta.className = 'conv-item-meta';
      const timeStr = conv.updated_at ? new Date(conv.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      meta.textContent = `${conv.step_count || 0} turns • ${timeStr}`;

      content.appendChild(title);
      content.appendChild(meta);

      const delBtn = document.createElement('button');
      delBtn.className = 'conv-item-delete';
      delBtn.title = 'Delete Conversation';
      delBtn.innerHTML = '🗑️';
      delBtn.onclick = (e) => this.deleteConversation(conv.id, e);

      item.appendChild(content);
      item.appendChild(delBtn);
      this.dom.convList.appendChild(item);
    });
  }

  renderChatMessages() {
    if (this.messages.length === 0) {
      this.dom.welcomeView.style.display = 'flex';
      this.dom.chatInner.querySelectorAll('.message-row').forEach(e => e.remove());
      return;
    }

    this.dom.welcomeView.style.display = 'none';
    this.dom.chatInner.querySelectorAll('.message-row').forEach(e => e.remove());

    this.messages.forEach(msg => {
      const row = this.createMessageRowElement(msg);
      this.dom.chatInner.appendChild(row);
    });

    this.scrollToBottom();
  }

  createMessageRowElement(msg) {
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

    // Thinking process if present
    if (msg.thinking && msg.thinking.trim()) {
      const thinkingCard = document.createElement('div');
      thinkingCard.className = 'thinking-card';
      thinkingCard.innerHTML = `
        <div class="thinking-header" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'">
          <span>💭 Thinking process</span>
          <span>▼</span>
        </div>
        <div class="thinking-body" style="display: none;">${this.escapeHtml(msg.thinking)}</div>
      `;
      bubble.appendChild(thinkingCard);
    }

    // Tool calls
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      msg.tool_calls.forEach(tc => {
        const toolCard = document.createElement('div');
        toolCard.className = 'tool-card';
        const isDone = tc.state === 'DONE' || tc.output !== null;
        const statusClass = isDone ? 'done' : 'active';
        const durStr = tc.duration_seconds ? ` (${tc.duration_seconds.toFixed(2)}s)` : '';
        const statusLabel = isDone ? `✔ DONE${durStr}` : '⚡ RUNNING';

        let icon = '⚙️';
        if (tc.name === 'run_command') icon = '⚡';
        else if (tc.name.includes('view_file') || tc.name.includes('read_')) icon = '📖';
        else if (tc.name.includes('write_') || tc.name.includes('replace_') || tc.name.includes('sed_') || tc.name.includes('edit')) icon = '✏️';
        else if (tc.name.includes('web') || tc.name.includes('url') || tc.name.includes('browser')) icon = '🌐';

        const summaryText = tc.summary || (tc.args && (tc.args.CommandLine || tc.args.AbsolutePath || tc.args.TargetFile || ''));
        const titleHtml = summaryText ?
          `<span>${icon} <strong>${this.escapeHtml(tc.name)}</strong> <code class="tool-header-action">${this.escapeHtml(summaryText)}</code></span>` :
          `<span>${icon} <strong>${this.escapeHtml(tc.name)}</strong></span>`;

        let paramsStr = '';
        if (tc.args) {
          paramsStr = typeof tc.args === 'object' ? JSON.stringify(tc.args, null, 2) : String(tc.args);
        }

        let outputContent = tc.output || (isDone ? '(Completed with empty output)' : '(Executing command in terminal...)');

        let bodyHtml = '';
        if (tc.name === 'run_command') {
          const cmdLine = (tc.args && tc.args.CommandLine) ? tc.args.CommandLine : summaryText || 'run_command';
          bodyHtml = `
            <div class="tool-terminal-box">
              <div class="terminal-cmd-bar">
                <span class="terminal-cmd-text">$ ${this.escapeHtml(cmdLine)}</span>
              </div>
              <pre class="terminal-out-text"><code>${this.escapeHtml(outputContent)}</code></pre>
            </div>
          `;
        } else {
          bodyHtml = `
<strong>Parameters:</strong>
${this.escapeHtml(paramsStr)}

<strong>Output:</strong>
${this.escapeHtml(outputContent)}
          `;
        }

        toolCard.innerHTML = `
          <div class="tool-header" onclick="const b = this.nextElementSibling; b.style.display = b.style.display === 'none' ? 'block' : 'none'">
            <div class="tool-title">
              ${titleHtml}
            </div>
            <span class="tool-status-badge ${statusClass}">${statusLabel}</span>
          </div>
          <div class="tool-body" style="${isDone ? 'display: none;' : 'display: block;'}">
            ${bodyHtml}
          </div>
        `;
        bubble.appendChild(toolCard);
      });
    }

    // Message text
    const textEl = document.createElement('div');
    textEl.className = 'message-text markdown-body';

    if (msg.role === 'user') {
      textEl.textContent = msg.content;
    } else {
      if (msg.content) {
        textEl.innerHTML = marked.parse(msg.content);
        this.attachCopyCodeButtons(textEl);
      } else if (msg.isStreaming) {
        textEl.innerHTML = '<span class="streaming-pulse"></span>';
      }
    }
    bubble.appendChild(textEl);

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

  // --- Modal Logic ---

  async openChannelsModal() {
    this.dom.modalChannels.style.display = 'flex';
    try {
      const res = await fetch('/api/settings');
      const s = await res.json();
      document.getElementById('discord-enable-toggle').checked = s.discord_enabled;
      document.getElementById('discord-token-input').placeholder = s.discord_bot_token_set ? `Configured (${s.discord_bot_token_masked})` : 'Enter Discord Bot Token';
      document.getElementById('discord-token-input').value = '';
      document.getElementById('discord-prefix-input').value = s.discord_prefix || '!agy';
      document.getElementById('discord-channels-input').value = (s.discord_allowed_channels || []).join(', ');
      document.getElementById('discord-autothread-toggle').checked = s.discord_auto_thread || false;

      // Status card
      const chRes = await fetch('/api/channels');
      const channels = await chRes.json();
      const discord = channels.find(c => c.id === 'discord');
      const statusBox = document.getElementById('discord-live-status');
      if (discord) {
        statusBox.innerHTML = `
          <strong>Status:</strong> <span class="status-indicator ${discord.status}"></span> ${discord.status.toUpperCase()}<br>
          <strong>Bot User:</strong> ${discord.bot_user || 'None'}<br>
          <strong>Connected Servers:</strong> ${discord.guilds}<br>
          <strong>Tracked Threads:</strong> ${discord.tracked_threads}
          ${discord.last_error ? `<br><span style="color:var(--danger)"><strong>Error:</strong> ${discord.last_error}</span>` : ''}
        `;
      }
    } catch (e) {
      console.error(e);
    }
  }

  async saveDiscordConfig() {
    const enabled = document.getElementById('discord-enable-toggle').checked;
    const token = document.getElementById('discord-token-input').value.trim();
    const prefix = document.getElementById('discord-prefix-input').value.trim();
    const channelsStr = document.getElementById('discord-channels-input').value.trim();
    const autoThread = document.getElementById('discord-autothread-toggle').checked;

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
        this.dom.modalChannels.style.display = 'none';
        this.fetchChannels();
      }
    } catch (e) {
      alert('Error updating Discord config: ' + e);
    }
  }

  async openSettingsModal() {
    this.dom.modalSettings.style.display = 'flex';
    try {
      const res = await fetch('/api/settings');
      const s = await res.json();
      document.getElementById('settings-model').value = s.default_model;
      document.getElementById('settings-effort').value = s.default_effort;
      document.getElementById('settings-mode').value = s.default_mode;
      document.getElementById('settings-cwd').value = s.default_cwd;
      document.getElementById('settings-skip-permissions').checked = s.dangerously_skip_permissions;
    } catch (e) {
      console.error(e);
    }
  }

  async saveSettings() {
    const payload = {
      default_model: document.getElementById('settings-model').value,
      default_effort: document.getElementById('settings-effort').value,
      default_mode: document.getElementById('settings-mode').value,
      default_cwd: document.getElementById('settings-cwd').value,
      dangerously_skip_permissions: document.getElementById('settings-skip-permissions').checked,
    };
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      alert('Settings saved!');
      this.dom.modalSettings.style.display = 'none';
    } catch (e) {
      alert('Error saving settings: ' + e);
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
      const cpuFormatted = cpuPct.toFixed(1);
      if (this.dom.meterCpuVal) {
        this.dom.meterCpuVal.textContent = `${cpuFormatted}% (${data.cores || 1} cores)`;
      }
      if (this.dom.meterCpuBar) {
        this.dom.meterCpuBar.style.width = `${cpuPct}%`;
        this.applyMeterBarClass(this.dom.meterCpuBar, cpuPct);
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

      if (this.dom.meterRamVal) {
        this.dom.meterRamVal.textContent = `${Math.round(memPct)}% (${usedStr} / ${totalStr})`;
      }
      if (this.dom.meterRamBar) {
        this.dom.meterRamBar.style.width = `${memPct}%`;
        this.applyMeterBarClass(this.dom.meterRamBar, memPct);
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
        this.dom.meterDiskVal.textContent = `${Math.round(diskPct)}% (${usedGb} / ${totalGb} GB)`;
      }
      if (this.dom.meterDiskBar) {
        this.dom.meterDiskBar.style.width = `${diskPct}%`;
        this.applyMeterBarClass(this.dom.meterDiskBar, diskPct);
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

    // Sidebar 5-Hour Quota Meter
    if (this.dom.meterQuotaVal) {
      this.dom.meterQuotaVal.textContent = typeof g5h === 'number' ? `${g5h}% remaining` : '--';
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
      this.dom.meterWeeklyQuotaVal.textContent = typeof gWeekly === 'number' ? `${gWeekly}% remaining` : '--';
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
      if (this.dom.btnCliToggle) this.dom.btnCliToggle.textContent = '▼ Close';
      if (this.dom.btnHeaderCli) this.dom.btnHeaderCli.classList.add('active');
      if (this.dom.cliConsoleBody) {
        this.dom.cliConsoleBody.scrollTop = this.dom.cliConsoleBody.scrollHeight;
      }
    } else {
      this.dom.cliConsoleDrawer.classList.add('collapsed');
      if (this.dom.btnCliToggle) this.dom.btnCliToggle.textContent = '▲ Open';
      if (this.dom.btnHeaderCli && !this.isGenerating) this.dom.btnHeaderCli.classList.remove('active');
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

  async openSystemModal() {
    this.dom.modalSystem.style.display = 'flex';
    try {
      const res = await fetch('/api/system');
      const sys = await res.json();
      const cpuPct = sys.cpu ? sys.cpu.percent.toFixed(1) : 'N/A';
      const load1 = sys.cpu ? sys.cpu.load_1m : 'N/A';
      const load5 = sys.cpu ? sys.cpu.load_5m : 'N/A';
      const load15 = sys.cpu ? sys.cpu.load_15m : 'N/A';
      const memPct = sys.memory ? sys.memory.percent : 'N/A';
      const diskPct = sys.disk ? sys.disk.percent : 'N/A';

      document.getElementById('system-info-content').innerHTML = `
        <div style="font-family: var(--font-mono); font-size: 13.5px; line-height: 1.8;">
          <strong>⚡ CPU Usage:</strong> ${cpuPct}% (${sys.cores} cores, Load: ${load1}, ${load5}, ${load15})<br>
          <strong>🧠 Memory (RAM):</strong> ${memPct}% (${sys.memory.used_mb} MB used of ${sys.memory.total_mb} MB)<br>
          <strong>💾 Disk Storage:</strong> ${diskPct}% (${sys.disk.used_gb} GB used of ${sys.disk.total_gb} GB)<br>
          <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 8px 0;">
          <strong>Host OS:</strong> ${sys.os}<br>
          <strong>Python:</strong> ${sys.python}<br>
          <strong>Antigravity Binary:</strong> ${sys.agy_bin}<br>
        </div>
      `;
    } catch (e) {
      console.error(e);
    }
  }

  openDesignSystemModal() {
    if (this.dom.modalDesignSystem) {
      this.dom.modalDesignSystem.style.display = 'flex';
    }
  }

  setupDesignSystemEvents() {
    // Tabs switching
    const tabs = document.querySelectorAll('.design-tab-btn');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const targetId = tab.getAttribute('data-design-tab');
        document.querySelectorAll('.design-tab-content').forEach(c => c.classList.remove('active'));
        const target = document.getElementById(targetId);
        if (target) target.classList.add('active');
      });
    });

    // Font variable sliders
    const sliderWght = document.getElementById('slider-wght');
    const sliderOpsz = document.getElementById('slider-opsz');
    const valWght = document.getElementById('val-slider-wght');
    const valOpsz = document.getElementById('val-slider-opsz');
    const fontPreview = document.getElementById('font-live-preview');

    const updateFontPreview = () => {
      if (!fontPreview) return;
      const wght = sliderWght ? sliderWght.value : 500;
      const opsz = sliderOpsz ? sliderOpsz.value : 24;
      if (valWght) valWght.textContent = wght;
      if (valOpsz) valOpsz.textContent = opsz;
      fontPreview.style.fontVariationSettings = `'wght' ${wght}, 'opsz' ${opsz}`;
    };

    if (sliderWght) sliderWght.addEventListener('input', updateFontPreview);
    if (sliderOpsz) sliderOpsz.addEventListener('input', updateFontPreview);

    // SVG Copy buttons
    document.querySelectorAll('.btn-copy-svg').forEach(btn => {
      btn.addEventListener('click', async () => {
        const src = btn.getAttribute('data-src');
        try {
          const res = await fetch(src);
          const svgText = await res.text();
          await navigator.clipboard.writeText(svgText);
          const origText = btn.textContent;
          btn.textContent = '✓ Copied SVG!';
          btn.style.color = 'var(--success)';
          setTimeout(() => {
            btn.textContent = origText;
            btn.style.color = '';
          }, 2000);
        } catch (err) {
          console.error('Failed to copy SVG:', err);
        }
      });
    });

    // Color Swatch click-to-copy
    document.querySelectorAll('.color-swatch-card').forEach(card => {
      card.addEventListener('click', async () => {
        const hex = card.getAttribute('data-color');
        if (hex) {
          try {
            await navigator.clipboard.writeText(hex);
            const hexEl = card.querySelector('.swatch-hex');
            const orig = hexEl ? hexEl.textContent : hex;
            if (hexEl) hexEl.textContent = '✓ Copied!';
            setTimeout(() => {
              if (hexEl) hexEl.textContent = orig;
            }, 1800);
          } catch (err) {
            console.error('Failed to copy hex:', err);
          }
        }
      });
    });
  }
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  window.app = new AgyApp();
});
