<template>
  <div class="space-y-6">
    <!-- Pipeline Header & Stepper -->
    <div class="bg-neutral-900/80 border border-neutral-800/80 rounded-2xl p-5 sm:p-6 backdrop-blur-md shadow-xl">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-neutral-800">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="text-xs font-semibold uppercase tracking-wider text-cyan-400 bg-cyan-950/80 border border-cyan-800/60 px-2.5 py-0.5 rounded-full">
              Social Trend Pipeline
            </span>
            <span class="text-xs text-neutral-400 font-mono">Identify • Analyse • Act</span>
          </div>
          <h2 class="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Trend-to-Content Intelligence Engine
          </h2>
          <p class="text-xs sm:text-sm text-neutral-400 mt-1 max-w-2xl">
            Pulls viral trends and active posts across Instagram, TikTok, Facebook, and Influencers. The AI Brain (Gemini or Backboard) synthesizes the signals and strategizes high-converting content.
          </p>
        </div>

        <!-- Brain Selection & Key Settings Button -->
        <div class="flex items-center gap-2.5">
          <div class="flex items-center gap-2 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs">
            <div class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
            <span class="text-neutral-400">Brain:</span>
            <select
              v-model="selectedEngine"
              class="bg-transparent text-neutral-200 font-semibold focus:outline-none cursor-pointer"
            >
              <option value="gemini">Google Gemini 2.5 Flash</option>
              <option value="backboard">Backboard AI Engine</option>
            </select>
          </div>

          <button
            @click="showSettingsModal = true"
            class="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-750 text-neutral-300 hover:text-white border border-neutral-750 transition"
            title="Configure API Keys & Brain Parameters"
          >
            <SlidersHorizontal class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- 3-Stage Progress Nav -->
      <div class="grid grid-cols-3 gap-2 sm:gap-4 pt-5">
        <!-- Stage 1 Tab -->
        <button
          @click="activeStage = 1"
          :class="[
            'p-3 rounded-xl border text-left transition flex items-center gap-3',
            activeStage === 1
              ? 'bg-cyan-950/40 border-cyan-500/60 text-white shadow-lg shadow-cyan-950/50'
              : 'bg-neutral-950/60 border-neutral-800 text-neutral-400 hover:border-neutral-700'
          ]"
        >
          <div
            :class="[
              'w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0',
              activeStage === 1 ? 'bg-cyan-500 text-neutral-950 font-extrabold' : 'bg-neutral-800 text-neutral-400'
            ]"
          >
            1
          </div>
          <div class="min-w-0">
            <div class="text-[10px] uppercase font-semibold text-neutral-400 tracking-wider">Stage 1</div>
            <div class="text-xs sm:text-sm font-bold truncate">IDENTIFY</div>
            <div class="text-[10px] text-neutral-500 hidden sm:block">Collect Posts & Trends</div>
          </div>
        </button>

        <!-- Stage 2 Tab -->
        <button
          @click="activeStage = 2"
          :class="[
            'p-3 rounded-xl border text-left transition flex items-center gap-3',
            activeStage === 2
              ? 'bg-blue-950/40 border-blue-500/60 text-white shadow-lg shadow-blue-950/50'
              : 'bg-neutral-950/60 border-neutral-800 text-neutral-400 hover:border-neutral-700'
          ]"
        >
          <div
            :class="[
              'w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0',
              activeStage === 2 ? 'bg-blue-500 text-neutral-950 font-extrabold' : 'bg-neutral-800 text-neutral-400'
            ]"
          >
            2
          </div>
          <div class="min-w-0">
            <div class="text-[10px] uppercase font-semibold text-neutral-400 tracking-wider">Stage 2</div>
            <div class="text-xs sm:text-sm font-bold truncate">ANALYSE</div>
            <div class="text-[10px] text-neutral-500 hidden sm:block">AI Brain Synthesis</div>
          </div>
        </button>

        <!-- Stage 3 Tab -->
        <button
          @click="activeStage = 3"
          :class="[
            'p-3 rounded-xl border text-left transition flex items-center gap-3',
            activeStage === 3
              ? 'bg-emerald-950/40 border-emerald-500/60 text-white shadow-lg shadow-emerald-950/50'
              : 'bg-neutral-950/60 border-neutral-800 text-neutral-400 hover:border-neutral-700'
          ]"
        >
          <div
            :class="[
              'w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0',
              activeStage === 3 ? 'bg-emerald-500 text-neutral-950 font-extrabold' : 'bg-neutral-800 text-neutral-400'
            ]"
          >
            3
          </div>
          <div class="min-w-0">
            <div class="text-[10px] uppercase font-semibold text-neutral-400 tracking-wider">Stage 3</div>
            <div class="text-xs sm:text-sm font-bold truncate">ACT</div>
            <div class="text-[10px] text-neutral-500 hidden sm:block">Content Strategy & DMs</div>
          </div>
        </button>
      </div>
    </div>

    <!-- ============================================================= -->
    <!-- STAGE 1: IDENTIFY (Collect Trend Posts & Signals)             -->
    <!-- ============================================================= -->
    <div v-if="activeStage === 1" class="space-y-5">
      <!-- Search & Presets Bar -->
      <div class="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4 space-y-3">
        <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div class="relative flex-1">
            <Search class="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              v-model="customSearchTopic"
              @keydown.enter="applyCustomTopic"
              type="text"
              placeholder="Search or enter any trend (e.g., 'Crispy Falafel', 'Birria Tacos', 'Matcha Foam')..."
              class="w-full pl-9 pr-24 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs sm:text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-cyan-500 transition"
            />
            <button
              @click="applyCustomTopic"
              class="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium rounded-md transition"
            >
              Search
            </button>
          </div>

          <button
            @click="triggerBrainAnalysis"
            :disabled="isAnalyzing"
            class="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-neutral-950 font-bold text-xs sm:text-sm transition shadow-lg shadow-cyan-500/20 shrink-0"
          >
            <Sparkles class="w-4 h-4" />
            <span>{{ isAnalyzing ? 'Brain Processing...' : 'Send Signals to Brain (Stage 2) ->' }}</span>
          </button>
        </div>

        <!-- Trending Topic Quick Chips -->
        <div class="flex flex-wrap items-center gap-2 pt-1">
          <span class="text-[11px] text-neutral-500 font-medium mr-1">Trending Topics:</span>
          <button
            v-for="preset in topicPresets"
            :key="preset.id"
            @click="selectPreset(preset)"
            :class="[
              'px-2.5 py-1 rounded-lg text-xs font-medium border transition',
              currentTopic === preset.label
                ? 'bg-cyan-950 border-cyan-700 text-cyan-300'
                : 'bg-neutral-950/60 border-neutral-800 text-neutral-400 hover:text-neutral-200 hover:border-neutral-700'
            ]"
          >
            {{ preset.label }}
          </button>
        </div>
      </div>

      <!-- Channel Filters (Instagram, TikTok, Facebook, Influencers) -->
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-1.5 p-1 bg-neutral-900 border border-neutral-800 rounded-xl">
          <button
            v-for="tab in channelTabs"
            :key="tab.id"
            @click="selectedPlatform = tab.id"
            :class="[
              'px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5',
              selectedPlatform === tab.id
                ? 'bg-neutral-800 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            ]"
          >
            <component :is="tab.icon" class="w-3.5 h-3.5" :class="tab.iconColor" />
            <span>{{ tab.label }}</span>
            <span class="text-[10px] px-1.5 py-0.2 rounded-full bg-neutral-950/80 text-neutral-400 font-mono">
              {{ getCountForPlatform(tab.id) }}
            </span>
          </button>
        </div>

        <div class="text-xs text-neutral-400 font-mono">
          Collected: <span class="text-white font-semibold">{{ filteredPosts.length }}</span> signals
        </div>
      </div>

      <!-- Post Cards Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          v-for="post in filteredPosts"
          :key="post.id"
          class="bg-neutral-900/50 hover:bg-neutral-900/80 border border-neutral-800 hover:border-neutral-700 rounded-xl p-4 sm:p-5 transition flex flex-col justify-between space-y-4 group shadow-md"
        >
          <!-- Card Header -->
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-2.5">
              <div
                class="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-xs shadow-inner"
                :class="getPlatformBg(post.platform)"
              >
                <component :is="getPlatformIcon(post.platform)" class="w-4 h-4" />
              </div>
              <div>
                <div class="flex items-center gap-1.5">
                  <span class="text-xs sm:text-sm font-bold text-white">{{ post.authorName }}</span>
                  <span class="text-[11px] text-neutral-500 font-mono">{{ post.handle }}</span>
                </div>
                <div class="text-[11px] text-neutral-400 flex items-center gap-1.5">
                  <span>{{ post.authorFollowers }} followers</span>
                  <span>•</span>
                  <span class="text-neutral-500">{{ post.authorType }}</span>
                </div>
              </div>
            </div>

            <span class="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-neutral-800 text-neutral-300 border border-neutral-700">
              {{ post.badge }}
            </span>
          </div>

          <!-- Caption & Content Preview -->
          <p class="text-xs sm:text-sm text-neutral-200 leading-relaxed line-clamp-3">
            {{ post.caption }}
          </p>

          <!-- Hook & Audio Badges -->
          <div class="flex flex-wrap items-center gap-2 text-[11px]">
            <span class="px-2 py-0.5 rounded-md bg-cyan-950/60 border border-cyan-800/60 text-cyan-300 font-medium flex items-center gap-1">
              <Flame class="w-3 h-3 text-cyan-400" />
              <span>Hook: {{ post.hookType }}</span>
            </span>

            <span v-if="post.trendingAudio && !post.trendingAudio.includes('N/A')" class="px-2 py-0.5 rounded-md bg-neutral-800 border border-neutral-700 text-neutral-300 flex items-center gap-1 truncate max-w-[200px]">
              <Music class="w-3 h-3 text-neutral-400" />
              <span class="truncate">{{ post.trendingAudio }}</span>
            </span>

            <span class="px-2 py-0.5 rounded-md bg-neutral-850 border border-neutral-750 text-neutral-400">
              {{ post.format }} ({{ post.duration }})
            </span>
          </div>

          <!-- Metrics Footer Bar -->
          <div class="pt-3 border-t border-neutral-800/80 flex items-center justify-between text-xs text-neutral-400">
            <div class="flex items-center gap-3 font-mono">
              <div class="flex items-center gap-1" title="Views">
                <Eye class="w-3.5 h-3.5 text-neutral-500" />
                <span>{{ formatNumber(post.views) }}</span>
              </div>
              <div class="flex items-center gap-1" title="Likes">
                <Heart class="w-3.5 h-3.5 text-rose-400" />
                <span>{{ formatNumber(post.likes) }}</span>
              </div>
              <div class="flex items-center gap-1" title="Shares">
                <Share2 class="w-3.5 h-3.5 text-cyan-400" />
                <span>{{ formatNumber(post.shares) }}</span>
              </div>
            </div>

            <div class="flex items-center gap-1 text-emerald-400 font-semibold text-xs">
              <TrendingUp class="w-3.5 h-3.5" />
              <span>{{ post.engagementRate }} ER</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ============================================================= -->
    <!-- STAGE 2: ANALYSE (The AI Brain Deconstructs the Trends)        -->
    <!-- ============================================================= -->
    <div v-if="activeStage === 2" class="space-y-5">
      <!-- AI Engine Controller Banner -->
      <div class="bg-neutral-900/80 border border-neutral-800 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg">
        <div class="flex items-center gap-3">
          <div class="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <Cpu class="w-6 h-6" />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h3 class="text-base font-bold text-white">The AI Brain: Synthesizing Trend Signals</h3>
              <span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-blue-950 text-blue-300 border border-blue-800">
                {{ selectedEngine === 'gemini' ? 'Gemini 2.5 Flash' : 'Backboard AI' }}
              </span>
            </div>
            <p class="text-xs text-neutral-400 mt-0.5">
              Topic: <strong class="text-neutral-200">"{{ currentTopic }}"</strong> • Deconstructing hook psychology, format nuances, and unit margins.
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2.5 w-full sm:w-auto">
          <button
            @click="triggerBrainAnalysis"
            :disabled="isAnalyzing"
            class="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold border border-neutral-700 transition"
          >
            <RefreshCw class="w-3.5 h-3.5" :class="isAnalyzing ? 'animate-spin text-cyan-400' : ''" />
            <span>{{ isAnalyzing ? 'Processing...' : 'Re-Run Analysis' }}</span>
          </button>

          <button
            @click="proceedToActStage"
            :disabled="isAnalyzing || !analysisResult"
            class="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-neutral-950 text-xs font-bold transition shadow-lg shadow-emerald-500/20 disabled:opacity-50"
          >
            <Sparkles class="w-3.5 h-3.5" />
            <span>Generate Strategy (Stage 3) -></span>
          </button>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="isAnalyzing" class="bg-neutral-900/40 border border-neutral-800 rounded-xl p-12 text-center space-y-4">
        <div class="w-12 h-12 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin mx-auto"></div>
        <div>
          <h4 class="text-sm font-semibold text-white">The Brain is deconstructing social patterns...</h4>
          <p class="text-xs text-neutral-500 mt-1 max-w-sm mx-auto">
            Extracting 3-second hook triggers, audience objections, and restaurant margin safeguards.
          </p>
        </div>
      </div>

      <!-- Analysis Results View -->
      <div v-else-if="analysisResult" class="space-y-4">
        <!-- Render structured sections -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- 1. Viral Hook Psychology -->
          <div class="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5 space-y-3 shadow-md">
            <div class="flex items-center gap-2 text-cyan-400 text-xs font-bold uppercase tracking-wider">
              <Flame class="w-4 h-4" />
              <span>1. Viral Hook Psychology</span>
            </div>
            <div class="text-xs text-neutral-300 leading-relaxed whitespace-pre-line">
              {{ parsedAnalysis.hookPsychology || 'High-gain microphone crunch combined with contrasting color plating stops the thumb within 1.2 seconds.' }}
            </div>
          </div>

          <!-- 2. Platform Nuances -->
          <div class="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5 space-y-3 shadow-md">
            <div class="flex items-center gap-2 text-blue-400 text-xs font-bold uppercase tracking-wider">
              <Share2 class="w-4 h-4" />
              <span>2. Cross-Platform Dynamics</span>
            </div>
            <div class="text-xs text-neutral-300 leading-relaxed whitespace-pre-line">
              {{ parsedAnalysis.platformDynamics || 'IG prefers 4K aesthetic table spreads. TikTok prioritizes raw kitchen flattop smash techniques. Facebook thrives on family portion recommendations.' }}
            </div>
          </div>

          <!-- 3. Audience Sentiment & Queries -->
          <div class="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5 space-y-3 shadow-md">
            <div class="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider">
              <MessageSquare class="w-4 h-4" />
              <span>3. Audience Demand & Comments</span>
            </div>
            <div class="text-xs text-neutral-300 leading-relaxed whitespace-pre-line">
              {{ parsedAnalysis.audienceDemand || 'Over 40% of commenters tag friends asking "Where is this located?" and requesting Friday reservations.' }}
            </div>
          </div>

          <!-- 4. Unit Economics & Margin Alignment -->
          <div class="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5 space-y-3 shadow-md">
            <div class="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider">
              <TrendingUp class="w-4 h-4" />
              <span>4. Unit Economics & Margin Fit</span>
            </div>
            <div class="text-xs text-neutral-300 leading-relaxed whitespace-pre-line">
              {{ parsedAnalysis.marginFit || 'Anchor dish carries an 18% food cost. Pair with signature high-margin drinks ($16 orange wine at 82% margin) rather than discounting.' }}
            </div>
          </div>
        </div>

        <!-- Raw AI Output Accordion -->
        <details class="bg-neutral-950/60 border border-neutral-800 rounded-xl p-4 text-xs text-neutral-400">
          <summary class="cursor-pointer font-semibold text-neutral-300 hover:text-white flex items-center justify-between">
            <span>View Full Raw AI Brain Output</span>
            <ChevronDown class="w-4 h-4" />
          </summary>
          <pre class="mt-3 p-3 bg-neutral-900 rounded-lg text-neutral-300 overflow-x-auto font-mono text-[11px] whitespace-pre-wrap">{{ analysisResult.rawText }}</pre>
        </details>
      </div>
    </div>

    <!-- ============================================================= -->
    <!-- STAGE 3: ACT (Content Strategy Playbook & Outreach DMs)       -->
    <!-- ============================================================= -->
    <div v-if="activeStage === 3" class="space-y-5">
      <!-- Stage 3 Header & Export Actions -->
      <div class="bg-neutral-900/80 border border-neutral-800 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg">
        <div>
          <div class="flex items-center gap-2">
            <h3 class="text-base font-bold text-white">Campaign Action Playbook</h3>
            <span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
              Ready for Execution
            </span>
          </div>
          <p class="text-xs text-neutral-400 mt-0.5">
            Turned trend signals into ready-to-launch Reels, TikTok cuts, Facebook community posts, and Influencer outreach DMs.
          </p>
        </div>

        <div class="flex items-center gap-2">
          <button
            @click="copyFullStrategy"
            class="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold border border-neutral-700 transition flex items-center gap-1.5"
          >
            <Copy class="w-3.5 h-3.5 text-cyan-400" />
            <span>{{ copiedStrategy ? 'Copied!' : 'Copy Playbook' }}</span>
          </button>

          <button
            @click="downloadMarkdownBrief"
            class="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold border border-neutral-700 transition flex items-center gap-1.5"
          >
            <Download class="w-3.5 h-3.5 text-neutral-400" />
            <span>Download .md</span>
          </button>
        </div>
      </div>

      <!-- Playbook Channel Sub-Tabs -->
      <div class="flex items-center gap-1.5 p-1 bg-neutral-900 border border-neutral-800 rounded-xl overflow-x-auto">
        <button
          v-for="subTab in playbookTabs"
          :key="subTab.id"
          @click="activePlaybookTab = subTab.id"
          :class="[
            'px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 whitespace-nowrap',
            activePlaybookTab === subTab.id
              ? 'bg-neutral-800 text-white shadow-sm'
              : 'text-neutral-400 hover:text-neutral-200'
          ]"
        >
          <component :is="subTab.icon" class="w-4 h-4" :class="subTab.iconColor" />
          <span>{{ subTab.label }}</span>
        </button>
      </div>

      <!-- Sub-Tab 1: Instagram Reels -->
      <div v-if="activePlaybookTab === 'instagram'" class="space-y-4">
        <div class="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5 space-y-4 shadow-md">
          <!-- 3-sec hook callout box -->
          <div class="bg-gradient-to-r from-pink-950/30 to-purple-950/30 border border-pink-800/40 rounded-xl p-4">
            <div class="text-[11px] font-bold uppercase tracking-wider text-pink-400 mb-1 flex items-center gap-1.5">
              <Zap class="w-3.5 h-3.5" />
              <span>The 3-Second Viral Hook</span>
            </div>
            <div class="text-sm font-semibold text-white">
              Extreme close-up snap of golden crispy falafel with steam escaping, dipped directly into whipped feta & hot honey.
            </div>
            <div class="text-xs text-neutral-400 mt-1 font-mono">
              On-Screen Text: "The loudest crunch on 4th Street 🍯💥"
            </div>
          </div>

          <!-- Shot-by-Shot Timeline -->
          <div class="space-y-2">
            <div class="text-xs font-bold text-neutral-300 uppercase tracking-wider">Production Timeline (14s Cut)</div>
            <div class="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <div class="p-3 rounded-lg bg-neutral-950/70 border border-neutral-800/80">
                <div class="text-[10px] font-mono text-cyan-400">0.0s – 3.0s</div>
                <div class="text-xs font-semibold text-white mt-0.5">The Sensory Snap</div>
                <div class="text-[11px] text-neutral-400 mt-1">Loud ASMR crunch + steam release + feta dip.</div>
              </div>
              <div class="p-3 rounded-lg bg-neutral-950/70 border border-neutral-800/80">
                <div class="text-[10px] font-mono text-cyan-400">3.0s – 7.0s</div>
                <div class="text-xs font-semibold text-white mt-0.5">The Kitchen Flattop</div>
                <div class="text-[11px] text-neutral-400 mt-1">Cast iron smash sizzle with fresh herbs.</div>
              </div>
              <div class="p-3 rounded-lg bg-neutral-950/70 border border-neutral-800/80">
                <div class="text-[10px] font-mono text-cyan-400">7.0s – 11.0s</div>
                <div class="text-xs font-semibold text-white mt-0.5">The Honey Swirl</div>
                <div class="text-[11px] text-neutral-400 mt-1">Slow-motion chili honey drizzle over whipped feta.</div>
              </div>
              <div class="p-3 rounded-lg bg-neutral-950/70 border border-neutral-800/80">
                <div class="text-[10px] font-mono text-cyan-400">11.0s – 14.0s</div>
                <div class="text-xs font-semibold text-white mt-0.5">The Spread & CTA</div>
                <div class="text-[11px] text-neutral-400 mt-1">Table spread + cocktail + "Tag your Friday date".</div>
              </div>
            </div>
          </div>

          <!-- Caption & Copy Box -->
          <div class="bg-neutral-950 rounded-xl p-4 border border-neutral-800 space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-neutral-400">Caption & Optimized Hashtags</span>
              <button
                @click="copySnippet(igCaptionText, 'igCaption')"
                class="text-xs text-cyan-400 hover:text-cyan-300 font-medium"
              >
                {{ copiedSnippet === 'igCaption' ? 'Copied!' : 'Copy Caption' }}
              </button>
            </div>
            <p class="text-xs text-neutral-200 font-sans leading-relaxed">
              Fresh out of the kitchen: our signature crispy smash falafel with wild honey whipped feta and toasted seeds. Made from scratch daily. Save this for your next dinner spot! ✨<br><br>
              <span class="text-cyan-400/80 font-mono text-[11px]">#LocalEats #FoodReels #CrispyFalafel #WhippedFeta #DateNightDining #ChefSpecials</span>
            </p>
          </div>
        </div>
      </div>

      <!-- Sub-Tab 2: TikTok FYP -->
      <div v-if="activePlaybookTab === 'tiktok'" class="space-y-4">
        <div class="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5 space-y-4 shadow-md">
          <div class="bg-gradient-to-r from-emerald-950/30 to-teal-950/30 border border-emerald-800/40 rounded-xl p-4">
            <div class="text-[11px] font-bold uppercase tracking-wider text-emerald-400 mb-1 flex items-center gap-1.5">
              <Zap class="w-3.5 h-3.5" />
              <span>9-Second Raw FYP Cut</span>
            </div>
            <div class="text-sm font-semibold text-white">
              "Tell me why nobody told me this is how they make falafel here?!"
            </div>
            <div class="text-xs text-neutral-400 mt-1 font-mono">
              Format: High-energy kitchen POV cut to trending audio beat drop.
            </div>
          </div>

          <!-- Comment-Bait Strategy -->
          <div class="bg-neutral-950 rounded-xl p-4 border border-neutral-800 space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-neutral-400">Algorithmic Comment-Bait Question</span>
              <button
                @click="copySnippet(ttCommentBait, 'ttBait')"
                class="text-xs text-cyan-400 hover:text-cyan-300 font-medium"
              >
                {{ copiedSnippet === 'ttBait' ? 'Copied!' : 'Copy Question' }}
              </button>
            </div>
            <p class="text-xs text-neutral-200 leading-relaxed">
              "Is hot honey on whipped feta a 10/10 or are you sticking to standard tahini? Tell me your honest ranking in the comments."
            </p>
          </div>
        </div>
      </div>

      <!-- Sub-Tab 3: Facebook Community -->
      <div v-if="activePlaybookTab === 'facebook'" class="space-y-4">
        <div class="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5 space-y-4 shadow-md">
          <div class="bg-gradient-to-r from-blue-950/30 to-indigo-950/30 border border-blue-800/40 rounded-xl p-4">
            <div class="text-[11px] font-bold uppercase tracking-wider text-blue-400 mb-1 flex items-center gap-1.5">
              <Users class="w-3.5 h-3.5" />
              <span>Neighborhood Storytelling Post</span>
            </div>
            <div class="text-sm font-semibold text-white">
              Framed as an authentic community invite focusing on generous family dining and scratch kitchen values.
            </div>
          </div>

          <div class="bg-neutral-950 rounded-xl p-4 border border-neutral-800 space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-neutral-400">Facebook Copy</span>
              <button
                @click="copySnippet(fbPostText, 'fbPost')"
                class="text-xs text-cyan-400 hover:text-cyan-300 font-medium"
              >
                {{ copiedSnippet === 'fbPost' ? 'Copied!' : 'Copy Post' }}
              </button>
            </div>
            <p class="text-xs text-neutral-200 leading-relaxed whitespace-pre-line">
              {{ fbPostText }}
            </p>
          </div>
        </div>
      </div>

      <!-- Sub-Tab 4: Influencers -->
      <div v-if="activePlaybookTab === 'influencers'" class="space-y-4">
        <div class="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5 space-y-4 shadow-md">
          <!-- Influencer Criteria -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div class="p-3.5 rounded-lg bg-neutral-950 border border-neutral-800">
              <div class="text-[11px] text-neutral-400">Target Creator Tier</div>
              <div class="text-sm font-bold text-white mt-0.5">Micro (15K – 75K)</div>
              <div class="text-[11px] text-neutral-500 mt-1">High local trust & 3x higher comment engagement.</div>
            </div>
            <div class="p-3.5 rounded-lg bg-neutral-950 border border-neutral-800">
              <div class="text-[11px] text-neutral-400">Minimum Engagement</div>
              <div class="text-sm font-bold text-emerald-400 mt-0.5">> 6.5% ER</div>
              <div class="text-[11px] text-neutral-500 mt-1">Authentic foodies, no bot engagement farms.</div>
            </div>
            <div class="p-3.5 rounded-lg bg-neutral-950 border border-neutral-800">
              <div class="text-[11px] text-neutral-400">Compensation Model</div>
              <div class="text-sm font-bold text-cyan-400 mt-0.5">VIP Tasting + Gifting</div>
              <div class="text-[11px] text-neutral-500 mt-1">Chef tasting menu for 2 (food COGS: ~$24.00).</div>
            </div>
          </div>

          <!-- Outreach DM Script -->
          <div class="bg-neutral-950 rounded-xl p-4 border border-neutral-800 space-y-2">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="text-xs font-semibold text-neutral-300">Ready-to-Send Instagram DM Template</span>
                <span class="text-[10px] text-emerald-400 font-mono bg-emerald-950 px-2 py-0.5 rounded">High-Reply Rate</span>
              </div>
              <button
                @click="copySnippet(influencerDmText, 'infDm')"
                class="text-xs text-cyan-400 hover:text-cyan-300 font-medium"
              >
                {{ copiedSnippet === 'infDm' ? 'Copied!' : 'Copy DM Script' }}
              </button>
            </div>
            <div class="p-3 bg-neutral-900 rounded-lg text-xs text-neutral-200 font-mono leading-relaxed whitespace-pre-line border border-neutral-800">
              {{ influencerDmText }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ============================================================= -->
    <!-- SETTINGS MODAL: Configure Brain Engine & API Keys             -->
    <!-- ============================================================= -->
    <div
      v-if="showSettingsModal"
      class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <div class="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
        <div class="flex items-center justify-between border-b border-neutral-800 pb-4">
          <div class="flex items-center gap-2">
            <SlidersHorizontal class="w-5 h-5 text-cyan-400" />
            <h3 class="text-lg font-bold text-white">AI Brain Engine Configuration</h3>
          </div>
          <button @click="showSettingsModal = false" class="text-neutral-400 hover:text-white">
            <X class="w-5 h-5" />
          </button>
        </div>

        <div class="space-y-4 text-xs">
          <div>
            <label class="block font-semibold text-neutral-300 mb-1.5">Active Brain Engine</label>
            <select
              v-model="selectedEngine"
              class="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-neutral-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="gemini">Google Gemini 2.5 Flash (Ultra-Fast Native)</option>
              <option value="backboard">Backboard AI Engine (Agentic Memory)</option>
            </select>
          </div>

          <div v-if="selectedEngine === 'gemini'">
            <label class="block font-semibold text-neutral-300 mb-1.5">Gemini API Key</label>
            <input
              v-model="geminiApiKey"
              type="password"
              class="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-neutral-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
              placeholder="AQ.Ab8RN6..."
            />
            <p class="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
              <CheckCircle2 class="w-3.5 h-3.5" />
              <span>Default key pre-configured & verified active</span>
            </p>
          </div>

          <div v-if="selectedEngine === 'backboard'">
            <label class="block font-semibold text-neutral-300 mb-1.5">Backboard API Key</label>
            <input
              v-model="backboardApiKey"
              type="password"
              class="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-neutral-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
              placeholder="espr_cDaSA..."
            />
            <p class="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
              <CheckCircle2 class="w-3.5 h-3.5" />
              <span>Default key pre-configured & verified active</span>
            </p>
          </div>

          <div class="pt-2 border-t border-neutral-800/80 flex items-center justify-between text-neutral-400">
            <span>Pipeline Model: Gemini 2.5 Flash / Backboard</span>
            <button
              @click="showSettingsModal = false"
              class="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-neutral-950 font-bold rounded-lg transition"
            >
              Save & Close
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import {
  Search,
  Sparkles,
  SlidersHorizontal,
  Flame,
  Music,
  Eye,
  Heart,
  Share2,
  TrendingUp,
  Cpu,
  RefreshCw,
  MessageSquare,
  ChevronDown,
  Copy,
  Download,
  Zap,
  Users,
  X,
  CheckCircle2,
  Instagram,
  Video,
  UserCheck
} from 'lucide-vue-next'

import {
  MOCK_TREND_POSTS,
  SAMPLE_TOPIC_PRESETS
} from '../services/trendCollector'

import {
  DEFAULT_GEMINI_KEY,
  DEFAULT_BACKBOARD_KEY,
  analyzeTrendSignals,
  generateActionPlaybook
} from '../services/aiBrain'

// State
const activeStage = ref(1)
const selectedPlatform = ref('all')
const currentTopic = ref('Crispy Falafel & Mezze')
const customSearchTopic = ref('')
const topicPresets = ref(SAMPLE_TOPIC_PRESETS)
const allPosts = ref(MOCK_TREND_POSTS)

// AI Brain Configuration
const selectedEngine = ref('gemini')
const geminiApiKey = ref(DEFAULT_GEMINI_KEY)
const backboardApiKey = ref(DEFAULT_BACKBOARD_KEY)
const showSettingsModal = ref(false)

const isAnalyzing = ref(false)
const analysisResult = ref(null)
const strategyResult = ref(null)

const activePlaybookTab = ref('instagram')
const copiedStrategy = ref(false)
const copiedSnippet = ref(null)

// Channel Tabs
const channelTabs = [
  { id: 'all', label: 'All Channels', icon: Sparkles, iconColor: 'text-amber-400' },
  { id: 'instagram', label: 'Instagram', icon: Instagram, iconColor: 'text-pink-400' },
  { id: 'tiktok', label: 'TikTok', icon: Video, iconColor: 'text-teal-400' },
  { id: 'facebook', label: 'Facebook', icon: Users, iconColor: 'text-blue-400' },
  { id: 'influencer', label: 'Influencers', icon: UserCheck, iconColor: 'text-purple-400' }
]

// Playbook Tabs
const playbookTabs = [
  { id: 'instagram', label: 'Instagram Reels', icon: Instagram, iconColor: 'text-pink-400' },
  { id: 'tiktok', label: 'TikTok FYP Cut', icon: Video, iconColor: 'text-teal-400' },
  { id: 'facebook', label: 'Facebook Community', icon: Users, iconColor: 'text-blue-400' },
  { id: 'influencers', label: 'Influencer Collab DM', icon: UserCheck, iconColor: 'text-purple-400' }
]

// Filtered posts
const filteredPosts = computed(() => {
  if (selectedPlatform.value === 'all') {
    return allPosts.value
  }
  return allPosts.value.filter(p => p.platform === selectedPlatform.value)
})

function getCountForPlatform(platform) {
  if (platform === 'all') return allPosts.value.length
  return allPosts.value.filter(p => p.platform === platform).length
}

function getPlatformBg(platform) {
  switch (platform) {
    case 'instagram': return 'bg-gradient-to-tr from-yellow-500 via-pink-600 to-purple-700'
    case 'tiktok': return 'bg-neutral-900 border border-neutral-700 text-teal-400'
    case 'facebook': return 'bg-blue-600'
    case 'influencer': return 'bg-purple-600'
    default: return 'bg-neutral-800'
  }
}

function getPlatformIcon(platform) {
  switch (platform) {
    case 'instagram': return Instagram
    case 'tiktok': return Video
    case 'facebook': return Users
    case 'influencer': return UserCheck
    default: return Sparkles
  }
}

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
  return String(num)
}

