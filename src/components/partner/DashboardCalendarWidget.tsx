import React, { useState, useEffect, useMemo, type FormEvent } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css'; 
import './DashboardCalendarWidget.css'; 

import { 
  getFirestore, collectionGroup, collection, query, where, onSnapshot,
  doc, getDoc, setDoc, addDoc, serverTimestamp, orderBy 
} from 'firebase/firestore';

// --- [Icons] ---
const Icons = {
  Meeting: () => <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>,
  Construction: () => <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>,
  Personal: () => <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>,
  Add: () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  ArrowDown: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
};

// Types & Helpers
type ScheduleItem = {
  id: string; time: string; title: string; siteId?: string;
  type: 'meeting' | 'construction' | 'personal'; isPublic?: boolean;
  dateKey: string; fullTitle?: string; siteName?: string;
};

interface DashboardCalendarWidgetProps {
  partnerUid: string;
  onSiteSelect: (siteId: string) => void; 
}

const getISODateString = (date: Date): string => {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().split('T')[0];
};

const getWeekRange = (date: Date) => {
  const d = new Date(date);
  const day = d.getDay(); const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = new Date(d); start.setDate(d.getDate() + diffToMonday);
  const end = new Date(start); end.setDate(start.getDate() + 6);
  return { start, end };
};

