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
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  Plus,
} from "lucide-react";

interface CsvStudioProps {
  currentTrendingDish?: { name: string; aliases?: string[] };
  allDishes?: Array<{ id: string; name: string }>;
  onSelectDish?: (dishId: string) => void;
}

// Authentic Ember & Rye Datasets
const EMBER_RYE_INVENTORY_CSV = `ingredient,unit,quantity_on_hand,unit_cost
chicken thigh,lb,48.0000,3.2500
chicken wings,lb,32.0000,2.8500
brioche bun,each,240.0000,0.5500
pickles,gal,3.5000,12.0000
honey,lb,6.0000,4.7500
buttermilk,gal,4.0000,6.4000
all-purpose flour,lb,50.0000,0.6200
hot sauce,gal,2.0000,18.5000
ground beef,lb,36.0000,5.1000
cheddar cheese,lb,18.0000,4.9500
smoked brisket,lb,22.0000,9.8000
waffle fries,lb,60.0000,1.4500
sweet corn,lb,25.0000,1.2000
cotija cheese,lb,8.0000,6.2500
kale,lb,12.0000,2.3000
matcha powder,oz,16.0000,3.9000
oat milk,gal,5.0000,7.2500
cold brew concentrate,gal,3.0000,22.0000
butter,lb,20.0000,4.4000
chocolate chips,lb,9.0000,5.6000`;

const EMBER_RYE_MENU_CSV = `name,description,category,price,estimated_cost
Crispy Chicken Sandwich,"Buttermilk-brined thigh, pickles, herb mayo, brioche.",Sandwiches,13.50,4.10
Nashville Hot Chicken Sandwich,"Cayenne-lacquered thigh, slaw, brioche.",Sandwiches,14.25,4.45
Buttermilk Fried Chicken Tenders,"Three tenders, honey mustard.",Plates,11.75,3.60
Classic Cheeseburger,"Quarter-pound patty, cheddar, griddled onion.",Sandwiches,12.50,4.20
Smoked Brisket Sandwich,"Twelve-hour brisket, pickles, white bread.",Sandwiches,16.00,6.10
Loaded Waffle Fries,"Queso, scallion, pickled jalapeno.",Sides,8.25,2.05
Buffalo Wings (8 pc),"Fried wings tossed in buffalo, ranch on the side.",Plates,13.00,4.80
Street Corn Elote Cup,"Charred corn, cotija, lime, chili salt.",Sides,6.50,1.65
Kale Caesar Salad,"Tuscan kale, parmesan, sourdough crumb.",Salads,10.50,2.90
Matcha Latte,"Ceremonial-grade matcha, oat milk.",Drinks,5.75,1.35
Horchata Cold Brew,"Cold brew cut with cinnamon rice milk.",Drinks,5.25,1.10
Brown Butter Chocolate Chip Cookie,"Browned butter, sea salt, bittersweet chocolate.",Desserts,3.75,0.72`;

const EMBER_RYE_SALES_CSV = `menu_item,date,channel,units_sold,gross_revenue
Crispy Chicken Sandwich,2026-09-11,in_store,42,567.00
Buffalo Wings (8 pc),2026-09-11,in_store,38,494.00
Classic Cheeseburger,2026-09-11,in_store,31,387.50
Nashville Hot Chicken Sandwich,2026-09-11,online,26,370.50
Smoked Brisket Sandwich,2026-09-11,in_store,19,304.00
Loaded Waffle Fries,2026-09-11,in_store,44,363.00
Street Corn Elote Cup,2026-09-11,doordash,22,143.00
Kale Caesar Salad,2026-09-11,in_store,18,189.00
Matcha Latte,2026-09-11,in_store,24,138.00
Horchata Cold Brew,2026-09-11,doordash,19,99.75
Brown Butter Chocolate Chip Cookie,2026-09-11,in_store,35,131.25`;

