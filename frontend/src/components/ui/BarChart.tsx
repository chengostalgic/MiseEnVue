"use client";

import React, {
  createContext,
  useContext,
  useState,
  useMemo,
  useRef,
  useCallback,
} from "react";

interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface BarChartContextValue {
  data: Record<string, any>[];
  xDataKey: string;
  margin: Margin;
  barGap: number;
  chartWidth: number;
  chartHeight: number;
  plotWidth: number;
  plotHeight: number;
  barWidth: number;
  xScale: (index: number) => number;
  yScale: (value: number) => number;
  maxValue: number;
  hoveredIndex: number | null;
  setHoveredIndex: (index: number | null) => void;
  hoveredPos: { x: number; y: number } | null;
  activeDataKey: string;
  setActiveDataKey: (key: string) => void;
}

const BarChartContext = createContext<BarChartContextValue | null>(null);

function useBarChart() {
  const context = useContext(BarChartContext);
  if (!context) {
    throw new Error("Chart components must be used within a <BarChart />");
  }
  return context;
}

export interface BarChartProps {
  data: Record<string, any>[];
  xDataKey: string;
  margin?: Partial<Margin>;
  barGap?: number;
  children: React.ReactNode;
  className?: string;
  height?: number;
}

export function BarChart({
  data,
  xDataKey,
  margin = {},
  barGap = 0,
  children,
  className = "",
  height = 160,
}: BarChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [hoveredPos, setHoveredPos] = useState<{ x: number; y: number } | null>(null);
  const [activeDataKey, setActiveDataKey] = useState<string>("revenue");
  const containerRef = useRef<HTMLDivElement>(null);

  const fullMargin: Margin = useMemo(
    () => ({
      top: margin.top ?? 8,
      right: margin.right ?? 8,
      bottom: margin.bottom ?? 40,
      left: margin.left ?? 8,
    }),
    [margin.top, margin.right, margin.bottom, margin.left],
  );

  const chartWidth = 840;
  const chartHeight = height;
  const plotWidth = Math.max(0, chartWidth - fullMargin.left - fullMargin.right);
  const plotHeight = Math.max(0, chartHeight - fullMargin.top - fullMargin.bottom);

  const numBars = data.length || 1;
  const totalGaps = (numBars - 1) * barGap;
  const barWidth = Math.max(4, (plotWidth - totalGaps) / numBars);

  const maxValue = useMemo(() => {
    let max = 0;
    for (const item of data) {
      const val = Number(item[activeDataKey]) || 0;
      if (val > max) max = val;
    }
    return max > 0 ? max * 1.08 : 100;
  }, [data, activeDataKey]);

  const xScale = useCallback(
    (index: number) => fullMargin.left + index * (barWidth + barGap),
    [fullMargin.left, barWidth, barGap],
  );

  const yScale = useCallback(
    (val: number) => {
      const clamped = Math.max(0, Math.min(val, maxValue));
      const ratio = clamped / maxValue;
      return fullMargin.top + plotHeight - ratio * plotHeight;
    },
    [fullMargin.top, plotHeight, maxValue],
  );

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svgRect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX - svgRect.left;
    const svgX = (clientX / svgRect.width) * chartWidth;

    const relativeX = svgX - fullMargin.left;
    const step = barWidth + barGap;
    const idx = Math.floor(relativeX / step);

    if (idx >= 0 && idx < data.length) {
      setHoveredIndex(idx);
      const bx = xScale(idx) + barWidth / 2;
      const by = yScale(Number(data[idx][activeDataKey]) || 0);
      setHoveredPos({ x: bx, y: by });
    } else {
      setHoveredIndex(null);
      setHoveredPos(null);
    }
  };

  const handleMouseLeave = () => {
    setHoveredIndex(null);
    setHoveredPos(null);
  };

  const contextValue: BarChartContextValue = {
    data,
    xDataKey,
    margin: fullMargin,
    barGap,
    chartWidth,
    chartHeight,
    plotWidth,
    plotHeight,
    barWidth,
    xScale,
    yScale,
    maxValue,
    hoveredIndex,
    setHoveredIndex,
    hoveredPos,
    activeDataKey,
    setActiveDataKey,
  };

  return (
    <BarChartContext.Provider value={contextValue}>
      <div
        ref={containerRef}
        className={`relative w-full select-none ${className}`}
        style={{ touchAction: "none" }}
      >
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full h-auto block overflow-visible"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {children}
        </svg>
      </div>
    </BarChartContext.Provider>
  );
}