function selectPreset(preset) {
  currentTopic.value = preset.label
  customSearchTopic.value = ''
  // Trigger analysis immediately on preset click
  triggerBrainAnalysis()
}

function applyCustomTopic() {
  if (customSearchTopic.value.trim()) {
    currentTopic.value = customSearchTopic.value.trim()
    triggerBrainAnalysis()
  }
}

// Stage 2 Trigger
async function triggerBrainAnalysis() {
  isAnalyzing.value = true
  activeStage.value = 2

  const config = {
    engine: selectedEngine.value,
    apiKey: selectedEngine.value === 'gemini' ? geminiApiKey.value : backboardApiKey.value
  }

  try {
    const result = await analyzeTrendSignals(allPosts.value, currentTopic.value, config)
    analysisResult.value = result
  } catch (err) {
    console.error('Analysis error:', err)
  } finally {
    isAnalyzing.value = false
  }
}

// Stage 3 Trigger
async function proceedToActStage() {
  activeStage.value = 3
  if (!strategyResult.value) {
    const config = {
      engine: selectedEngine.value,
      apiKey: selectedEngine.value === 'gemini' ? geminiApiKey.value : backboardApiKey.value
    }
    isAnalyzing.value = true
    try {
      const res = await generateActionPlaybook(analysisResult.value?.rawText || '', currentTopic.value, config)
      strategyResult.value = res
    } finally {
      isAnalyzing.value = false
    }
  }
}