const DashboardCalendarWidget: React.FC<DashboardCalendarWidgetProps> = ({ partnerUid, onSiteSelect }) => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [filterType, setFilterType] = useState<'today' | 'week' | 'month'>('today');
  const [allSchedules, setAllSchedules] = useState<ScheduleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [filterPrefs, setFilterPrefs] = useState({ showMeetings: true, showConstruction: true, showPersonal: true });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [siteNamesCache, setSiteNamesCache] = useState<Map<string, string>>(new Map()); 
  
  // [NEW] 더 보기 상태 관리
  const [visibleCount, setVisibleCount] = useState(5);
  
  const db = getFirestore();

  useEffect(() => {
    if (!partnerUid) return;
    setIsLoading(true);

    let meetings: ScheduleItem[] = [], constructionLogs: ScheduleItem[] = [], constructionSchedules: ScheduleItem[] = [], personals: ScheduleItem[] = [];

    const updateAll = () => {
      setAllSchedules([...meetings, ...constructionLogs, ...constructionSchedules, ...personals]);
      setIsLoading(false);
    };

    const fetchSiteNameIfNeeded = async (siteId: string) => {
        if (!siteId || siteNamesCache.has(siteId)) return;
        try {
            const snap = await getDoc(doc(db, 'users', partnerUid, 'sites', siteId));
            if (snap.exists()) setSiteNamesCache(prev => new Map(prev).set(siteId, snap.data().siteName));
        } catch(e) {}
    };

    // (Data Fetching 로직은 기존과 동일하므로 생략 없이 유지)
    const unsubMemos = onSnapshot(query(collectionGroup(db, 'memos'), where('partnerUid', '==', partnerUid), where('memoType', '==', 'meeting')), (snap) => {
      meetings = snap.docs.map(d => {
        const data = d.data();
        if(data.siteId) fetchSiteNameIfNeeded(data.siteId);
        return { id: d.id, time: data.meetingTime, title: `미팅: ${data.memoContent}`, siteId: data.siteId, type: 'meeting', dateKey: data.meetingDate, siteName: data.siteName };
      });
      updateAll();
    });

    const unsubWork = onSnapshot(query(collectionGroup(db, 'workLogs'), where('partnerUid', '==', partnerUid), where('tomorrowProcess', '!=', '')), (snap) => {
      constructionLogs = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data.date) {
          const nextDay = new Date(data.date); nextDay.setDate(nextDay.getDate() + 1);
          if(data.siteId) fetchSiteNameIfNeeded(data.siteId);
          constructionLogs.push({ id: d.id, time: '09:00', title: data.tomorrowProcess, siteId: data.siteId, type: 'construction', dateKey: getISODateString(nextDay), siteName: data.siteName });
        }
      });
      updateAll();
    });

    const unsubSchedules = onSnapshot(query(collectionGroup(db, 'schedules')), (snap) => {
        constructionSchedules = [];
        snap.forEach(d => {
          const pathSegments = d.ref.path.split('/');
          if (pathSegments.length > 1 && pathSegments[1] === partnerUid) { 
            const data = d.data();
            const siteId = pathSegments[3]; 
            fetchSiteNameIfNeeded(siteId);
            constructionSchedules.push({ id: d.id, time: '10:00', title: data.processes.join(', '), siteId, type: 'construction', dateKey: data.date, siteName: siteNamesCache.get(siteId) });
          }
        });
        updateAll();
    });

    const unsubPersonal = onSnapshot(query(collection(db, 'users', partnerUid, 'personalSchedules'), orderBy('time', 'asc')), (snap) => {
      personals = snap.docs.map(d => {
        const data = d.data();
        return { id: d.id, time: data.time, title: data.title, type: 'personal', isPublic: data.isPublic, dateKey: data.date };
      });
      updateAll();
    });
    
    return () => { unsubMemos(); unsubWork(); unsubSchedules(); unsubPersonal(); };
  }, [partnerUid, siteNamesCache]);

  // 필터링된 전체 리스트
  const filteredSchedulesList = useMemo(() => {
    return allSchedules.filter(s => 
      (s.type === 'personal' && filterPrefs.showPersonal) || 
      (s.type === 'meeting' && filterPrefs.showMeetings) || 
      (s.type === 'construction' && filterPrefs.showConstruction)
    );
  }, [allSchedules, filterPrefs]);

  // 날짜별 맵핑
  const schedulesByDateMap = useMemo(() => {
    const map = new Map<string, ScheduleItem[]>();
    filteredSchedulesList.forEach(s => {
      if (!s.dateKey) return;
      if (!map.has(s.dateKey)) map.set(s.dateKey, []);
      map.get(s.dateKey)!.push(s);
    });
    return map;
  }, [filteredSchedulesList]);

  // 화면에 표시할 전체 리스트 (필터링 적용됨)
  const displayedSchedules = useMemo(() => {
    const selectedDateKey = getISODateString(selectedDate);
    if (filterType === 'today') return (schedulesByDateMap.get(selectedDateKey) || []).sort((a, b) => a.time.localeCompare(b.time));
    if (filterType === 'week') {
      const { start, end } = getWeekRange(selectedDate);
      return filteredSchedulesList.filter(s => {
          const itemDate = new Date(s.dateKey);
          return itemDate >= start && itemDate <= end;
      }).sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.time.localeCompare(b.time));
    }
    if (filterType === 'month') {
      const yearMonth = selectedDateKey.substring(0, 7);
      return filteredSchedulesList.filter(s => s.dateKey.startsWith(yearMonth)).sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.time.localeCompare(b.time));
    }
    return [];
  }, [filterType, filteredSchedulesList, selectedDate, schedulesByDateMap]);

  // [NEW] 날짜나 필터가 바뀌면 더보기 초기화
  useEffect(() => {
    setVisibleCount(5);
  }, [selectedDate, filterType, filterPrefs]);

  const tileContent = ({ date, view }: { date: Date, view: string }) => {
    if (view !== 'month') return null;
    const dateKey = getISODateString(date);
    const dailySchedules = schedulesByDateMap.get(dateKey) || [];
    if (dailySchedules.length === 0) return null;

    return (
      <div className="cal-events-box">
        {dailySchedules.slice(0, 3).map((item, idx) => (
          <div key={idx} className={`cal-event-bar ${item.type}`} title={item.title}>
            {item.title}
          </div>
        ))}
        {dailySchedules.length > 3 && (
          <div className="cal-more-count">+{dailySchedules.length - 3}</div>
        )}
      </div>
    );
  };

  const handleDateChange = (value: any) => setSelectedDate(value as Date);
  const toggleFilter = (key: 'showMeetings' | 'showConstruction' | 'showPersonal') => setFilterPrefs(prev => ({ ...prev, [key]: !prev[key] }));

  // --- View Tabs ---
  const ViewTabs = ({ className }: { className?: string }) => (
    <div className={`dc-view-tabs ${className || ''}`}>
        <button className={filterType==='today'?'active':''} onClick={()=>setFilterType('today')}>오늘</button>
        <button className={filterType==='week'?'active':''} onClick={()=>setFilterType('week')}>이번 주</button>
        <button className={filterType==='month'?'active':''} onClick={()=>setFilterType('month')}>이번 달</button>
    </div>
  );

  return (
    <div className="dc-widget">
      
      {/* 1. Header */}
      <div className="dc-header">
        <div className="dc-title-area">
            <h3>일정 캘린더</h3>
            <div className="dc-filter-group">
                <button className={`dc-filter-chip meeting ${filterPrefs.showMeetings?'active':''}`} onClick={()=>toggleFilter('showMeetings')}>
                    <span className="dot meeting" /> 미팅
                </button>
                <button className={`dc-filter-chip construction ${filterPrefs.showConstruction?'active':''}`} onClick={()=>toggleFilter('showConstruction')}>
                    <span className="dot construction" /> 공사
                </button>
                <button className={`dc-filter-chip personal ${filterPrefs.showPersonal?'active':''}`} onClick={()=>toggleFilter('showPersonal')}>
                    <span className="dot personal" /> 개인
                </button>
            </div>
        </div>
        <button className="dc-add-btn" onClick={() => setIsModalOpen(true)}>
            <Icons.Add /> <span>일정 추가</span>
        </button>
      </div>

      {/* 2. Body */}
      <div className="dc-body">
        
        {/* A. Calendar (PC Only) */}
        <div className="dc-calendar-container">
            <Calendar
                onChange={handleDateChange}
                value={selectedDate}
                locale="ko-KR"
                formatDay={(locale, date) => date.getDate().toString()}
                tileContent={tileContent}
                next2Label={null} prev2Label={null}
                className="dc-react-calendar"
            />
        </div>

        {/* B. Toolbar (Sticky in Mobile via CSS) */}
        <div className="dc-toolbar">
            <div className="dc-view-tabs">
                <button className={filterType==='today'?'active':''} onClick={()=>setFilterType('today')}>오늘</button>
                <button className={filterType==='week'?'active':''} onClick={()=>setFilterType('week')}>이번 주</button>
                <button className={filterType==='month'?'active':''} onClick={()=>setFilterType('month')}>이번 달</button>
            </div>
            <span className="dc-current-date">
                {selectedDate.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
            </span>
        </div>

        {/* C. List Area */}
        <div className="dc-list-container">
            {isLoading ? (
                <div className="dc-state"><div className="spinner"></div></div>
            ) : displayedSchedules.length === 0 ? (
                <div className="dc-state empty">일정이 없습니다.</div>
            ) : (
                <div className="dc-list-items">
                    {/* [NEW] 보여줄 개수만큼 slice */}
                    {displayedSchedules.slice(0, visibleCount).map((item) => {
                        const d = new Date(item.dateKey);
                        const dateStr = `${d.getMonth()+1}.${d.getDate()}`;
                        const displaySiteName = item.siteName || (item.siteId ? '현장' : null);
                        
                        return (
                            <div key={item.id} className="dc-card-item" onClick={() => item.siteId && onSiteSelect(item.siteId)}>
                                {/* Left: Date & Time */}
                                <div className="dc-card-left">
                                    <span className="date">{dateStr}</span>
                                    <span className="time">{item.time}</span>
                                </div>

                                {/* Right: Content */}
                                <div className="dc-card-right">
                                    <div className="dc-meta-row">
                                        <span className={`dc-type-badge ${item.type}`}>
                                            {item.type === 'meeting' && <Icons.Meeting />}
                                            {item.type === 'construction' && <Icons.Construction />}
                                            {item.type === 'personal' && <Icons.Personal />}
                                            <span className="type-text">
                                                {item.type==='meeting'?'미팅':item.type==='construction'?'공사':'개인'}
                                            </span>
                                        </span>
                                        {displaySiteName && (
                                            <span className="dc-site-name">@{displaySiteName}</span>
                                        )}
                                    </div>
                                    <p className="dc-content-text">{item.title}</p>
                                </div>
                            </div>
                        )
                    })}

                    {/* [NEW] 더 보기 버튼 */}
                    {displayedSchedules.length > visibleCount && (
                        <button className="dc-load-more-btn" onClick={() => setVisibleCount(prev => prev + 5)}>
                            <Icons.ArrowDown /> 일정 더 보기 ({displayedSchedules.length - visibleCount})
                        </button>
                    )}
                </div>
            )}
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && <PersonalScheduleModal partnerUid={partnerUid} onClose={() => setIsModalOpen(false)} />}
    </div>
  );
};

