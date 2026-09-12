"use client";

import React, { useState, useRef } from "react";
import Papa from "papaparse";
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
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

interface CsvStudioProps {
  currentTrendingDish?: { name: string; aliases?: string[] };
}

export default function CsvStudio({ currentTrendingDish }: CsvStudioProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [fileDetails, setFileDetails] = useState<{ name: string; sizeFormatted: string } | null>(null);
  const [delimiter, setDelimiter] = useState(",");

  const [columns, setColumns] = useState<string[]>([]);
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [summaryEntries, setSummaryEntries] = useState<Array<{ key: string; value: string }>>([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Fit Analysis state
  const [fitResult, setFitResult] = useState<any>(null);
  const [isAnalyzingFit, setIsAnalyzingFit] = useState(false);

  function formatFileSize(bytes: number) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  function isNumeric(val: any) {
    if (val === null || val === undefined || val === "") return false;
    return !isNaN(Number(val));
  }

  function formatCurrency(val: any) {
    const num = Number(val);
    if (isNaN(num)) return val;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(num);
  }

  function getStatusBadgeClass(val: any) {
    if (!val) return "bg-neutral-800 border-neutral-700 text-neutral-300";
    const str = String(val).toLowerCase();
    if (str.includes("completed") || str.includes("income") || str.includes("success") || str.includes("active")) {
      return "bg-emerald-950/60 border-emerald-800/60 text-emerald-400";
    }
    if (str.includes("progress") || str.includes("pending") || str.includes("review")) {
      return "bg-amber-950/60 border-amber-800/60 text-amber-400";
    }
    if (str.includes("expense") || str.includes("fail") || str.includes("error") || str.includes("86") || str.includes("urgent")) {
      return "bg-rose-950/60 border-rose-800/60 text-rose-400";
    }
    return "bg-neutral-800 border-neutral-700 text-neutral-300";
  }

  function triggerUpload() {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  function processFile(file: File) {
    setErrorMessage("");
    if (!file.name.endsWith(".csv") && !file.name.endsWith(".txt") && !file.name.endsWith(".tsv")) {
      setErrorMessage("Please upload a CSV or delimited text file (.csv).");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const rawText = event.target?.result as string;
      parseCsvString(rawText, {
        name: file.name,
        sizeFormatted: formatFileSize(file.size),
      });
    };
    reader.onerror = () => {
      setErrorMessage("Could not read file from disk.");
    };
    reader.readAsText(file);
  }

  function parseCsvString(csvString: string, meta: { name: string; sizeFormatted: string }) {
    setErrorMessage("");
    const summaries: Array<{ key: string; value: string }> = [];

    let mainCsv = csvString;
    const summaryDividerIdx = csvString.search(/\n\s*---.*---\s*\n/);
    if (summaryDividerIdx !== -1) {
      mainCsv = csvString.slice(0, summaryDividerIdx);
      const summarySection = csvString.slice(summaryDividerIdx);
      const summaryLines = summarySection.split("\n").filter((l) => l.trim() && !l.includes("---"));
      summaryLines.forEach((line) => {
        const parts = line.split(",");
        if (parts.length >= 2) {
          summaries.push({
            key: parts[0].trim(),
            value: parts.slice(1).join(",").trim(),
          });
        }
      });
    }

    Papa.parse(mainCsv, {
      header: true,
      skipEmptyLines: "greedy",
      dynamicTyping: false,
      complete: (results: any) => {
        if (!results.data || results.data.length === 0) {
          setErrorMessage("The uploaded file appears to be empty or missing data.");
          return;
        }

        const rawCols = results.meta.fields || [];
        setColumns(rawCols.filter((c: string) => c && c.trim()));
        setParsedData(results.data);
        setDelimiter(results.meta.delimiter || ",");
        setSummaryEntries(summaries);
        setFileDetails(meta);
        setCurrentPage(1);
        setSearchQuery("");
        setSortCol(null);
        setFitResult(null);
      },
      error: (err: any) => {
        setErrorMessage(`Parse error: ${err.message}`);
      },
    });
  }

  function resetData() {
    setParsedData([]);
    setColumns([]);
    setFileDetails(null);
    setSummaryEntries([]);
    setSearchQuery("");
    setErrorMessage("");
    setFitResult(null);
  }

  // Fit Analysis (Part 2)
  async function runFitAnalysis() {
    if (parsedData.length === 0) return;
    if (!currentTrendingDish?.name) {
      setErrorMessage("Pick a scraped dish in Discover before running kitchen fit.");
      return;
    }
    setIsAnalyzingFit(true);
    try {
      const res = await fetch("/api/fit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventoryItems: parsedData,
          trendingDish: currentTrendingDish,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setFitResult(data);
      }
    } catch (err) {
      console.error("Fit analysis failed:", err);
    } finally {
      setIsAnalyzingFit(false);
    }
  }

  function toggleSort(col: string) {
    if (sortCol === col) {
      if (sortAsc) setSortAsc(false);
      else {
        setSortCol(null);
        setSortAsc(true);
      }
    } else {
      setSortCol(col);
      setSortAsc(true);
    }
  }

  const filteredData = parsedData
    .filter((row) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return Object.values(row).some((val) => String(val || "").toLowerCase().includes(q));
    })
    .sort((a, b) => {
      if (!sortCol) return 0;
      const valA = a[sortCol] ?? "";
      const valB = b[sortCol] ?? "";
      const numA = Number(valA);
      const numB = Number(valB);

      if (!isNaN(numA) && !isNaN(numB) && valA !== "" && valB !== "") {
        return sortAsc ? numA - numB : numB - numA;
      }
      return sortAsc
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA));
    });

  const totalPages = Math.ceil(filteredData.length / pageSize) || 1;
  const paginatedData = filteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

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
Active Settlement Batches,1`;

    parseCsvString(sample, {
      name: "miseen_financial_report_2026-09-12.csv",
      sizeFormatted: "951 B",
    });
  }

  function loadSampleInventory() {
    const sample = `Item Code,Item Name,Category,Current Stock,Par Level,Unit,Unit Cost,Margin %,Reorder Alert
INV-001,Dayboat Halibut Fillet,Fresh Seafood,4.5,14.0,kg,$24.50,78%,URGENT
INV-002,Prime Angus Ribeye,Fresh Butcher,12.0,20.0,kg,$32.00,82%,Normal
INV-003,Heirloom Baby Greens,Organic Produce,2.1,8.0,kg,$6.80,85%,Low
INV-004,Organic Greek Feta,Dairy & Cheese,8.0,10.0,kg,$11.20,80%,Normal
INV-005,Cold Pressed Extra Virgin Oil,Dry Pantry,24.0,30.0,L,$14.00,74%,Normal
INV-006,Skin-Contact Pinot Grigio,Cellar Bar,18.0,24.0,Bottles,$19.50,84%,Normal
INV-007,San Marzano Tomatoes (DOP),Dry Pantry,36.0,40.0,Cans,$4.20,86%,Normal`;

    parseCsvString(sample, {
      name: "perishable_inventory_pars.csv",
      sizeFormatted: "640 B",
    });
  }

  function exportJson() {
    const jsonStr = JSON.stringify(parsedData, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (fileDetails?.name?.replace(/\.[^/.]+$/, "") || "data") + ".json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportCsv() {
    const csv = Papa.unparse(parsedData);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileDetails?.name || "export.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4 flex-1 flex flex-col">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv,text/plain"
        className="hidden"
        onChange={handleFileInput}
      />

      {/* Dropzone if no file uploaded */}
      {!fileDetails && parsedData.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center my-auto py-12">
          <div className="w-full max-w-2xl space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-3xl font-semibold text-stone-50 tracking-tight">
                Kitchen files
              </h1>
              <p className="text-sm text-stone-400 max-w-md mx-auto">
                {currentTrendingDish
                  ? `Fit check will use “${currentTrendingDish.name}” from this week’s scrape.`
                  : "Upload inventory or a P&L. Discover picks the dish this file is scored against."}
              </p>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDragging(false);
              }}
              onDrop={handleDrop}
              onClick={triggerUpload}
              className={`relative group cursor-pointer border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition-all duration-200 flex flex-col items-center justify-center ${
                isDragging
                  ? "border-cyan-400 bg-cyan-950/20 scale-[1.01]"
                  : "border-neutral-750 hover:border-neutral-600 bg-neutral-900/40 hover:bg-neutral-900/70"
              }`}
            >
              <div className="w-16 h-16 rounded-2xl bg-neutral-800/80 border border-neutral-700/80 flex items-center justify-center mb-4 text-cyan-400 group-hover:scale-105 group-hover:border-cyan-500/50 transition-all shadow-xl">
                <UploadCloud className="w-8 h-8" />
              </div>

              <h3 className="text-lg font-semibold text-white mb-1">
                Drag and drop your CSV here
              </h3>
              <p className="text-xs sm:text-sm text-neutral-400 mb-5">
                Supports standard <span className="text-neutral-300 font-mono">.csv</span> or delimited files
              </p>

              <button
                type="button"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-neutral-950 font-semibold text-sm transition shadow-lg shadow-cyan-500/20"
              >
                <FileUp className="w-4 h-4" />
                Choose File
              </button>

              <div className="mt-6 flex items-center gap-2 text-[11px] text-neutral-500">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>Client-side parsing • Ready for Part 2 Inventory Fit Matching</span>
              </div>
            </div>

            {errorMessage && (
              <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-300 text-sm flex items-start gap-3">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-400" />
                <div>
                  <p className="font-medium">Failed to parse file</p>
                  <p className="text-xs text-rose-300/80 mt-0.5">{errorMessage}</p>
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-neutral-800/60">
              <div className="flex items-center justify-between mb-3 text-xs text-neutral-400 font-medium">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Or load sample data:</span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={loadSampleFinancialReport}
                  className="flex items-start gap-3 p-3 rounded-xl bg-neutral-900/60 hover:bg-neutral-850 border border-neutral-800 hover:border-neutral-700 text-left transition group"
                >
                  <div className="p-2 rounded-lg bg-neutral-800 group-hover:bg-cyan-950 text-cyan-400 transition">
                    <FileSpreadsheet className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-neutral-200 group-hover:text-white">
                      Restaurant Financial Report
                    </div>
                    <div className="text-[11px] text-neutral-500 mt-0.5">COGS, settlements, vendor orders & treasury</div>
                  </div>
                </button>

                <button
                  onClick={loadSampleInventory}
                  className="flex items-start gap-3 p-3 rounded-xl bg-neutral-900/60 hover:bg-neutral-850 border border-neutral-800 hover:border-neutral-700 text-left transition group"
                >
                  <div className="p-2 rounded-lg bg-neutral-800 group-hover:bg-emerald-950 text-emerald-400 transition">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-neutral-200 group-hover:text-white">
                      Daily Perishable Pars
                    </div>
                    <div className="text-[11px] text-neutral-500 mt-0.5">Inventory stock, unit costs, pars & shelf life</div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CSV Loaded View */}
      {fileDetails && parsedData.length > 0 && (
        <div className="space-y-4 flex-1 flex flex-col">
          {/* Top Banner with File details + Fit Analysis Button */}
          <div className="bg-neutral-900/70 border border-neutral-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-cyan-950/60 border border-cyan-800/50 flex items-center justify-center text-cyan-400">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white text-sm sm:text-base truncate max-w-[280px] sm:max-w-md">
                    {fileDetails.name}
                  </span>
                  <span className="text-[11px] text-neutral-400 bg-neutral-800 px-2 py-0.5 rounded font-mono">
                    {fileDetails.sizeFormatted}
                  </span>
                </div>
                <div className="text-xs text-neutral-400 mt-0.5 flex items-center gap-3">
                  <span>
                    <strong className="text-neutral-200">{parsedData.length}</strong> rows
                  </span>
                  <span>•</span>
                  <span>
                    <strong className="text-neutral-200">{columns.length}</strong> columns
                  </span>
                  <span>•</span>
                  <span className="font-mono text-[10px] text-neutral-500">
                    delimiter: '{delimiter === "\t" ? "\\t" : delimiter}'
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={runFitAnalysis}
                disabled={isAnalyzingFit}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-neutral-950 transition shadow-lg shadow-emerald-500/20"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isAnalyzingFit ? "Matching..." : "Match Against Viral Trends"}</span>
              </button>

              <button
                onClick={triggerUpload}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-neutral-800 hover:bg-neutral-750 text-neutral-200 border border-neutral-700 transition"
              >
                <FileUp className="w-3.5 h-3.5 text-cyan-400" />
                <span>Replace</span>
              </button>

              <button
                onClick={exportCsv}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-neutral-800 hover:bg-neutral-750 text-neutral-200 border border-neutral-700 transition"
              >
                <Download className="w-3.5 h-3.5 text-neutral-400" />
                <span>CSV</span>
              </button>

              <button
                onClick={exportJson}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-neutral-800 hover:bg-neutral-750 text-neutral-200 border border-neutral-700 transition"
              >
                <Download className="w-3.5 h-3.5 text-neutral-400" />
                <span>JSON</span>
              </button>

              <button
                onClick={resetData}
                className="p-1.5 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded-lg transition"
                title="Clear table"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Part 2: Fit Analysis Results Card */}
          {fitResult && (
            <div className="bg-neutral-900/90 border border-emerald-800/60 rounded-xl p-4 sm:p-5 space-y-3 shadow-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></div>
                  <h4 className="text-sm font-bold text-white">
                    Inventory Fit Match: {fitResult.dishName}
                  </h4>
                </div>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                  {fitResult.coveragePercent}% Ingredient Coverage
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 text-xs">
                  <div className="text-neutral-400">On-Hand Ingredients ({fitResult.matchedIngredients?.length})</div>
                  <div className="text-emerald-400 font-semibold mt-1 truncate">
                    {fitResult.matchedIngredients?.join(", ") || "None"}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 text-xs">
                  <div className="text-neutral-400">Missing Ingredients ({fitResult.missingIngredients?.length})</div>
                  <div className="text-amber-400 font-semibold mt-1 truncate">
                    {fitResult.missingIngredients?.length ? fitResult.missingIngredients.join(", ") : "100% Stocked"}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 text-xs">
                  <div className="text-neutral-400">Unit Margin Economics</div>
                  <div className="text-white font-mono font-semibold mt-1">
                    Cost: ${fitResult.financials?.estimatedPlateCost} • Retail: ${fitResult.financials?.suggestedPrice} ({fitResult.financials?.projectedMargin})
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Financial Summary detected in CSV */}
          {summaryEntries.length > 0 && (
            <div className="bg-neutral-900/40 border border-neutral-800/80 rounded-xl p-4">
              <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>CSV Key Summary Figures</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {summaryEntries.map((item, idx) => (
                  <div key={idx} className="bg-neutral-950/60 border border-neutral-800/60 rounded-lg p-3">
                    <div className="text-[11px] text-neutral-400 truncate">{item.key}</div>
                    <div className="text-sm sm:text-base font-semibold text-white font-mono mt-0.5 truncate">
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search & Pagination Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search across all columns..."
                className="w-full pl-9 pr-8 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-xs sm:text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-cyan-500 transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-3 justify-between sm:justify-end text-xs text-neutral-400">
              <div className="flex items-center gap-2">
                <span>Show:</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value={10}>10 rows</option>
                  <option value={25}>25 rows</option>
                  <option value={50}>50 rows</option>
                  <option value={100}>100 rows</option>
                  <option value={1000}>All</option>
                </select>
              </div>

              <div className="text-xs text-neutral-400">
                Showing <span className="text-neutral-200 font-medium">{filteredData.length}</span> of {parsedData.length}
              </div>
            </div>
          </div>

          {/* Interactive Table */}
          <div className="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-900/30 flex-1 flex flex-col shadow-xl">
            <div className="overflow-x-auto flex-1 max-h-[580px] overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-neutral-900/90 text-neutral-300 font-semibold border-b border-neutral-800 sticky top-0 z-10 backdrop-blur-sm">
                  <tr>
                    <th className="py-3 px-3.5 w-12 text-center text-neutral-500 font-mono text-[11px]">#</th>
                    {columns.map((col) => (
                      <th
                        key={col}
                        onClick={() => toggleSort(col)}
                        className="py-3 px-3.5 select-none cursor-pointer hover:bg-neutral-800/80 transition group whitespace-nowrap"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>{col}</span>
                          <span className="text-neutral-500 group-hover:text-neutral-300 transition">
                            {sortCol === col && sortAsc && <ArrowUp className="w-3.5 h-3.5 text-cyan-400" />}
                            {sortCol === col && !sortAsc && <ArrowDown className="w-3.5 h-3.5 text-cyan-400" />}
                            {sortCol !== col && <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-100" />}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60 font-sans">
                  {paginatedData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-neutral-800/40 transition group">
                      <td className="py-2.5 px-3.5 text-center text-neutral-500 font-mono text-[11px]">
                        {(currentPage - 1) * pageSize + idx + 1}
                      </td>
                      {columns.map((col) => (
                        <td
                          key={col}
                          className={`py-2.5 px-3.5 whitespace-nowrap text-neutral-200 ${
                            isNumeric(row[col]) ? "font-mono" : ""
                          }`}
                        >
                          {col.toLowerCase() === "status" || col.toLowerCase() === "type" || col.toLowerCase() === "reorder alert" ? (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${getStatusBadgeClass(
                                row[col]
                              )}`}
                            >
                              {row[col]}
                            </span>
                          ) : col.toLowerCase() === "amount" && isNumeric(row[col]) ? (
                            <span className={Number(row[col]) < 0 ? "text-rose-400 font-medium" : "text-emerald-400 font-medium"}>
                              {formatCurrency(row[col])}
                            </span>
                          ) : (
                            <span className="truncate block max-w-xs sm:max-w-md">
                              {row[col] !== undefined && row[col] !== null ? row[col] : "—"}
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}

                  {paginatedData.length === 0 && (
                    <tr>
                      <td colSpan={columns.length + 1} className="py-12 text-center text-neutral-500">
                        <p className="text-sm">No rows matching your search filter.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="border-t border-neutral-800/80 bg-neutral-900/60 px-4 py-3 flex items-center justify-between text-xs text-neutral-400">
              <div>
                Page <span className="text-neutral-200 font-semibold">{currentPage}</span> of{" "}
                <span className="text-neutral-200 font-semibold">{totalPages || 1}</span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="p-1.5 rounded-lg border border-neutral-700/80 hover:bg-neutral-800 disabled:opacity-40 disabled:hover:bg-transparent transition text-neutral-300"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="p-1.5 rounded-lg border border-neutral-700/80 hover:bg-neutral-800 disabled:opacity-40 disabled:hover:bg-transparent transition text-neutral-300"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
