import React, { useState, useEffect, useMemo, type FormEvent } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css'; 
import './DashboardCalendarWidget.css'; 

import { 
  getFirestore, collectionGroup, collection, query, where, onSnapshot,
  Timestamp, doc, getDoc, setDoc, addDoc, serverTimestamp, orderBy 
} from 'firebase/firestore';

// --- [ 1. 타입 정의 ] ---
type ScheduleItem = {
  id: string;
  time: string;
  title: string;
  siteId?: string;
  type: 'meeting' | 'construction' | 'personal'; 
  isPublic?: boolean;
  dateKey: string; // 'YYYY-MM-DD'
  fullTitle?: string; 
  siteName?: string;
};

interface MemoEntry {
  memoType: 'meeting' | 'general';
  memoContent: string;
  meetingDate: string;
  meetingTime: string;
  siteName: string; 
  siteId: string;
  partnerUid: string;
  createdAt: Timestamp;
}

interface SiteWorkEntry {
  tomorrowProcess: string;
  date: string;
  siteName: string;
  siteId: string;
  partnerUid: string;
}

interface SiteScheduleEntry {
    date: string;
    processes: string[];
    isNoisy: boolean;
    siteId?: string;
    partnerUid?: string;
}

interface DashboardCalendarWidgetProps {
  partnerUid: string;
  onSiteSelect: (siteId: string) => void; 
}

// --- [ 2. 헬퍼 함수 ] ---
const getISODateString = (date: Date): string => {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().split('T')[0];
};

const getWeekRange = (date: Date): { start: Date, end: Date } => {
  const d = new Date(date);
  const day = d.getDay(); 
  const diffToMonday = day === 0 ? -6 : 1 - day;
  
  const start = new Date(d); start.setDate(d.getDate() + diffToMonday);
  const end = new Date(start); end.setDate(start.getDate() + 6);
  return { start, end };
};