const PersonalScheduleModal: React.FC<{ partnerUid: string, onClose: () => void }> = ({ partnerUid, onClose }) => {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(getISODateString(new Date()));
  const [time, setTime] = useState('09:00');
  const [isPublic, setIsPublic] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const db = getFirestore();

  const save = async (e: FormEvent) => {
    e.preventDefault(); setSubmitting(true);
    try {
      await addDoc(collection(db, 'users', partnerUid, 'personalSchedules'), { title, date, time, isPublic, partnerUid, createdAt: serverTimestamp() });
      onClose();
    } catch(e) { console.error(e); } finally { setSubmitting(false); }
  };

  return (
    <div className="dc-modal-overlay" onClick={onClose}>
      <div className="dc-modal" onClick={e => e.stopPropagation()}>
        <h3>새 일정 등록</h3>
        <form onSubmit={save}>
            <div className="dc-form-row">
                <label>날짜</label><input type="date" value={date} onChange={e=>setDate(e.target.value)} required />
            </div>
            <div className="dc-form-row">
                <label>시간</label><input type="time" value={time} onChange={e=>setTime(e.target.value)} required />
            </div>
            <div className="dc-form-row">
                <label>내용</label><input type="text" value={title} onChange={e=>setTitle(e.target.value)} placeholder="일정 내용을 입력하세요" required />
            </div>
            <div className="dc-form-check">
                <input type="checkbox" id="publicCheck" checked={isPublic} onChange={e=>setIsPublic(e.target.checked)} />
                <label htmlFor="publicCheck">직원들과 공유하기</label>
            </div>
            <div className="dc-modal-actions">
                <button type="button" className="btn-cancel" onClick={onClose}>취소</button>
                <button type="submit" className="btn-submit" disabled={submitting}>등록</button>
            </div>
        </form>
      </div>
    </div>
  );
};

export default DashboardCalendarWidget;