export const calculateFileSha256 = async (file) => {
  if (!globalThis.crypto?.subtle || !file?.arrayBuffer) return null;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
};