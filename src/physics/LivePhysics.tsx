// Fork addition (see FORK.md): the Live page's physics section. It keeps the adjustments in the
// page settings (so the OBS URL carries them), saves them per project, applies them to the
// preview avatar and relays them to open stream views.
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { MeshAvatar } from '../engine';
import { PhysicsControls, physicsText } from './PhysicsControls';
import { savePhysics, sendPhysics, type PhysicsTuning } from './settings';

type Props = {
  project: string; value: PhysicsTuning; onChange: (value: PhysicsTuning) => void;
  avatar: MutableRefObject<MeshAvatar | null>; ready: boolean; language: keyof typeof physicsText;
};

export function LivePhysics({ project, value, onChange, avatar, ready, language }: Props) {
  const [groups, setGroups] = useState<string[]>([]);
  const latest = useRef(value); latest.current = value;
  useEffect(() => {
    if (!ready || !avatar.current) return;
    setGroups(avatar.current.getPhysicsGroups());
    avatar.current.setPhysicsTuning(latest.current);
  }, [ready, avatar]);
  useEffect(() => {
    savePhysics(project, value);
    avatar.current?.setPhysicsTuning(value);
  }, [project, value, avatar]);
  useEffect(() => {
    // throttled like the lighting relay; the last value is always delivered
    let sent: PhysicsTuning | undefined;
    const timer = setInterval(() => { if (sent !== latest.current) { sent = latest.current; sendPhysics(project, sent); } }, 34);
    return () => clearInterval(timer);
  }, [project]);
  const t = physicsText[language];
  return <details className="live-lighting live-physics" data-testid="physics-section">
    <summary><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M12 3v7" /><circle cx="12" cy="15" r="4" /><path d="M6 21c1.5-1 3.5-1.5 6-1.5s4.5.5 6 1.5" /></svg>{t.title}</summary>
    <PhysicsControls value={value} onChange={onChange} groups={groups} language={language} />
  </details>;
}
