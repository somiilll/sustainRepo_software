import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Switch } from '../components/ui/switch';
import { 
  Plus, Search, Trash2, Edit2, Settings2, Layers, ChevronRight, 
  Loader2, GripVertical, Copy, Eye, EyeOff, X, Check, AlertTriangle
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Available field types
const FIELD_TYPES = [
  { value: 'text', label: 'Single Line Text', icon: '📝' },
  { value: 'textarea', label: 'Multi-Line Text', icon: '📄' },
  { value: 'number', label: 'Number', icon: '🔢' },
  { value: 'dropdown', label: 'Dropdown Select', icon: '▼' },
  { value: 'radio', label: 'Radio Buttons', icon: '⚪' },
  { value: 'checkbox_group', label: 'Checkbox Group', icon: '☑️' },
  { value: 'yes_no', label: 'Yes/No', icon: '✓✗' },
  { value: 'date', label: 'Date', icon: '📅' },
  { value: 'unit_selector', label: 'Unit Selector', icon: '📏' },
  { value: 'table', label: 'Table', icon: '▦' },
  { value: 'file_upload', label: 'File Upload', icon: '📎' },
];

// Framework options
const FRAMEWORKS = ['BRSR', 'GRI', 'SBTi', 'CDP', 'TCFD'];

// Reporting types
const REPORTING_TYPES = [
  { value: 'daily', label: 'Daily' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

// Section configs
const SECTIONS = [
  { value: 'environment', label: 'Environment', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'social', label: 'Social', color: 'bg-blue-100 text-blue-700' },
  { value: 'governance', label: 'Governance', color: 'bg-purple-100 text-purple-700' },
];

export default function ESGConfig() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [stats, setStats] = useState(null);
  const [activeSection, setActiveSection] = useState('environment');
  const [searchQuery, setSearchQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);

  const headers = { Authorization: `Bearer ${token}` };

  // Fetch data
  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const params = { include_inactive: showInactive };
      if (activeSection !== 'all') params.section = activeSection;
      
      const res = await axios.get(`${BACKEND_URL}/api/super-admin/esg-config/categories`, {
        params,
        headers
      });
      setCategories(res.data.categories || []);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    } finally {
      setLoading(false);
    }
  }, [activeSection, showInactive, token]);

  const fetchStats = async () => {
    try {
      const res = await axios.get(`${BACKEND_URL}/api/super-admin/esg-config/stats`, { headers });
      setStats(res.data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  useEffect(() => {
    fetchCategories();
    fetchStats();
  }, [fetchCategories]);

  // Filter categories
  const filteredCategories = categories.filter(cat => {
    if (searchQuery) {
      const search = searchQuery.toLowerCase();
      return cat.category.toLowerCase().includes(search) || 
             (cat.subcategory && cat.subcategory.toLowerCase().includes(search));
    }
    return true;
  });

  // Group by category
  const groupedCategories = filteredCategories.reduce((acc, cat) => {
    const key = cat.category;
    if (!acc[key]) acc[key] = [];
    acc[key].push(cat);
    return acc;
  }, {});

  const handleEdit = (category) => {
    setSelectedCategory(category);
    setShowEditModal(true);
  };

  const handleToggleActive = async (category) => {
    try {
      await axios.post(
        `${BACKEND_URL}/api/super-admin/esg-config/categories/${category.id}/toggle-active`,
        {},
        { headers }
      );
      fetchCategories();
      fetchStats();
    } catch (error) {
      console.error('Failed to toggle category:', error);
    }
  };

  const handleDelete = async (category) => {
    if (!window.confirm(`Are you sure you want to delete "${category.category} - ${category.subcategory || 'General'}"?`)) {
      return;
    }
    try {
      await axios.delete(
        `${BACKEND_URL}/api/super-admin/esg-config/categories/${category.id}`,
        { headers }
      );
      fetchCategories();
      fetchStats();
    } catch (error) {
      alert(error.response?.data?.detail || 'Failed to delete category');
    }
  };

  const handleCategoryCreated = () => {
    setShowAddModal(false);
    fetchCategories();
    fetchStats();
  };

  const handleCategoryUpdated = () => {
    setShowEditModal(false);
    setSelectedCategory(null);
    fetchCategories();
    fetchStats();
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">ESG Configuration</h1>
          <p className="text-sm text-text-muted mt-1">
            Manage ESG record categories, fields, and framework mappings
          </p>
        </div>
        <Button onClick={() => setShowAddModal(true)} className="bg-emerald-600 hover:bg-emerald-700" data-testid="add-category-btn">
          <Plus className="w-4 h-4 mr-2" /> Add Category
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <p className="text-xs text-text-muted">Total Categories</p>
            <p className="text-2xl font-bold text-text-primary">{stats.categories?.total || 0}</p>
            <p className="text-xs text-emerald-600">{stats.categories?.active || 0} active</p>
          </Card>
          {SECTIONS.map(sec => (
            <Card key={sec.value} className="p-4">
              <p className="text-xs text-text-muted">{sec.label}</p>
              <p className="text-2xl font-bold text-text-primary">
                {stats.categories?.by_section?.[sec.value]?.total || 0}
              </p>
              <p className="text-xs text-text-muted">
                {stats.records?.[sec.value] || 0} records
              </p>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Section Tabs */}
          <Tabs value={activeSection} onValueChange={setActiveSection} className="flex-1">
            <TabsList>
              <TabsTrigger value="environment" data-testid="tab-environment">Environment</TabsTrigger>
              <TabsTrigger value="social" data-testid="tab-social">Social</TabsTrigger>
              <TabsTrigger value="governance" data-testid="tab-governance">Governance</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <Input
              placeholder="Search categories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-48"
              data-testid="search-categories"
            />
          </div>

          {/* Show Inactive Toggle */}
          <div className="flex items-center gap-2">
            <Switch
              checked={showInactive}
              onCheckedChange={setShowInactive}
              data-testid="toggle-inactive"
            />
            <span className="text-sm text-text-muted">Show inactive</span>
          </div>
        </div>
      </Card>

      {/* Categories List */}
      <div className="space-y-4">
        {loading ? (
          <Card className="p-8 text-center">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-stone-400" />
            <p className="text-sm text-text-muted mt-2">Loading categories...</p>
          </Card>
        ) : Object.keys(groupedCategories).length === 0 ? (
          <Card className="p-8 text-center">
            <Layers className="w-8 h-8 mx-auto text-stone-300" />
            <p className="text-sm text-text-muted mt-2">No categories found</p>
            <Button onClick={() => setShowAddModal(true)} variant="outline" className="mt-4">
              <Plus className="w-4 h-4 mr-2" /> Create First Category
            </Button>
          </Card>
        ) : (
          Object.entries(groupedCategories).map(([categoryName, subcategories]) => (
            <Card key={categoryName} className="overflow-hidden">
              <div className="p-4 bg-stone-50 border-b flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Layers className="w-5 h-5 text-stone-500" />
                  <h3 className="font-medium text-text-primary">{categoryName}</h3>
                  <Badge variant="outline" className="text-xs">
                    {subcategories.length} {subcategories.length === 1 ? 'subcategory' : 'subcategories'}
                  </Badge>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Subcategory</TableHead>
                    <TableHead>Frameworks</TableHead>
                    <TableHead>Reporting Types</TableHead>
                    <TableHead>Fields</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subcategories.map(cat => (
                    <TableRow key={cat.id} className={!cat.is_active ? 'opacity-50' : ''}>
                      <TableCell>
                        <GripVertical className="w-4 h-4 text-stone-300 cursor-grab" />
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{cat.subcategory || 'General'}</span>
                        {cat.sub_subcategory && (
                          <span className="text-xs text-text-muted ml-2">/ {cat.sub_subcategory}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {cat.frameworks?.map(fw => (
                            <Badge key={fw} variant="outline" className="text-xs">{fw}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {cat.allowed_reporting_types?.slice(0, 2).map(rt => (
                            <Badge key={rt} variant="secondary" className="text-xs capitalize">{rt}</Badge>
                          ))}
                          {cat.allowed_reporting_types?.length > 2 && (
                            <Badge variant="secondary" className="text-xs">+{cat.allowed_reporting_types.length - 2}</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {cat.fields?.length || 0} fields
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {cat.is_active ? (
                          <Badge className="bg-emerald-100 text-emerald-700 text-xs">Active</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(cat)} className="h-8 w-8 p-0">
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleToggleActive(cat)} 
                            className="h-8 w-8 p-0"
                          >
                            {cat.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleDelete(cat)} 
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ))
        )}
      </div>

      {/* Add Category Modal */}
      <CategoryModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={handleCategoryCreated}
        section={activeSection}
      />

      {/* Edit Category Modal */}
      {selectedCategory && (
        <CategoryModal
          open={showEditModal}
          onClose={() => { setShowEditModal(false); setSelectedCategory(null); }}
          onSuccess={handleCategoryUpdated}
          section={selectedCategory.section}
          category={selectedCategory}
          isEdit
        />
      )}
    </div>
  );
}


// =============================================================================
// Category Modal Component
// =============================================================================

function CategoryModal({ open, onClose, onSuccess, section, category, isEdit = false }) {
  const { token } = useAuth();
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('basic');
  
  const [formData, setFormData] = useState({
    section: section || 'environment',
    category: '',
    subcategory: '',
    sub_subcategory: '',
    frameworks: ['BRSR'],
    allowed_reporting_types: ['monthly', 'yearly'],
    fields: [],
    is_active: true,
    order: 0
  });

  const headers = { Authorization: `Bearer ${token}` };

  // Initialize form with category data when editing
  useEffect(() => {
    if (isEdit && category) {
      setFormData({
        section: category.section || 'environment',
        category: category.category || '',
        subcategory: category.subcategory || '',
        sub_subcategory: category.sub_subcategory || '',
        frameworks: category.frameworks || ['BRSR'],
        allowed_reporting_types: category.allowed_reporting_types || ['monthly', 'yearly'],
        fields: category.fields || [],
        is_active: category.is_active ?? true,
        order: category.order || 0
      });
    } else {
      setFormData({
        section: section || 'environment',
        category: '',
        subcategory: '',
        sub_subcategory: '',
        frameworks: ['BRSR'],
        allowed_reporting_types: ['monthly', 'yearly'],
        fields: [],
        is_active: true,
        order: 0
      });
    }
  }, [isEdit, category, section, open]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const toggleArrayItem = (field, item) => {
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].includes(item)
        ? prev[field].filter(i => i !== item)
        : [...prev[field], item]
    }));
  };

  const handleSubmit = async () => {
    if (!formData.category.trim()) {
      alert('Category name is required');
      return;
    }

    setSaving(true);
    try {
      if (isEdit && category) {
        await axios.put(
          `${BACKEND_URL}/api/super-admin/esg-config/categories/${category.id}`,
          formData,
          { headers }
        );
      } else {
        await axios.post(
          `${BACKEND_URL}/api/super-admin/esg-config/categories`,
          formData,
          { headers }
        );
      }
      onSuccess();
    } catch (error) {
      console.error('Failed to save category:', error);
      alert(error.response?.data?.detail || 'Failed to save category');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-emerald-600" />
            {isEdit ? 'Edit Category' : 'Add Category'}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full">
            <TabsTrigger value="basic" className="flex-1">Basic Info</TabsTrigger>
            <TabsTrigger value="fields" className="flex-1">Fields ({formData.fields.length})</TabsTrigger>
          </TabsList>

          {/* Basic Info Tab */}
          <TabsContent value="basic" className="space-y-4 mt-4">
            {/* Section */}
            <div>
              <Label>Section *</Label>
              <Select value={formData.section} onValueChange={(v) => handleChange('section', v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SECTIONS.map(sec => (
                    <SelectItem key={sec.value} value={sec.value}>{sec.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Category Name */}
            <div>
              <Label>Category Name *</Label>
              <Input
                value={formData.category}
                onChange={(e) => handleChange('category', e.target.value)}
                placeholder="e.g., Water, Energy, Emissions"
                className="mt-1"
              />
            </div>

            {/* Subcategory */}
            <div>
              <Label>Subcategory</Label>
              <Input
                value={formData.subcategory}
                onChange={(e) => handleChange('subcategory', e.target.value)}
                placeholder="e.g., Consumption, Discharge, Recycled"
                className="mt-1"
              />
            </div>

            {/* Sub-subcategory */}
            <div>
              <Label>Sub-Subcategory (Optional)</Label>
              <Input
                value={formData.sub_subcategory}
                onChange={(e) => handleChange('sub_subcategory', e.target.value)}
                placeholder="e.g., Third-party, Own sources"
                className="mt-1"
              />
            </div>

            {/* Frameworks */}
            <div>
              <Label>Frameworks</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {FRAMEWORKS.map(fw => (
                  <Button
                    key={fw}
                    type="button"
                    variant={formData.frameworks.includes(fw) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => toggleArrayItem('frameworks', fw)}
                    className={formData.frameworks.includes(fw) ? 'bg-emerald-600' : ''}
                  >
                    {fw}
                  </Button>
                ))}
              </div>
            </div>

            {/* Reporting Types */}
            <div>
              <Label>Allowed Reporting Types</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {REPORTING_TYPES.map(rt => (
                  <Button
                    key={rt.value}
                    type="button"
                    variant={formData.allowed_reporting_types.includes(rt.value) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => toggleArrayItem('allowed_reporting_types', rt.value)}
                    className={formData.allowed_reporting_types.includes(rt.value) ? 'bg-blue-600' : ''}
                  >
                    {rt.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Order */}
            <div>
              <Label>Display Order</Label>
              <Input
                type="number"
                value={formData.order}
                onChange={(e) => handleChange('order', parseInt(e.target.value) || 0)}
                className="mt-1 w-24"
                min={0}
              />
            </div>

            {/* Active */}
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.is_active}
                onCheckedChange={(v) => handleChange('is_active', v)}
              />
              <Label>Active</Label>
            </div>
          </TabsContent>

          {/* Fields Tab */}
          <TabsContent value="fields" className="mt-4">
            <FieldsEditor
              fields={formData.fields}
              onChange={(fields) => handleChange('fields', fields)}
            />
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {isEdit ? 'Save Changes' : 'Create Category'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// =============================================================================
// Fields Editor Component
// =============================================================================

function FieldsEditor({ fields, onChange }) {
  const [showAddField, setShowAddField] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);

  const addField = (field) => {
    onChange([...fields, field]);
    setShowAddField(false);
  };

  const updateField = (index, field) => {
    const updated = [...fields];
    updated[index] = field;
    onChange(updated);
    setEditingIndex(null);
  };

  const removeField = (index) => {
    onChange(fields.filter((_, i) => i !== index));
  };

  const moveField = (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= fields.length) return;
    const updated = [...fields];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    onChange(updated);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-muted">
          Define the data fields users will fill when creating records in this category.
        </p>
        <Button onClick={() => setShowAddField(true)} variant="outline" size="sm">
          <Plus className="w-4 h-4 mr-1" /> Add Field
        </Button>
      </div>

      {fields.length === 0 ? (
        <div className="p-8 border-2 border-dashed rounded-lg text-center">
          <p className="text-sm text-text-muted">No fields defined yet</p>
          <Button onClick={() => setShowAddField(true)} variant="outline" size="sm" className="mt-2">
            <Plus className="w-4 h-4 mr-1" /> Add First Field
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {fields.map((field, index) => (
            <div key={index} className="flex items-center gap-2 p-3 bg-stone-50 rounded-lg">
              <div className="flex flex-col gap-1">
                <Button variant="ghost" size="sm" onClick={() => moveField(index, -1)} disabled={index === 0} className="h-5 w-5 p-0">
                  ▲
                </Button>
                <Button variant="ghost" size="sm" onClick={() => moveField(index, 1)} disabled={index === fields.length - 1} className="h-5 w-5 p-0">
                  ▼
                </Button>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{field.label}</span>
                  {field.required && <Badge variant="destructive" className="text-[10px]">Required</Badge>}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs">{field.type}</Badge>
                  <span className="text-xs text-text-muted">{field.field_key}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => setEditingIndex(index)} className="h-8 w-8 p-0">
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => removeField(index)} className="h-8 w-8 p-0 text-red-500">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Field Modal */}
      <FieldModal
        open={showAddField}
        onClose={() => setShowAddField(false)}
        onSave={addField}
      />

      {/* Edit Field Modal */}
      {editingIndex !== null && (
        <FieldModal
          open={true}
          onClose={() => setEditingIndex(null)}
          onSave={(field) => updateField(editingIndex, field)}
          field={fields[editingIndex]}
          isEdit
        />
      )}
    </div>
  );
}


// =============================================================================
// Field Modal Component
// =============================================================================

function FieldModal({ open, onClose, onSave, field, isEdit = false }) {
  const [formData, setFormData] = useState({
    field_key: '',
    type: 'text',
    label: '',
    required: false,
    placeholder: '',
    options: [],
    default_value: null,
    validation: {},
    table_columns: [],
    table_min_rows: 1,
    table_max_rows: 10
  });
  const [optionsText, setOptionsText] = useState('');

  useEffect(() => {
    if (isEdit && field) {
      setFormData({
        field_key: field.field_key || '',
        type: field.type || 'text',
        label: field.label || '',
        required: field.required || false,
        placeholder: field.placeholder || '',
        options: field.options || [],
        default_value: field.default_value || null,
        validation: field.validation || {},
        table_columns: field.table_columns || [],
        table_min_rows: field.table_min_rows || 1,
        table_max_rows: field.table_max_rows || 10
      });
      setOptionsText((field.options || []).join('\n'));
    } else {
      setFormData({
        field_key: '',
        type: 'text',
        label: '',
        required: false,
        placeholder: '',
        options: [],
        default_value: null,
        validation: {},
        table_columns: [],
        table_min_rows: 1,
        table_max_rows: 10
      });
      setOptionsText('');
    }
  }, [isEdit, field, open]);

  const handleChange = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const generateFieldKey = (label) => {
    return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  };

  const handleLabelChange = (label) => {
    handleChange('label', label);
    if (!isEdit || !formData.field_key) {
      handleChange('field_key', generateFieldKey(label));
    }
  };

  const handleSave = () => {
    if (!formData.label.trim() || !formData.field_key.trim()) {
      alert('Label and Field Key are required');
      return;
    }

    const fieldData = { ...formData };
    
    // Parse options from text
    if (['dropdown', 'radio', 'checkbox_group', 'unit_selector'].includes(formData.type)) {
      fieldData.options = optionsText.split('\n').map(o => o.trim()).filter(Boolean);
    }

    onSave(fieldData);
  };

  const needsOptions = ['dropdown', 'radio', 'checkbox_group', 'unit_selector'].includes(formData.type);
  const isTable = formData.type === 'table';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Field' : 'Add Field'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Field Type */}
          <div>
            <Label>Field Type *</Label>
            <Select value={formData.type} onValueChange={(v) => handleChange('type', v)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map(ft => (
                  <SelectItem key={ft.value} value={ft.value}>
                    <span className="mr-2">{ft.icon}</span> {ft.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Label */}
          <div>
            <Label>Label *</Label>
            <Input
              value={formData.label}
              onChange={(e) => handleLabelChange(e.target.value)}
              placeholder="e.g., Total Consumption"
              className="mt-1"
            />
          </div>

          {/* Field Key */}
          <div>
            <Label>Field Key *</Label>
            <Input
              value={formData.field_key}
              onChange={(e) => handleChange('field_key', e.target.value)}
              placeholder="e.g., total_consumption"
              className="mt-1 font-mono text-sm"
            />
            <p className="text-xs text-text-muted mt-1">Unique identifier for this field (snake_case)</p>
          </div>

          {/* Placeholder */}
          {['text', 'textarea', 'number'].includes(formData.type) && (
            <div>
              <Label>Placeholder</Label>
              <Input
                value={formData.placeholder}
                onChange={(e) => handleChange('placeholder', e.target.value)}
                placeholder="Enter placeholder text..."
                className="mt-1"
              />
            </div>
          )}

          {/* Options (for dropdown, radio, checkbox_group) */}
          {needsOptions && (
            <div>
              <Label>Options (one per line)</Label>
              <Textarea
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                placeholder="Option 1&#10;Option 2&#10;Option 3"
                rows={4}
                className="mt-1 font-mono text-sm"
              />
            </div>
          )}

          {/* Table Columns */}
          {isTable && (
            <div>
              <Label>Table Columns</Label>
              <TableColumnsEditor
                columns={formData.table_columns}
                onChange={(cols) => handleChange('table_columns', cols)}
              />
              <div className="grid grid-cols-2 gap-4 mt-3">
                <div>
                  <Label className="text-xs">Min Rows</Label>
                  <Input
                    type="number"
                    value={formData.table_min_rows}
                    onChange={(e) => handleChange('table_min_rows', parseInt(e.target.value) || 1)}
                    min={1}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Max Rows</Label>
                  <Input
                    type="number"
                    value={formData.table_max_rows}
                    onChange={(e) => handleChange('table_max_rows', parseInt(e.target.value) || 10)}
                    min={1}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Required Toggle */}
          <div className="flex items-center gap-2">
            <Switch
              checked={formData.required}
              onCheckedChange={(v) => handleChange('required', v)}
            />
            <Label>Required field</Label>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} className="bg-emerald-600 hover:bg-emerald-700">
            {isEdit ? 'Save Changes' : 'Add Field'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// =============================================================================
// Table Columns Editor (for table field type)
// =============================================================================

function TableColumnsEditor({ columns, onChange }) {
  const [newColumn, setNewColumn] = useState({ key: '', label: '', type: 'text' });

  const addColumn = () => {
    if (!newColumn.key || !newColumn.label) return;
    onChange([...columns, { ...newColumn }]);
    setNewColumn({ key: '', label: '', type: 'text' });
  };

  const removeColumn = (index) => {
    onChange(columns.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2 mt-2">
      {columns.length > 0 && (
        <div className="space-y-1">
          {columns.map((col, idx) => (
            <div key={idx} className="flex items-center gap-2 p-2 bg-stone-50 rounded text-sm">
              <span className="font-mono text-xs flex-1">{col.key}</span>
              <span className="flex-1">{col.label}</span>
              <Badge variant="outline" className="text-xs">{col.type}</Badge>
              <Button variant="ghost" size="sm" onClick={() => removeColumn(idx)} className="h-6 w-6 p-0">
                <X className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Input
          value={newColumn.key}
          onChange={(e) => setNewColumn(prev => ({ ...prev, key: e.target.value }))}
          placeholder="Key"
          className="flex-1 text-xs"
        />
        <Input
          value={newColumn.label}
          onChange={(e) => setNewColumn(prev => ({ ...prev, label: e.target.value }))}
          placeholder="Label"
          className="flex-1 text-xs"
        />
        <Select value={newColumn.type} onValueChange={(v) => setNewColumn(prev => ({ ...prev, type: v }))}>
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="text">Text</SelectItem>
            <SelectItem value="number">Number</SelectItem>
            <SelectItem value="dropdown">Dropdown</SelectItem>
            <SelectItem value="date">Date</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={addColumn} size="sm" variant="outline" className="h-9">
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
