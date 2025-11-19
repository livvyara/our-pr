// src/components/partner/ConstructionScheduleModal.tsx

import React, { useState, useEffect, type FormEvent, useMemo } from 'react';
import { 
  getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, query, orderBy, onSnapshot, serverTimestamp, Timestamp, getDoc 
} from 'firebase/firestore';
import { auth } from '../../firebase-config';
import './ConstructionScheduleModal.css'; 

// --- [ 타입 정의 ] ---
interface ScheduleEntry {
  id: string;
  date: string;
  processes: string[];
  isNoisy: boolean;
  createdAt: Timestamp;
  siteName: string; 
}

interface ModalProps {
  siteId: string;
  partnerUid: string;
  onClose: () => void;
}

// 콤마로 구분된 문자열을 최대 5개의 배열로 변환
const parseProcesses = (text: string): string[] => {
  return text.split(',').map(s => s.trim()).filter(s => s.length > 0).slice(0, 5);
};

// [⭐ 추가] 날짜 범위 생성 헬퍼
const getDatesInRange = (startStr: string, endStr: string): string[] => {
    const dates: string[] = [];
    let currentDate = new Date(startStr);
    const endDate = new Date(endStr);
    
    // Timezone 문제 방지 위해 YYYY-MM-DD 문자열로 비교
    const endKey = endDate.toISOString().split('T')[0];

    while (currentDate.toISOString().split('T')[0] <= endKey) {
        dates.push(currentDate.toISOString().split('T')[0]);
        currentDate.setDate(currentDate.getDate() + 1);
    }
    return dates;
};


