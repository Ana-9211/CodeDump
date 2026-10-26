'use client';
// Browser-side helpers: fetch wrapper, formatting, and a tiny data-loading hook.
import { useCallback, useEffect, useState } from 'react';

export async function call(method, url, body) {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error || 'Something went wrong. Please try again.');
    err.status = res.status;
    throw err;
  }
  return data;
}
export const get = (url) => call('GET', url);
export const post = (url, body = {}) => call('POST', url, body);
export const put = (url, body) => call('PUT', url, body);
export const patch = (url, body = {}) => call('PATCH', url, body);
export const del = (url) => call('DELETE', url);

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
export const money = (cents) => inr.format((cents ?? 0) / 100);
export const dateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '-');
export const dateOnly = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '-');

/** Loads `url` (or skips when url is null) and exposes { data, error, loading, reload }. */
export function useFetch(url) {
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(url) });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!url) { setState({ data: null, error: null, loading: false }); return undefined; }
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    get(url)
      .then((data) => live && setState({ data, error: null, loading: false }))
      .catch((error) => live && setState({ data: null, error, loading: false }));
    return () => { live = false; };
  }, [url, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
