import React, { useState, useEffect, useRef } from 'react';
import { 
  getFirestore, collection, query, orderBy, onSnapshot, getDoc, doc 
} from 'firebase/firestore';
import './CustomerConstructionScheduleModal.css';

interface ScheduleEntry {
  id: string;
  date: string;
  processes: string[];
  isNoisy: boolean;
}

interface ModalProps {
  siteId: string;
  partnerUid: string;
  onClose: () => void;
}

const getProcessColor = (str: string) => {
  const palettes = [
    { bg: '#e3f2fd', border: '#90caf9', text: '#1565c0' }, 
    { bg: '#e8f5e9', border: '#a5d6a7', text: '#2e7d32' }, 
    { bg: '#fff3e0', border: '#ffcc80', text: '#ef6c00' }, 
    { bg: '#f3e5f5', border: '#ce93d8', text: '#7b1fa2' }, 
    { bg: '#e0f7fa', border: '#80deea', text: '#006064' }, 
    { bg: '#ffebee', border: '#ef9a9a', text: '#c62828' }
  ];
  let hash = 0; 
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return palettes[Math.abs(hash % palettes.length)];
};

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const dayName = days[date.getDay()];
  return `${mm}.${dd} (${dayName})`;
};

const isToday = (dateStr: string) => {
  const today = new Date();
  const target = new Date(dateStr);
  return today.toDateString() === target.toDateString();
};

const CustomerConstructionScheduleModal: React.FC<ModalProps> = ({ siteId, partnerUid, onClose }) => {
  const db = getFirestore();
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [siteName, setSiteName] = useState('공사 현장');
  const [loading, setLoading] = useState(true);
  
  // [수정] 애니메이션 강제 실행을 위한 상태 변수
  const [showContent, setShowContent] = useState(false);
  
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!siteId || !partnerUid) return;

    const fetchSiteInfo = async () => {
      try {
        const siteDoc = await getDoc(doc(db, 'users', partnerUid, 'sites', siteId));
        if (siteDoc.exists()) {
          setSiteName(siteDoc.data().siteName || '공사 현장');
        }
      } catch (e) {
        console.error("현장 정보 로드 실패", e);
      }
    };
    fetchSiteInfo();

    const q = query(
      collection(db, 'users', partnerUid, 'sites', siteId, 'schedules'), 
      orderBy('date', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: ScheduleEntry[] = [];
      snapshot.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() } as ScheduleEntry);
      });
      setSchedules(list);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [siteId, partnerUid, db]);

  // [수정] 로딩 완료 후 애니메이션 강제 실행 (0.1초 딜레이)
  useEffect(() => {
    if (!loading) {
      // 오늘 날짜로 스크롤 이동
      if (listRef.current) {
        const todayEl = listRef.current.querySelector('.schedule-item.today');
        if (todayEl) {
          todayEl.scrollIntoView({ behavior: 'auto', block: 'center' });
        }
      }
      
      // 애니메이션 클래스 활성화
      const timer = setTimeout(() => {
        setShowContent(true);
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [loading]);

  return (
    <div className="cs-modal-overlay" onClick={onClose}>
      <div className="cs-modal-container" onClick={e => e.stopPropagation()}>
        
        {/* 헤더 */}
        <div className="cs-modal-header">
          <div className="header-content">
            {/* [수정] showContent 상태에 따라 즉시 cs-active 적용 */}
            <div className="cs-reveal-mask">
              <h2 className={`cs-site-name cs-reveal-text ${showContent ? 'cs-active' : ''}`}>
                {siteName}
              </h2>
            </div>
            <div className="cs-reveal-mask">
              <span 
                className={`cs-modal-title cs-reveal-text ${showContent ? 'cs-active' : ''}`} 
                style={{transitionDelay: '0.1s'}}
              >
                전체 공사 일정표
              </span>
            </div>
          </div>
          <button className="btn-close" onClick={onClose}>&times;</button>
        </div>

        {/* 리스트 영역 */}
        <div className="cs-modal-body" ref={listRef}>
          {loading ? (
            <div className="cs-loading">일정을 불러오는 중입니다...</div>
          ) : schedules.length === 0 ? (
            <div className={`cs-empty cs-fade-up ${showContent ? 'cs-active' : ''}`}>
                등록된 공사 일정이 없습니다.
            </div>
          ) : (
            <div className="schedule-timeline">
              {schedules.map((schedule, index) => {
                const isTodayItem = isToday(schedule.date);
                return (
                  <div 
                    key={schedule.id} 
                    // [수정] showContent가 true면 무조건 cs-active 적용
                    className={`schedule-item ${isTodayItem ? 'today' : ''} cs-fade-up ${showContent ? 'cs-active' : ''}`}
                    // 렌더링 최적화를 위해 처음 로드될 때만 딜레이 적용
                    style={{ transitionDelay: `${Math.min(index * 0.05, 1)}s` }} 
                  >
                    {/* 날짜 컬럼 */}
                    <div className="date-col">
                      <span className="date-text">{formatDate(schedule.date)}</span>
                      {isTodayItem && <span className="today-badge">TODAY</span>}
                    </div>

                    {/* 내용 컬럼 */}
                    <div className="content-col">
                      {schedule.isNoisy && (
                        <div className="noisy-alert">
                          <span className="noisy-icon">📢</span> 소음 주의
                        </div>
                      )}
                      
                      <div className="process-list">
                        {schedule.processes.map((proc, idx) => {
                          const style = getProcessColor(proc);
                          return (
                            <span 
                              key={idx} 
                              className="process-tag"
                              style={{ 
                                backgroundColor: style.bg, 
                                color: style.text, 
                                border: `1px solid ${style.border}` 
                              }}
                            >
                              {proc}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="cs-modal-footer">
          <p className={`cs-fade-up ${showContent ? 'cs-active' : ''}`} style={{transitionDelay: '0.5s'}}>
            ※ 현장 상황에 따라 일정이 변동될 수 있습니다.
          </p>
        </div>
      </div>
    </div>
  );
};

export default CustomerConstructionScheduleModal;