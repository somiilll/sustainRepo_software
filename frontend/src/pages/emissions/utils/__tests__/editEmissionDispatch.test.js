/* global afterEach, describe, expect, it, jest */
import axios from 'axios';
import { editEmissionDispatch } from '../editEmissionDispatch';

jest.mock('axios', () => ({ get: jest.fn() }));

const createDeferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const createContext = () => {
  let draft = null;
  const activeEditIdRef = { current: null };
  const setEditDraft = jest.fn((nextDraftOrUpdater) => {
    draft = typeof nextDraftOrUpdater === 'function'
      ? nextDraftOrUpdater(draft)
      : nextDraftOrUpdater;
  });

  return {
    context: {
      scope3EFData: [],
      fugitiveEmissionsData: [],
      fuelDatabase: [],
      activeEditIdRef,
      setEditDraft,
      setEditingEmissionId: jest.fn(),
      setEmissionAuditLog: jest.fn(),
      setIsEditLoading: jest.fn(),
      setDialogOpen: jest.fn(),
      setIsFormDirty: jest.fn(),
      setEditingEmission: jest.fn(),
    },
    getDraft: () => draft,
  };
};

describe('editEmissionDispatch', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('does not merge delayed evidence filenames into a newer edit draft', async () => {
    const delayedFileInfo = createDeferred();
    axios.get.mockReturnValueOnce(delayedFileInfo.promise);
    const { context, getDraft } = createContext();

    const openingA = editEmissionDispatch({
      id: 'record-a',
      scope: 'scope1',
      category: 'Stationary Combustion',
      evidence_url: '/api/files/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    }, context);

    await editEmissionDispatch({
      id: 'record-b',
      facility_id: 'facility-b',
      scope: 'scope2',
      category: 'Purchased Electricity',
      evidence_url: '',
    }, context);

    delayedFileInfo.resolve({ data: { filename: 'record-a-evidence.pdf' } });
    await openingA;

    expect(getDraft().values.facility_id).toBe('facility-b');
    expect(getDraft().existingEvidences).toEqual([]);
    expect(context.setEditingEmissionId).toHaveBeenLastCalledWith('record-b');
  });
});