export function LinearGradient({
  from,
  id,
  to = "transparent",
}: {
  from: string;
  id: string;
  to?: string;
}) {
  const fallbackColor = "#0047FF";
  const stopColor = from.startsWith("var") ? from : from || fallbackColor;
  const endColor = to === "transparent" ? stopColor : to;

  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={stopColor} stopOpacity={0.88} />
        <stop offset="45%" stopColor={stopColor} stopOpacity={0.35} />
        <stop offset="100%" stopColor={endColor} stopOpacity={0.0} />
      </linearGradient>
    </defs>
  );
}

export function Grid({
  horizontal = true,
  stroke = "#f0f0f2",
}: {
  horizontal?: boolean;
  stroke?: string;
}) {
  const { margin, plotWidth, plotHeight } = useBarChart();

  if (!horizontal) return null;

  const lines = [0.25, 0.5, 0.75, 1.0];

  return (
    <g className="grid-lines" opacity={0.75}>
      {lines.map((ratio, i) => {
        const y = margin.top + plotHeight - ratio * plotHeight;
        return (
          <line
            key={i}
            x1={margin.left}
            y1={y}
            x2={margin.left + plotWidth}
            y2={y}
            stroke={stroke}
            strokeDasharray="3 3"
            strokeWidth={1}
          />
        );
      })}
    </g>
  );
}

export function Bar({
  dataKey,
  fill,
  lineCap = "butt",
  stroke = "var(--chart-3, #0047FF)",
}: {
  dataKey: string;
  fill: string;
  lineCap?: "butt" | "round" | "square";
  stroke?: string;
}) {
  const { data, barWidth, xScale, yScale, plotHeight, margin, hoveredIndex, setActiveDataKey } =
    useBarChart();

  React.useEffect(() => {
    setActiveDataKey(dataKey);
  }, [dataKey, setActiveDataKey]);

  return (
    <g className="chart-bars">
      {data.map((item, index) => {
        const val = Number(item[dataKey]) || 0;
        const x = xScale(index);
        const y = yScale(val);
        const h = Math.max(0, margin.top + plotHeight - y);
        const isHovered = hoveredIndex === index;

        return (
          <g key={index} className="transition-opacity duration-150">
            {/* Bar Body with Gradient Fill */}
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={h}
              fill={fill}
              className={`transition-all duration-150 ${
                isHovered ? "opacity-100 brightness-110" : "opacity-90"
              }`}
            />
            {/* Top Cap Stroke */}
            <line
              x1={x}
              y1={y}
              x2={x + barWidth}
              y2={y}
              stroke={stroke}
              strokeWidth={isHovered ? 2.5 : 1.75}
              strokeLinecap={lineCap}
            />
          </g>
        );
      })}
    </g>
  );
}

