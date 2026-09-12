<template>
  <div class="min-h-screen flex flex-col bg-neutral-950 text-neutral-100 selection:bg-cyan-500/20 selection:text-cyan-200">
    <!-- Top Navigation Bar -->
    <header class="border-b border-neutral-800/80 bg-neutral-900/60 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-6 py-3">
      <div class="max-w-7xl mx-auto flex items-center justify-between">
        <!-- Logo -->
        <div class="flex items-center gap-3">
          <div class="h-9 w-9 rounded-xl bg-gradient-to-br from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 ring-1 ring-white/10">
            <Zap class="w-5 h-5 text-white" />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="font-extrabold tracking-tight text-white text-lg">MiseEnVue</span>
              <span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800/60 tracking-wider">
                Trend Intelligence & CSV
              </span>
            </div>
          </div>
        </div>

        <!-- Center View Mode Switcher -->
        <div class="flex items-center gap-1 bg-neutral-950/80 border border-neutral-800 p-1 rounded-xl shadow-inner">
          <button
            @click="currentView = 'pipeline'"
            :class="[
              'flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition',
              currentView === 'pipeline'
                ? 'bg-neutral-800 text-white shadow-sm border border-neutral-700/60'
                : 'text-neutral-400 hover:text-neutral-200'
            ]"
          >
            <Sparkles class="w-3.5 h-3.5 text-cyan-400" />
            <span>Trend Pipeline (Identify • Analyse • Act)</span>
          </button>

          <button
            @click="currentView = 'csv'"
            :class="[
              'flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition',
              currentView === 'csv'
                ? 'bg-neutral-800 text-white shadow-sm border border-neutral-700/60'
                : 'text-neutral-400 hover:text-neutral-200'
            ]"
          >
            <FileSpreadsheet class="w-3.5 h-3.5 text-emerald-400" />
            <span>CSV Studio</span>
          </button>
        </div>

        <!-- Right Side Context Actions (for CSV mode) -->
        <div class="flex items-center gap-2">
          <template v-if="currentView === 'csv' && parsedData.length > 0">
            <button
              @click="triggerUpload"
              class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 transition"
            >
              <FileUp class="w-3.5 h-3.5 text-cyan-400" />
              <span>Upload New</span>
            </button>
            
            <button
              @click="exportJson"
              class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-neutral-850 hover:bg-neutral-800 text-neutral-300 border border-neutral-700/60 transition"
              title="Download parsed data as JSON"
            >
              <Download class="w-3.5 h-3.5 text-neutral-400" />
              <span>JSON</span>
            </button>

            <button
              @click="resetData"
              class="p-1.5 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded-lg transition"
              title="Clear CSV data"
            >
              <Trash2 class="w-4 h-4" />
            </button>
          </template>

          <a
            v-else
            href="https://github.com/chengostalgic/MiseEnVue"
            target="_blank"
            class="text-xs text-neutral-400 hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-neutral-800/80 transition flex items-center gap-1.5"
          >
            <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>Live Engine</span>
          </a>
        </div>
      </div>
    </header>

    <!-- Main Workspace -->
    <main class="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col">
      <!-- VIEW 1: TREND INTELLIGENCE PIPELINE (Identify -> Analyse -> Act) -->
      <div v-if="currentView === 'pipeline'" class="flex-1">
        <TrendPipelineView />
      </div>

      <!-- VIEW 2: CSV STUDIO (Drag & Drop, Parse, Table, Search, Sort) -->
      <div v-else class="flex-1 flex flex-col">
        <!-- Hidden Native File Input -->
        <input
          ref="fileInputRef"
          type="file"
          accept=".csv,text/csv,text/plain"
          class="hidden"
          @change="handleFileInput"
        />

        <!-- Sub-State: No CSV uploaded yet -->
        <div v-if="!fileDetails && parsedData.length === 0" class="flex-1 flex flex-col items-center justify-center my-auto py-12">
          <div class="w-full max-w-2xl space-y-6">
            <div class="text-center space-y-2">
              <h1 class="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                Upload CSV File
              </h1>
              <p class="text-sm sm:text-base text-neutral-400 max-w-md mx-auto">
                Drop any CSV file to inspect, search, sort, and analyze your tabular data in real-time.
              </p>
            </div>

            <!-- Drag & Drop Zone -->
            <div
              @dragover.prevent="isDragging = true"
              @dragleave.prevent="isDragging = false"
              @drop.prevent="handleDrop"
              @click="triggerUpload"
              :class="[
                'relative group cursor-pointer border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition-all duration-200 flex flex-col items-center justify-center',
                isDragging
                  ? 'border-cyan-400 bg-cyan-950/20 scale-[1.01]'
                  : 'border-neutral-750 hover:border-neutral-600 bg-neutral-900/40 hover:bg-neutral-900/70'
              ]"
            >
              <div class="w-16 h-16 rounded-2xl bg-neutral-800/80 border border-neutral-700/80 flex items-center justify-center mb-4 text-cyan-400 group-hover:scale-105 group-hover:border-cyan-500/50 transition-all shadow-xl">
                <UploadCloud class="w-8 h-8" />
              </div>

              <h3 class="text-lg font-semibold text-white mb-1">
                Drag and drop your CSV here
              </h3>
              <p class="text-xs sm:text-sm text-neutral-400 mb-5">
                Supports standard <span class="text-neutral-300 font-mono">.csv</span> or delimited files
              </p>

              <button
                type="button"
                class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-neutral-950 font-semibold text-sm transition shadow-lg shadow-cyan-500/20"
              >
                <FileUp class="w-4 h-4" />
                Choose File
              </button>

              <div class="mt-6 flex items-center gap-2 text-[11px] text-neutral-500">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>100% private & client-side • Never leaves your browser</span>
              </div>
            </div>

            <!-- Error Alert if any -->
            <div v-if="errorMessage" class="p-4 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-300 text-sm flex items-start gap-3">
              <AlertCircle class="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-400" />
              <div>
                <p class="font-medium">Failed to parse file</p>
                <p class="text-xs text-rose-300/80 mt-0.5">{{ errorMessage }}</p>
              </div>
            </div>

            <!-- Quick Samples -->
            <div class="pt-4 border-t border-neutral-800/60">
              <div class="flex items-center justify-between mb-3 text-xs text-neutral-400 font-medium">
                <div class="flex items-center gap-1.5">
                  <Sparkles class="w-3.5 h-3.5 text-amber-400" />
                  <span>Or load sample data:</span>
                </div>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  @click="loadSampleFinancialReport"
                  class="flex items-start gap-3 p-3 rounded-xl bg-neutral-900/60 hover:bg-neutral-850 border border-neutral-800 hover:border-neutral-700 text-left transition group"
                >
                  <div class="p-2 rounded-lg bg-neutral-800 group-hover:bg-cyan-950 text-cyan-400 transition">
                    <FileSpreadsheet class="w-4 h-4" />
                  </div>
                  <div>
                    <div class="text-xs font-semibold text-neutral-200 group-hover:text-white">Restaurant Financial Report</div>
                    <div class="text-[11px] text-neutral-500 mt-0.5">COGS, settlements, vendor orders & treasury</div>
                  </div>
                </button>

                <button
                  @click="loadSampleInventory"
                  class="flex items-start gap-3 p-3 rounded-xl bg-neutral-900/60 hover:bg-neutral-850 border border-neutral-800 hover:border-neutral-700 text-left transition group"
                >
                  <div class="p-2 rounded-lg bg-neutral-800 group-hover:bg-emerald-950 text-emerald-400 transition">
                    <FileText class="w-4 h-4" />
                  </div>
                  <div>
                    <div class="text-xs font-semibold text-neutral-200 group-hover:text-white">Daily Perishable Pars</div>
                    <div class="text-[11px] text-neutral-500 mt-0.5">Inventory stock, unit costs, pars & shelf life</div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Sub-State: CSV data loaded and interactive -->
        <div v-else class="space-y-4 flex-1 flex flex-col">
          <!-- File Info Banner -->
          <div class="bg-neutral-900/70 border border-neutral-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div class="flex items-center gap-3">
              <div class="h-10 w-10 rounded-lg bg-cyan-950/60 border border-cyan-800/50 flex items-center justify-center text-cyan-400">
                <FileSpreadsheet class="w-5 h-5" />
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <span class="font-semibold text-white text-sm sm:text-base truncate max-w-[280px] sm:max-w-md">
                    {{ fileDetails?.name || 'Uploaded File.csv' }}
                  </span>
                  <span class="text-[11px] text-neutral-400 bg-neutral-800 px-2 py-0.5 rounded font-mono">
                    {{ fileDetails?.sizeFormatted || 'CSV' }}
                  </span>
                </div>
                <div class="text-xs text-neutral-400 mt-0.5 flex items-center gap-3">
                  <span><strong class="text-neutral-200">{{ parsedData.length }}</strong> rows</span>
                  <span>•</span>
                  <span><strong class="text-neutral-200">{{ columns.length }}</strong> columns</span>
                  <span v-if="delimiter">•</span>
                  <span v-if="delimiter" class="font-mono text-[10px] text-neutral-500">delimiter: '{{ delimiter === '\t' ? '\\t' : delimiter }}'</span>
                </div>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <button
                @click="triggerUpload"
                class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-neutral-800 hover:bg-neutral-750 text-neutral-200 border border-neutral-700 transition"
              >
                <FileUp class="w-3.5 h-3.5 text-cyan-400" />
                <span>Replace File</span>
              </button>
              <button
                @click="exportCsv"
                class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-neutral-800 hover:bg-neutral-750 text-neutral-200 border border-neutral-700 transition"
              >
                <Download class="w-3.5 h-3.5 text-neutral-400" />
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          <!-- Summary Cards if detected -->
          <div v-if="summaryEntries.length > 0" class="bg-neutral-900/40 border border-neutral-800/80 rounded-xl p-4">
            <div class="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <Sparkles class="w-3.5 h-3.5 text-cyan-400" />
              <span>Summary Key Figures</span>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <div
                v-for="(item, idx) in summaryEntries"
                :key="idx"
                class="bg-neutral-950/60 border border-neutral-800/60 rounded-lg p-3"
              >
                <div class="text-[11px] text-neutral-400 truncate">{{ item.key }}</div>
                <div class="text-sm sm:text-base font-semibold text-white font-mono mt-0.5 truncate">
                  {{ item.value }}
                </div>
              </div>
            </div>
          </div>

          <!-- Search & Controls -->
          <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
            <div class="relative flex-1 max-w-md">
              <Search class="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                v-model="searchQuery"
                type="text"
                placeholder="Search across all columns..."
                class="w-full pl-9 pr-8 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-xs sm:text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 transition"
              />
              <button
                v-if="searchQuery"
                @click="searchQuery = ''"
                class="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
              >
                <X class="w-3.5 h-3.5" />
              </button>
            </div>

            <div class="flex items-center gap-3 justify-between sm:justify-end text-xs text-neutral-400">
              <div class="flex items-center gap-2">
                <span>Show:</span>
                <select
                  v-model="pageSize"
                  class="bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-cyan-500"
                >
                  <option :value="10">10 rows</option>
                  <option :value="25">25 rows</option>
                  <option :value="50">50 rows</option>
                  <option :value="100">100 rows</option>
                  <option :value="1000">All</option>
                </select>
              </div>

              <div class="text-xs text-neutral-400">
                Showing <span class="text-neutral-200 font-medium">{{ filteredData.length }}</span> of {{ parsedData.length }}
              </div>
            </div>
          </div>

          <!-- Interactive Table -->
          <div class="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-900/30 flex-1 flex flex-col shadow-xl">
            <div class="overflow-x-auto flex-1 max-h-[580px] overflow-y-auto">
              <table class="w-full text-left text-xs border-collapse">
                <thead class="bg-neutral-900/90 text-neutral-300 font-semibold border-b border-neutral-800 sticky top-0 z-10 backdrop-blur-sm">
                  <tr>
                    <th class="py-3 px-3.5 w-12 text-center text-neutral-500 font-mono text-[11px]">#</th>
                    <th
                      v-for="col in columns"
                      :key="col"
                      @click="toggleSort(col)"
                      class="py-3 px-3.5 select-none cursor-pointer hover:bg-neutral-800/80 transition group whitespace-nowrap"
                    >
                      <div class="flex items-center gap-1.5">
                        <span>{{ col }}</span>
                        <span class="text-neutral-500 group-hover:text-neutral-300 transition">
                          <ArrowUp v-if="sortCol === col && sortAsc" class="w-3.5 h-3.5 text-cyan-400" />
                          <ArrowDown v-else-if="sortCol === col && !sortAsc" class="w-3.5 h-3.5 text-cyan-400" />
                          <ArrowUpDown v-else class="w-3 h-3 opacity-30 group-hover:opacity-100" />
                        </span>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-neutral-800/60 font-sans">
                  <tr
                    v-for="(row, idx) in paginatedData"
                    :key="idx"
                    class="hover:bg-neutral-800/40 transition group"
                  >
                    <td class="py-2.5 px-3.5 text-center text-neutral-500 font-mono text-[11px]">
                      {{ (currentPage - 1) * pageSize + idx + 1 }}
                    </td>
                    <td
                      v-for="col in columns"
                      :key="col"
                      :class="[
                        'py-2.5 px-3.5 whitespace-nowrap text-neutral-200',
                        isNumeric(row[col]) ? 'font-mono' : ''
                      ]"
                    >
                      <span
                        v-if="col.toLowerCase() === 'status' || col.toLowerCase() === 'type'"
                        :class="getStatusBadgeClass(row[col])"
                        class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border"
                      >
                        {{ row[col] }}
                      </span>
                      <span
                        v-else-if="col.toLowerCase() === 'amount' && isNumeric(row[col])"
                        :class="Number(row[col]) < 0 ? 'text-rose-400 font-medium' : 'text-emerald-400 font-medium'"
                      >
                        {{ formatCurrency(row[col]) }}
                      </span>
                      <span v-else class="truncate block max-w-xs sm:max-w-md">
                        {{ row[col] !== undefined && row[col] !== null ? row[col] : '—' }}
                      </span>
                    </td>
                  </tr>

                  <tr v-if="paginatedData.length === 0">
                    <td :colspan="columns.length + 1" class="py-12 text-center text-neutral-500">
                      <p class="text-sm">No rows matching your search filter.</p>
                      <button
                        v-if="searchQuery"
                        @click="searchQuery = ''"
                        class="mt-2 text-xs text-cyan-400 hover:underline"
                      >
                        Clear search filter
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Bottom Pagination -->
            <div class="border-t border-neutral-800/80 bg-neutral-900/60 px-4 py-3 flex items-center justify-between text-xs text-neutral-400">
              <div>
                Page <span class="text-neutral-200 font-semibold">{{ currentPage }}</span> of
                <span class="text-neutral-200 font-semibold">{{ totalPages || 1 }}</span>
              </div>

              <div class="flex items-center gap-1.5">
                <button
                  @click="currentPage--"
                  :disabled="currentPage <= 1"
                  class="p-1.5 rounded-lg border border-neutral-700/80 hover:bg-neutral-800 disabled:opacity-40 disabled:hover:bg-transparent transition text-neutral-300"
                  title="Previous page"
                >
                  <ChevronLeft class="w-4 h-4" />
                </button>

                <button
                  @click="currentPage++"
                  :disabled="currentPage >= totalPages"
                  class="p-1.5 rounded-lg border border-neutral-700/80 hover:bg-neutral-800 disabled:opacity-40 disabled:hover:bg-transparent transition text-neutral-300"
                  title="Next page"
                >
                  <ChevronRight class="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import Papa from 'papaparse'
