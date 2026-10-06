import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { fetchBrightDataReddit, setBrightDataToken, disconnectBrightData, getBrightDataSettings, normalizeBrightDataPost } from '../src/services/brightData.js';
import { getDurableData } from '../src/services/storage.js';
import { fetchSection } from '../src/services/feeds.js';
import { createDefaultFilters } from '../src/workbenches.js';
const STATE = 'scout-lab:bright-data-state';
const record = (id='abc', subreddit='OpenAI') => ({url:`https://www.reddit.com/r/${subreddit}/comments/${id}/release/`,title:'Community release',num_upvotes:100,num_comments:20,date_posted:new Date(Date.now()-3600000).toISOString(),description:'Details',user_posted:'user'});
const response = (value, status=200) => new Response(JSON.stringify(value), {status});
const mock = () => vi.fn(async (url) => {
  if (String(url).includes('/trigger?')) return response({snapshot_id:'sd_test'});
  if (String(url).includes('/progress/')) return response({status:'ready'});
  if (String(url).includes('/snapshot/')) return response([record(), record()]);
  throw new Error('unexpected request');
});
beforeEach(() => {localStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-06T00:00:00Z'));});
afterEach(() => {vi.useRealTimers(); vi.unstubAllGlobals();});
describe('Bright Data Reddit', () => {
  it('keeps the token out of durable backups and stops requests when disconnected', async () => {
    setBrightDataToken('test-token'); expect(getBrightDataSettings().connected).toBe(true);
    expect(JSON.stringify(getDurableData())).not.toContain('test-token');
    disconnectBrightData();
    await expect(fetchBrightDataReddit(['OpenAI'])).rejects.toThrow('Connect Bright Data');
  });
  it('starts one bounded job for simultaneous callers, resumes, deduplicates and reuses daily records', async () => {
    setBrightDataToken('test-token'); const fetcher=mock(); vi.stubGlobal('fetch',fetcher);
    await Promise.all([fetchBrightDataReddit(['OpenAI']),fetchBrightDataReddit(['OpenAI'])]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0];
    expect(String(url)).toContain('discover_by=subreddit_url');
    expect(JSON.parse(options.body)).toEqual({input:[{url:'https://www.reddit.com/r/OpenAI/',sort_by:'Hot'}],limit_per_input:20});
    expect(options.headers.Authorization).toBe('Bearer test-token');
    vi.advanceTimersByTime(15001);
    expect((await fetchBrightDataReddit(['OpenAI'])).cards.map((card)=>card.id)).toEqual(['reddit:abc']);
    await fetchBrightDataReddit(['OpenAI']); expect(fetcher).toHaveBeenCalledTimes(3);
    expect((await fetchBrightDataReddit(['LocalLLaMA'])).cards).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(86400000);
    await fetchBrightDataReddit(['OpenAI']); expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it('allocates only 140 records across 20 communities and respects the monthly reservation cap', async () => {
    setBrightDataToken('test-token'); const fetcher=mock(); vi.stubGlobal('fetch',fetcher);
    await fetchBrightDataReddit(Array.from({length:20},(_,i)=>`community${i}`));
    expect(JSON.parse(fetcher.mock.calls[0][1].body).limit_per_input).toBe(7);
    expect(getBrightDataSettings().reserved).toBe(140);
    localStorage.setItem(STATE,JSON.stringify({month:'2026-10',reserved:4500,records:[record()]}));
    expect((await fetchBrightDataReddit(['OpenAI'])).message).toContain('allowance');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('reserves before an ambiguous trigger failure and never retries a charged job on Refresh', async () => {
    setBrightDataToken('test-token'); const fetcher=vi.fn().mockRejectedValue(new Error('offline')); vi.stubGlobal('fetch',fetcher);
    await expect(fetchBrightDataReddit(['OpenAI'])).rejects.toThrow();
    expect(getBrightDataSettings().reserved).toBe(20);
    expect((await fetchBrightDataReddit(['OpenAI'])).unavailable).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('reports token rejection without recording a charged job or leaking the token', async () => {
    setBrightDataToken('test-token'); vi.stubGlobal('fetch',vi.fn(async()=>response({},401)));
    await expect(fetchBrightDataReddit(['OpenAI'])).rejects.toThrow('rejected');
    expect(getBrightDataSettings().reserved).toBe(0);
    expect(localStorage.getItem(STATE)).not.toContain('test-token');
  });
  it('resumes a running job across calls and preserves cached results on job failure', async () => {
    setBrightDataToken('test-token');
    localStorage.setItem(STATE,JSON.stringify({month:'2026-10',reserved:20,lastAttemptAt:Date.now(),records:[record()],job:{snapshotId:'sd_test',maxRecords:20,communities:['OpenAI'],lastPollAt:0}}));
    const fetcher=vi.fn(async()=>response({status:'running'})); vi.stubGlobal('fetch',fetcher);
    expect((await fetchBrightDataReddit(['OpenAI'])).pending).toBe(true);
    vi.advanceTimersByTime(15001); fetcher.mockImplementation(async()=>response({status:'failed'}));
    const result=await fetchBrightDataReddit(['OpenAI']);
    expect(result.cards).toHaveLength(1); expect(result.unavailable).toBe(true); expect(getBrightDataSettings().pending).toBe(false);
  });
  it('normalizes real provider fields and rejects unsafe URLs or dates', () => {
    expect(normalizeBrightDataPost(record())).toMatchObject({id:'reddit:abc',source:'reddit',details:{points:100,comments:20,subreddit:'OpenAI'}});
    expect(normalizeBrightDataPost({...record(),url:'https://evil.com/r/OpenAI/comments/abc/'})).toBeNull();
    expect(normalizeBrightDataPost({...record(),date_posted:'bad'})).toBeNull();
  });
  it('merges cached Reddit with HN, applies filters, and force Refresh does not start another job', async () => {
    setBrightDataToken('test-token');localStorage.setItem(STATE,JSON.stringify({month:'2026-10',reserved:20,lastAttemptAt:Date.now(),communities:['OpenAI'],records:[record()]}));
    const fetcher=vi.fn(async()=>response({hits:[{objectID:'hn',title:'AI tools',points:40,num_comments:5,created_at:new Date(Date.now()-3600000).toISOString()}],nbPages:1}));vi.stubGlobal('fetch',fetcher);
    const filters=createDefaultFilters().posts;
    expect((await fetchSection('posts',filters,{redditCommunities:['OpenAI']})).cards.map(c=>c.id)).toEqual(['reddit:abc','hn:hn']);
    expect((await fetchSection('posts',{...filters,minComments:'20'},{redditCommunities:['OpenAI'],force:true})).cards.map(c=>c.id)).toEqual(['reddit:abc']);
    expect(fetcher.mock.calls.every(([url])=>String(url).includes('hn.algolia'))).toBe(true);
  });
});
