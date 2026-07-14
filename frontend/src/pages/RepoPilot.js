import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Send, Upload, FileText, Trash2, Bot, User, Loader2, X } from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, ScatterChart, Scatter,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const API = process.env.REACT_APP_BACKEND_URL;
const CHART_COLORS = ['#0ea5e9', '#e11d48', '#16a34a', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

function RenderChart({ chart }) {
  const { type, title, data, stack } = chart;
  if (!data) return null;

  // Detect flat vs nested data
  const isNested = typeof Object.values(data)[0] === 'object';
  let chartData, keys;

  if (isNested) {
    keys = [...new Set(Object.values(data).flatMap(v => Object.keys(v)))];
    chartData = Object.entries(data).map(([label, vals]) => ({ name: label, ...vals }));
  } else {
    keys = ['value'];
    chartData = Object.entries(data).map(([label, val]) => ({ name: label, value: val }));
  }

  const common = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
      <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#78716c" angle={-20} textAnchor="end" height={45} />
      <YAxis tick={{ fontSize: 10 }} stroke="#78716c" />
      <Tooltip />
      <Legend wrapperStyle={{ fontSize: 11 }} />
    </>
  );

  return (
    <div className="my-3 p-3 bg-white rounded-lg border border-stone-200">
      {title && <p className="text-xs font-semibold text-text-primary mb-2">{title}</p>}
      <ResponsiveContainer width="100%" height={220}>
        {type === 'pie' ? (
          <PieChart>
            <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
              {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        ) : type === 'line' ? (
          <LineChart data={chartData}>
            {common}
            {keys.map((k, i) => <Line key={k} type="monotone" dataKey={k} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} />)}
          </LineChart>
        ) : type === 'area' ? (
          <AreaChart data={chartData}>
            {common}
            {keys.map((k, i) => <Area key={k} type="monotone" dataKey={k} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.3} stroke={CHART_COLORS[i % CHART_COLORS.length]} />)}
          </AreaChart>
        ) : type === 'scatter' ? (
          <ScatterChart>
            {common}
            <Scatter data={chartData} fill={CHART_COLORS[0]} />
          </ScatterChart>
        ) : (
          <BarChart data={chartData}>
            {common}
            {keys.map((k, i) => <Bar key={k} dataKey={k} fill={CHART_COLORS[i % CHART_COLORS.length]} stackId={stack ? 'stack' : undefined} />)}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function ChatMessage({ msg, documents }) {
  const isUser = msg.role === 'user';
  const [viewSource, setViewSource] = useState(null);

  const getImageUrl = (source) => {
    const doc = documents.find(d => d.doc_id === source.doc_id);
    return doc?.image_urls?.[String(source.page_num)] || null;
  };

  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : ''}`} data-testid="chat-message">
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mt-1">
          <Bot className="w-4 h-4 text-emerald-700" />
        </div>
      )}
      <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm ${isUser ? 'bg-emerald-600 text-white rounded-br-sm' : 'bg-stone-100 text-text-primary rounded-bl-sm'}`}>
        {isUser ? (
          <p>{msg.content}</p>
        ) : (
          <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }} />
        )}
        {msg.charts?.length > 0 && msg.charts.map((chart, i) => <RenderChart key={i} chart={chart} />)}
        {msg.sources?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-stone-200/50">
            {msg.sources.map((s, i) => {
              const imgUrl = getImageUrl(s);
              return (
                <Badge
                  key={i}
                  variant="outline"
                  className={`text-[10px] bg-white/80 ${imgUrl ? 'cursor-pointer hover:bg-emerald-50' : ''}`}
                  onClick={() => imgUrl && setViewSource({ ...s, imgUrl })}
                >
                  [{s.citation_id}] {s.doc_id} p.{s.page_num}
                </Badge>
              );
            })}
          </div>
        )}
      </div>
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center shrink-0 mt-1">
          <User className="w-4 h-4 text-stone-600" />
        </div>
      )}
      {viewSource && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => setViewSource(null)}>
          <div className="bg-white rounded-lg p-4 max-w-3xl max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-2">
              <p className="text-sm font-semibold">{viewSource.doc_id} — Page {viewSource.page_num}</p>
              <Button variant="ghost" size="sm" onClick={() => setViewSource(null)}><X className="w-4 h-4" /></Button>
            </div>
            <img src={viewSource.imgUrl} alt={`Page ${viewSource.page_num}`} className="w-full" />
          </div>
        </div>
      )}
    </div>
  );
}

