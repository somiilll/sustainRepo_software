import React, { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Expand, X } from "lucide-react";

function GradientDef({ id, color }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={color} stopOpacity={0.35} />
      <stop offset="60%" stopColor={color} stopOpacity={0.15} />
      <stop offset="100%" stopColor={color} stopOpacity={0} />
    </linearGradient>
  );
}

const renderSeries = (chartType, series, stacked) =>
  series.map((item, index) => {
    const commonProps = {
      key: item.key,
      dataKey: item.key,
      name: item.label,
      stroke: item.color,
      strokeWidth: 2.5,
      stackId: stacked ? "stack" : undefined,
    };

    if (chartType === "bar") {
      return (
        <Bar
          {...commonProps}
          fill={item.color}
          radius={index === series.length - 1 ? [4, 4, 0, 0] : 0}
        />
      );
    }

    if (chartType === "area") {
      return (
        <Area
          {...commonProps}
          type="monotone"
          fill={`url(#grad-${item.key})`}
          fillOpacity={1}
          activeDot={{ r: 5 }}
        />
      );
    }

    return (
      <Line
        {...commonProps}
        type="monotone"
        dot={false}
        activeDot={{ r: 5 }}
      />
    );
  });

export const AnalyticsChartCard = ({
  className = "",
  headerAction,
  title,
  subtitle,
  data = [],
  series = [],
  chartType = "area",
  stacked = false,
  accent = "#1A4D2E",
  unit = "",
  testId,
  onDrilldown,
  loading = false,
}) => {
  const [fullscreen, setFullscreen] = useState(false);

  const hasData = useMemo(() => {
    return data.some((row) =>
      series.some((item) => Number(row[item.key]) > 0)
    );
  }, [data, series]);

  const Chart =
    chartType === "bar"
      ? BarChart
      : chartType === "area"
      ? AreaChart
      : LineChart;

  const chartContent = loading ? (
    <div className="h-full w-full animate-pulse rounded-md bg-stone-100" />
  ) : hasData ? (
    <ResponsiveContainer width="100%" height="100%">
      <Chart
        data={data}
        margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
        onClick={(state) =>
          onDrilldown?.(state?.activePayload?.[0]?.payload, title)
        }
      >
        <defs>
          {series.map((item) => (
            <GradientDef
              key={item.key}
              id={`grad-${item.key}`}
              color={item.color}
            />
          ))}
        </defs>

        <CartesianGrid
          vertical={false}
          stroke="#E7E5E4"
          strokeDasharray="3 3"
        />

        <XAxis
          dataKey="period"
          tickLine={false}
          axisLine={false}
          tick={{ fill: "#78716C", fontSize: 11 }}
        />

        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fill: "#78716C", fontSize: 11 }}
          width={45}
        />

        <Tooltip
          formatter={(value) => [
            `${Number(value).toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}${unit ? ` ${unit}` : ""}`,
          ]}
          contentStyle={{
            borderRadius: 10,
            border: "1px solid #E7E5E4",
            boxShadow: "0 8px 20px rgba(0,0,0,.08)",
          }}
        />

        <Legend iconType="circle" />

        {renderSeries(chartType, series, stacked)}
      </Chart>
    </ResponsiveContainer>
  ) : (
    <div className="flex h-full items-center justify-center text-sm text-stone-400">
      No reported data for these filters
    </div>
  );

  return (
    <>
      <section
        className={`relative flex flex-col overflow-hidden rounded-lg border border-stone-200 bg-white p-5 shadow-sm hover:shadow-lg ${className}`}
      >
        <div
          className="absolute inset-x-0 top-0 h-1"
          style={{ background: accent }}
        />

        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="mt-1 text-xs text-stone-500">{subtitle}</p>
          </div>

          <div className="flex items-center gap-3">
            {headerAction}

            <button
              onClick={() => setFullscreen(true)}
              className="rounded-md p-1.5 hover:bg-stone-100"
            >
              <Expand className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-[280px] flex-1">{chartContent}</div>
      </section>

      {fullscreen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
          <div className="flex h-[90vh] w-[95vw] flex-col rounded-xl bg-white p-6">
            <button
              onClick={() => setFullscreen(false)}
              className="absolute right-8 top-8 rounded-md p-2 hover:bg-stone-100"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="mb-5 text-sm text-stone-500">{subtitle}</p>

            <div className="min-h-0 flex-1">{chartContent}</div>
          </div>
        </div>
      )}
    </>
  );
};