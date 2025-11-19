// src/components/admin/ActivityLogTab.tsx

import React, { useState, useEffect, useCallback } from 'react';
import { 
  getFirestore, 
  collection, 
  query, 
  orderBy, 
  limit, 
  getDocs,
  startAfter,
  type DocumentData,
  type QueryDocumentSnapshot,
  Timestamp
} from 'firebase/firestore';
import './ActivityLogTab.css'; // (새로운 CSS 파일)

// 로그 데이터 타입
interface LogEntry {
  id: string;
  adminNickname: string;
  message: string;
  timestamp: Timestamp;
}

// Timestamp를 'YYYY/MM/DD HH:MM:SS'로 변환
const formatLogTimestamp = (ts: Timestamp | null | undefined): string => {
  if (!ts) return "날짜 없음";
  const d = ts.toDate();
  
  const Y = d.getFullYear();
  const M = (d.getMonth() + 1).toString().padStart(2, '0');
  const D = d.getDate().toString().padStart(2, '0');
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  const s = d.getSeconds().toString().padStart(2, '0');
  
  return `${Y}/${M}/${D} ${h}:${m}:${s}`;
};

const LOGS_PER_PAGE = 50; // 한 번에 불러올 로그 개수

const ActivityLogTab: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  
  const db = getFirestore();

  // 1. 첫 페이지 로그 불러오기
  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    setHasMore(true); // 새로고침 시 '더 보기' 버튼 다시 활성화
    
    try {
      const logsRef = collection(db, "adminActivityLogs");
      const q = query(
        logsRef, 
        orderBy("timestamp", "desc"), 
        limit(LOGS_PER_PAGE)
      );
      
      const querySnapshot = await getDocs(q);
      const logList: LogEntry[] = [];
      querySnapshot.forEach((doc) => {
        logList.push({ id: doc.id, ...doc.data() } as LogEntry);
      });
      
      setLogs(logList);
      setLastDoc(querySnapshot.docs[querySnapshot.docs.length - 1]); // 마지막 문서 저장
      if (querySnapshot.docs.length < LOGS_PER_PAGE) {
        setHasMore(false); // 더 이상 로그가 없음
      }
    } catch (error) {
      console.error("활동로그 로딩 오류:", error);
      alert("활동로그를 불러오는 데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [db]);

  useEffect(() => {
    fetchLogs(); // 컴포넌트 마운트 시 실행
  }, [fetchLogs]);

  // 2. '더 보기' (다음 페이지)
  const fetchMoreLogs = async () => {
    if (!lastDoc || !hasMore) return;

    setIsLoadingMore(true);
    try {
      const logsRef = collection(db, "adminActivityLogs");
      const q = query(
        logsRef, 
        orderBy("timestamp", "desc"), 
        startAfter(lastDoc), // 마지막 문서 다음부터
        limit(LOGS_PER_PAGE)
      );

      const querySnapshot = await getDocs(q);
      const logList: LogEntry[] = [];
      querySnapshot.forEach((doc) => {
        logList.push({ id: doc.id, ...doc.data() } as LogEntry);
      });

      setLogs(prevLogs => [...prevLogs, ...logList]); // 기존 로그에 추가
      setLastDoc(querySnapshot.docs[querySnapshot.docs.length - 1]);
      
      if (querySnapshot.docs.length < LOGS_PER_PAGE) {
        setHasMore(false); // 더 이상 로그가 없음
      }
    } catch (error) {
      console.error("활동로그 '더 보기' 로딩 오류:", error);
      alert("추가 로그를 불러오는 데 실패했습니다.");
    } finally {
      setIsLoadingMore(false);
    }
  };

  return (
    <div className="activity-log-container">
      <div className="activity-log-header">
        <h2>활동로그</h2>
        <button onClick={fetchLogs} disabled={isLoading}>
          {isLoading ? '새로고침 중...' : '새로고침'}
        </button>
      </div>

      <p className="log-caption">
        관리자(admin, subadmin)가 수행한 주요 작업의 기록입니다. 
      </p>

      {isLoading && <p>로그를 불러오는 중입니다...</p>}

      {!isLoading && (
        <table className="activity-log-table">
          <thead>
            <tr>
              <th className="col-time">시간</th>
              <th className="col-admin">관리자</th>
              <th className="col-message">활동 내용</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(log => (
              <tr key={log.id}>
                <td className="col-time">{formatLogTimestamp(log.timestamp)}</td>
                <td className="col-admin">{log.adminNickname}</td>
                <td className="col-message">{log.message}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={3} style={{ textAlign: 'center' }}>기록된 활동로그가 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {hasMore && (
        <button 
          className="load-more-button" 
          onClick={fetchMoreLogs}
          disabled={isLoadingMore}
        >
          {isLoadingMore ? '로딩 중...' : '이전 로그 더 보기'}
        </button>
      )}
      {!hasMore && logs.length > 0 && (
        <p className="log-end-marker">--- 모든 로그를 불러왔습니다 ---</p>
      )}
    </div>
  );
};

export default ActivityLogTab;