import TrendPipelineView from './components/TrendPipelineView.vue'
import {
  FileSpreadsheet,
  FileText,
  UploadCloud,
  FileUp,
  Download,
  Trash2,
  AlertCircle,
  Sparkles,
  Search,
  X,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Zap
} from 'lucide-vue-next'

// Active View: 'pipeline' (Trend-to-Content Pipeline) or 'csv' (CSV Studio)
const currentView = ref('pipeline')

// CSV Studio State
const fileInputRef = ref(null)
const isDragging = ref(false)
const errorMessage = ref('')
const fileDetails = ref(null)
const delimiter = ref(',')

const columns = ref([])
const parsedData = ref([])
const summaryEntries = ref([])

const searchQuery = ref('')
const sortCol = ref(null)
const sortAsc = ref(true)
const currentPage = ref(1)
const pageSize = ref(25)

// Formatting
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function isNumeric(val) {
  if (val === null || val === undefined || val === '') return false
  return !isNaN(Number(val))
}

function formatCurrency(val) {
  const num = Number(val)
  if (isNaN(num)) return val
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(num)
}

function getStatusBadgeClass(val) {
  if (!val) return 'bg-neutral-800 border-neutral-700 text-neutral-300'
  const str = String(val).toLowerCase()
  if (str.includes('completed') || str.includes('income') || str.includes('success') || str.includes('active')) {
    return 'bg-emerald-950/60 border-emerald-800/60 text-emerald-400'
  }
  if (str.includes('progress') || str.includes('pending') || str.includes('review')) {
    return 'bg-amber-950/60 border-amber-800/60 text-amber-400'
  }
  if (str.includes('expense') || str.includes('fail') || str.includes('error') || str.includes('86')) {
    return 'bg-rose-950/60 border-rose-800/60 text-rose-400'
  }
  return 'bg-neutral-800 border-neutral-700 text-neutral-300'
}