// --- [ 3. 메인 컴포넌트 ] ---
const DashboardCalendarWidget: React.FC<DashboardCalendarWidgetProps> = ({ 
  partnerUid, 
  onSiteSelect 
}) => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [filterType, setFilterType] = useState<'today' | 'week' | 'month'>('today');

  const [allSchedules, setAllSchedules] = useState<ScheduleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const db = getFirestore();

  const [filterPrefs, setFilterPrefs] = useState({ showMeetings: true, showConstruction: true, showPersonal: true });
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [siteNamesCache, setSiteNamesCache] = useState<Map<string, string>>(new Map()); 

  useEffect(() => {
    if (!partnerUid) return;
    getDoc(doc(db, 'users', partnerUid)).then(snap => {
      if (snap.exists() && snap.data().calendarFilters) {
        setFilterPrefs(prev => ({ ...prev, ...snap.data().calendarFilters }));
      }
    });
  }, [db, partnerUid]);

  useEffect(() => {
    if (!partnerUid) return;
    setIsLoading(true);

    let meetings: ScheduleItem[] = [];
    let constructionLogs: ScheduleItem[] = [];
    let constructionSchedules: ScheduleItem[] = [];
    let personals: ScheduleItem[] = [];

    const updateAll = () => {
      setAllSchedules([...meetings, ...constructionLogs, ...constructionSchedules, ...personals]);
      setIsLoading(false);
    };

    const fetchSiteNameIfNeeded = async (siteId: string) => {
        if (!siteId || siteNamesCache.has(siteId)) return;
        try {
            const snap = await getDoc(doc(db, 'users', partnerUid, 'sites', siteId));
            if (snap.exists()) {
                const name = snap.data().siteName;
                setSiteNamesCache(prev => new Map(prev).set(siteId, name));
            }
        } catch(e) { console.warn('Site name fetch failed', e); }
    };

    const qMemos = query(collectionGroup(db, 'memos'), where('partnerUid', '==', partnerUid), where('memoType', '==', 'meeting'));
    const unsubMemos = onSnapshot(qMemos, (snap) => {
      meetings = snap.docs.map(d => {
        const data = d.data() as MemoEntry;
        if(data.siteId) fetchSiteNameIfNeeded(data.siteId);
        return { 
            id: d.id, time: data.meetingTime, title: `${data.meetingTime} 미팅: ${data.memoContent}`, 
            siteId: data.siteId, type: 'meeting', dateKey: data.meetingDate, siteName: data.siteName 
        };
      });
      updateAll();
    });

    const qWork = query(collectionGroup(db, 'workLogs'), where('partnerUid', '==', partnerUid), where('tomorrowProcess', '!=', ''));
    const unsubWork = onSnapshot(qWork, (snap) => {
      constructionLogs = [];
      snap.forEach((d) => {
        const data = d.data() as SiteWorkEntry;
        if (data.date) {
          const nextDay = new Date(data.date); nextDay.setDate(nextDay.getDate() + 1);
          if(data.siteId) fetchSiteNameIfNeeded(data.siteId);
          constructionLogs.push({ id: d.id, time: '09:00', title: data.tomorrowProcess, siteId: data.siteId, type: 'construction', dateKey: getISODateString(nextDay), siteName: data.siteName });
        }
      });
      updateAll();
    });

    const qSchedules = query(collectionGroup(db, 'schedules'));
    const unsubSchedules = onSnapshot(qSchedules, (snap) => {
        constructionSchedules = [];
        snap.forEach(d => {
          const pathSegments = d.ref.path.split('/');
          if (pathSegments.length > 1 && pathSegments[1] === partnerUid) { 
            const data = d.data() as SiteScheduleEntry;
            const siteId = pathSegments[3]; 
            fetchSiteNameIfNeeded(siteId);
            constructionSchedules.push({
                id: d.id, time: '10:00', title: data.processes.join(', '), siteId: siteId, 
                type: 'construction', dateKey: data.date, siteName: siteNamesCache.get(siteId) 
            });
          }
        });
        updateAll();
    });

    const qPersonal = query(collection(db, 'users', partnerUid, 'personalSchedules'), orderBy('time', 'asc')); 
    const unsubPersonal = onSnapshot(qPersonal, (snap) => {
      personals = snap.docs.map(d => {
        const data = d.data();
        return { id: d.id, time: data.time, title: data.title, siteId: undefined, type: 'personal', isPublic: data.isPublic, dateKey: data.date };
      });
      updateAll();
    });
    
    return () => { unsubMemos(); unsubWork(); unsubSchedules(); unsubPersonal(); };
  }, [db, partnerUid, siteNamesCache]);


  const filteredSchedulesList = useMemo(() => {
    return allSchedules.filter(schedule => {
      if (schedule.type === 'personal' && filterPrefs.showPersonal) return true; 
      if (schedule.type === 'meeting' && filterPrefs.showMeetings) return true;
      if (schedule.type === 'construction' && filterPrefs.showConstruction) return true;
      return false;
    });
  }, [allSchedules, filterPrefs]);

  const schedulesByDateMap = useMemo(() => {
    const map = new Map<string, ScheduleItem[]>();
    filteredSchedulesList.forEach(schedule => {
      const dateKey = schedule.dateKey; 
      if (!dateKey) return;
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(schedule);
    });

    const finalMap = new Map<string, ScheduleItem[]>();
    map.forEach((dailyItems, dateKey) => {
        const constructions = dailyItems.filter(s => s.type === 'construction' && s.siteId);
        const others = dailyItems.filter(s => s.type !== 'construction' || !s.siteId);

        const groupedBySite = new Map<string, ScheduleItem[]>();
        constructions.forEach(item => {
            const sId = item.siteId!;
            if (!groupedBySite.has(sId)) groupedBySite.set(sId, []);
            groupedBySite.get(sId)!.push(item);
        });

        const result: ScheduleItem[] = [...others];
        groupedBySite.forEach((list, siteId) => {
            const siteName = list[0].siteName || siteNamesCache.get(siteId) || '현장';
            const isSingleProcess = list.length === 1 && list[0].title.indexOf(',') === -1;
            result.push({
                id: list.map(i => i.id).join('-'), 
                time: list[0].time,
                title: list.length > 1 || !isSingleProcess ? `[${siteName}] 공사일정 (${list.length}건)` : `[${siteName}] ${list[0].title.split(',')[0].trim()}`,
                fullTitle: `[${siteName} 공사일정]\n${list.map(i => i.title).join('\n')}`,
                siteId: list[0].siteId,
                type: 'construction',
                dateKey: dateKey,
                siteName: siteName
            } as ScheduleItem);
        });
        result.sort((a, b) => a.time.localeCompare(b.time));
        finalMap.set(dateKey, result);
    });
    return finalMap;
  }, [filteredSchedulesList, siteNamesCache]);


  const displayedSchedules = useMemo(() => {
    const selectedDateKey = getISODateString(selectedDate);
    const rawList = filteredSchedulesList;

    if (filterType === 'today') {
      return rawList.filter(s => s.dateKey === selectedDateKey).sort((a, b) => a.time.localeCompare(b.time));
    }
    if (filterType === 'week') {
      const { start, end } = getWeekRange(selectedDate); 
      const weekSchedules = rawList.filter(s => {
          const itemDate = new Date(s.dateKey);
          return itemDate >= start && itemDate <= end;
      });
      return weekSchedules.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.time.localeCompare(b.time));
    }
    if (filterType === 'month') {
      const yearMonth = selectedDateKey.substring(0, 7);
      const monthSchedules = rawList.filter(s => s.dateKey.startsWith(yearMonth));
      return monthSchedules.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.time.localeCompare(b.time));
    }
    return [];
  }, [filterType, filteredSchedulesList, selectedDate]);


  const tileContent = ({ date, view }: { date: Date, view: string }) => {
    if (view === 'month') {
      const dateKey = getISODateString(date);
      const dailySchedules = schedulesByDateMap.get(dateKey); 
      if (dailySchedules && dailySchedules.length > 0) {
        return (
          <div className="calendar-tile-content">
            {dailySchedules.slice(0, 3).map(item => (
              <div key={item.id} className={`calendar-dot ${item.type}`} title={item.fullTitle || item.title}>
                {item.title} 
              </div>
            ))}
            {dailySchedules.length > 3 && <div className="calendar-more">+{dailySchedules.length - 3}</div>}
          </div>
        );
      }
    }
    return null;
  };

  const handleDateChange = (value: any) => setSelectedDate(value as Date);
  const toggleFilter = (key: 'showMeetings' | 'showConstruction' | 'showPersonal') => setFilterPrefs(prev => ({ ...prev, [key]: !prev[key] }));
  
  const handleSaveFilters = async () => {
    if (!partnerUid) return;
    setIsSavingPrefs(true);
    try {
      await setDoc(doc(db, 'users', partnerUid), { calendarFilters: filterPrefs }, { merge: true });
    } catch (e) { console.error(e); } finally { setIsSavingPrefs(false); }
  };

  const scheduleListTitle = useMemo(() => {
    const formatOptions: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', weekday: 'short' };
    if (filterType === 'today') return selectedDate.toLocaleDateString('ko-KR', formatOptions);
    if (filterType === 'week') {
      const { start, end } = getWeekRange(selectedDate); 
      const startStr = start.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
      const endStr = end.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
      return `${startStr} ~ ${endStr}`;
    }
    if (filterType === 'month') return selectedDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' }); 
    return '';
  }, [filterType, selectedDate]);

  if (isLoading) return <div className="dc-loading">일정을 불러오는 중입니다...</div>;

  return (
    <div className="dashboard-calendar-widget">
      
      {/* 헤더 영역 */}
      <div className="widget-header">
        <div className="widget-title">
           <h3>일정 캘린더</h3>
           <p>일별, 주간별 일정을 확인하고 관리합니다.</p>
        </div>
      </div>

      {/* 컨트롤 패널 (회색 박스) */}
      <div className="calendar-control-panel">
         <div className="filter-chips">
            <button className={`filter-chip ${filterPrefs.showMeetings?'active':''}`} onClick={()=>toggleFilter('showMeetings')}>미팅</button>
            <button className={`filter-chip ${filterPrefs.showConstruction?'active':''}`} onClick={()=>toggleFilter('showConstruction')}>공사</button>
            <button className={`filter-chip ${filterPrefs.showPersonal?'active':''}`} onClick={()=>toggleFilter('showPersonal')}>개인</button>
         </div>
         <div className="header-actions">
            <button className="btn-text-save" onClick={handleSaveFilters}>{isSavingPrefs?'저장중...':'필터 저장'}</button>
            <button className="btn-add-schedule" onClick={() => setIsModalOpen(true)}>+ 일정 등록</button>
         </div>
      </div>

      {/* 캘린더 (모바일에서는 CSS로 숨김 처리됨) */}
      <div className="calendar-wrapper">
        <Calendar
          onChange={handleDateChange}
          value={selectedDate}
          locale="ko-KR"
          formatDay={(locale, date) => date.getDate().toString()}
          tileContent={tileContent}
          next2Label={null}
          prev2Label={null}
        />
      </div>

      {/* 리스트 영역 */}
      <div className="schedule-list-wrapper">
        <div className="list-header">
          <div className="view-tabs">
             <button className={`view-tab ${filterType==='today'?'active':''}`} onClick={()=>setFilterType('today')}>오늘</button>
             <button className={`view-tab ${filterType==='week'?'active':''}`} onClick={()=>setFilterType('week')}>주간</button>
             <button className={`view-tab ${filterType==='month'?'active':''}`} onClick={()=>setFilterType('month')}>월간</button>
          </div>
          <span className="list-date-label">{scheduleListTitle}</span>
        </div>

        <div className="list-content">
            {displayedSchedules.length === 0 ? (
            <div className="no-data-message">등록된 일정이 없습니다.</div>
            ) : (
            <ul className="schedule-ul">
                {displayedSchedules.map((item) => {
                const d = new Date(item.dateKey);
                const dateStr = `${d.getMonth() + 1}/${d.getDate()} (${d.toLocaleDateString('ko-KR', { weekday: 'short' })})`;
                const displaySiteName = item.siteName || (item.siteId ? '현장' : null);
                
                let cleanTitle = item.title;
                if (displaySiteName && item.title.includes(`[${displaySiteName}]`)) {
                    cleanTitle = item.title.replace(`[${displaySiteName}]`, '').trim();
                }

                return (
                    <li key={item.id} className="schedule-li" onClick={() => item.siteId && onSiteSelect(item.siteId)}>
                    <div className="li-time-col">
                        <span className="li-date">{dateStr}</span>
                        <span className="li-time">{item.time}</span>
                    </div>
                    <div className="li-info-col">
                        <div className="li-tags">
                            <span className={`badge-type ${item.type}`}>
                                {item.type==='meeting'?'미팅':item.type==='construction'?'공사':'개인'}
                            </span>
                            {displaySiteName && item.type !== 'personal' && (
                                <span className="badge-site">{displaySiteName}</span>
                            )}
                        </div>
                        <span className="li-title">{cleanTitle}</span>
                    </div>
                    </li>
                );
                })}
            </ul>
            )}
        </div>
      </div>

      {/* 개인 일정 추가 모달 */}
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
    e.preventDefault();
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'users', partnerUid, 'personalSchedules'), {
        title, date, time, isPublic, partnerUid, createdAt: serverTimestamp()
      });
      alert('일정이 등록되었습니다.');
      onClose();
    } catch(e) { console.error(e); alert('오류 발생'); } finally { setSubmitting(false); }
  };

  return (
    <div className="cal-modal-overlay">
      <div className="cal-modal-box">
        <h3>새로운 일정</h3>
        <form onSubmit={save}>
          <div className="cal-form-group">
              <label>날짜</label>
              <input type="date" value={date} onChange={e=>setDate(e.target.value)} required />
          </div>
          <div className="cal-form-group">
              <label>시간</label>
              <input type="time" value={time} onChange={e=>setTime(e.target.value)} required />
          </div>
          <div className="cal-form-group">
              <label>내용</label>
              <input type="text" value={title} onChange={e=>setTitle(e.target.value)} placeholder="일정 내용을 입력하세요" required />
          </div>
          <div className="cal-form-check">
              <label><input type="checkbox" checked={isPublic} onChange={e=>setIsPublic(e.target.checked)} /> 직원들과 공유하기</label>
          </div>
          <div className="cal-form-actions">
            <button type="button" className="btn-text" onClick={onClose}>취소</button>
            <button type="submit" className="btn-submit" disabled={submitting}>등록</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DashboardCalendarWidget;