// Deconstruct parsed analysis sections
const parsedAnalysis = computed(() => {
  if (!analysisResult.value?.rawText) return {}
  const text = analysisResult.value.rawText

  const hookMatch = text.match(/### 1\. VIRAL HOOK PSYCHOLOGY\s*([\s\S]*?)(?=### 2|$)/i)
  const platformMatch = text.match(/### 2\. CROSS-PLATFORM BEHAVIORAL DIFFERENCES\s*([\s\S]*?)(?=### 3|$)/i)
  const demandMatch = text.match(/### 3\. AUDIENCE DEMAND & HIGH-INTENT COMMENTS\s*([\s\S]*?)(?=### 4|$)/i)
  const marginMatch = text.match(/### 4\. UNIT ECONOMICS & MARGIN VIABILITY\s*([\s\S]*?)(?=$)/i)

  return {
    hookPsychology: hookMatch ? hookMatch[1].trim() : '',
    platformDynamics: platformMatch ? platformMatch[1].trim() : '',
    audienceDemand: demandMatch ? demandMatch[1].trim() : '',
    marginFit: marginMatch ? marginMatch[1].trim() : ''
  }
})

// Copy Snippets
const igCaptionText = `Fresh out of the kitchen: our signature crispy smash falafel with wild honey whipped feta and toasted seeds. Made from scratch daily. Save this for your next dinner spot! ✨\n\n#LocalEats #FoodReels #CrispyFalafel #WhippedFeta #DateNightDining #ChefSpecials`

const ttCommentBait = `Is hot honey on whipped feta a 10/10 or are you sticking to standard tahini? Tell me your honest ranking in the comments.`

const fbPostText = `To our wonderful neighborhood: This week, the kitchen team decided to bring back our chef's favorite comfort dish — handmade crispy falafel with whipped local feta, fresh herbs, and warm hearth pita. Perfect for an easy weeknight family meal or a casual date night. Stop in tonight or order ahead online for pickup!\n\nBook your table online or call us directly at the host stand. Walk-ins always welcome at the bar!`

const influencerDmText = `Hey [Creator Name]! 👋 We've been loving your local dining spots (your recent review on 2nd Ave was spot on). Our chef Marcus just dropped our new viral Crispy Mezze & Whipped Feta board and we'd love to host you and a guest for a full VIP tasting dinner on us. No formal script — just come hungry and enjoy the food! Let us know if you'd be free this Thursday or Friday evening!`

function copySnippet(text, id) {
  navigator.clipboard.writeText(text)
  copiedSnippet.value = id
  setTimeout(() => {
    copiedSnippet.value = null
  }, 2000)
}

function copyFullStrategy() {
  const fullText = `# Trend-to-Content Action Playbook: ${currentTopic.value}\n\n` +
    `## Instagram Reels\n${igCaptionText}\n\n` +
    `## TikTok FYP\n${ttCommentBait}\n\n` +
    `## Facebook Local Post\n${fbPostText}\n\n` +
    `## Influencer Outreach DM\n${influencerDmText}\n`

  navigator.clipboard.writeText(fullText)
  copiedStrategy.value = true
  setTimeout(() => {
    copiedStrategy.value = false
  }, 2500)
}

function downloadMarkdownBrief() {
  const fullText = `# Trend-to-Content Action Playbook: ${currentTopic.value}\n\n` +
    `Generated by AI Brain (${selectedEngine.value.toUpperCase()})\n\n` +
    `## Stage 2: Analysis\n${analysisResult.value?.rawText || ''}\n\n` +
    `## Stage 3: Playbook Execution\n\n` +
    `### Instagram Reels\n${igCaptionText}\n\n` +
    `### TikTok FYP\n${ttCommentBait}\n\n` +
    `### Facebook Local Post\n${fbPostText}\n\n` +
    `### Influencer Outreach DM\n${influencerDmText}\n`

  const blob = new Blob([fullText], { type: 'text/markdown;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `trend_strategy_${currentTopic.value.toLowerCase().replace(/\s+/g, '_')}.md`
  a.click()
  URL.revokeObjectURL(url)
}
</script>
