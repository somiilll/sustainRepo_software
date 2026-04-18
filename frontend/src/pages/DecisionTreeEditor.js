import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Plus, Trash2, Edit, ChevronDown, ChevronRight, GitFork, AlertCircle,
  ArrowRight, Layers, FileCode2,
} from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// A decision node can be:
// 1. A branch: { field_name, options: { value: { formula_id } or { next: {...} } } }
// 2. A leaf: { formula_id }
const EMPTY_TREE = {
  field_name: '',
  options: {},
};

export default function DecisionTreeEditor() {
  const { getAuthHeader } = useAuth();
  const [trees, setTrees] = useState([]);
  const [categories, setCategories] = useState([]);
  const [formulas, setFormulas] = useState([]);
  const [loading, setLoading] = useState(true);

  // Editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [tree, setTree] = useState(EMPTY_TREE);
  const [editingTreeId, setEditingTreeId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);

  // Expansion
  const [expandedTree, setExpandedTree] = useState(null);

  const load = useCallback(async () => {
    try {
      const [tRes, cRes, fRes] = await Promise.all([
        axios.get(`${API}/calc-engine/decision-trees`, { headers: getAuthHeader() }),
        axios.get(`${API}/categories`, { headers: getAuthHeader() }),
        axios.get(`${API}/calc-engine/formulas`, { headers: getAuthHeader() }),
      ]);
      setTrees(tRes.data || []);
      setCategories(cRes.data || []);
      setFormulas(fRes.data || []);
    } catch (e) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader]);

  useEffect(() => { load(); }, [load]);

  // Group trees by category
  const treesByCategory = useMemo(() => {
    const map = {};
    trees.forEach((t) => {
      const cat = categories.find((c) => c.id === t.category_id);
      const catName = cat?.name || 'Uncategorized';
      if (!map[catName]) map[catName] = [];
      map[catName].push({ ...t, categoryObj: cat });
    });
    return map;
  }, [trees, categories]);

  // Categories without trees
  const categoriesWithoutTree = useMemo(() => {
    const withTree = new Set(trees.map((t) => t.category_id));
    return categories.filter((c) => !withTree.has(c.id));
  }, [categories, trees]);

  const openCreate = (categoryId = '') => {
    setSelectedCategoryId(categoryId);
    setTree(JSON.parse(JSON.stringify(EMPTY_TREE)));
    setEditingTreeId(null);
    setValidationErrors([]);
    setEditorOpen(true);
  };

  const openEdit = (t) => {
    setSelectedCategoryId(t.category_id);
    setTree(JSON.parse(JSON.stringify(t.tree)));
    setEditingTreeId(t.id);
    setValidationErrors([]);
    setEditorOpen(true);
  };

  // Tree manipulation helpers
  const updateTreeAtPath = (path, value) => {
    setTree((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      if (path.length === 0) return value;
      let cur = next;
      for (let i = 0; i < path.length - 1; i++) {
        const p = path[i];
        if (typeof p === 'string') {
          cur = cur.options[p];
          if (cur.next) cur = cur.next;
        }
      }
      const lastKey = path[path.length - 1];
      if (typeof lastKey === 'string') {
        if (cur.options && cur.options[lastKey]) {
          if (value === null) {
            delete cur.options[lastKey];
          } else {
            cur.options[lastKey] = value;
          }
        } else {
          cur[lastKey] = value;
        }
      }
      return next;
    });
  };

  const addBranch = (node, optionValue) => {
    if (!node.options) node.options = {};
    node.options[optionValue] = { formula_id: '' };
    return node;
  };

  const validate = () => {
    const errors = [];
    if (!selectedCategoryId) errors.push('Category is required');

    const checkNode = (node, path) => {
      if (node.formula_id !== undefined) {
        // Leaf
        if (!node.formula_id) {
          errors.push(`Leaf at ${path || 'root'}: formula_id is required`);
        }
        return;
      }
      if (!node.field_name) {
        errors.push(`Branch at ${path || 'root'}: field_name is required`);
      }
      if (!node.options || Object.keys(node.options).length === 0) {
        errors.push(`Branch at ${path || 'root'}: at least one option is required`);
      }
      Object.entries(node.options || {}).forEach(([val, child]) => {
        const childPath = path ? `${path}.${val}` : val;
        if (child.next) {
          checkNode(child.next, childPath);
        } else if (child.formula_id !== undefined) {
          if (!child.formula_id) {
            errors.push(`Leaf at ${childPath}: formula_id is required`);
          }
        } else {
          errors.push(`Child at ${childPath}: must have 'next' or 'formula_id'`);
        }
      });
    };

    checkNode(tree, '');
    setValidationErrors(errors);
    return errors.length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = { category_id: selectedCategoryId, tree };
      if (editingTreeId) {
        await axios.put(`${API}/super-admin/calc-engine/decision-trees/${editingTreeId}`, payload, { headers: getAuthHeader() });
        toast.success('Decision tree updated');
      } else {
        await axios.post(`${API}/super-admin/calc-engine/decision-trees`, payload, { headers: getAuthHeader() });
        toast.success('Decision tree created');
      }
      setEditorOpen(false);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const deleteTree = async (t) => {
    const catName = t.categoryObj?.name || 'this category';
    if (!window.confirm(`Delete decision tree for "${catName}"?`)) return;
    try {
      await axios.delete(`${API}/super-admin/calc-engine/decision-trees/${t.id}`, { headers: getAuthHeader() });
      toast.success('Decision tree deleted');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Delete failed');
    }
  };

  // Recursive tree node editor
  const TreeNodeEditor = ({ node, path, onUpdate }) => {
    const isLeaf = node.formula_id !== undefined && !node.options;
    const [newOptionValue, setNewOptionValue] = useState('');

    if (isLeaf) {
      return (
        <div className="flex items-center gap-2 p-2 bg-emerald-50 rounded-lg border border-emerald-200">
          <FileCode2 className="w-4 h-4 text-emerald-600" />
          <Select value={node.formula_id || 'none'} onValueChange={(v) => onUpdate({ ...node, formula_id: v === 'none' ? '' : v })}>
            <SelectTrigger className="bg-white flex-1"><SelectValue placeholder="Select formula" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Select formula —</SelectItem>
              {formulas.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => onUpdate({ field_name: '', options: { [node.formula_id || 'value1']: { formula_id: node.formula_id || '' } } })}>
            Convert to branch
          </Button>
        </div>
      );
    }

    const options = Object.entries(node.options || {});

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <GitFork className="w-4 h-4 text-blue-600" />
          <Input
            value={node.field_name || ''}
            onChange={(e) => onUpdate({ ...node, field_name: e.target.value })}
            placeholder="field_name (e.g. fuel_type, activity_type)"
            className="bg-white flex-1 font-mono text-sm"
          />
        </div>

        <div className="pl-6 border-l-2 border-blue-200 space-y-2">
          {options.map(([val, child]) => (
            <div key={val} className="space-y-2">
              <div className="flex items-center gap-2">
                <ArrowRight className="w-4 h-4 text-stone-400" />
                <Badge variant="outline" className="font-mono">{val}</Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-500 ml-auto"
                  onClick={() => {
                    const newOptions = { ...node.options };
                    delete newOptions[val];
                    onUpdate({ ...node, options: newOptions });
                  }}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
              <div className="pl-6">
                {child.next ? (
                  <TreeNodeEditor
                    node={child.next}
                    path={[...path, val]}
                    onUpdate={(newChild) => onUpdate({
                      ...node,
                      options: { ...node.options, [val]: { next: newChild } },
                    })}
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <Select
                      value={child.formula_id || 'none'}
                      onValueChange={(v) => onUpdate({
                        ...node,
                        options: { ...node.options, [val]: { formula_id: v === 'none' ? '' : v } },
                      })}
                    >
                      <SelectTrigger className="bg-white flex-1"><SelectValue placeholder="Select formula" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Select formula —</SelectItem>
                        {formulas.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onUpdate({
                        ...node,
                        options: {
                          ...node.options,
                          [val]: { next: { field_name: '', options: { value1: { formula_id: child.formula_id || '' } } } },
                        },
                      })}
                    >
                      Nest
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}

          <div className="flex items-center gap-2 pt-2">
            <Input
              value={newOptionValue}
              onChange={(e) => setNewOptionValue(e.target.value)}
              placeholder="Add option value (e.g. diesel, gasoline)"
              className="bg-white text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newOptionValue.trim()) {
                  onUpdate({
                    ...node,
                    options: { ...node.options, [newOptionValue.trim()]: { formula_id: '' } },
                  });
                  setNewOptionValue('');
                }
              }}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!newOptionValue.trim()}
              onClick={() => {
                if (newOptionValue.trim()) {
                  onUpdate({
                    ...node,
                    options: { ...node.options, [newOptionValue.trim()]: { formula_id: '' } },
                  });
                  setNewOptionValue('');
                }
              }}
            >
              <Plus className="w-3 h-3 mr-1" />Add
            </Button>
          </div>
        </div>
      </div>
    );
  };

  // Render tree preview recursively
  const renderTreePreview = (node, depth = 0) => {
    if (!node) return null;
    if (node.formula_id !== undefined && !node.options) {
      const f = formulas.find((x) => x.id === node.formula_id);
      return (
        <div style={{ marginLeft: depth * 16 }} className="flex items-center gap-1 text-sm">
          <FileCode2 className="w-3 h-3 text-emerald-600" />
          <span className="text-emerald-700 font-medium">{f?.name || node.formula_id || '(no formula)'}</span>
        </div>
      );
    }

    return (
      <div style={{ marginLeft: depth * 16 }}>
        <div className="flex items-center gap-1 text-sm text-blue-700 font-mono">
          <GitFork className="w-3 h-3" />{node.field_name || '(no field)'}
        </div>
        {Object.entries(node.options || {}).map(([val, child]) => (
          <div key={val}>
            <div style={{ marginLeft: 16 }} className="text-xs text-stone-500 flex items-center gap-1">
              <ArrowRight className="w-3 h-3" />{val}:
            </div>
            {child.next ? renderTreePreview(child.next, depth + 2) : renderTreePreview({ formula_id: child.formula_id }, depth + 2)}
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return <div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="space-y-6" data-testid="decision-tree-editor-page">
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div>
          <h1 className="text-4xl font-heading font-bold text-text-primary mb-2 flex items-center gap-3">
            <GitFork className="w-8 h-8 text-primary" />
            Decision Trees
          </h1>
          <p className="text-text-secondary">Configure how the calc engine selects formulas based on context (fuel type, activity type, etc.).</p>
        </div>
        <Button onClick={() => openCreate()} className="bg-primary hover:bg-primary/90 text-white rounded-full px-6" data-testid="create-tree-btn">
          <Plus className="w-4 h-4 mr-2" />Create Decision Tree
        </Button>
      </div>

      {/* Categories without trees */}
      {categoriesWithoutTree.length > 0 && (
        <Card className="p-4 bg-amber-50/50 border border-amber-200">
          <div className="flex items-center gap-2 text-amber-700 font-medium mb-2">
            <AlertCircle className="w-4 h-4" />
            Categories without decision trees
          </div>
          <div className="flex flex-wrap gap-2">
            {categoriesWithoutTree.map((c) => (
              <Button
                key={c.id}
                size="sm"
                variant="outline"
                onClick={() => openCreate(c.id)}
                className="text-amber-700 border-amber-300 hover:bg-amber-100"
              >
                <Plus className="w-3 h-3 mr-1" />{c.name}
              </Button>
            ))}
          </div>
        </Card>
      )}

      {/* Trees by category */}
      {Object.entries(treesByCategory).map(([catName, catTrees]) => (
        <div key={catName}>
          <div className="flex items-center gap-2 mb-3">
            <Layers className="w-4 h-4 text-primary" />
            <h2 className="font-heading font-bold text-text-primary">{catName}</h2>
            <Badge variant="secondary" className="text-xs">{catTrees.length}</Badge>
          </div>
          <div className="space-y-3">
            {catTrees.map((t) => {
              const isExpanded = expandedTree === t.id;
              return (
                <Card key={t.id} className="overflow-hidden">
                  <div
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-stone-50/50"
                    onClick={() => setExpandedTree(isExpanded ? null : t.id)}
                    data-testid={`tree-row-${t.id}`}
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-stone-400" /> : <ChevronRight className="w-4 h-4 text-stone-400" />}
                      <div>
                        <div className="font-heading font-bold text-text-primary">{t.categoryObj?.name || 'Unknown Category'}</div>
                        <div className="text-sm text-text-muted">
                          Root field: <span className="font-mono text-primary">{t.tree?.field_name || '(direct formula)'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">v{t.version_number || 1}</Badge>
                      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openEdit(t); }} data-testid={`edit-tree-${t.id}`}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-500" onClick={(e) => { e.stopPropagation(); deleteTree(t); }} data-testid={`delete-tree-${t.id}`}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="border-t border-stone-100 p-4 bg-stone-50/30">
                      {renderTreePreview(t.tree)}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      {trees.length === 0 && (
        <Card className="p-12 text-center text-text-muted">
          No decision trees configured. Create one to map categories to formulas.
        </Card>
      )}

      {/* Editor Dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTreeId ? 'Edit Decision Tree' : 'Create Decision Tree'}</DialogTitle>
            <DialogDescription>Define branching logic to select the right formula based on input context.</DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div className="space-y-1.5">
              <Label>Category *</Label>
              <Select value={selectedCategoryId || 'none'} onValueChange={(v) => setSelectedCategoryId(v === 'none' ? '' : v)} disabled={!!editingTreeId}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Select category —</SelectItem>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <Card className="p-4 border border-stone-200">
              <Label className="font-heading font-bold mb-3 block">Tree Structure</Label>
              <TreeNodeEditor node={tree} path={[]} onUpdate={setTree} />
            </Card>

            {/* Validation Errors */}
            {validationErrors.length > 0 && (
              <Card className="p-4 border border-red-200 bg-red-50">
                <div className="flex items-center gap-2 text-red-700 font-medium mb-2">
                  <AlertCircle className="w-4 h-4" />
                  Validation Errors
                </div>
                <ul className="list-disc list-inside text-sm text-red-600">
                  {validationErrors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </Card>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => setEditorOpen(false)} className="flex-1">Cancel</Button>
              <Button onClick={save} disabled={saving} className="flex-1 bg-primary hover:bg-primary/90 text-white" data-testid="save-tree-btn">
                {saving ? 'Saving...' : (editingTreeId ? 'Update Tree' : 'Create Tree')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
