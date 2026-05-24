// /**
//  * BaseYearSankey — emissions flow from Base Year & Current Year through Scopes.
//  * Uses Recharts <Sankey>.
//  */
// import React from 'react';
// import { ResponsiveContainer, Sankey, Tooltip, Layer, Rectangle } from 'recharts';

// const SCOPE_PALETTE = {
//   'Scope 1': '#10B981',
//   'Scope 2': '#3B82F6',
//   'Scope 3': '#8B5CF6',
//   'Biogenic': '#F59E0B',
// };

// function nodeColor(payload) {
//   const scope = payload?.scope;
//   return SCOPE_PALETTE[scope] || '#78716C';
// }

// function SankeyNode({ x, y, width, height, index, payload }) {
//   const color = nodeColor(payload);
//   return (
//     <Layer key={`node-${index}`}>
//       <Rectangle x={x} y={y} width={width} height={height} fill={color} fillOpacity={0.92} />
//     </Layer>
//   );
// }

// function SankeyLink({ sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX, linkWidth, payload }) {
//   const color = SCOPE_PALETTE[payload?.scope] || '#A8A29E';
//   const path = `M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`;
//   return (
//     <path
//       d={path}
//       fill="none"
//       stroke={color}
//       strokeOpacity={0.32}
//       strokeWidth={linkWidth}
//     />
//   );
// }

// export default function BaseYearSankey({ nodes = [], links = [], height = 280 }) {
//   if (!nodes.length || !links.length) {
//     return (
//       <div className="flex flex-col items-center justify-center h-[260px] text-sm text-stone-400 gap-1" data-testid="sankey-empty">
//         <p>Base year not configured yet.</p>
//         <p className="text-xs">Configure base year emissions to see comparison flow.</p>
//       </div>
//     );
//   }
//   return (
//     <div data-testid="base-year-sankey">
//       <ResponsiveContainer width="100%" height={height}>
//         <Sankey
//           data={{ nodes, links }}
//           node={(p) => <SankeyNode {...p} />}
//           link={(p) => <SankeyLink {...p} />}
//           nodePadding={16}
//           nodeWidth={10}
//           margin={{ top: 6, right: 10, bottom: 6, left: 10 }}
//         >
//           <Tooltip
//             contentStyle={{ borderRadius: 10, border: '1px solid #E7E5E4', boxShadow: '0 6px 14px rgba(0,0,0,0.08)', fontSize: 12 }}
//             formatter={(v, _, p) => {
//               const pl = p?.payload?.payload || p?.payload;
//               if (pl && pl.base != null && pl.current != null) {
//                 return [`Base ${pl.base.toFixed(2)} → Current ${pl.current.toFixed(2)} tCO₂e`, pl.scope];
//               }
//               return `${Number(v).toFixed(2)} tCO₂e`;
//             }}
//           />
//         </Sankey>
//       </ResponsiveContainer>
//     </div>
//   );
// }


import React, { useState } from 'react';
import {
  ResponsiveContainer,
  Sankey,
  Tooltip,
  Layer,
  Rectangle,
} from 'recharts';

const SCOPE_PALETTE = {
  'Scope 1': '#10B981',
  'Scope 2': '#3B82F6',
  'Scope 3': '#8B5CF6',
  Biogenic: '#F59E0B',
};

function nodeColor(payload) {
  return SCOPE_PALETTE[payload?.scope] || '#78716C';
}

/**
 * NODE
 */
function SankeyNode({ x, y, width, height, payload }) {
  const color = nodeColor(payload);

  return (
    <Layer>
      <Rectangle
        x={x}
        y={y}
        width={width}
        height={height}
        fill={color}
        fillOpacity={payload?.side === 'base' ? 0.45 : 0.9}
      />
    </Layer>
  );
}

/**
 * LINK
 */
function SankeyLink({
  sourceX,
  targetX,
  sourceY,
  targetY,
  sourceControlX,
  targetControlX,
  linkWidth,
  payload,
  activeScope,
  setActiveScope,
}) {
  const color = SCOPE_PALETTE[payload?.scope] || '#A8A29E';

  const isActive =
    !activeScope || activeScope === payload?.scope;

  const path = `M${sourceX},${sourceY}
    C${sourceControlX},${sourceY}
    ${targetControlX},${targetY}
    ${targetX},${targetY}`;

  return (
    <path
      d={path}
      fill="none"
      stroke={color}
      strokeWidth={linkWidth}
      strokeOpacity={isActive ? 0.75 : 0.08}
      onMouseEnter={() => setActiveScope(payload?.scope)}
      onMouseLeave={() => setActiveScope(null)}
      style={{ cursor: 'pointer' }}
    />
  );
}

/**
 * MAIN
 */
export default function BaseYearSankey({
  nodes = [],
  links = [],
  height = 320,
}) {
  const [activeScope, setActiveScope] = useState(null);

  if (!nodes.length || !links.length) {
    return (
      <div className="flex items-center justify-center h-[260px] text-sm text-stone-400">
        No Sankey data
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <ResponsiveContainer width="100%" height={height}>
        <Sankey
          data={{ nodes, links }}
          node={(p) => <SankeyNode {...p} />}
          link={(p) => (
            <SankeyLink
              {...p}
              activeScope={activeScope}
              setActiveScope={setActiveScope}
            />
          )}
          nodePadding={18}
          nodeWidth={12}
          margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
        >
          <Tooltip
            contentStyle={{
              borderRadius: 10,
              border: '1px solid #E7E5E4',
              fontSize: 12,
            }}
            formatter={(v, _, p) => {
              const pl = p?.payload?.payload || p?.payload;

              if (pl?.base != null && pl?.current != null) {
                return [
                  `Base ${pl.base.toFixed(
                    2
                  )} → Current ${pl.current.toFixed(2)} tCO₂e`,
                  pl.scope,
                ];
              }

              return `${Number(v).toFixed(2)} tCO₂e`;
            }}
          />
        </Sankey>
      </ResponsiveContainer>
    </div>
  );
}