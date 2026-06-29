/**
 * IncidentTrendChart — Line chart for safety/complaints/breaches
 */
import React from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

const categoryConfig = {
  safety: {
    title: 'Safety Incidents',
    keys: ['injury', 'fatality', 'ill_health', 'near_miss'],
    colors: ['#F43F5E', '#DC2626', '#F97316', '#FBBF24'],
    labels: ['Injury', 'Fatality', 'Ill-health', 'Near Miss']
  },
  complaints: {
    title: 'Complaints',
    keys: ['workplace', 'harassment', 'discrimination', 'human_rights', 'consumer'],
    colors: ['#8B5CF6', '#A855F7', '#C084FC', '#D8B4FE', '#E9D5FF'],
    labels: ['Workplace', 'Harassment', 'Discrimination', 'Human Rights', 'Consumer']
  },
  breaches: {
    title: 'Data Breaches',
    keys: ['unauthorized', 'phishing', 'ransomware', 'insider'],
    colors: ['#0EA5E9', '#38BDF8', '#7DD3FC', '#BAE6FD'],
    labels: ['Unauthorized', 'Phishing', 'Ransomware', 'Insider']
  }
};

export default function IncidentTrendChart({ data = [], category = 'safety', height = 260 }) {
  const config = categoryConfig[category] || categoryConfig.safety;

  if (!data?.length) {
    return (
      <div className="flex items-center justify-center h-[260px] text-sm text-stone-400">
        No incident data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
        <XAxis dataKey="period" stroke="#A8A29E" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis stroke="#A8A29E" fontSize={11} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{
            borderRadius: 12,
            border: '1px solid #E7E5E4',
            boxShadow: '0 8px 20px rgba(0,0,0,0.08)',
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
        {config.keys.map((key, idx) => (
          <Line 
            key={key}
            type="monotone" 
            dataKey={key} 
            name={config.labels[idx]}
            stroke={config.colors[idx]} 
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