// CSV Actions
function triggerUpload() {
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
    fileInputRef.value.click()
  }
}

function handleFileInput(e) {
  const file = e.target.files?.[0]
  if (file) {
    processFile(file)
  }
}

function handleDrop(e) {
  isDragging.value = false
  const file = e.dataTransfer.files?.[0]
  if (file) {
    processFile(file)
  }
}

function processFile(file) {
  errorMessage.value = ''
  if (!file.name.endsWith('.csv') && !file.name.endsWith('.txt') && !file.name.endsWith('.tsv')) {
    errorMessage.value = 'Please upload a CSV or delimited text file (.csv).'
    return
  }

  const reader = new FileReader()
  reader.onload = (event) => {
    const rawText = event.target.result
    parseCsvString(rawText, {
      name: file.name,
      size: file.size,
      sizeFormatted: formatFileSize(file.size)
    })
  }
  reader.onerror = () => {
    errorMessage.value = 'Could not read file from disk.'
  }
  reader.readAsText(file)
}

function parseCsvString(csvString, meta) {
  errorMessage.value = ''
  summaryEntries.value = []

  let mainCsv = csvString
  const summaryDividerIdx = csvString.search(/\n\s*---.*---\s*\n/)
  if (summaryDividerIdx !== -1) {
    mainCsv = csvString.slice(0, summaryDividerIdx)
    const summarySection = csvString.slice(summaryDividerIdx)
    const summaryLines = summarySection.split('\n').filter(l => l.trim() && !l.includes('---'))
    summaryLines.forEach(line => {
      const parts = line.split(',')
      if (parts.length >= 2) {
        summaryEntries.value.push({
          key: parts[0].trim(),
          value: parts.slice(1).join(',').trim()
        })
      }
    })
  }

  Papa.parse(mainCsv, {
    header: true,
    skipEmptyLines: 'greedy',
    dynamicTyping: false,
    complete: (results) => {
      if (results.errors && results.errors.length > 0) {
        console.warn('PapaParse warnings:', results.errors)
      }

      if (!results.data || results.data.length === 0) {
        errorMessage.value = 'The uploaded file appears to be empty or missing data.'
        return
      }

      const rawCols = results.meta.fields || []
      columns.value = rawCols.filter(c => c && c.trim())
      parsedData.value = results.data
      delimiter.value = results.meta.delimiter || ','

      fileDetails.value = meta || {
        name: 'sample_dataset.csv',
        sizeFormatted: '1.2 KB'
      }

      currentPage.value = 1
      searchQuery.value = ''
      sortCol.value = null
    },
    error: (err) => {
      errorMessage.value = `Parse error: ${err.message}`
    }
  })
}

