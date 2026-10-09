// Fork addition (see FORK.md): choose the project on the Live page itself (the desktop app has
// no editor), and reopen the last one when Live is opened without ?project=.
import { useEffect, useState } from 'react';
import { localProjects } from '../editor/project';

const LAST_KEY = 'mesh-avatar:live-project';
const label = { es: 'Proyecto', en: 'Project', ja: 'プロジェクト', zh: '项目' };

/** Called before the page renders: without ?project=, go back to the last project used. */
export function reopenLastProject() {
  const query = new URLSearchParams(location.search);
  if (query.has('project')) { try { localStorage.setItem(LAST_KEY, query.get('project')!); } catch { /* optional */ } return false; }
  let last: string | null = null;
  try { last = localStorage.getItem(LAST_KEY); } catch { /* optional */ }
  if (!last || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(last)) return false;
  query.set('project', last); location.replace(`${location.pathname}?${query}`);
  return true;
}

export function LiveProjectPicker({ current, language }: { current: string; language: keyof typeof label }) {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    void localProjects().then(list => { if (live && list) setNames(list.filter(entry => !entry.error).map(entry => entry.name)); });
    return () => { live = false; };
  }, []);
  if (names.length < 2) return null;
  return <select className="live-project" aria-label={label[language]} title={label[language]} value={current}
    onChange={event => { const query = new URLSearchParams(location.search); query.set('project', event.target.value); location.search = query.toString(); }}>
    {!names.includes(current) && <option value={current}>{current}</option>}
    {names.map(name => <option key={name} value={name}>{name}</option>)}
  </select>;
}
