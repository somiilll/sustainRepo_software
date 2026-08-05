import React from 'react';
import { Lock } from 'lucide-react';

/**
 * LockedModuleOverlay - Shows a blurred preview with lock message
 * Used for supplier users to show modules they don't have access to
 */
export default function LockedModuleOverlay({ 
  children, 
  message = "Subscribe to unlock this module",
  showPreview = true 
}) {
  return (
    <div className="relative min-h-[400px]">
      {/* Blurred background content for sneak peek */}
      {showPreview && (
        <div className="absolute inset-0 overflow-hidden">
          <div className="filter blur-sm opacity-40 pointer-events-none select-none">
            {children}
          </div>
        </div>
      )}
      
      {/* Overlay with lock message */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/80 via-white/60 to-white/80 backdrop-blur-[2px] flex items-center justify-center z-10">
        <div className="text-center p-8 max-w-md">
          <div className="w-16 h-16 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-stone-400" />
          </div>
          <h3 className="text-lg font-semibold text-stone-700 mb-2">
            Module Locked
          </h3>
          <p className="text-stone-500 text-sm">
            {message}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * NoAssignmentMessage - Shows when user has no tasks assigned in a section
 * Used for regular users (not admin) accessing unassigned sections
 */
export function NoAssignmentMessage({ section }) {
  return (
    <div className="text-center py-16 px-4">
      <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
        <svg 
          className="w-7 h-7 text-amber-500" 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" 
          />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-stone-700 mb-2">
        No Tasks Assigned
      </h3>
      <p className="text-stone-500 text-sm max-w-sm mx-auto">
        You don't have any tasks assigned in this section. 
        Please contact your administrator if you need access.
      </p>
    </div>
  );
}