function resetData() {
  parsedData.value = []
  columns.value = []
  fileDetails.value = null
  summaryEntries.value = []
  searchQuery.value = ''
  errorMessage.value = ''
}

function toggleSort(col) {
  if (sortCol.value === col) {
    if (sortAsc.value) {
      sortAsc.value = false
    } else {
      sortCol.value = null
      sortAsc.value = true
    }
  } else {
    sortCol.value = col
    sortAsc.value = true
  }
}

const filteredData = computed(() => {
  let list = parsedData.value
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim()
    list = list.filter(row => {
      return Object.values(row).some(val => {
        return String(val || '').toLowerCase().includes(q)
      })
    })
  }

  if (sortCol.value) {
    const col = sortCol.value
    const asc = sortAsc.value
    list = [...list].sort((a, b) => {
      const valA = a[col] ?? ''
      const valB = b[col] ?? ''
      const numA = Number(valA)
      const numB = Number(valB)

      if (!isNaN(numA) && !isNaN(numB) && valA !== '' && valB !== '') {
        return asc ? numA - numB : numB - numA
      }
      return asc
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA))
    })
  }
  return list
})

const totalPages = computed(() => {
  return Math.ceil(filteredData.value.length / pageSize.value) || 1
})

const paginatedData = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredData.value.slice(start, start + pageSize.value)
})

