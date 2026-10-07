import apiClient from './apiClient.js';

/** POST a drawing payload to the API; resolves the zip as a Blob (SPEC-40). */
export async function requestRoomDrawings(payload) {
  const { data } = await apiClient.post('/api/drawings/preview', payload, {
    responseType: 'blob',
  });
  return data;
}

/** Read the API's JSON error from a Blob, or describe a connection failure. */
export async function drawingErrorMessage(error) {
  if (!error.response) {
    return `Could not reach the API at ${apiClient.defaults.baseURL}`;
  }

  try {
    const data = error.response.data;
    const body = data instanceof Blob ? JSON.parse(await data.text()) : data;
    if (typeof body?.error === 'string' && body.error) return body.error;
  } catch {
    // A non-JSON response still gets a readable fallback below.
  }

  return error.message || `Request failed (${error.response.status})`;
}

/** Save a Blob as a download via a temporary object URL and <a download>. */
export function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
