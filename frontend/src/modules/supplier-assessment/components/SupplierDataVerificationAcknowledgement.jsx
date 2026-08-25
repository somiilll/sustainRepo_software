import React from 'react';
import { Checkbox } from '../../../components/ui/checkbox';
import { Label } from '../../../components/ui/label';

export const DATA_VERIFICATION_STATEMENT = 'I confirm that the information provided has been reviewed and verified for accuracy and completeness.';

export const SupplierDataVerificationAcknowledgement = ({
  checked,
  onCheckedChange,
  testIdPrefix,
}) => {
  const checkboxId = `${testIdPrefix}-checkbox`;

  return (
    <div
      className="flex items-start gap-3 border-y border-stone-200 bg-stone-50 px-3 py-4"
      data-testid={`${testIdPrefix}-acknowledgement`}
    >
      <Checkbox
        id={checkboxId}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        aria-required="true"
        data-testid={checkboxId}
      />
      <Label
        htmlFor={checkboxId}
        className="cursor-pointer text-sm font-medium leading-5 text-stone-800"
        data-testid={`${testIdPrefix}-statement`}
      >
        {DATA_VERIFICATION_STATEMENT}
      </Label>
    </div>
  );
};