function loadSampleFinancialReport() {
  const sample = `ID,Transaction Name,Timestamp,Category,Type,Amount,Status
tx-1,"Baldor Specialty Foods (Organic Produce & Microgreens)","Today, 09:42","Kitchen COGS",expense,-482.5,In progress
tx-2,"US Foods Direct (Prime Ribeye & Dairy Restock)","Yesterday, 14:10","Food Inventory",expense,-1240,Completed
tx-3,"Toast POS Daily Settlement (Dinner Rush)","Yesterday, 23:59","POS Revenue",income,3842.5,Completed
tx-4,"Southern Glazer's Wine & Spirits (Pinot & Bar Restock)","Oct 24, 11:20","Cellar Restock",expense,-680,Completed
tx-5,"Ecolab Commercial Dishwasher & Chemical Lease","Oct 22, 08:30","BOH Sanitation",expense,-215,Completed
tx-6,"Cintas Linen & Chef Uniform Laundry","Oct 20, 10:15","Linen & Floor",expense,-165.4,Completed

--- FINANCIAL SUMMARY ---
Current Treasury Balance,$12,680.42
Food & Ingredients COGS,$604.36
Wine & Spirits Float,$296.65
Front-of-House Labor,$206.48
Ad Spend & Promos,$182.44
Uncovered Margin Profit,$0.00
Active Settlement Batches,1`

  parseCsvString(sample, {
    name: 'miseen_financial_report_2026-09-12.csv',
    sizeFormatted: '951 B'
  })
}

