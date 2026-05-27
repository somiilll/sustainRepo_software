import React, { useState, useEffect, useMemo } from 'react';
import { Group } from '@visx/group';
import { Treemap, hierarchy, stratify, treemapSquarify } from '@visx/hierarchy';
import { scaleLinear } from '@visx/scale';
import { useTooltip, TooltipWithBounds, defaultStyles } from '@visx/tooltip';
import { ParentSize } from '@visx/responsive';
import { localPoint } from '@visx/event';
import axios from 'axios';
import { Button } from './ui/button';
import { X, TrendingUp, FileText, ChevronRight, ArrowLeft, Loader2 } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer
} from 'recharts';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Beautiful color palette - warm to cool gradient for emissions intensity
const colorPalette = [
  '#0ea5e9', // sky-500
  '#06b6d4', // cyan-500
  '#14b8a6', // teal-500
  '#10b981', // emerald-500
  '#22c55e', // green-500
  '#84cc16', // lime-500
  '#eab308', // yellow-500
  '#f97316', // orange-500
  '#ef4444', // red-500
  '#dc2626', // red-600
];

// Category color mapping for consistent coloring
const categoryColors = {
  'Purchased Goods and Services': '#ef4444',
  'Capital Goods': '#f97316',
  'Fuel and Energy Related Activities Not Included in Scope 1 or Scope 2': '#eab308',
  'Upstream Transportation and Distribution': '#84cc16',
  'Waste Generated in Operations': '#22c55e',
  'Business Travel': '#10b981',
  'Employee Commuting': '#14b8a6',
  'Upstream Leased Assets': '#06b6d4',
  'Downstream Transportation and Distribution': '#0ea5e9',
  'Processing of Sold Products': '#6366f1',
  'Use of Sold Products': '#8b5cf6',
  'End-of-Life Treatment of Sold Products': '#a855f7',
  'Downstream Leased Assets': '#d946ef',
  'Franchises': '#ec4899',
  'Investments': '#f43f5e',
};

const tooltipStyles = {
  ...defaultStyles,
  backgroundColor: 'rgba(30, 41, 59, 0.95)',
  color: 'white',
  padding: '12px 16px',
  borderRadius: '8px',
  fontSize: '13px',
  boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
  border: '1px solid rgba(255,255,255,0.1)',
};

