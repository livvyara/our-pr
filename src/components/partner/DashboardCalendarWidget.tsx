// src/components/partner/DashboardCalendarWidget.tsx

import React, { useState, useEffect, useMemo, type FormEvent } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css'; 
import './DashboardCalendarWidget.css'; 

import { 
  getFirestore, collectionGroup, collection, query, where, onSnapshot,
  Timestamp, doc, getDoc, setDoc, addDoc, serverTimestamp, orderBy, getDocs 
} from 'firebase/firestore';
import { auth } from '../../firebase-config'; 

// --- [ 1. 타입 정의 ] ---

type ScheduleItem = {
  id: string;
  time: string;
  title: string;
  siteId?: string;
  type: 'meeting' | 'construction' | 'personal'; 
  isPublic?: boolean;
  dateKey: string; // 'YYYY-MM-DD'
  fullTitle?: string; // 툴팁용 (그룹화된 일정 상세)
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
    siteId?: string; // 경로에서 추출되거나 데이터에 포함
    partnerUid?: string;
}

interface PersonalScheduleEntry {
  title: string;
  date: string;
  time: string;
  isPublic: boolean;
  partnerUid: string;
  createdAt: Timestamp;
}

interface DashboardCalendarWidgetProps {
  partnerUid: string;
  onSiteSelect: (siteId: string) => void; 
}

// --- [ 2. 헬퍼 함수 ] ---

