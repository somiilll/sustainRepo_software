// import React, { useMemo, useState } from 'react';
// import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
// import { Expand, X } from 'lucide-react';

// function GradientDef({ id, color }) {
//   return (
//     <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
//       <stop offset="5%" stopColor={color} stopOpacity={1} />
//       <stop offset="95%" stopColor={color} stopOpacity={0} />
//     </linearGradient>
//   );
// }


// // const renderSeries = (chartType, series, stacked) => series.map((item, index) => {
// //   const shared = { key: item.key, dataKey: item.key, name: item.label, stroke: item.color, fill: item.color, strokeWidth: 2.2, stackId: stacked ? 'stack' : undefined };
// //   if (chartType === 'bar') return <Bar {...shared} key={item.key} radius={index === series.length - 1 ? [4, 4, 0, 0] : 0} />;
// //   if (chartType === 'area') return <Area {...shared} key={item.key} fillOpacity={0.14} type="monotone" />;
// //   return <Line {...shared} key={item.key} type="monotone" dot={false} activeDot={{ r: 4 }} />;
// // });

// const renderSeries = (chartType, series, stacked) => {
//   // React Router breaks SVG gradients if you don't explicitly tell it the current page path.
//   const path = typeof window !== 'undefined' ? window.location.pathname : '';

//   return series.map((item, index) => {
//     const isArea = chartType === 'area';
    
//     const shared = { 
//       key: item.key, 
//       dataKey: item.key, 
//       name: item.label, 
//       stroke: item.color, 
//       // FIX 2: Prepend the path to the URL so the browser can actually find your gradient
//       fill: isArea ? `url(${path}#grad-${item.key})` : item.color, 
//       strokeWidth: 2.2, 
//       stackId: stacked ? 'stack' : undefined 
//     };
    
//     if (chartType === 'bar') {
//       return <Bar {...shared} key={item.key} radius={index === series.length - 1 ? [4, 4, 0, 0] : 0} />;
//     }
    
//     if (chartType === 'area') {
//       // FIX 3: Add fillOpacity={1}. 
//       // Recharts forces 0.6 opacity by default, which washes out your custom gradient.
//       return <Area {...shared} key={item.key} type="monotone" fillOpacity={1} />;
//     }
    
//     return <Line {...shared} key={item.key} type="monotone" dot={false} activeDot={{ r: 4 }} />;
//   });
// };


// export const AnalyticsChartCard = ({ 
//   className = '', 
//   headerAction, 
//   title, 
//   subtitle, 
//   data = [], 
//   series = [], 
//   chartType = 'area', 
//   stacked = false, 
//   accent = '#1A4D2E', 
//   unit = '', 
//   testId, 
//   onDrilldown, 
//   loading = false 
// }) => {
//   const [fullscreen, setFullscreen] = useState(false);
//   const hasData = useMemo(() => data.some((row) => series.some((item) => Number(row[item.key]) > 0)), [data, series]);
//   const Chart = chartType === 'bar' ? BarChart : chartType === 'area' ? AreaChart : LineChart;
  
//   // Changed hardcoded heights to 100% so it inherits from the flex-1 wrapper
//   const content = loading ? (
//     <div className="h-full w-full animate-pulse rounded-md bg-stone-100 dark:bg-stone-800" data-testid={`${testId}-loading`} />
//   ) : hasData ? (
//     <ResponsiveContainer width="100%" height="100%">
//       <Chart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} onClick={(state) => onDrilldown?.(state?.activePayload?.[0]?.payload, title)}>
//         <defs>
//             {series.map((item) => (
//               <GradientDef key={item.key} id={`grad-${item.key}`} color={item.color} />
//             ))}
//           </defs>
//         <CartesianGrid vertical={false} stroke="#E7E5E4" strokeDasharray="3 3" />
//         <XAxis dataKey="period" tickLine={false} axisLine={false} tick={{ fill: '#78716C', fontSize: 10 }} />
//         <YAxis tickLine={false} axisLine={false} tick={{ fill: '#78716C', fontSize: 10 }} width={44} />
//         <Tooltip formatter={(value) => [`${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ''}`]} contentStyle={{ borderRadius: 8, border: '1px solid #E7E5E4', boxShadow: '0 8px 18px rgba(28,25,23,.10)' }} />
//         <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
//         {renderSeries(chartType, series, stacked)}
//       </Chart>
//     </ResponsiveContainer>
//   ) : (
//     <div className="flex h-full w-full items-center justify-center text-sm text-stone-400 dark:text-stone-500" data-testid={`${testId}-empty`}>
//       No reported data for these filters
//     </div>
//   );

//   return (
//     <>
//       {/* 1. Added flex flex-col and injected className */}
//       <section className={`relative flex flex-col min-w-0 overflow-hidden rounded-lg border border-stone-200 bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-shadow duration-200 hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] dark:border-stone-700 dark:bg-stone-900 ${className}`} data-testid={testId}>
//         <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: accent }} />
//         <div className="mb-4 flex items-start justify-between gap-3">
//           <div>
//             <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">{title}</h3>
//             <p className="mt-0.5 text-xs text-stone-500">{subtitle}</p>
//           </div>
          
//           {/* 2. Render headerAction next to the fullscreen button */}
//           <div className="flex items-center gap-3">
//             {headerAction && <div>{headerAction}</div>}
//             <button type="button" aria-label={`Open ${title} fullscreen`} onClick={() => setFullscreen(true)} className="rounded-md p-1.5 text-stone-400 transition-colors duration-200 hover:bg-stone-100 hover:text-stone-700" data-testid={`${testId}-fullscreen-button`}>
//               <Expand className="h-4 w-4" />
//             </button>
//           </div>
//         </div>
        
//         {/* 3. Wrap content in a flex-1 container with a minimum height so it stretches correctly */}
//         <div className="flex-1 w-full min-h-[236px]">
//           {content}
//         </div>
//       </section>

//       {/* Fullscreen Modal Update */}
//       {fullscreen && (
//         <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-950/50 p-4" data-testid={`${testId}-fullscreen-modal`}>
//           <section className="relative flex flex-col h-[min(720px,94vh)] w-[min(1100px,96vw)] rounded-lg bg-white p-6 shadow-2xl dark:bg-stone-900">
//             <button type="button" aria-label={`Close ${title} fullscreen`} onClick={() => setFullscreen(false)} className="absolute right-4 top-4 rounded-md p-2 text-stone-500 transition-colors duration-200 hover:bg-stone-100" data-testid={`${testId}-fullscreen-close`}>
//               <X className="h-5 w-5" />
//             </button>
//             <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">{title}</h2>
//             <p className="mb-5 text-sm text-stone-500">{subtitle}</p>
//             <div className="flex-1 w-full min-h-0">
//               {content}
//             </div>
//           </section>
//         </div>
//       )}
//     </>
//   );
// };


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