const ConstructionScheduleModal: React.FC<ModalProps> = ({ siteId, partnerUid, onClose }) => {
  const db = getFirestore();
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [currentSiteName, setCurrentSiteName] = useState('현장');
  const [isLoading, setIsLoading] = useState(true);

  // 폼 상태
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]); // [⭐ 수정] 시작 날짜
  const [endDate, setEndDate] = useState(''); // [⭐ 추가] 종료 날짜
  const [processesText, setProcessesText] = useState('');
  const [isNoisy, setIsNoisy] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 데이터 구독 및 현장 이름 가져오기
  useEffect(() => {
    if (!siteId || !partnerUid) return;
    
    const fetchData = async () => {
      // 1. 현장 이름 가져오기
      try {
        const siteDocRef = doc(db, 'users', partnerUid, 'sites', siteId);
        const siteSnap = await getDoc(siteDocRef);
        if (siteSnap.exists()) {
            setCurrentSiteName(siteSnap.data().siteName || '현장');
        }
      } catch (e) { console.error("현장 정보 로딩 실패", e); }

      // 2. 일정 목록 구독
      const scheduleRef = collection(db, 'users', partnerUid, 'sites', siteId, 'schedules');
      const q = query(scheduleRef, orderBy('date', 'asc'));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const list: ScheduleEntry[] = [];
        snapshot.forEach(doc => {
          const data = doc.data();
          list.push({ 
            id: doc.id, 
            date: data.date, processes: data.processes, isNoisy: data.isNoisy,
            createdAt: data.createdAt, siteName: currentSiteName 
          } as ScheduleEntry);
        });
        setSchedules(list);
        setIsLoading(false);
      }, (error) => { console.error("일정 구독 오류:", error); setIsLoading(false); });

      return () => unsubscribe();
    };

    fetchData();
  }, [siteId, partnerUid, db, currentSiteName]);


  // --- CRUD 핸들러 ---
  
  // 수정 시작 (종료일은 DB에 없으므로 시작일만 로드)
  const handleEdit = (schedule: ScheduleEntry) => {
    setIsEditing(true);
    setEditId(schedule.id);
    setStartDate(schedule.date);
    setEndDate(''); // 수정 시에는 단일 날짜만 수정할 수 있도록 종료일 초기화
    setProcessesText(schedule.processes.join(', '));
    setIsNoisy(schedule.isNoisy);
  };
  
  // 삭제
  const handleDelete = async (id: string, siteName: string) => {
    if (!window.confirm("해당 일정을 삭제하시겠습니까?")) return;
    try {
      await deleteDoc(doc(db, 'users', partnerUid, 'sites', siteId, 'schedules', id));
      
      await addDoc(collection(db, 'users', partnerUid, 'activityLogs'), {
        type: '공사일정삭제', content: `[일정삭제] ${auth.currentUser?.displayName || '사용자'}가 [${siteName}] 현장의 일정을 삭제했습니다.`,
        relatedId: siteId, partnerUid, performerUid: auth.currentUser?.uid, createdAt: serverTimestamp(), isRead: false
      });
    } catch (e) { console.error("삭제 실패:", e); }
  };

  // [⭐ 핵심 수정] 등록/수정 저장
  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    const processes = parseProcesses(processesText);
    if (processes.length === 0) {
      alert("공정을 콤마로 구분하여 최소 1개 이상 입력해주세요.");
      return;
    }

    // --- 유효성 검사 ---
    if (endDate && new Date(endDate) < new Date(startDate)) {
        alert("종료 날짜는 시작 날짜보다 빠를 수 없습니다.");
        return;
    }
    
    setIsSubmitting(true);
    
    try {
      if (isEditing && editId) {
        // [CASE 1] 단일 일정 수정
        await updateDoc(doc(db, 'users', partnerUid, 'sites', siteId, 'schedules', editId), {
            date: startDate, // 수정 시에는 시작 날짜만 사용
            processes,
            isNoisy,
        });

        await addDoc(collection(db, 'users', partnerUid, 'activityLogs'), {
            type: '공사일정수정', content: `[일정수정] ${auth.currentUser?.displayName || '사용자'}가 [${currentSiteName}] 현장의 ${startDate} 일정을 수정했습니다.`,
            relatedId: siteId, partnerUid, performerUid: auth.currentUser?.uid, createdAt: serverTimestamp(), isRead: false
        });

        alert("일정이 수정되었습니다.");
      } else {
        // [CASE 2] 일괄/단일 등록 (Batch Registration)
        const datesToSave = getDatesInRange(startDate, endDate || startDate); // 종료일이 없으면 시작일만 사용

        // [⭐ 핵심] Promise.all을 이용한 병렬 저장
        const batchPromises = datesToSave.map(dateStr => {
            return addDoc(collection(db, 'users', partnerUid, 'sites', siteId, 'schedules'), {
                date: dateStr, // 각 날짜별로 저장
                processes,
                isNoisy,
                createdAt: serverTimestamp(),
            });
        });

        await Promise.all(batchPromises);

        // 로그 기록 (대표 로그만 남김)
        const logContent = datesToSave.length > 1 
            ? `[일괄등록] ${currentSiteName} 현장 일정을 ${startDate} ~ ${datesToSave[datesToSave.length - 1]} 범위로 등록했습니다.`
            : `[일정등록] ${currentSiteName} 현장의 ${startDate} 일정을 등록했습니다.`;

        await addDoc(collection(db, 'users', partnerUid, 'activityLogs'), {
            type: '공사일정등록', content: logContent, relatedId: siteId, partnerUid, performerUid: auth.currentUser?.uid, createdAt: serverTimestamp(), isRead: false
        });

        alert(`총 ${datesToSave.length}개의 일정이 등록되었습니다.`);
      }
      
      // 폼 초기화
      handleCancelEdit();
      setStartDate(new Date().toISOString().split('T')[0]);
      setEndDate('');

    } catch (e) {
      console.error("저장 실패:", e);
      alert("일정 저장에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditId(null);
    setProcessesText('');
    setIsNoisy(false);
    setEndDate(''); // 취소 시 종료일도 초기화
  };

  return (
    <div className="schedule-modal-overlay">
      <div className="schedule-modal-content">
        <h3>{isEditing ? '공사 일정 수정' : '공사 일정 등록'}</h3>
        
        {/* 1. 등록/수정 폼 */}
        <form className="schedule-form" onSubmit={handleSave}>
          <div className="form-grid">
            
            {/* [⭐ 수정] 날짜 선택 (시작일) */}
            <div className="form-group-date">
              <label>시작 날짜</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required disabled={isSubmitting} />
            </div>

            {/* [⭐ 추가] 날짜 선택 (종료일) */}
            <div className="form-group-date">
              <label>종료 날짜 (선택 사항)</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={isSubmitting || isEditing} />
            </div>

            <div className="form-group-check">
              <label htmlFor="noisy-check">시끄러운 날 선택</label>
              <input type="checkbox" id="noisy-check" checked={isNoisy} onChange={(e) => setIsNoisy(e.target.checked)} disabled={isSubmitting} />
            </div>

            <div className="form-group-full">
              <label>공정 입력 (최대 5개, 콤마 구분)</label>
              <textarea 
                value={processesText} 
                onChange={(e) => setProcessesText(e.target.value)} 
                placeholder="예: 철거, 목공, 페인트, 바닥, 마감"
                disabled={isSubmitting}
                required
              />
              <p className="help-text">현재 공정 수: {parseProcesses(processesText).length}개</p>
            </div>
          </div>
          
          <div className="form-actions">
            {isEditing && (
              <button type="button" className="btn-cancel" onClick={handleCancelEdit} disabled={isSubmitting}>취소</button>
            )}
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? '처리 중...' : isEditing ? '수정 완료' : '일정 등록'}
            </button>
          </div>
        </form>

        {/* 2. 리스트 */}
        <div className="schedule-list-wrapper">
          <h4>등록된 공사 일정</h4>
          {isLoading ? (
            <p className="loading-text">일정을 불러오는 중...</p>
          ) : schedules.length === 0 ? (
            <p className="no-data">등록된 일정이 없습니다.</p>
          ) : (
            <ul className="schedule-list">
              {schedules.map(schedule => (
                <li key={schedule.id} className={`schedule-item ${schedule.isNoisy ? 'noisy' : ''}`}>
                  <div className="schedule-info">
                    <span className="schedule-date">{schedule.date}</span>
                    <span className="schedule-processes">
                      {schedule.processes.map((proc, i) => (
                        <span key={i} className="process-tag">{proc}</span>
                      ))}
                    </span>
                  </div>
                  <div className="schedule-controls">
                    <button onClick={() => handleEdit(schedule)} className="btn-edit">수정</button>
                    <button onClick={() => handleDelete(schedule.id, schedule.siteName)} className="btn-delete">삭제</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        
        <button className="btn-close-modal" onClick={onClose} disabled={isSubmitting}>닫기</button>
      </div>
    </div>
  );
};

export default ConstructionScheduleModal;