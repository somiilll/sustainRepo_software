/**
 * BaseYearSankey — emissions flow from Base Year & Current Year through Scopes.
 * Uses Recharts <Sankey>.
 */
import React from 'react';
import { ResponsiveContainer, Sankey, Tooltip, Layer, Rectangle } from 'recharts';

const NODE_COLORS = {
  'Base Year': '#A8A29E',
  'Current Year': '#0F766E',
  'Scope 1': '#10B981',
  'Scope 2': '#3B82F6',
  'Scope 3': '#8B5CF6',
  'Biogenic': '#F59E0B',
};

function SankeyNode({ x, y, width, height, index, payload, containerWidth }) {
  const isOut = x + width + 6 > containerWidth;
  const color = NODE_COLORS[payload.name] || '#78716C';
  return (
    <Layer key={`node-${index}`}>
      <Rectangle x={x} y={y} width={width} height={height} fill={color} fillOpacity={0.9} />
      <text
        x={isOut ? x - 6 : x + width + 6}
        y={y + height / 2}
        textAnchor={isOut ? 'end' : 'start'}
        fontSize={11}
        fill="#44403C"
        dominantBaseline="middle"
      >
        {payload.name}
      </text>
    </Layer>
  );
}

export default function BaseYearSankey({ nodes = [], links = [], height = 280 }) {
  if (!nodes.length || !links.length) {
    return (
      <div className="flex flex-col items-center justify-center h-[260px] text-sm text-stone-400 gap-1" data-testid="sankey-empty">
        <p>Base year not configured yet.</p>
        <p className="text-xs">Configure base year emissions to see comparison flow.</p>
      </div>
    );
  }
  return (
    <div data-testid="base-year-sankey">
      <ResponsiveContainer width="100%" height={height}>
        <Sankey
          data={{ nodes, links }}
          node={(p) => <SankeyNode {...p} />}
          link={{ stroke: '#10B981', strokeOpacity: 0.18 }}
          nodePadding={20}
          margin={{ top: 8, right: 80, bottom: 8, left: 8 }}
        >
          <Tooltip
            contentStyle={{ borderRadius: 10, border: '1px solid #E7E5E4', boxShadow: '0 6px 14px rgba(0,0,0,0.08)', fontSize: 12 }}
            formatter={(v) => `${Number(v).toFixed(2)} tCO₂e`}
          />
        </Sankey>
      </ResponsiveContainer>
    </div>
  );
}
