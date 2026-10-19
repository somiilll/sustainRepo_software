import React, { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './ui/select';
import { Plus, Trash2, GitFork, ArrowRight, FileCode2, WrapText, X, Check } from 'lucide-react';

/**
 * Inline prompt shown when wrapping a node with a new parent.
 * Asks for the option value under which the current node will be placed.
 */
function WrapPrompt({ onConfirm, onCancel }) {
  const [optionValue, setOptionValue] = useState('');

  const handleConfirm = () => {
    const trimmed = optionValue.trim();
    if (trimmed) onConfirm(trimmed);
  };

  return (
    <div className="flex items-center gap-2 p-2 bg-violet-50 rounded-lg border border-violet-300 animate-in fade-in-0 slide-in-from-top-1 duration-150">
      <WrapText className="w-4 h-4 text-violet-600 shrink-0" />
      <span className="text-xs text-violet-700 whitespace-nowrap">Place current node under option:</span>
      <Input
        autoFocus
        value={optionValue}
        onChange={(e) => setOptionValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleConfirm();
          if (e.key === 'Escape') onCancel();
        }}
        placeholder="e.g. using_ncv"
        className="bg-white text-sm font-mono h-7 flex-1"
      />
      <Button size="sm" variant="ghost" disabled={!optionValue.trim()} onClick={handleConfirm} className="text-violet-700 h-7 px-2">
        <Check className="w-3.5 h-3.5" />
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel} className="text-stone-400 h-7 px-2">
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

/**
 * Creates a new parent node that wraps `childNode` under the given option value.
 */
function wrapNode(childNode, optionValue) {
  const isLeaf = childNode.formula_id !== undefined && !childNode.options;
  return {
    field_name: '',
    options: {
      [optionValue]: isLeaf ? { next: { field_name: '', options: { value1: { formula_id: childNode.formula_id || '' } } } } : { next: childNode },
    },
  };
}

/** Branch node — has field_name + options */
function BranchNode({ node, path, onUpdate, formulas, renderNode }) {
  const [newOptionValue, setNewOptionValue] = useState('');
  const [wrapping, setWrapping] = useState(false);
  const options = Object.entries(node.options || {});

  const handleAddOption = (value) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onUpdate({ ...node, options: { ...node.options, [trimmed]: { formula_id: '' } } });
    setNewOptionValue('');
  };

  return (
    <div className="space-y-3" data-testid={`branch-node-${path.join('-') || 'root'}`}>
      {/* Wrap prompt (shown above the node when active) */}
      {wrapping && (
        <WrapPrompt
          onConfirm={(optVal) => { onUpdate(wrapNode(node, optVal)); setWrapping(false); }}
          onCancel={() => setWrapping(false)}
        />
      )}

      {/* Node header */}
      <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
        <GitFork className="w-4 h-4 text-blue-600 shrink-0" />
        <Input
          value={node.field_name || ''}
          onChange={(e) => onUpdate({ ...node, field_name: e.target.value })}
          placeholder="field_name (e.g. fuel_type, calculation_methodology)"
          className="bg-white flex-1 font-mono text-sm"
        />
        {!wrapping && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setWrapping(true)}
            className="text-violet-600 border-violet-300 hover:bg-violet-50 shrink-0"
            title="Wrap this node with a new parent"
            data-testid={`wrap-branch-${path.join('-') || 'root'}`}
          >
            <WrapText className="w-3.5 h-3.5 mr-1" />Wrap
          </Button>
        )}
      </div>

      {/* Options */}
      <div className="pl-6 border-l-2 border-blue-200 space-y-2">
        {options.map(([val, child]) => (
          <OptionRow
            key={val}
            val={val}
            child={child}
            node={node}
            path={path}
            onUpdate={onUpdate}
            formulas={formulas}
            renderNode={renderNode}
          />
        ))}

        {/* Add new option */}
        <div className="flex items-center gap-2 pt-2">
          <Input
            value={newOptionValue}
            onChange={(e) => setNewOptionValue(e.target.value)}
            placeholder="Add option value (e.g. diesel, gasoline)"
            className="bg-white text-sm"
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddOption(newOptionValue); }}
          />
          <Button size="sm" variant="outline" disabled={!newOptionValue.trim()} onClick={() => handleAddOption(newOptionValue)}>
            <Plus className="w-3 h-3 mr-1" />Add
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Single option row within a branch node */
function OptionRow({ val, child, node, path, onUpdate, formulas, renderNode }) {
  const deleteOption = () => {
    const newOptions = { ...node.options };
    delete newOptions[val];
    onUpdate({ ...node, options: newOptions });
  };

  const setChild = (newChild) => {
    onUpdate({ ...node, options: { ...node.options, [val]: newChild } });
  };

  const nestLeaf = () => {
    setChild({
      next: { field_name: '', options: { value1: { formula_id: child.formula_id || '' } } },
    });
  };

  const setFormulaId = (v) => {
    setChild({ formula_id: v === 'none' ? '' : v });
  };

  const setNestedChild = (newChild) => {
    setChild({ next: newChild });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <ArrowRight className="w-4 h-4 text-stone-400" />
        <Badge variant="outline" className="font-mono">{val}</Badge>
        <Button size="sm" variant="ghost" className="text-red-500 ml-auto" onClick={deleteOption}>
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
      <div className="pl-6">
        {child.next ? (
          renderNode(child.next, [...path, val], setNestedChild)
        ) : (
          <div className="flex items-center gap-2">
            <Select value={child.formula_id || 'none'} onValueChange={setFormulaId}>
              <SelectTrigger className="bg-white flex-1"><SelectValue placeholder="Select formula" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Select formula —</SelectItem>
                {formulas.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={nestLeaf}>Nest</Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Leaf node — terminal formula assignment */
function LeafNode({ node, onUpdate, formulas }) {
  const [wrapping, setWrapping] = useState(false);

  const convertToBranch = () => {
    onUpdate({ field_name: '', options: { [node.formula_id || 'value1']: { formula_id: node.formula_id || '' } } });
  };

  return (
    <div className="space-y-2" data-testid="leaf-node">
      {wrapping && (
        <WrapPrompt
          onConfirm={(optVal) => { onUpdate(wrapNode(node, optVal)); setWrapping(false); }}
          onCancel={() => setWrapping(false)}
        />
      )}
      <div className="flex items-center gap-2 p-2 bg-emerald-50 rounded-lg border border-emerald-200">
        <FileCode2 className="w-4 h-4 text-emerald-600 shrink-0" />
        <Select value={node.formula_id || 'none'} onValueChange={(v) => onUpdate({ ...node, formula_id: v === 'none' ? '' : v })}>
          <SelectTrigger className="bg-white flex-1"><SelectValue placeholder="Select formula" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— Select formula —</SelectItem>
            {formulas.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={convertToBranch}>Branch</Button>
        {!wrapping && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setWrapping(true)}
            className="text-violet-600 border-violet-300 hover:bg-violet-50"
            title="Wrap this node with a new parent"
            data-testid="wrap-leaf"
          >
            <WrapText className="w-3.5 h-3.5 mr-1" />Wrap
          </Button>
        )}
      </div>
    </div>
  );
}

/** Main TreeNodeEditor — recursive renderer */
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