const getISODateString = (date: Date): string => {
  // Timezone 문제 방지 (날짜 경계를 정확히 하기 위함)
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

  // 설정 및 캐시 상태
  const [filterPrefs, setFilterPrefs] = useState({ showMeetings: true, showConstruction: true, showPersonal: true });
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [siteNamesCache, setSiteNamesCache] = useState<Map<string, string>>(new Map()); // 현장명 캐싱

  // 1. 필터 설정 불러오기
  useEffect(() => {
    if (!partnerUid) return;
    getDoc(doc(db, 'users', partnerUid)).then(snap => {
      if (snap.exists() && snap.data().calendarFilters) {
        setFilterPrefs(prev => ({ ...prev, ...snap.data().calendarFilters }));
      }
    });
  }, [db, partnerUid]);


  // 2. 데이터 구독 및 통합
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

    // (A) 현장명 캐시 업데이트 함수 (필수)
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

    // 1. 미팅 일정 (memos)
    const qMemos = query(collectionGroup(db, 'memos'), where('partnerUid', '==', partnerUid), where('memoType', '==', 'meeting'));
    const unsubMemos = onSnapshot(qMemos, (snap) => {
      meetings = snap.docs.map(d => {
        const data = d.data() as MemoEntry;
        if(data.siteId) fetchSiteNameIfNeeded(data.siteId);
        return { id: d.id, time: data.meetingTime, title: `미팅: ${data.memoContent}`, siteId: data.siteId, type: 'meeting', dateKey: data.meetingDate, siteName: data.siteName };
      });
      updateAll();
    });

    // 2. 공사 일정 (workLogs - 익일 작업)
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

    // 3. [⭐] 공사 일정 (schedules - 새로 만든 모달 데이터)
    const qSchedules = query(collectionGroup(db, 'schedules'));
    const unsubSchedules = onSnapshot(qSchedules, (snap) => {
        constructionSchedules = [];
        snap.forEach(d => {
            const pathSegments = d.ref.path.split('/');
            // 내 파트너 데이터인지 확인 (경로: users/{uid}/sites/{siteId}/schedules/{docId})
            if (pathSegments.length > 1 && pathSegments[1] === partnerUid) { 
                const data = d.data() as SiteScheduleEntry;
                const siteId = pathSegments[3]; 
                fetchSiteNameIfNeeded(siteId);

                constructionSchedules.push({
                    id: d.id, time: '10:00', 
                    title: data.processes.join(', '), 
                    siteId: siteId, 
                    type: 'construction', 
                    dateKey: data.date, 
                    siteName: siteNamesCache.get(siteId) 
                });
            }
        });
        updateAll();
    });

    // 4. 개인 일정
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


  // 3. 필터링 및 그룹화 로직

  // 1단계: 상단 필터 (미팅/공사/개인) 적용
  const filteredSchedulesList = useMemo(() => {
    return allSchedules.filter(schedule => {
      if (schedule.type === 'personal' && filterPrefs.showPersonal) return true; 
      if (schedule.type === 'meeting' && filterPrefs.showMeetings) return true;
      if (schedule.type === 'construction' && filterPrefs.showConstruction) return true;
      return false;
    });
  }, [allSchedules, filterPrefs]);

  // 2단계: 캘린더 타일용 (그룹화 로직 적용)
  const schedulesByDateMap = useMemo(() => {
    const map = new Map<string, ScheduleItem[]>();
    filteredSchedulesList.forEach(schedule => {
      const dateKey = schedule.dateKey; 
      if (!dateKey) return;
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(schedule);
    });

    // [⭐ 타일 그룹화 로직]
    const finalMap = new Map<string, ScheduleItem[]>();
    map.forEach((dailyItems, dateKey) => {
        const constructions = dailyItems.filter(s => s.type === 'construction' && s.siteId);
        const others = dailyItems.filter(s => s.type !== 'construction' || !s.siteId);

        const groupedBySite = new Map<string, ScheduleItem[]>();
        constructions.forEach(item => {
            const sId = item.siteId!;
            const name = item.siteName || siteNamesCache.get(sId) || '현장'; // 이름 확인
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


  // 3단계: 하단 리스트 데이터 (비그룹화된 원본 리스트 사용)
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


  // 캘린더 타일 내용
  const tileContent = ({ date, view }: { date: Date, view: string }) => {
    if (view === 'month') {
      const dateKey = getISODateString(date);
      const dailySchedules = schedulesByDateMap.get(dateKey); // 그룹화된 맵 사용
      
      if (dailySchedules && dailySchedules.length > 0) {
        return (
          <div className="calendar-tile-content">
            {dailySchedules.slice(0, 3).map(item => (
              <div 
                key={item.id}
                className={`calendar-dot ${item.type}`}
                title={item.fullTitle || item.title}
              >
                {item.title} 
              </div>
            ))}
            {dailySchedules.length > 3 && <div style={{fontSize:'10px', color:'#999'}}>+{dailySchedules.length - 3}</div>}
          </div>
        );
      }
    }
    return null;
  };


  // 필터 저장, 토글, 날짜 변경 등 핸들러들은 동일합니다.
  const handleDateChange = (value: any) => setSelectedDate(value as Date);
  const toggleFilter = (key: 'showMeetings' | 'showConstruction' | 'showPersonal') => setFilterPrefs(prev => ({ ...prev, [key]: !prev[key] }));
  
  const handleSaveFilters = async () => {
    if (!partnerUid) return;
    setIsSavingPrefs(true);
    try {
      await setDoc(doc(db, 'users', partnerUid), { calendarFilters: filterPrefs }, { merge: true });
      alert('저장되었습니다.');
    } catch (e) { console.error(e); } finally { setIsSavingPrefs(false); }
  };

const scheduleListTitle = useMemo(() => {
    const formatOptions: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', weekday: 'short' };
    
    if (filterType === 'today') {
      return selectedDate.toLocaleDateString('ko-KR', formatOptions);
    }
    if (filterType === 'week') {
      const { start, end } = getWeekRange(selectedDate); 
      const startStr = start.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
      let endStr;
      if (start.getMonth() !== end.getMonth()) {
        endStr = end.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
      } else {
        endStr = end.toLocaleDateString('ko-KR', { day: 'numeric', weekday: 'short' });
      }
      return `${startStr} ~ ${endStr}`;
    }
    if (filterType === 'month') {
      return selectedDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' }); 
    }
    return '';
  }, [filterType, selectedDate]);
  if (isLoading) return <div className="dashboard-calendar-widget" style={{padding:'20px', textAlign:'center'}}>일정 로딩 중...</div>;

  // --- [ 4. 렌더링 ] ---

  return (
    <div className="dashboard-calendar-widget">
      
      {/* 1. 헤더 (컨트롤) */}
      <div className="widget-header">
        <div className="header-left">
          <h3 className="widget-title">일정 관리</h3>
          <button className={`filter-toggle ${filterPrefs.showMeetings?'active':''}`} onClick={()=>toggleFilter('showMeetings')}>미팅</button>
          <button className={`filter-toggle ${filterPrefs.showConstruction?'active':''}`} onClick={()=>toggleFilter('showConstruction')}>공사</button>
          <button className={`filter-toggle ${filterPrefs.showPersonal?'active':''}`} onClick={()=>toggleFilter('showPersonal')}>개인</button>
          <button className="btn-save-filter" onClick={handleSaveFilters}>{isSavingPrefs?'저장중':'필터저장'}</button>
        </div>
        <button className="btn-add-personal" onClick={() => setIsModalOpen(true)}>+ 일정 추가</button>
      </div>

      {/* 2. 캘린더 */}
      <div className="calendar-container">
        <Calendar
          onChange={handleDateChange}
          value={selectedDate}
          locale="ko-KR"
          formatDay={(locale, date) => date.getDate().toString()}
          tileContent={tileContent}
        />
      </div>

      {/* 3. 리스트 */}
      <div className="schedule-list-container">
        <div className="list-header-row">
          <button className={`view-filter-btn ${filterType==='today'?'active':''}`} onClick={()=>setFilterType('today')}>오늘</button>
          <button className={`view-filter-btn ${filterType==='week'?'active':''}`} onClick={()=>setFilterType('week')}>주간</button>
          <button className={`view-filter-btn ${filterType==='month'?'active':''}`} onClick={()=>setFilterType('month')}>월간</button>
          <span style={{marginLeft:'auto', fontWeight:'bold', color:'#555'}}>{scheduleListTitle}</span>
        </div>

        {displayedSchedules.length === 0 ? (
          <div className="no-data">일정이 없습니다.</div>
        ) : (
          <ul className="schedule-list">
            {displayedSchedules.map((item) => {
              const d = new Date(item.dateKey);
              const dayOfMonth = d.getDate();
              const dayOfWeek = d.toLocaleDateString('ko-KR', { weekday: 'short' });
              const displaySiteName = item.siteName || (item.siteId ? `[${item.siteId.substring(0, 4)}...]` : null);

// 제목에서 [현장명] 부분을 제거
              const cleanTitle = item.title.startsWith(`[${displaySiteName}]`) 
                  ? item.title.substring(`[${displaySiteName}]`.length).trim() 
                  : item.title;

              // 액티비티 내용 (공정/메모)
              const activityContent = item.type === 'meeting' || item.type === 'construction'
                  ? cleanTitle.replace(/^(미팅:|공사예정:|공사예정:\s?공정입력|공정입력:)/, '').trim() // 불필요한 라벨 제거
                  : item.title;

              return (
                <li key={item.id} className={`schedule-item ${item.siteId?'clickable':''}`} onClick={() => item.siteId && onSiteSelect(item.siteId)} title={item.fullTitle || item.title}>
                  
                  {/* 날짜/시간 영역 */}
                  <div className="time-badge">
                    {filterType !== 'today' && (
                      <span className="schedule-item-date">
                        {d.getMonth() + 1}/{dayOfMonth} ({dayOfWeek})
                      </span>
                    )}
                    <span style={{color: '#555'}}>{item.time}</span>
                  </div>
                  
                  {/* 내용 영역 */}
                  <div className="content-text">
                    <span className={`tag ${item.type}`}>
                      {item.type==='meeting'?'미팅':item.type==='construction'?'공사':'개인'}
                    </span>
                    
                    {displaySiteName && item.type !== 'personal' && (
                        <strong style={{marginRight:'8px', color:'#333'}}>
                            [{displaySiteName}]
                        </strong>
                    )}
                    
                    <span className="schedule-title">
                        {activityContent}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 개인 일정 추가 모달 */}
      {isModalOpen && <PersonalScheduleModal partnerUid={partnerUid} onClose={() => setIsModalOpen(false)} />}
    </div>
  );
};

// 개인 일정 추가 모달 (별도 컴포넌트)
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
      alert('저장되었습니다.');
      onClose();
    } catch(e) { console.error(e); alert('오류 발생'); } finally { setSubmitting(false); }
  };

  return (
    <div className="calendar-modal-overlay">
      <div className="calendar-modal-content">
        <h3>개인 일정 추가</h3>
        <form onSubmit={save}>
          <div className="modal-form-group"><label>날짜</label><input type="date" value={date} onChange={e=>setDate(e.target.value)} required /></div>
          <div className="modal-form-group"><label>시간</label><input type="time" value={time} onChange={e=>setTime(e.target.value)} required /></div>
          <div className="modal-form-group"><label>내용</label><input type="text" value={title} onChange={e=>setTitle(e.target.value)} required /></div>
          <div className="modal-form-checkbox"><label><input type="checkbox" checked={isPublic} onChange={e=>setIsPublic(e.target.checked)} /> 직원 공개</label></div>
          <div className="modal-form-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>취소</button>
            <button type="submit" className="btn-save" disabled={submitting}>저장</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DashboardCalendarWidget;