export function BarXAxis({ stroke = "#e4e4e7" }: { stroke?: string }) {
  const { data, xDataKey, barWidth, xScale, plotHeight, margin, plotWidth, hoveredIndex } =
    useBarChart();

  const axisY = margin.top + plotHeight;

  return (
    <g className="chart-x-axis">
      {/* Horizontal Axis Baseline */}
      <line
        x1={margin.left}
        y1={axisY}
        x2={margin.left + plotWidth}
        y2={axisY}
        stroke={stroke}
        strokeWidth={1}
      />
      {/* Month / Cycle Text Labels */}
      {data.map((item, index) => {
        const x = xScale(index) + barWidth / 2;
        const isHovered = hoveredIndex === index;
        return (
          <g key={index}>
            <line
              x1={x}
              y1={axisY}
              x2={x}
              y2={axisY + 4}
              stroke={stroke}
              strokeWidth={1}
            />
            <text
              x={x}
              y={axisY + 18}
              textAnchor="middle"
              className={`font-sans text-[11px] transition-colors ${
                isHovered ? "fill-neutral-950 font-semibold" : "fill-neutral-400 font-normal"
              }`}
            >
              {item[xDataKey]}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export function BarLineIndicator({
  data,
  valueKey,
  xKey,
  stroke = "var(--chart-3, #0047FF)",
}: {
  data: Record<string, any>[];
  valueKey: string;
  xKey: string;
  stroke?: string;
}) {
  const { barWidth, xScale, yScale, hoveredIndex } = useBarChart();

  if (!data || data.length === 0) return null;

  const points = data.map((item, i) => {
    const x = xScale(i) + barWidth / 2;
    const y = yScale(Number(item[valueKey]) || 0);
    return { x, y };
  });

  const pathD = points.reduce((acc, pt, i) => {
    if (i === 0) return `M ${pt.x},${pt.y}`;
    return `${acc} L ${pt.x},${pt.y}`;
  }, "");

  return (
    <g className="bar-line-indicator pointer-events-none">
      {/* Connecting Trend Line */}
      <path
        d={pathD}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.85}
      />
      {/* Indicator Dots at Tops of Bars */}
      {points.map((pt, i) => {
        const isHovered = hoveredIndex === i;
        return (
          <circle
            key={i}
            cx={pt.x}
            cy={pt.y}
            r={isHovered ? 4.5 : 2.5}
            fill="#ffffff"
            stroke={stroke}
            strokeWidth={isHovered ? 2.5 : 1.75}
            className="transition-all duration-150"
          />
        );
      })}
    </g>
  );
}

export function ChartTooltip({
  showCrosshair = false,
  showDots = false,
}: {
  showCrosshair?: boolean;
  showDots?: boolean;
}) {
  const { data, xDataKey, activeDataKey, hoveredIndex, xScale, yScale, barWidth, chartWidth } =
    useBarChart();

  if (hoveredIndex === null || !data[hoveredIndex]) return null;

  const item = data[hoveredIndex];
  const x = xScale(hoveredIndex) + barWidth / 2;
  const val = Number(item[activeDataKey]) || 0;
  const y = yScale(val);

  // Keep tooltip inside chart boundaries
  const tooltipWidth = 120;
  const tooltipHeight = 52;
  const isRightEdge = x + tooltipWidth / 2 > chartWidth - 16;
  const isLeftEdge = x - tooltipWidth / 2 < 16;
  const tooltipX = isRightEdge
    ? chartWidth - tooltipWidth - 8
    : isLeftEdge
    ? 8
    : x - tooltipWidth / 2;
  const tooltipY = Math.max(6, y - tooltipHeight - 10);

  return (
    <g className="chart-tooltip pointer-events-none animate-in fade-in duration-100">
      {showCrosshair && (
        <line
          x1={x}
          y1={0}
          x2={x}
          y2={180}
          stroke="#0047FF"
          strokeWidth={1}
          strokeDasharray="2 2"
          opacity={0.4}
        />
      )}
      {showDots && (
        <circle cx={x} cy={y} r={5} fill="#0047FF" stroke="#ffffff" strokeWidth={2} />
      )}
      {/* Tooltip Card */}
      <foreignObject
        x={tooltipX}
        y={tooltipY}
        width={tooltipWidth}
        height={tooltipHeight}
        className="overflow-visible"
      >
        <div className="bg-white/95 backdrop-blur-xs border border-neutral-200/90 rounded-[4px] px-2.5 py-1.5 shadow-md text-left select-none font-sans">
          <div className="flex items-center justify-between text-[10px] text-neutral-400">
            <span>{item[xDataKey]}</span>
            <span className="text-[#0047FF] font-semibold">Velocity</span>
          </div>
          <div className="text-xs font-semibold text-neutral-950 mt-0.5 tabular-nums">
            ${val.toLocaleString()}
          </div>
        </div>
      </foreignObject>
    </g>
  );
}
