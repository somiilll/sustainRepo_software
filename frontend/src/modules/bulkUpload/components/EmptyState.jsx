/**
 * EmptyState — placeholder when no validation result is loaded.
 */
import React from 'react';
import { Card } from '../../../components/ui/card';
import { FileSpreadsheet } from 'lucide-react';

export default function EmptyState() {
  return (
    <Card className="p-12 text-center" data-testid="bulk-upload-empty-state">
      <FileSpreadsheet className="w-16 h-16 text-stone-300 mx-auto mb-4" />
      <h3 className="text-lg font-semibold text-text-primary mb-2">No file uploaded yet</h3>
      <p className="text-text-muted max-w-md mx-auto">
        Download the template, fill it with your emissions data, and upload it for validation.
        After validation, you can choose to save valid rows, download error report, or upload a new file.
      </p>
    </Card>
  );
}
