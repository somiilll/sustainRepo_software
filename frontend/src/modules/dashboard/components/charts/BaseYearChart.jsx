// import React, { useMemo } from 'react';
// import {
//   ResponsiveContainer,
//   BarChart,
//   Bar,
//   XAxis,
//   YAxis,
//   CartesianGrid,
//   Tooltip,
//   Cell,
//   Legend,
// } from 'recharts';

// const SCOPE_COLORS = {
//   'Scope 1': {
//     base: '#A7F3D0',
//     reporting: '#10B981',
//   },

//   'Scope 2': {
//     base: '#BFDBFE',
//     reporting: '#3B82F6',
//   },

//   'Scope 3': {
//     base: '#DDD6FE',
//     reporting: '#8B5CF6',
//   },
// };

// function CustomTooltip({
//   active,
//   payload,
//   label,
// }) {
//   if (!active || !payload?.length) {
//     return null;
//   }

//   const row = payload?.[0]?.payload;

//   return (
//     <div className="bg-white border border-stone-200 rounded-xl shadow-lg p-3 min-w-[220px]">
//       <p className="text-sm font-semibold text-stone-900 mb-2">
//         {label}
//       </p>

//       <div className="space-y-1.5">
//         <div className="flex items-center justify-between gap-4 text-xs">
//           <span className="text-stone-500">
//             {row.baseYearLabel}
//           </span>

//           <span className="font-semibold text-stone-900">
//             {row.baseYear.toFixed(2)} tCO₂e
//           </span>
//         </div>

//         <div className="flex items-center justify-between gap-4 text-xs">
//           <span className="text-stone-500">
//             Reporting Period
//           </span>

//           <span className="font-semibold text-stone-900">
//             {row.reportingYear.toFixed(2)} tCO₂e
//           </span>
//         </div>

//         <div className="pt-2 border-t border-stone-100 flex items-center justify-between">
//           <span className="text-xs text-stone-500">
//             Change
//           </span>

//           <span
//             className={`text-xs font-bold ${
//               row.changePct > 0
//                 ? 'text-red-500'
//                 : 'text-emerald-600'
//             }`}
//           >
//             {row.changePct > 0 ? '+' : ''}
//             {row.changePct.toFixed(1)}%
//           </span>
//         </div>
//       </div>
//     </div>
//   );
// }

// export default function BaseYearChart({
//   data = [],
//   height = 385,
// }) {
//   const chartData = useMemo(() => {
//     return data.map((r) => ({
//       ...r,

//       baseColor:
//         SCOPE_COLORS[r.scope]?.base ||
//         '#D6D3D1',

//       reportingColor:
//         SCOPE_COLORS[r.scope]?.reporting ||
//         '#78716C',
//     }));
//   }, [data]);

//   if (!chartData.length) {
//     return (
//       <div className="flex items-center justify-center h-[280px] text-sm text-stone-400">
//         No base year comparison data
//       </div>
//     );
//   }

//   return (
//     <div className="w-full h-full">
//       <ResponsiveContainer
//         width="100%"
//         height={height}
//       >
//         <BarChart
//           data={chartData}
//           barGap={10}
//           barCategoryGap="20%"
//           margin={{
//             top: 20,
//             right: 10,
//             left: -10,
//             bottom: 5,
//           }}
//         >
//           <CartesianGrid
//             strokeDasharray="3 3"
//             vertical={false}
//             stroke="#E7E5E4"
//           />

//           <XAxis
//             dataKey="scope"
//             tick={{
//               fontSize: 12,
//               fill: '#57534E',
//               fontWeight: 600,
//             }}
//             axisLine={false}
//             tickLine={false}
//           />

//           <YAxis
//             tick={{
//               fontSize: 11,
//               fill: '#78716C',
//             }}
//             axisLine={false}
//             tickLine={false}
//             width={70}
//             label={{
//               value: 'tCO₂e',
//               angle: -90,
//               position: 'insideLeft',
//               offset: 15,
//               style: {
//                 textAnchor: 'middle',
//                 fill: '#78716C',
//                 fontSize: 10,
//                 fontWeight: 600,
//               },
//             }}
//           />

//           <Tooltip
//             content={<CustomTooltip />}
//             cursor={{
//               fill: 'rgba(0,0,0,0.03)',
//             }}
//           />

//           {/* <Legend
//             wrapperStyle={{
//               fontSize: 12,
//               paddingTop: 8,
//             }}
//           /> */}

//           {/* BASE YEAR */}
//           {/* <Bar
//             dataKey="baseYear"
//             name="Base Year"
//             radius={[6, 6, 0, 0]}
//             barSize={50}
//           >
//             {chartData.map((entry, idx) => (
//               <Cell
//                 key={`base-${idx}`}
//                 fill={entry.baseColor}
//               />
//             ))}
//           </Bar> */}

