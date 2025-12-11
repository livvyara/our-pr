import React, { useState, useEffect, useRef } from 'react';
import { getFirestore, collection, query, orderBy, onSnapshot, getDoc, doc } from 'firebase/firestore';
import './CustomerConstructionScheduleModal.css';

// --- [High-End Icons] ---
const Icons = {
  Close: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>,
  Alert: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  Check: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
};

interface ScheduleEntry { id: string; date: string; processes: string[]; isNoisy: boolean; }
interface ModalProps { siteId: string; partnerUid: string; onClose: () => void; }

const getProcessColor = (str: string) => {
  const palettes = [
    { bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8' },
    { bg: '#F0FDF4', border: '#BBF7D0', text: '#15803D' },
    { bg: '#FFF7ED', border: '#FED7AA', text: '#C2410C' },
    { bg: '#FAF5FF', border: '#E9D5FF', text: '#7E22CE' },
    { bg: '#FEF2F2', border: '#FECACA', text: '#B91C1C' }
  ];
  let hash = 0; for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return palettes[Math.abs(hash % palettes.length)];
};

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return {
    month: String(date.getMonth() + 1).padStart(2, '0'),
    day: String(date.getDate()).padStart(2, '0'),
    dayName: days[date.getDay()]
  };
};

const isToday = (dateStr: string) => new Date().toDateString() === new Date(dateStr).toDateString();
const isPast = (dateStr: string) => new Date(dateStr) < new Date(new Date().toDateString());

const CustomerConstructionScheduleModal: React.FC<ModalProps> = ({ siteId, partnerUid, onClose }) => {
  const db = getFirestore();
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [siteName, setSiteName] = useState('공사 현장');
  const [loading, setLoading] = useState(true);
  const [showContent, setShowContent] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!siteId || !partnerUid) return;
    const fetchSiteInfo = async () => {
      try {
        const siteDoc = await getDoc(doc(db, 'users', partnerUid, 'sites', siteId));
        if (siteDoc.exists()) setSiteName(siteDoc.data().siteName || '공사 현장');
      } catch (e) { console.error(e); }
    };
    fetchSiteInfo();

    const q = query(collection(db, 'users', partnerUid, 'sites', siteId, 'schedules'), orderBy('date', 'asc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const list: ScheduleEntry[] = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() } as ScheduleEntry));
      setSchedules(list);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [siteId, partnerUid, db]);

  useEffect(() => {
    if (!loading) {
      if (listRef.current) {
        const todayEl = listRef.current.querySelector('.timeline-item.today');
        if (todayEl) todayEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      setTimeout(() => setShowContent(true), 100);
    }
  }, [loading]);

  return (
    <div className="cs-overlay" onClick={onClose}>
      <div className="cs-container" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="cs-header">
          <div className="cs-title-group">
            <h2 className="cs-site-name">{siteName}</h2>
            <span className="cs-subtitle">전체 공사 일정표</span>
          </div>
          <button className="cs-close-btn" onClick={onClose}><Icons.Close /></button>
        </div>

        {/* Timeline Body */}
        <div className="cs-body" ref={listRef}>
          {loading ? (
            <div className="cs-loading"><div className="spinner"></div></div>
          ) : schedules.length === 0 ? (
            <div className="cs-empty">등록된 일정이 없습니다.</div>
          ) : (
            <div className="cs-timeline">
              {/* Timeline Line (Vertical) */}
              <div className="cs-line"></div>

              {schedules.map((item, idx) => {
                const today = isToday(item.date);
                const past = isPast(item.date);
                const { month, day, dayName } = formatDate(item.date);
                
                return (
                  <div 
                    key={item.id} 
                    className={`timeline-item ${today ? 'today' : ''} ${past ? 'past' : ''} ${showContent ? 'active' : ''}`}
                    style={{ transitionDelay: `${Math.min(idx * 0.05, 0.5)}s` }}
                  >
                    {/* Left: Date */}
                    <div className="time-date">
                        <span className="month">{month}월</span>
                        <span className="day">{day}</span>
                        <span className={`weekday ${dayName === '일' ? 'sun' : dayName === '토' ? 'sat' : ''}`}>{dayName}</span>
                    </div>

                    {/* Center: Marker */}
                    <div className="time-marker">
                        <div className="marker-dot">
                            {past && <Icons.Check />}
                        </div>
                    </div>

                    {/* Right: Content Card */}
                    <div className="time-content">
                        {item.isNoisy && (
                            <div className="noisy-badge">
                                <Icons.Alert /> 소음 주의
                            </div>
                        )}
                        <div className="proc-list">
                            {item.processes.map((proc, pIdx) => {
                                const style = getProcessColor(proc);
                                return (
                                    <span key={pIdx} className="proc-tag" style={{backgroundColor:style.bg, color:style.text, borderColor:style.border}}>
                                        {proc}
                                    </span>
                                )
                            })}
                        </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="cs-footer">
            <p>※ 현장 상황에 따라 일정이 변동될 수 있습니다.</p>
        </div>
      </div>
    </div>
  );
};

export default CustomerConstructionScheduleModal;