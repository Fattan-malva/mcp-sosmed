import { URL } from 'node:url';
import { getRequestHeaders, ValidationError } from './cookies.js';

export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function meta(html, property) {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`, 'i'))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${property}["']`, 'i'));
  return m?.[1]?.replace(/&amp;/g, '&').replace(/&quot;/g, '"') || null;
}

function titleTag(html) {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() || null;
}

export function text(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function attr(html, name) {
  const m = html.match(new RegExp(`${name}="([^"]*)"`, 'i'));
  return m ? m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"') : null;
}

export function parseJobs(html) {
  return [...html.matchAll(/<li>[\s\S]*?<\/li>/gi)].map(({ 0: card }) => {
    const id = card.match(/jobPosting:(\d+)/)?.[1];
    if (!id) return null;
    return {
      id,
      title: text(card.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1] || ''),
      company: text(card.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i)?.[1] || ''),
      location: text(card.match(/job-search-card__location[^>]*>([\s\S]*?)<\/span>/i)?.[1] || ''),
      postedAt: attr(card.match(/<time[\s\S]*?<\/time>/i)?.[0] || '', 'datetime'),
      url: (attr(card.match(/<a[^>]+base-card__full-link[^>]*>/i)?.[0] || '', 'href') || '').replace(/&amp;/g, '&')
    };
  }).filter(Boolean);
}

export async function jobs(query = {}) {
  const p = new URLSearchParams({ keywords: query.keywords || '', location: query.location || '', start: String(query.start || 0) });
  const response = await fetch(`https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${p}`, { headers: { 'user-agent': UA } });
  if (!response.ok) throw new Error(`LinkedIn returned ${response.status}`);
  return parseJobs(await response.text());
}

const PLATFORM_HOSTS = {
  instagram: { label: 'Instagram', hosts: ['instagram.com'] },
  linkedin: { label: 'LinkedIn', hosts: ['linkedin.com'] },
};

function hostAllowed(hostname, hosts) {
  return hosts.some((h) => hostname === h || hostname.endsWith(`.${h}`));
}

/**
 * GET satu halaman publik/terautentikasi dari platform, lalu ambil metadata.
 * Jika cookie platform sudah disimpan, request dikirim dengan cookie tersebut.
 */
export async function getPage(platform, input) {
  const { label, hosts } = PLATFORM_HOSTS[platform];
  let target;
  try { target = new URL(String(input ?? '')); } catch { throw new ValidationError(`URL ${label} tidak valid`); }
  if (!['http:', 'https:'].includes(target.protocol)) throw new ValidationError('Protokol URL harus http atau https');
  if (!hostAllowed(target.hostname, hosts)) throw new ValidationError(`Hanya URL ${hosts[0]} yang diizinkan`);

  const auth = await getRequestHeaders(platform);
  const response = await fetch(target, {
    headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml', ...(auth ?? {}) },
    redirect: 'follow',
  });
  if (!hostAllowed(new URL(response.url).hostname, hosts)) throw new Error('Redirect ke host yang tidak diizinkan');
  if (!response.ok) throw new Error(`${label} returned ${response.status}`);

  const html = await response.text();
  return {
    url: response.url,
    authenticated: Boolean(auth),
    title: meta(html, 'og:title') || titleTag(html),
    description: meta(html, 'og:description') || meta(html, 'description'),
    image: meta(html, 'og:image'),
    type: meta(html, 'og:type'),
  };
}

export const instagram = (input) => getPage('instagram', input);
export const linkedin = (input) => getPage('linkedin', input);