function loadSampleInventory() {
  const sample = `Item Code,Item Name,Category,Current Stock,Par Level,Unit,Unit Cost,Margin %,Reorder Alert
INV-001,Dayboat Halibut Fillet,Fresh Seafood,4.5,14.0,kg,$24.50,78%,URGENT
INV-002,Prime Angus Ribeye,Fresh Butcher,12.0,20.0,kg,$32.00,82%,Normal
INV-003,Heirloom Baby Greens,Organic Produce,2.1,8.0,kg,$6.80,85%,Low
INV-004,Organic Greek Feta,Dairy & Cheese,8.0,10.0,kg,$11.20,80%,Normal
INV-005,Cold Pressed Extra Virgin Oil,Dry Pantry,24.0,30.0,L,$14.00,74%,Normal
INV-006,Skin-Contact Pinot Grigio,Cellar Bar,18.0,24.0,Bottles,$19.50,84%,Normal
INV-007,San Marzano Tomatoes (DOP),Dry Pantry,36.0,40.0,Cans,$4.20,86%,Normal`

  parseCsvString(sample, {
    name: 'perishable_inventory_pars.csv',
    sizeFormatted: '640 B'
  })
}

function exportJson() {
  const jsonStr = JSON.stringify(parsedData.value, null, 2)
  const blob = new Blob([jsonStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = (fileDetails.value?.name?.replace(/\.[^/.]+$/, '') || 'data') + '.json'
  a.click()
  URL.revokeObjectURL(url)
}

function exportCsv() {
  const csv = Papa.unparse(parsedData.value)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileDetails.value?.name || 'export.csv'
  a.click()
  URL.revokeObjectURL(url)
}
</script>
