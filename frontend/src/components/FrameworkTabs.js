import React from 'react';

/**
 * ESG Module Container
 * 
 * Simple wrapper that renders the metrics content for ESG sections.
 * 
 * @param {string} moduleType - 'environment' | 'social' | 'governance'
 * @param {React.ReactNode} metricsContent - Content for Metrics
 */
export default function FrameworkTabs({ 
  moduleType, 
  metricsContent,
  recordsContent, // Keep for backward compatibility
}) {
  return (
    <div className="w-full">
      {metricsContent || recordsContent}
    </div>
  );
}
