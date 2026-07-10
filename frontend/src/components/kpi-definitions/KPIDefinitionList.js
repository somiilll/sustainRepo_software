/**
 * KPI Definition List
 * Table view of all KPI definitions with actions
 */
import React from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { ESG_SECTIONS, KPI_STATUSES } from './constants';
import { 
  Search, MoreVertical, Edit2, Copy, Archive, Trash2, 
  Filter, RefreshCw, ExternalLink 
} from 'lucide-react';

const KPIDefinitionList = ({
  kpiDefinitions = [],
  isLoading = false,
  filters,
  setFilters,
  onEdit,
  onDuplicate,
  onArchive,
  onDelete,
  onRefresh,
}) => {
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value === 'all' ? '' : value }));
  };

  const filteredKpis = kpiDefinitions;

  return (
    <div className="space-y-4">
      {/* Filters Row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={filters.search || ''}
            onChange={(e) => handleFilterChange('search', e.target.value)}
            placeholder="Search KPIs..."
            className="pl-9"
            data-testid="kpi-search"
          />
        </div>

        {/* Section Filter */}
        <Select
          value={filters.section || 'all'}
          onValueChange={(value) => handleFilterChange('section', value)}
        >
          <SelectTrigger className="w-[150px]" data-testid="kpi-filter-section">
            <SelectValue placeholder="Section" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sections</SelectItem>
            {Object.entries(ESG_SECTIONS).map(([key, { label }]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status Filter */}
        <Select
          value={filters.status || 'all'}
          onValueChange={(value) => handleFilterChange('status', value)}
        >
          <SelectTrigger className="w-[130px]" data-testid="kpi-filter-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {Object.entries(KPI_STATUSES).map(([key, { label }]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Refresh */}
        <Button
          variant="outline"
          size="icon"
          onClick={onRefresh}
          disabled={isLoading}
          data-testid="kpi-refresh"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="w-[250px]">Metric Name</TableHead>
              <TableHead className="w-[150px]">Category</TableHead>
              <TableHead className="w-[150px]">Subcategory</TableHead>
              <TableHead className="w-[100px]">Section</TableHead>
              <TableHead className="w-[80px]">Status</TableHead>
              <TableHead className="w-[80px] text-center">Refs</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                  Loading KPI definitions...
                </TableCell>
              </TableRow>
            ) : filteredKpis.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                  No KPI definitions found
                </TableCell>
              </TableRow>
            ) : (
              filteredKpis.map((kpi) => {
                const sectionConfig = ESG_SECTIONS[kpi.section] || {};
                const statusConfig = KPI_STATUSES[kpi.status] || {};
                const hasRefs = (kpi.target_count || 0) > 0 || (kpi.dashboard_count || 0) > 0;

                return (
                  <TableRow 
                    key={kpi.id} 
                    className="hover:bg-slate-50"
                    data-testid={`kpi-row-${kpi.id}`}
                  >
                    <TableCell>
                      <div>
                        <p className="font-medium text-gray-900">{kpi.metric_name}</p>
                        {kpi.short_name && kpi.short_name !== kpi.metric_name && (
                          <p className="text-xs text-gray-500">{kpi.short_name}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-gray-700">{kpi.category_name || '-'}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-gray-600">{kpi.subcategory || '-'}</span>
                    </TableCell>
                    <TableCell>
                      <span className={`
                        inline-flex items-center px-2 py-1 rounded text-xs font-medium text-white
                        ${sectionConfig.color || 'bg-gray-500'}
                      `}>
                        {sectionConfig.label || kpi.section}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`
                        inline-block px-2 py-1 rounded text-xs font-medium border
                        ${statusConfig.color || 'bg-gray-100 text-gray-600'}
                      `}>
                        {statusConfig.label || kpi.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {hasRefs ? (
                        <span className="text-xs text-gray-600">
                          {kpi.target_count || 0} targets
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            data-testid={`kpi-actions-${kpi.id}`}
                          >
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEdit(kpi)}>
                            <Edit2 className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onDuplicate(kpi.id)}>
                            <Copy className="w-4 h-4 mr-2" />
                            Duplicate
                          </DropdownMenuItem>
                          {kpi.status !== 'archived' && (
                            <DropdownMenuItem 
                              onClick={() => onArchive(kpi.id)}
                              disabled={hasRefs}
                              className={hasRefs ? 'opacity-50' : ''}
                            >
                              <Archive className="w-4 h-4 mr-2" />
                              Archive
                              {hasRefs && <span className="text-xs ml-1">(has refs)</span>}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem 
                            onClick={() => onDelete(kpi.id)}
                            disabled={hasRefs}
                            className={`text-red-600 ${hasRefs ? 'opacity-50' : ''}`}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Footer Stats */}
      {!isLoading && filteredKpis.length > 0 && (
        <div className="text-sm text-gray-500">
          Showing {filteredKpis.length} KPI definition{filteredKpis.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
};

export default KPIDefinitionList;
