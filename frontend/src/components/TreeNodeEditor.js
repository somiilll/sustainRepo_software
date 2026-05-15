import React, { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './ui/select';
import { Plus, Trash2, GitFork, ArrowRight, FileCode2 } from 'lucide-react';

// Individual node component for branch nodes
function BranchNode({ node, path, onUpdate, formulas, renderNode }) {
  const [newOptionValue, setNewOptionValue] = useState('');
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
                renderNode(
                  child.next,
                  [...path, val],
                  (newChild) => onUpdate({
                    ...node,
                    options: { ...node.options, [val]: { next: newChild } },
                  })
                )
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
}

// Leaf node component
function LeafNode({ node, onUpdate, formulas }) {
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

// Main TreeNodeEditor that handles the recursion via render prop pattern
export default function TreeNodeEditor({ node, path, onUpdate, formulas }) {
  const renderNode = (nodeToRender, nodePath, nodeOnUpdate) => {
    const isLeaf = nodeToRender.formula_id !== undefined && !nodeToRender.options;
    
    if (isLeaf) {
      return <LeafNode node={nodeToRender} onUpdate={nodeOnUpdate} formulas={formulas} />;
    }
    
    return (
      <BranchNode
        node={nodeToRender}
        path={nodePath}
        onUpdate={nodeOnUpdate}
        formulas={formulas}
        renderNode={renderNode}
      />
    );
  };

  return renderNode(node, path, onUpdate);
}