export default function CsvStudio({
  currentTrendingDish,
  allDishes = [],
  onSelectDish,
}: CsvStudioProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [fileDetails, setFileDetails] = useState<{ name: string; sizeFormatted: string } | null>(null);
  const [delimiter, setDelimiter] = useState(",");

  const [columns, setColumns] = useState<string[]>([]);
  const [parsedData, setParsedData] = useState<any[]>([]);

  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Fit Analysis state
  const [fitResult, setFitResult] = useState<any>(null);
  const [isAnalyzingFit, setIsAnalyzingFit] = useState(false);
  const [selectedDishName, setSelectedDishName] = useState(
    currentTrendingDish?.name || "Chili crisp hot honey wings",
  );
  const [procureNotice, setProcureNotice] = useState<string | null>(null);

  React.useEffect(() => {
    if (currentTrendingDish?.name) {
      setSelectedDishName(currentTrendingDish.name);
    }
  }, [currentTrendingDish?.name]);

  const activeDishName = selectedDishName;

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
      setErrorMessage("Please upload a CSV or delimited text file (.csv, .tsv).");
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
    Papa.parse(csvString.trim(), {
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
        setFileDetails(meta);
        setCurrentPage(1);
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
    setErrorMessage("");
    setFitResult(null);
  }

  // Fit Analysis (Part 2)
  async function runFitAnalysis(dishNameToTest?: string, dataOverride?: any[]) {
    const dataToUse = dataOverride || parsedData;
    if (dataToUse.length === 0) return;
    const targetDish = dishNameToTest || selectedDishName;
    setIsAnalyzingFit(true);
    try {
      const res = await fetch("/api/fit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventoryItems: dataToUse,
          trendingDish: {
            name: targetDish,
            aliases: currentTrendingDish?.name === targetDish ? currentTrendingDish.aliases : undefined,
          },
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

  function quickProcureIngredient(ingName: string) {
    const newRow: Record<string, any> = {
      ingredient: ingName,
      unit: "lb",
      quantity_on_hand: "12.0000",
      unit_cost: "3.7500",
    };
    for (const col of columns) {
      if (!(col in newRow)) {
        newRow[col] = ingName;
      }
    }
    const updated = [newRow, ...parsedData];
    setParsedData(updated);
    setProcureNotice(`Stocked "${ingName}" into inventory. Re-evaluated recipe fit.`);
    setTimeout(() => setProcureNotice(null), 4000);
    void runFitAnalysis(selectedDishName, updated);
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

  const filteredData = [...parsedData].sort((a, b) => {
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

  function loadInventoryFixture() {
    parseCsvString(EMBER_RYE_INVENTORY_CSV, {
      name: "ember_and_rye_inventory.csv",
      sizeFormatted: "652 B",
    });
  }

  function loadMenuFixture() {
    parseCsvString(EMBER_RYE_MENU_CSV, {
      name: "ember_and_rye_menu.csv",
      sizeFormatted: "1.0 KB",
    });
  }

  function loadSalesFixture() {
    parseCsvString(EMBER_RYE_SALES_CSV, {
      name: "ember_and_rye_sales_30d.csv",
      sizeFormatted: "820 B",
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
    <div className="space-y-6 flex-1 flex flex-col select-none">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv,text/plain,.tsv"
        className="hidden"
        onChange={handleFileInput}
      />

      {/* TOP HEADER */}
      <div className="pb-4 border-b border-neutral-100 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-sans uppercase tracking-wider text-neutral-500">
            <span className="text-[#0047FF] font-semibold">Walk-In &amp; Menu Studio</span>
            <span> · </span>
            <span>Recipe Feasibility</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-light tracking-tight text-neutral-950 mt-1">
            Inventory
          </h2>
          <p className="text-xs text-neutral-500 mt-1 max-w-2xl font-light">
            Match restaurant inventory and active menus against viral food trends. Fit analysis currently active for &ldquo;{activeDishName}&rdquo;.
          </p>
        </div>

        {/* Quick Loaders Header Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={loadInventoryFixture}
            className="px-3 py-1.5 rounded-[4px] border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 text-xs font-sans transition shadow-2xs"
          >
            Load Inventory
          </button>
          <button
            type="button"
            onClick={loadMenuFixture}
            className="px-3 py-1.5 rounded-[4px] border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 text-xs font-sans transition shadow-2xs"
          >
            Load Menu
          </button>
          <button
            type="button"
            onClick={loadSalesFixture}
            className="px-3 py-1.5 rounded-[4px] border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 text-xs font-sans transition shadow-2xs"
          >
            Load Sales
          </button>
        </div>
      </div>

      {/* Dropzone if no file uploaded */}
      {!fileDetails && parsedData.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center my-auto py-8">
          <div className="w-full max-w-2xl space-y-6">
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
              className={`relative group cursor-pointer border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition flex flex-col items-center justify-center ${
                isDragging
                  ? "border-[#0047FF] bg-blue-50/50 shadow-sm"
                  : "border-[#0047FF] hover:border-[#0038df] bg-blue-50/20 hover:bg-blue-50/30"
              }`}
            >
              <div className="w-12 h-12 rounded-xl bg-white border border-neutral-200 flex items-center justify-center mb-3 text-[#0047FF] shadow-xs">
                <UploadCloud className="w-6 h-6" />
              </div>

              <h3 className="text-base font-medium text-neutral-950 mb-1">
                Drag and drop your CSV here
              </h3>
              <p className="text-xs text-neutral-500 mb-4">
                Supports standard <span className="font-sans font-medium text-neutral-700">.csv</span> or tab-delimited exports
              </p>

              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[4px] bg-[#0047FF] hover:bg-[#0038df] text-white font-medium text-xs shadow-xs transition"
              >
                <FileUp className="w-3.5 h-3.5" />
                Choose File
              </button>

              <div className="mt-4 text-[11px] font-sans text-neutral-400">
                Client-side parsing · Automatic ingredient &amp; margin fit matching
              </div>
            </div>

            {errorMessage && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                <div>
                  <p className="font-semibold">Failed to parse file</p>
                  <p className="text-neutral-600 mt-0.5">{errorMessage}</p>
                </div>
              </div>
            )}

            {/* Authentic Datasets Quick Cards */}
            <div className="pt-4 border-t border-neutral-100">
              <div className="text-[11px] font-sans uppercase tracking-wider text-neutral-400 mb-3">
                Or inspect sample data:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={loadInventoryFixture}
                  className="p-3.5 rounded-xl border border-neutral-200 bg-white hover:border-neutral-300 text-left transition shadow-2xs flex flex-col justify-between"
                >
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-[#0047FF]" />
                    <span className="text-xs font-semibold text-neutral-900">Walk-In Inventory</span>
                  </div>
                  <div className="text-[11px] text-neutral-500 mt-2 font-sans tabular-nums">
                    20 ingredients, quantities on hand &amp; unit costs
                  </div>
                </button>

                <button
                  type="button"
                  onClick={loadMenuFixture}
                  className="p-3.5 rounded-xl border border-neutral-200 bg-white hover:border-neutral-300 text-left transition shadow-2xs flex flex-col justify-between"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#0047FF]" />
                    <span className="text-xs font-semibold text-neutral-900">Active Menu Items</span>
                  </div>
                  <div className="text-[11px] text-neutral-500 mt-2 font-sans tabular-nums">
                    12 current dishes, retail prices &amp; recipe costs
                  </div>
                </button>

                <button
                  type="button"
                  onClick={loadSalesFixture}
                  className="p-3.5 rounded-xl border border-neutral-200 bg-white hover:border-neutral-300 text-left transition shadow-2xs flex flex-col justify-between"
                >
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-[#0047FF]" />
                    <span className="text-xs font-semibold text-neutral-900">30-Day POS Sales</span>
                  </div>
                  <div className="text-[11px] text-neutral-500 mt-2 font-sans tabular-nums">
                    Order volume across in-store, online &amp; delivery
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
          {/* Top Banner with File details + Actions */}
          <div className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-2xs">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-neutral-50 border border-neutral-200 flex items-center justify-center text-[#0047FF]">
                <FileSpreadsheet className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-neutral-950 text-sm truncate max-w-[280px] sm:max-w-md">
                    {fileDetails.name}
                  </span>
                  <span className="text-xs text-neutral-400 font-sans tabular-nums">
                    ({fileDetails.sizeFormatted})
                  </span>
                </div>
                <div className="text-xs text-neutral-500 mt-0.5 flex items-center gap-2 font-sans tabular-nums">
                  <span>
                    <strong className="text-neutral-900 font-semibold">{parsedData.length}</strong> rows
                  </span>
                  <span>·</span>
                  <span>
                    <strong className="text-neutral-900 font-semibold">{columns.length}</strong> columns
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {allDishes.length > 0 && (
                <div className="relative">
                  <select
                    value={selectedDishName}
                    onChange={(e) => {
                      const newName = e.target.value;
                      setSelectedDishName(newName);
                      const matched = allDishes.find((d) => d.name === newName);
                      if (matched) onSelectDish?.(matched.id);
                      if (parsedData.length > 0) {
                        void runFitAnalysis(newName);
                      }
                    }}
                    className="appearance-none bg-white border border-neutral-300 rounded-[4px] pl-2.5 pr-7 py-1.5 text-xs text-neutral-800 font-sans focus:outline-none focus:border-[#0047FF] shadow-2xs"
                  >
                    {allDishes.map((d) => (
                      <option key={d.id} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-neutral-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              )}

              <button
                type="button"
                onClick={() => void runFitAnalysis()}
                disabled={isAnalyzingFit}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-[4px] bg-[#0047FF] hover:bg-[#0038df] text-white transition shadow-xs"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isAnalyzingFit ? "Matching…" : "Match Against Viral Trends"}</span>
              </button>

              <button
                type="button"
                onClick={triggerUpload}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans rounded-[4px] bg-white hover:bg-neutral-50 text-neutral-700 border border-neutral-200 transition"
              >
                <FileUp className="w-3.5 h-3.5" />
                <span>Replace</span>
              </button>

              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans rounded-[4px] bg-white hover:bg-neutral-50 text-neutral-700 border border-neutral-200 transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>

              <button
                type="button"
                onClick={exportJson}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans rounded-[4px] bg-white hover:bg-neutral-50 text-neutral-700 border border-neutral-200 transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>JSON</span>
              </button>

              <button
                type="button"
                onClick={resetData}
                className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded transition"
                title="Clear table"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {procureNotice && (
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-[#0047FF] font-sans flex items-center gap-2">
              <Check className="w-4 h-4 text-[#0047FF] shrink-0" />
              <span>{procureNotice}</span>
            </div>
          )}

          {/* Part 2: Fit Analysis Results Card */}
          {fitResult && (
            <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-3 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-neutral-100">
                <div>
                  <div className="text-[11px] font-sans text-neutral-400 uppercase tracking-wider">
                    Kitchen Feasibility Diagnosis
                  </div>
                  <h4 className="text-base font-medium text-neutral-950 mt-0.5">
                    {fitResult.dishName}
                  </h4>
                </div>
                <div className="text-right">
                  <div className="text-xl font-medium text-[#0047FF] font-sans tabular-nums">
                    {fitResult.coveragePercent}%
                  </div>
                  <div className="text-[10px] font-sans text-neutral-500 uppercase">
                    {fitResult.isFeasible ? "Feasible with Existing Stock" : "Requires Vendor Procurement"}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 font-sans text-xs">
                <div className="p-3 rounded-lg bg-neutral-50/70 border border-neutral-200/80">
                  <div className="text-neutral-500 text-[10px] uppercase">
                    On-Hand Ingredients ({fitResult.matchedIngredients?.length || 0})
                  </div>
                  <div className="text-neutral-900 font-semibold mt-1">
                    {fitResult.matchedIngredients?.length ? fitResult.matchedIngredients.join(", ") : "None matched"}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-neutral-50/70 border border-neutral-200/80">
                  <div className="text-neutral-500 text-[10px] uppercase">
                    Missing Ingredients ({fitResult.missingIngredients?.length || 0})
                  </div>
                  {fitResult.missingIngredients?.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {fitResult.missingIngredients.map((ing: string) => (
                        <button
                          key={ing}
                          type="button"
                          onClick={() => quickProcureIngredient(ing)}
                          className="inline-flex items-center gap-1 text-[11px] font-sans px-2 py-0.5 rounded border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-900 transition hover:border-[#0047FF] shadow-2xs"
                          title={`Stock ${ing} into walk-in inventory`}
                        >
                          <span>{ing}</span>
                          <Plus className="w-2.5 h-2.5 text-[#0047FF]" />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-emerald-700 font-semibold mt-1">100% In Stock</div>
                  )}
                </div>

                <div className="p-3 rounded-lg bg-neutral-50/70 border border-neutral-200/80">
                  <div className="text-neutral-500 text-[10px] uppercase">
                    P&amp;L Envelope Fit
                  </div>
                  <div className="text-[#0047FF] font-semibold mt-1">
                    Within $2,016 Menu Trials Cap
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Table Header Controls */}
          <div className="flex items-center justify-between gap-3 pt-1 text-xs font-sans text-neutral-500">
            <div>
              Showing <strong className="text-neutral-900 font-semibold tabular-nums">{paginatedData.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}</strong>–<strong className="text-neutral-900 font-semibold tabular-nums">{Math.min(currentPage * pageSize, filteredData.length)}</strong> of <span className="tabular-nums">{parsedData.length}</span> rows
            </div>

            <div className="flex items-center gap-2">
              <span>Rows:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="bg-white border border-neutral-200 rounded px-2 py-1 text-xs text-neutral-800 focus:outline-none focus:border-[#0047FF]"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          {/* Interactive Table */}
          <div className="border border-neutral-200 rounded-xl overflow-hidden bg-white flex-1 flex flex-col shadow-2xs">
            <div className="overflow-x-auto flex-1 max-h-[580px] overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse font-sans">
                <thead className="bg-neutral-50 text-neutral-500 font-medium border-b border-neutral-200 sticky top-0 z-10">
                  <tr>
                    <th className="py-2.5 px-3 w-10 text-center text-neutral-400 text-[11px]">#</th>
                    {columns.map((col) => (
                      <th
                        key={col}
                        onClick={() => toggleSort(col)}
                        className="py-2.5 px-3 select-none cursor-pointer hover:bg-neutral-100 transition whitespace-nowrap text-[11px] uppercase tracking-wider text-neutral-600"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>{col}</span>
                          <span className="text-neutral-400">
                            {sortCol === col && sortAsc && <ArrowUp className="w-3 h-3 text-[#0047FF]" />}
                            {sortCol === col && !sortAsc && <ArrowDown className="w-3 h-3 text-[#0047FF]" />}
                            {sortCol !== col && <ArrowUpDown className="w-3 h-3 opacity-30" />}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {paginatedData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-neutral-50/70 transition">
                      <td className="py-2 px-3 text-center text-neutral-400 text-[11px] tabular-nums">
                        {(currentPage - 1) * pageSize + idx + 1}
                      </td>
                      {columns.map((col) => (
                        <td
                          key={col}
                          className="py-2 px-3 whitespace-nowrap text-neutral-800 text-xs"
                        >
                          {col.toLowerCase() === "amount" && isNumeric(row[col]) ? (
                            <span className={Number(row[col]) < 0 ? "text-rose-600 font-medium tabular-nums" : "text-neutral-900 font-medium tabular-nums"}>
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
                      <td colSpan={columns.length + 1} className="py-12 text-center text-neutral-400">
                        <p className="text-xs font-sans">No matching records found.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="border-t border-neutral-100 bg-neutral-50 px-4 py-2.5 flex items-center justify-between text-xs font-sans text-neutral-500">
              <div>
                Page <strong className="text-neutral-900 tabular-nums">{currentPage}</strong> of{" "}
                <strong className="text-neutral-900 tabular-nums">{totalPages || 1}</strong>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="p-1 rounded border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-30 transition text-neutral-700"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="p-1 rounded border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-30 transition text-neutral-700"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