function TreemapChart({ data, width, height, onSupplierClick, viewMode, onCategoryClick }) {
  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip();

  const margin = { top: 10, left: 10, right: 10, bottom: 10 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Guard against zero or negative dimensions (prevents canvas getImageData errors)
  if (!width || !height || width <= 0 || height <= 0 || innerWidth <= 0 || innerHeight <= 0) {
    return null;
  }

  // Build hierarchy data based on view mode
  const hierarchyData = useMemo(() => {
    if (viewMode === 'categories') {
      // Category view - show categories as treemap
      return {
        name: 'root',
        children: data.categories.map(cat => ({
          name: cat.name,
          value: cat.total_emissions,
          data: cat,
          type: 'category'
        }))
      };
    } else {
      // Supplier view within a category
      const category = data.categories.find(c => c.name === viewMode);
      if (!category) return { name: 'root', children: [] };
      
      return {
        name: 'root',
        children: category.suppliers.map(sup => ({
          name: sup.name,
          value: sup.total_emissions,
          data: sup,
          type: 'supplier',
          category: category.name
        }))
      };
    }
  }, [data, viewMode]);

  const root = useMemo(() => {
    return hierarchy(hierarchyData)
      .sum(d => d.value || 0)
      .sort((a, b) => (b.value || 0) - (a.value || 0));
  }, [hierarchyData]);

  // Color scale based on emission values
  const maxValue = useMemo(() => {
    if (!root.children) return 1;
    return Math.max(...root.children.map(d => d.value || 0));
  }, [root]);

  const colorScale = scaleLinear({
    domain: [0, maxValue * 0.3, maxValue * 0.6, maxValue],
    range: ['#22c55e', '#eab308', '#f97316', '#ef4444'],
  });

  const getNodeColor = (node) => {
    if (node.data.type === 'category') {
      return categoryColors[node.data.name] || colorScale(node.value);
    }
    return colorScale(node.value);
  };

  const handleMouseMove = (event, node) => {
    const coords = localPoint(event);
    showTooltip({
      tooltipData: node,
      tooltipLeft: coords?.x || 0,
      tooltipTop: coords?.y || 0,
    });
  };

  const handleClick = (node) => {
    if (node.data.type === 'category') {
      onCategoryClick(node.data.name);
    } else if (node.data.type === 'supplier') {
      onSupplierClick(node.data.data, node.data.category);
    }
  };

  if (!root.children || root.children.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-stone-500">
        <div className="text-center">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No Scope 3 emission data with supplier information</p>
          <p className="text-sm mt-1">Add supplier names when recording emissions to see the heatmap</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <svg width={width} height={height}>
        <Group top={margin.top} left={margin.left}>
          <Treemap
            root={root}
            size={[innerWidth, innerHeight]}
            tile={treemapSquarify}
            round
          >
            {(treemap) => (
              <Group>
                {treemap.descendants().map((node, i) => {
                  if (node.depth === 0) return null;
                  
                  const nodeWidth = node.x1 - node.x0;
                  const nodeHeight = node.y1 - node.y0;
                  const color = getNodeColor(node);
                  
                  // Calculate text that fits
                  const showName = nodeWidth > 60 && nodeHeight > 40;
                  const showValue = nodeWidth > 80 && nodeHeight > 55;
                  
                  return (
                    <Group key={`node-${i}`}>
                      <rect
                        x={node.x0}
                        y={node.y0}
                        width={nodeWidth}
                        height={nodeHeight}
                        fill={color}
                        stroke="#fff"
                        strokeWidth={2}
                        rx={4}
                        style={{ 
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                        }}
                        onMouseMove={(e) => handleMouseMove(e, node)}
                        onMouseLeave={hideTooltip}
                        onClick={() => handleClick(node)}
                        className="hover:opacity-80"
                      />
                      {showName && (
                        <text
                          x={node.x0 + nodeWidth / 2}
                          y={node.y0 + nodeHeight / 2 - (showValue ? 8 : 0)}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="#fff"
                          fontSize={Math.min(14, nodeWidth / 8)}
                          fontWeight="600"
                          style={{ 
                            pointerEvents: 'none',
                            textShadow: '0 1px 2px rgba(0,0,0,0.3)'
                          }}
                        >
                          {node.data.name.length > 20 
                            ? node.data.name.slice(0, 18) + '...' 
                            : node.data.name}
                        </text>
                      )}
                      {showValue && (
                        <text
                          x={node.x0 + nodeWidth / 2}
                          y={node.y0 + nodeHeight / 2 + 12}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="rgba(255,255,255,0.9)"
                          fontSize={Math.min(12, nodeWidth / 10)}
                          fontWeight="500"
                          style={{ 
                            pointerEvents: 'none',
                            textShadow: '0 1px 2px rgba(0,0,0,0.3)'
                          }}
                        >
                          {node.value >= 1000 
                            ? `${(node.value / 1000).toFixed(1)}k` 
                            : node.value.toFixed(1)} tCO₂e
                        </text>
                      )}
                    </Group>
                  );
                })}
              </Group>
            )}
          </Treemap>
        </Group>
      </svg>
      
      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          left={tooltipLeft}
          top={tooltipTop}
          style={tooltipStyles}
        >
          <div className="space-y-1">
            <div className="font-semibold text-white">
              {tooltipData.data.name}
            </div>
            <div className="text-emerald-400 font-medium">
              {tooltipData.value?.toFixed(2)} tCO₂e
            </div>
            {tooltipData.data.type === 'category' && (
              <div className="text-stone-400 text-xs mt-1">
                {tooltipData.data.data?.suppliers?.length || 0} suppliers • Click to drill down
              </div>
            )}
            {tooltipData.data.type === 'supplier' && (
              <div className="text-stone-400 text-xs mt-1">
                {tooltipData.data.data?.record_count || 0} records • Click for details
              </div>
            )}
          </div>
        </TooltipWithBounds>
      )}
    </div>
  );
}