function formatMarkdown(text) {
  if (!text) return '';
  let html = text
    .replace(/### (.*?)$/gm, '<h3 class="font-semibold text-base mt-3 mb-1">$1</h3>')
    .replace(/## (.*?)$/gm, '<h2 class="font-semibold text-lg mt-3 mb-1">$1</h2>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^- (.*?)$/gm, '<li class="ml-4">$1</li>')
    .replace(/(<li.*?<\/li>\n?)+/g, '<ul class="list-disc mb-2">$&</ul>');

  // Table rendering
  const lines = html.split('\n');
  let inTable = false;
  const out = [];
  for (const line of lines) {
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      if (!inTable) { out.push('<table class="w-full text-sm border-collapse my-2">'); inTable = true; }
      const cells = line.split('|').filter(c => c.trim());
      if (cells.every(c => /^[\s\-:]+$/.test(c))) continue; // skip separator
      const isHeader = !out.some(o => o.includes('<td'));
      const tag = isHeader && inTable && !out.some(o => o.includes('</tr>')) ? 'th' : 'td';
      const cls = tag === 'th' ? 'bg-stone-100 font-semibold px-2 py-1 border border-stone-200 text-left' : 'px-2 py-1 border border-stone-200';
      out.push('<tr>' + cells.map(c => `<${tag} class="${cls}">${c.trim()}</${tag}>`).join('') + '</tr>');
    } else {
      if (inTable) { out.push('</table>'); inTable = false; }
      out.push(line);
    }
  }
  if (inTable) out.push('</table>');
  html = out.join('\n');

  html = html.replace(/\n\n/g, '<br/>').replace(/\n/g, '<br/>');
  return html;
}

export default function RepoPilotPage() {
  const { token, user } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [docFilter, setDocFilter] = useState([]);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(scrollToBottom, [messages]);

  const fetchDocs = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/repo-pilot/documents`, { headers });
      setDocuments(res.data?.documents || []);
    } catch (e) { /* silent */ }
  }, [token]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: 'user', content: input.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await axios.post(`${API}/api/repo-pilot/chat`, {
        message: userMsg.content,
        doc_filters: docFilter.length > 0 ? docFilter : null,
        length: 'Medium',
      }, { headers });

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: res.data.answer,
        sources: res.data.sources,
        charts: res.data.charts,
      }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, an error occurred. Please try again.' }]);
    }
    setLoading(false);
  };

  const pollStatus = useCallback(async (documentId) => {
    const poll = async () => {
      try {
        const res = await axios.get(`${API}/api/repo-pilot/documents/${documentId}/status`, { headers });
        const { stage, progress, error_message } = res.data;
        if (stage === 'COMPLETED') {
          toast.success('Document processing completed!');
          fetchDocs();
          return;
        }
        if (stage === 'FAILED') {
          toast.error(`Processing failed: ${error_message || 'Unknown error'}`);
          fetchDocs();
          return;
        }
        // Still processing — poll again
        setTimeout(poll, 3000);
      } catch (err) {
        // Silently retry
        setTimeout(poll, 5000);
      }
    };
    poll();
  }, [token]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await axios.post(`${API}/api/repo-pilot/upload`, formData, {
        headers: { ...headers, 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      });
      toast.success(`Uploaded: ${res.data.doc_id} — processing started`);
      fetchDocs();
      // Start polling for processing status
      pollStatus(res.data.document_id);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Upload failed');
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDelete = async (docId) => {
    try {
      await axios.delete(`${API}/api/repo-pilot/documents/${docId}`, { headers });
      toast.success('Document deleted');
      fetchDocs();
      setDocFilter(prev => prev.filter(d => d !== docId));
    } catch (e) {
      toast.error('Failed to delete');
    }
  };

  // Auto-regenerate images for docs missing them
  useEffect(() => {
    documents.forEach(doc => {
      if (doc.stage === 'COMPLETED' && doc.r2_url && (!doc.image_urls || Object.keys(doc.image_urls).length === 0)) {
        axios.post(`${API}/api/repo-pilot/documents/${doc.doc_id}/regenerate-images`, {}, { headers })
          .then(() => { setTimeout(fetchDocs, 15000); })
          .catch(() => null);
      }
    });
  }, [documents.length]);

  const toggleFilter = (docId) => {
    setDocFilter(prev => prev.includes(docId) ? prev.filter(d => d !== docId) : [...prev, docId]);
  };

  return (
    <div className="flex h-[calc(100vh-2rem)] gap-4 p-4" data-testid="repo-pilot-page">
      {/* Sidebar — Documents */}
      <div className="w-72 shrink-0 flex flex-col">
        <Card className="flex-1 flex flex-col overflow-hidden">
          <div className="p-3 border-b">
            <h3 className="font-semibold text-sm">Documents</h3>
            <input type="file" ref={fileInputRef} accept=".pdf" onChange={handleUpload} className="hidden" />
            <Button size="sm" className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700 gap-1" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
              {uploading ? 'Processing...' : 'Upload PDF'}
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {documents.length === 0 ? (
              <p className="text-xs text-text-muted text-center py-4">No documents uploaded yet</p>
            ) : documents.map(doc => (
              <div key={doc.doc_id} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer text-xs group ${docFilter.includes(doc.doc_id) ? 'bg-emerald-50 border border-emerald-200' : 'hover:bg-stone-50'}`} onClick={() => doc.stage === 'COMPLETED' && toggleFilter(doc.doc_id)}>
                <FileText className={`w-3.5 h-3.5 shrink-0 ${doc.stage === 'COMPLETED' ? 'text-stone-400' : 'text-amber-400'}`} />
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium">{doc.filename || doc.doc_id}</p>
                  {doc.stage === 'COMPLETED' ? (
                    <p className="text-text-muted">{doc.pages} pages · {doc.chunks} chunks</p>
                  ) : doc.stage === 'FAILED' ? (
                    <p className="text-red-500">Failed</p>
                  ) : (
                    <p className="text-amber-600">Processing... {doc.progress || 0}%</p>
                  )}
                </div>
                {isAdmin && (
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); handleDelete(doc.doc_id); }}>
                    <Trash2 className="w-3 h-3 text-red-500" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          {docFilter.length > 0 && (
            <div className="p-2 border-t">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-text-muted">Filtering: {docFilter.length} doc(s)</span>
                <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1" onClick={() => setDocFilter([])}>
                  <X className="w-3 h-3" /> Clear
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        <Card className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center">
              <Bot className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <h2 className="font-semibold text-text-primary">Repo Pilot</h2>
              <p className="text-xs text-text-muted">Ask questions about your ESG documents</p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Bot className="w-16 h-16 text-stone-200 mb-4" />
                <h3 className="text-lg font-semibold text-text-primary mb-1">ESG Document Assistant</h3>
                <p className="text-sm text-text-muted max-w-md">Upload ESG reports, sustainability documents, or annual reports and ask any questions. I will find answers with exact page citations.</p>
              </div>
            )}
            {messages.map((msg, i) => <ChatMessage key={i} msg={msg} documents={documents} />)}
            {loading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-emerald-700" />
                </div>
                <div className="bg-stone-100 rounded-2xl rounded-bl-sm px-4 py-3">
                  <div className="flex gap-1"><div className="w-2 h-2 bg-stone-400 rounded-full animate-bounce" /><div className="w-2 h-2 bg-stone-400 rounded-full animate-bounce" style={{animationDelay:'0.1s'}} /><div className="w-2 h-2 bg-stone-400 rounded-full animate-bounce" style={{animationDelay:'0.2s'}} /></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t">
            <div className="flex gap-2">
              <Input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()} placeholder="Ask about your ESG documents..." className="flex-1" disabled={loading} data-testid="chat-input" />
              <Button onClick={handleSend} disabled={!input.trim() || loading} className="bg-emerald-600 hover:bg-emerald-700" data-testid="chat-send">
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
