import React, { useEffect, useState } from 'react';
import { getSecureFileUrl, getUploadedFileId } from '../lib/secureFileAccess';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const directSource = (source) => {
  if (!source) return null;
  if (/^(https?:|data:|blob:)/i.test(source)) return source;
  return `${BACKEND_URL}${source.startsWith('/') ? '' : '/'}${source}`;
};

export const SecureFileImage = ({ source, alt, className, fallback = null, testId }) => {
  const [imageUrl, setImageUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const fileId = getUploadedFileId(source);
    setImageUrl(null);
    setFailed(false);
    if (!source) return () => { active = false; };

    if (!fileId) {
      setImageUrl(directSource(source));
      return () => { active = false; };
    }

    getSecureFileUrl(fileId, 'view')
      .then((url) => { if (active) setImageUrl(url); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [source]);

  if (!imageUrl || failed) return fallback;
  return <img src={imageUrl} alt={alt} className={className} onError={() => setFailed(true)} data-testid={testId} />;
};