//           <Bar
//             dataKey="baseYear"
//             name="Base Year"
//             radius={[6, 6, 0, 0]}
//             shape={(props) => {
//               return (
//                 <rect
//                   x={props.x}
//                   y={props.y}
//                   width={props.width}
//                   height={props.height}
//                   rx={6}
//                   fill={props.payload.baseColor}
//                 />
//               );
//             }}
//           />

//           {/* REPORTING YEAR */}
//           <Bar
//             dataKey="reportingYear"
//             name="Reporting Period"
//             radius={[6, 6, 0, 0]}
//             shape={(props) => {
//               return (
//                 <rect
//                   x={props.x}
//                   y={props.y}
//                   width={props.width}
//                   height={props.height}
//                   rx={6}
//                   fill={props.payload.reportingColor}
//                 />
//               );
//             }}
//           />

//         </BarChart>
//       </ResponsiveContainer>
//     </div>
//   );
// }




import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

const SCOPE_COLORS = {
  'Scope 1': {
    base: '#A7F3D0',
    reporting: '#10B981',
  },

  'Scope 2': {
    base: '#BFDBFE',
    reporting: '#3B82F6',
  },

  'Scope 3': {
    base: '#DDD6FE',
    reporting: '#8B5CF6',
  },
};

function CustomTooltip({
  active,
  payload,
  label,
}) {
  if (!active || !payload?.length) {
    return null;
  }

  const row = payload?.[0]?.payload;

  return (
    <div className="bg-white border border-stone-200 rounded-xl shadow-lg p-3 min-w-[220px]">
      <p className="text-sm font-semibold text-stone-900 mb-2">
        {label}
      </p>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4 text-xs">
          <span className="text-stone-500">
            {row.baseYearLabel}
          </span>

          <span className="font-semibold text-stone-900">
            {row.baseYear.toFixed(2)} tCO₂e
          </span>
        </div>

        <div className="flex items-center justify-between gap-4 text-xs">
          <span className="text-stone-500">
            Reporting Period
          </span>

          <span className="font-semibold text-stone-900">
            {row.reportingYear.toFixed(2)} tCO₂e
          </span>
        </div>

        <div className="pt-2 border-t border-stone-100 flex items-center justify-between">
          <span className="text-xs text-stone-500">
            Change
          </span>

          <span
            className={`text-xs font-bold ${
              row.changePct > 0
                ? 'text-red-500'
                : 'text-emerald-600'
            }`}
          >
            {row.changePct > 0 ? '+' : ''}
            {row.changePct.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}

export default function BaseYearChart({
  data = [],
  height = 340,
}) {
  const chartData = useMemo(() => {
    return data.map((r) => ({
      ...r,

      baseColor:
        SCOPE_COLORS[r.scope]?.base ||
        '#D6D3D1',

      reportingColor:
        SCOPE_COLORS[r.scope]?.reporting ||
        '#78716C',
    }));
  }, [data]);

  if (!chartData.length) {
    return (
      <div className="flex items-center justify-center h-[280px] text-sm text-stone-400">
        No base year comparison data
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <ResponsiveContainer
        width="100%"
        height={height}
      >
        <BarChart
          data={chartData}
          layout="vertical"
          barGap={8}
          barCategoryGap="28%"
          margin={{
            top: 10,
            right: 25,
            left: 10,
            bottom: 10,
          }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            horizontal={true}
            vertical={false}
            stroke="#E7E5E4"
          />

          {/* VALUE AXIS */}
          <XAxis
            type="number"
            tick={{
              fontSize: 11,
              fill: '#78716C',
            }}
            axisLine={false}
            tickLine={false}
            label={{
              value: 'tCO₂e',
              position: 'insideBottomRight',
              offset: -5,
              style: {
                fill: '#78716C',
                fontSize: 10,
                fontWeight: 600,
              },
            }}
          />

          {/* CATEGORY AXIS */}
          <YAxis
            type="category"
            dataKey="scope"
            width={85}
            tick={{
              fontSize: 12,
              fill: '#57534E',
              fontWeight: 600,
            }}
            axisLine={false}
            tickLine={false}
          />

          <Tooltip
            content={<CustomTooltip />}
            cursor={{
              fill: 'rgba(0,0,0,0.03)',
            }}
          />

          {/* BASE YEAR */}
          <Bar
            dataKey="baseYear"
            name="Base Year"
            radius={[0, 6, 6, 0]}
            barSize={38}
            shape={(props) => {
              return (
                <rect
                  x={props.x}
                  y={props.y}
                  width={props.width}
                  height={props.height}
                  rx={6}
                  fill={props.payload.baseColor}
                />
              );
            }}
          />

          {/* REPORTING PERIOD */}
          <Bar
            dataKey="reportingYear"
            name="Reporting Period"
            radius={[0, 6, 6, 0]}
            barSize={38}
            shape={(props) => {
              return (
                <rect
                  x={props.x}
                  y={props.y}
                  width={props.width}
                  height={props.height}
                  rx={6}
                  fill={props.payload.reportingColor}
                />
              );
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}