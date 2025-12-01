import React, { useState, useEffect } from 'react';
import { getFirestore, collection, query, orderBy, getDocs } from 'firebase/firestore';
import './CustomerScheduleListModal.css'; 

interface ScheduleEntry {
  id: string;
  date: string; 
  processes: string[];
  isNoisy: boolean;
}

interface Props {
  siteId: string;
  partnerUid: string;
  onClose: () => void;
}

const CustomerScheduleListModal: React.FC<Props> = ({ siteId, partnerUid, onClose }) => {
  const db = getFirestore();
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSchedules = async () => {
      try {
        const q = query(
            collection(db, 'users', partnerUid, 'sites', siteId, 'schedules'), 
            orderBy('date', 'asc') // 날짜 오름차순
        );
        const snap = await getDocs(q);
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as ScheduleEntry));
        setSchedules(list);
      } catch (e) { console.error(e); } 
      finally { setLoading(false); }
    };
    fetchSchedules();
  }, [siteId, partnerUid]);

  // 날짜 포맷팅 (YYYY-MM-DD -> MM월 DD일 (요일))
  const formatDate = (dateStr: string) => {
      const date = new Date(dateStr);
      const days = ['일', '월', '화', '수', '목', '금', '토'];
      return `${date.getMonth() + 1}월 ${date.getDate()}일 (${days[date.getDay()]})`;
  };

  // 오늘 날짜인지 확인
  const isToday = (dateStr: string) => {
      const today = new Date().toISOString().split('T')[0];
      return dateStr === today;
  };

  return (
    <div className="cs-modal-overlay">
      <div className="cs-modal-content">
        <div className="cs-header">
          <h3>📅 공사 일정표</h3>
          <button className="cs-close-btn" onClick={onClose}>×</button>
        </div>

        <div className="cs-body">
            {loading ? <div className="cs-loading">일정을 불러오는 중...</div> : 
             schedules.length === 0 ? <div className="cs-empty">등록된 공사 일정이 없습니다.</div> :
             
             <div className="cs-list-container">
                 {schedules.map((item) => (
                     <div key={item.id} className={`cs-item ${isToday(item.date) ? 'today' : ''}`}>
                         <div className="cs-date-box">
                             <span className="cs-date-text">{formatDate(item.date)}</span>
                             {isToday(item.date) && <span className="badge-today">TODAY</span>}
                         </div>
                         
                         <div className="cs-process-box">
                             {item.processes.map((proc, idx) => (
                                 <span key={idx} className="cs-process-tag">{proc}</span>
                             ))}
                             {item.isNoisy && <span className="badge-noisy">📢 소음주의</span>}
                         </div>
                     </div>
                 ))}
             </div>
            }
        </div>
      </div>
    </div>
  );
};

export default CustomerScheduleListModal;