function SupplierDetailPanel({ supplier, category, onClose }) {
  if (!supplier) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold">{supplier.name}</h2>
              {supplier.code && (
                <p className="text-emerald-100 text-sm mt-1">Code: {supplier.code}</p>
              )}
              <p className="text-emerald-100 text-sm mt-1">Category: {category}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="mt-4 flex gap-6">
            <div className="bg-white/20 rounded-lg px-4 py-2">
              <p className="text-xs text-emerald-100">Total Emissions</p>
              <p className="text-2xl font-bold">{supplier.total_emissions.toFixed(2)} tCO₂e</p>
            </div>
            <div className="bg-white/20 rounded-lg px-4 py-2">
              <p className="text-xs text-emerald-100">Records</p>
              <p className="text-2xl font-bold">{supplier.record_count}</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[50vh]">
          {/* Monthly Trend Chart */}
          {supplier.monthly_trend && supplier.monthly_trend.length > 0 && (
            <div className="mb-6">
              <h3 className="font-semibold text-stone-800 mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                Monthly Emissions Trend
              </h3>
              <div className="h-48 bg-stone-50 rounded-lg p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={supplier.monthly_trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis 
                      dataKey="month" 
                      tick={{ fontSize: 11 }}
                      tickFormatter={(value) => {
                        const [year, month] = value.split('-');
                        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                        return `${monthNames[parseInt(month) - 1]} ${year.slice(2)}`;
                      }}
                    />
                    <YAxis tick={{ fontSize: 11 }} />
                    <RechartsTooltip 
                      formatter={(value) => [`${value.toFixed(2)} tCO₂e`, 'Emissions']}
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="emissions" 
                      stroke="#10b981" 
                      strokeWidth={2}
                      dot={{ fill: '#10b981', strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Emission Records */}
          <div>
            <h3 className="font-semibold text-stone-800 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-600" />
              Recent Emission Records
            </h3>
            <div className="space-y-2">
              {supplier.records && supplier.records.length > 0 ? (
                supplier.records.map((record, idx) => (
                  <div 
                    key={record.id || idx}
                    className="flex items-center justify-between p-3 bg-stone-50 rounded-lg hover:bg-stone-100 transition-colors"
                  >
                    <div>
                      <p className="font-medium text-stone-800">
                        {record.activity || 'General'}
                      </p>
                      <p className="text-sm text-stone-500">
                        {record.reporting_period}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-emerald-600">
                        {record.emissions.toFixed(4)} tCO₂e
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-stone-500 text-center py-4">No records available</p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t p-4 bg-stone-50">
          <Button onClick={onClose} variant="outline" className="w-full">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function SupplierHotspotHeatmap({ getAuthHeader, filters = {} }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('categories'); // 'categories' or category name
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);

  // Stabilize filters to prevent infinite re-renders
  const filterKey = JSON.stringify(filters);

  useEffect(() => {
    fetchData();
  }, [filterKey]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.start_period) params.append('start_period', filters.start_period);
      if (filters.end_period) params.append('end_period', filters.end_period);
      if (filters.facility_id?.length) {
        filters.facility_id.forEach(id => params.append('facility_id', id));
      }
      
      const response = await axios.get(
        `${API}/dashboard/supplier-hotspots?${params.toString()}`,
        { headers: getAuthHeader() }
      );
      setData(response.data);
    } catch (err) {
      console.error('Failed to fetch supplier hotspots:', err);
      setError('Failed to load supplier data');
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryClick = (categoryName) => {
    setViewMode(categoryName);
  };

  const handleBackToCategories = () => {
    setViewMode('categories');
  };

  const handleSupplierClick = (supplier, category) => {
    setSelectedSupplier(supplier);
    setSelectedCategory(category);
  };

  const handleCloseDetail = () => {
    setSelectedSupplier(null);
    setSelectedCategory(null);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-stone-200 p-6">
        <div className="flex items-center justify-center h-80">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-emerald-600 mb-3" />
            <p className="text-stone-500">Loading supplier hotspots...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-stone-200 p-6">
        <div className="flex items-center justify-center h-80 text-red-500">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-stone-200 bg-gradient-to-r from-stone-50 to-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {viewMode !== 'categories' && (
              <button
                onClick={handleBackToCategories}
                className="p-2 hover:bg-stone-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-stone-600" />
              </button>
            )}
            <div>
              <h3 className="font-semibold text-stone-800 text-lg">
                Scope 3 Supplier Hotspots
              </h3>
              <p className="text-sm text-stone-500">
                {viewMode === 'categories' 
                  ? 'Click on a category to drill down into suppliers'
                  : `${viewMode} - Click on a supplier for details`
                }
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-stone-500">Total Scope 3</p>
            <p className="text-xl font-bold text-emerald-600">
              {(data?.total_scope3_emissions || 0).toFixed(2)} tCO₂e
            </p>
          </div>
        </div>

        {/* Breadcrumb */}
        {viewMode !== 'categories' && (
          <div className="mt-3 flex items-center gap-2 text-sm">
            <button 
              onClick={handleBackToCategories}
              className="text-emerald-600 hover:text-emerald-700"
            >
              All Categories
            </button>
            <ChevronRight className="w-4 h-4 text-stone-400" />
            <span className="text-stone-600 font-medium">{viewMode}</span>
          </div>
        )}
      </div>

      {/* Treemap */}
      <div className="p-4" style={{ height: '400px' }}>
        <ParentSize>
          {({ width, height }) => (
            <TreemapChart
              data={data}
              width={width}
              height={height}
              viewMode={viewMode}
              onCategoryClick={handleCategoryClick}
              onSupplierClick={handleSupplierClick}
            />
          )}
        </ParentSize>
      </div>

      {/* Legend / Stats */}
      {viewMode === 'categories' && data?.categories?.length > 0 && (
        <div className="p-4 border-t border-stone-200 bg-stone-50">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {data.categories.slice(0, 8).map((cat, idx) => (
              <button
                key={cat.name}
                onClick={() => handleCategoryClick(cat.name)}
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-white transition-colors text-left"
              >
                <div 
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: categoryColors[cat.name] || colorPalette[idx % colorPalette.length] }}
                />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-stone-700 truncate">
                    {cat.name.length > 25 ? cat.name.slice(0, 23) + '...' : cat.name}
                  </p>
                  <p className="text-xs text-stone-500">
                    {cat.total_emissions.toFixed(1)} tCO₂e
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Supplier Detail Panel */}
      {selectedSupplier && (
        <SupplierDetailPanel
          supplier={selectedSupplier}
          category={selectedCategory}
          onClose={handleCloseDetail}
        />
      )}
    </div>
  );
}
