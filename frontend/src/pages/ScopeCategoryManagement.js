import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import {
  Plus,
  Edit,
  Trash2,
  ChevronDown,
  ChevronRight,
  Layers,
  FolderTree,
  Lock,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function ScopeCategoryManagement() {
  const { getAuthHeader } = useAuth();
  const [scopes, setScopes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({}); // scope_id -> bool
  const [showInactive, setShowInactive] = useState(false);

  const [scopeDialogOpen, setScopeDialogOpen] = useState(false);
  const [editingScope, setEditingScope] = useState(null);
  const [scopeForm, setScopeForm] = useState({ name: '', code: '', description: '', display_order: 0 });

  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryForm, setCategoryForm] = useState({
    scope_id: '',
    name: '',
    code: '',
    description: '',
    display_order: 0,
  });

  const loadData = async () => {
    try {
      const [scopesRes, catsRes] = await Promise.all([
        axios.get(`${API}/scopes?include_inactive=true`, { headers: getAuthHeader() }),
        axios.get(`${API}/categories?include_inactive=true`, { headers: getAuthHeader() }),
      ]);
      setScopes(scopesRes.data || []);
      setCategories(catsRes.data || []);
      // Expand all by default on first load
      setExpanded((prev) => {
        if (Object.keys(prev).length) return prev;
        const next = {};
        (scopesRes.data || []).forEach((s) => {
          next[s.id] = true;
        });
        return next;
      });
    } catch (err) {
      console.error(err);
      toast.error('Failed to load scopes & categories');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleScopes = useMemo(
    () => (showInactive ? scopes : scopes.filter((s) => s.is_active)),
    [scopes, showInactive],
  );

  const categoriesByScope = useMemo(() => {
    const map = {};
    (categories || []).forEach((c) => {
      if (!showInactive && !c.is_active) return;
      if (!map[c.scope_id]) map[c.scope_id] = [];
      map[c.scope_id].push(c);
    });
    Object.values(map).forEach((arr) => arr.sort((a, b) => (a.display_order || 0) - (b.display_order || 0)));
    return map;
  }, [categories, showInactive]);

  // ---------- Scope handlers ----------
  const openNewScope = () => {
    setEditingScope(null);
    setScopeForm({ name: '', code: '', description: '', display_order: (scopes.length || 0) + 1 });
    setScopeDialogOpen(true);
  };

  const openEditScope = (scope) => {
    setEditingScope(scope);
    setScopeForm({
      name: scope.name || '',
      code: scope.code || '',
      description: scope.description || '',
      display_order: scope.display_order || 0,
    });
    setScopeDialogOpen(true);
  };

  const handleScopeSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingScope) {
        await axios.put(
          `${API}/super-admin/scopes/${editingScope.id}`,
          scopeForm,
          { headers: getAuthHeader() },
        );
        toast.success('Scope updated');
      } else {
        await axios.post(`${API}/super-admin/scopes`, scopeForm, { headers: getAuthHeader() });
        toast.success('Scope created');
      }
      setScopeDialogOpen(false);
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Save failed');
    }
  };

  const handleDeleteScope = async (scope) => {
    if (!window.confirm(`Soft-delete scope "${scope.name}"? It will be hidden from new entries but kept in historical records.`)) return;
    try {
      await axios.delete(`${API}/super-admin/scopes/${scope.id}`, { headers: getAuthHeader() });
      toast.success('Scope deactivated');
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Delete failed');
    }
  };

  const handleRestoreScope = async (scope) => {
    try {
      await axios.post(`${API}/super-admin/scopes/${scope.id}/restore`, {}, { headers: getAuthHeader() });
      toast.success('Scope restored');
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Restore failed');
    }
  };

  // ---------- Category handlers ----------
  const openNewCategory = (scopeId = '') => {
    setEditingCategory(null);
    setCategoryForm({
      scope_id: scopeId || (visibleScopes[0]?.id ?? ''),
      name: '',
      code: '',
      description: '',
      display_order: (categoriesByScope[scopeId]?.length || 0) + 1,
    });
    setCategoryDialogOpen(true);
  };

  const openEditCategory = (cat) => {
    setEditingCategory(cat);
    setCategoryForm({
      scope_id: cat.scope_id,
      name: cat.name || '',
      code: cat.code || '',
      description: cat.description || '',
      display_order: cat.display_order || 0,
    });
    setCategoryDialogOpen(true);
  };

  const handleCategorySubmit = async (e) => {
    e.preventDefault();
    if (!categoryForm.scope_id) {
      toast.error('Please select a scope');
      return;
    }
    try {
      if (editingCategory) {
        await axios.put(
          `${API}/super-admin/categories/${editingCategory.id}`,
          categoryForm,
          { headers: getAuthHeader() },
        );
        toast.success('Category updated');
      } else {
        await axios.post(`${API}/super-admin/categories`, categoryForm, { headers: getAuthHeader() });
        toast.success('Category created');
      }
      setCategoryDialogOpen(false);
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Save failed');
    }
  };

  const handleDeleteCategory = async (cat) => {
    if (!window.confirm(`Soft-delete category "${cat.name}"? Existing records will keep their label, but new entries won't see it.`)) return;
    try {
      await axios.delete(`${API}/super-admin/categories/${cat.id}`, { headers: getAuthHeader() });
      toast.success('Category deactivated');
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Delete failed');
    }
  };

  const handleRestoreCategory = async (cat) => {
    try {
      await axios.post(
        `${API}/super-admin/categories/${cat.id}/restore`,
        {},
        { headers: getAuthHeader() },
      );
      toast.success('Category restored');
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Restore failed');
    }
  };

  const toggleExpand = (scopeId) => {
    setExpanded((prev) => ({ ...prev, [scopeId]: !prev[scopeId] }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="scope-category-management-page">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-4xl font-heading font-bold text-text-primary mb-2">
            Scope & Category Management
          </h1>
          <p className="text-text-secondary">
            Define the scopes (Scope 1, 2, 3, Biogenic, …) and the categories shown
            across Emissions, Fuel Database, Formulas, and Reports.
          </p>
        </div>
        <div className="flex gap-3 items-center">
          <div className="flex items-center gap-2">
            <Switch
              id="show-inactive"
              checked={showInactive}
              onCheckedChange={setShowInactive}
              data-testid="toggle-show-inactive"
            />
            <Label htmlFor="show-inactive" className="cursor-pointer">
              Show inactive
            </Label>
          </div>
          <Button
            onClick={openNewScope}
            className="bg-primary hover:bg-primary/90 text-white rounded-full px-6"
            data-testid="add-scope-button"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Scope
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {visibleScopes.length === 0 && (
          <Card className="p-12 text-center border-dashed">
            <FolderTree className="w-12 h-12 text-stone-300 mx-auto mb-3" />
            <p className="text-text-muted">No scopes yet. Click "Add Scope" to create one.</p>
          </Card>
        )}
        {visibleScopes.map((scope) => {
          const cats = categoriesByScope[scope.id] || [];
          const isOpen = expanded[scope.id] ?? true;
          return (
            <Card
              key={scope.id}
              className={`border border-stone-200 rounded-xl overflow-hidden ${
                !scope.is_active ? 'opacity-60' : ''
              }`}
              data-testid={`scope-card-${scope.code}`}
            >
              <div className="p-5 flex items-start justify-between gap-4 bg-stone-50/60">
                <button
                  type="button"
                  onClick={() => toggleExpand(scope.id)}
                  className="flex items-start gap-3 flex-1 text-left"
                  data-testid={`toggle-scope-${scope.code}`}
                >
                  <div className="bg-primary/10 p-2 rounded-lg mt-0.5">
                    <Layers className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-heading font-bold text-text-primary text-lg">
                        {scope.name}
                      </h3>
                      <Badge variant="outline" className="font-mono text-xs">
                        {scope.code}
                      </Badge>
                      {scope.is_system && (
                        <Badge className="bg-stone-200 text-stone-700 hover:bg-stone-200">
                          <Lock className="w-3 h-3 mr-1" /> system
                        </Badge>
                      )}
                      {!scope.is_active && (
                        <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">
                          inactive
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-xs">
                        {cats.length} categor{cats.length === 1 ? 'y' : 'ies'}
                      </Badge>
                    </div>
                    {scope.description && (
                      <p className="text-sm text-text-muted mt-1">{scope.description}</p>
                    )}
                  </div>
                  <div className="flex items-center text-text-muted">
                    {isOpen ? (
                      <ChevronDown className="w-5 h-5" />
                    ) : (
                      <ChevronRight className="w-5 h-5" />
                    )}
                  </div>
                </button>
                <div className="flex gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      openNewCategory(scope.id);
                    }}
                    data-testid={`add-category-in-${scope.code}`}
                    title="Add category"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditScope(scope);
                    }}
                    data-testid={`edit-scope-${scope.code}`}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  {scope.is_active ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteScope(scope);
                      }}
                      className="text-red-500 hover:text-red-700"
                      data-testid={`delete-scope-${scope.code}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRestoreScope(scope);
                      }}
                      className="text-emerald-600 hover:text-emerald-700"
                      data-testid={`restore-scope-${scope.code}`}
                      title="Restore"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>

              {isOpen && (
                <div className="p-5 space-y-2">
                  {cats.length === 0 && (
                    <p className="text-sm text-text-muted italic">
                      No categories yet. Click + to add one.
                    </p>
                  )}
                  {cats.map((cat) => (
                    <div
                      key={cat.id}
                      className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg border border-stone-200 hover:border-primary/40 transition-colors ${
                        !cat.is_active ? 'opacity-60 bg-stone-50' : 'bg-white'
                      }`}
                      data-testid={`category-row-${cat.code}`}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-2 h-2 rounded-full bg-primary/60 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-text-primary truncate">{cat.name}</span>
                            <Badge variant="outline" className="font-mono text-xs">
                              {cat.code}
                            </Badge>
                            {cat.is_system && (
                              <Badge className="bg-stone-200 text-stone-700 hover:bg-stone-200 text-xs">
                                <Lock className="w-2.5 h-2.5 mr-1" /> system
                              </Badge>
                            )}
                            {!cat.is_active && (
                              <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 text-xs">
                                inactive
                              </Badge>
                            )}
                          </div>
                          {cat.description && (
                            <p className="text-xs text-text-muted mt-0.5 truncate">
                              {cat.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditCategory(cat)}
                          data-testid={`edit-category-${cat.code}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        {cat.is_active ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteCategory(cat)}
                            className="text-red-500 hover:text-red-700"
                            data-testid={`delete-category-${cat.code}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRestoreCategory(cat)}
                            className="text-emerald-600 hover:text-emerald-700"
                            data-testid={`restore-category-${cat.code}`}
                            title="Restore"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Scope Dialog */}
      <Dialog open={scopeDialogOpen} onOpenChange={setScopeDialogOpen}>
        <DialogContent className="sm:max-w-md" data-testid="scope-dialog">
          <DialogHeader>
            <DialogTitle>{editingScope ? 'Edit Scope' : 'Add New Scope'}</DialogTitle>
            <DialogDescription>
              Scopes group categories (e.g. Scope 1 → Stationary Combustion).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleScopeSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="scope-name">Scope Name *</Label>
              <Input
                id="scope-name"
                value={scopeForm.name}
                onChange={(e) => setScopeForm({ ...scopeForm, name: e.target.value })}
                placeholder="e.g., Scope 1"
                required
                className="bg-stone-50"
                data-testid="scope-name-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="scope-code">
                Code{' '}
                <span className="text-xs text-text-muted font-normal">
                  (auto-generated if empty — used as the stored value, cannot change for system scopes)
                </span>
              </Label>
              <Input
                id="scope-code"
                value={scopeForm.code}
                onChange={(e) => setScopeForm({ ...scopeForm, code: e.target.value })}
                placeholder="e.g., scope1"
                className="bg-stone-50 font-mono"
                disabled={editingScope?.is_system}
                data-testid="scope-code-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="scope-description">Description</Label>
              <textarea
                id="scope-description"
                value={scopeForm.description}
                onChange={(e) => setScopeForm({ ...scopeForm, description: e.target.value })}
                rows={2}
                className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm"
                data-testid="scope-description-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="scope-order">Display Order</Label>
              <Input
                id="scope-order"
                type="number"
                value={scopeForm.display_order}
                onChange={(e) =>
                  setScopeForm({ ...scopeForm, display_order: Number(e.target.value) || 0 })
                }
                className="bg-stone-50"
                data-testid="scope-order-input"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setScopeDialogOpen(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-primary hover:bg-primary/90 text-white"
                data-testid="save-scope-button"
              >
                {editingScope ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Category Dialog */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="sm:max-w-md" data-testid="category-dialog">
          <DialogHeader>
            <DialogTitle>{editingCategory ? 'Edit Category' : 'Add New Category'}</DialogTitle>
            <DialogDescription>
              Categories appear in dropdowns across Emissions, Fuel Database, and Formulas.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCategorySubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="category-scope">Scope *</Label>
              <Select
                value={categoryForm.scope_id}
                onValueChange={(v) => setCategoryForm({ ...categoryForm, scope_id: v })}
              >
                <SelectTrigger data-testid="category-scope-select">
                  <SelectValue placeholder="Select a scope" />
                </SelectTrigger>
                <SelectContent>
                  {scopes
                    .filter((s) => s.is_active)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id} data-testid={`category-scope-option-${s.code}`}>
                        {s.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="category-name">Category Name *</Label>
              <Input
                id="category-name"
                value={categoryForm.name}
                onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                placeholder="e.g., Stationary Combustion"
                required
                className="bg-stone-50"
                data-testid="category-name-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category-code">
                Code{' '}
                <span className="text-xs text-text-muted font-normal">
                  (auto-generated if empty — cannot change for system categories)
                </span>
              </Label>
              <Input
                id="category-code"
                value={categoryForm.code}
                onChange={(e) => setCategoryForm({ ...categoryForm, code: e.target.value })}
                placeholder="e.g., stationary_combustion"
                className="bg-stone-50 font-mono"
                disabled={editingCategory?.is_system}
                data-testid="category-code-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category-description">Description</Label>
              <textarea
                id="category-description"
                value={categoryForm.description}
                onChange={(e) =>
                  setCategoryForm({ ...categoryForm, description: e.target.value })
                }
                rows={2}
                className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm"
                data-testid="category-description-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category-order">Display Order</Label>
              <Input
                id="category-order"
                type="number"
                value={categoryForm.display_order}
                onChange={(e) =>
                  setCategoryForm({
                    ...categoryForm,
                    display_order: Number(e.target.value) || 0,
                  })
                }
                className="bg-stone-50"
                data-testid="category-order-input"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCategoryDialogOpen(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-primary hover:bg-primary/90 text-white"
                data-testid="save-category-button"
              >
                {editingCategory ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
