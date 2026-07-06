/**
 * Category Status Badge Component
 */

import React from 'react';
import { Badge } from '../ui/badge';
import { CATEGORY_STATUS_CONFIG, CATEGORY_STATUS } from './constants';

export default function CategoryStatusBadge({ status }) {
  const config = CATEGORY_STATUS_CONFIG[status] || CATEGORY_STATUS_CONFIG[CATEGORY_STATUS.UNASSIGNED];
  return <Badge className={config.class}>{config.label}</Badge>;
}
