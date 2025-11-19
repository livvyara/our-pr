// src/components/admin/DispatchResultsSubTab.tsx

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
import './DispatchResultsSubTab.css'; // (CSS는 하단에 제공)

// 발송 로그 데이터 타입
interface DispatchLog {
  id: string;
  adminNickname: string;
  message: string;
  timestamp: Timestamp;
  type: 'Marketing SMS' | 'Direct SMS' | 'Push Notification' | 'Unknown';
  recipientCount: number;
}

// Timestamp 포맷
const formatLogTimestamp = (ts: Timestamp | null | undefined): string => {
  if (!ts) return "날짜 없음";
  const d = ts.toDate();
  const Y = d.getFullYear();
  const M = (d.getMonth() + 1).toString().padStart(2, '0');
  const D = d.getDate().toString().padStart(2, '0');
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${Y}/${M}/${D} ${h}:${m}`;
};

const LOGS_PER_PAGE = 30;

const DispatchResultsSubTab: React.FC = () => {
  const [logs, setLogs] = useState<DispatchLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  
  const db = getFirestore();

  // 1. 첫 페이지 로그 불러오기
  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    setHasMore(true); 
    try {
      const logsRef = collection(db, "dispatchLogs");
      const q = query(
        logsRef, 
        orderBy("timestamp", "desc"), 
        limit(LOGS_PER_PAGE)
      );
      
      const querySnapshot = await getDocs(q);
      const logList: DispatchLog[] = [];
      querySnapshot.forEach((doc) => {
        logList.push({ id: doc.id, ...doc.data() } as DispatchLog);
      });
      
      setLogs(logList);
      setLastDoc(querySnapshot.docs[querySnapshot.docs.length - 1]);
      if (querySnapshot.docs.length < LOGS_PER_PAGE) {
        setHasMore(false);
      }
    } catch (error) {
      console.error("발송결과 로딩 오류:", error);
      alert("발송결과를 불러오는 데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [db]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // 2. '더 보기'
  const fetchMoreLogs = async () => {
    if (!lastDoc || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const logsRef = collection(db, "dispatchLogs");
      const q = query(
        logsRef, 
        orderBy("timestamp", "desc"), 
        startAfter(lastDoc), 
        limit(LOGS_PER_PAGE)
      );
      const querySnapshot = await getDocs(q);
      const logList: DispatchLog[] = [];
      querySnapshot.forEach((doc) => {
        logList.push({ id: doc.id, ...doc.data() } as DispatchLog);
      });
      setLogs(prevLogs => [...prevLogs, ...logList]);
      setLastDoc(querySnapshot.docs[querySnapshot.docs.length - 1]);
      if (querySnapshot.docs.length < LOGS_PER_PAGE) {
        setHasMore(false);
      }
    } catch (error) {
      console.error("발송결과 '더 보기' 로딩 오류:", error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  return (
    <div className="dispatch-log-container">
      <h3>문자/푸시 발송 결과</h3>
      <p>
        관리자가 발송한 단체/개별 메시지 및 푸시 알림의 발송 내역입니다.
      </p>

      {isLoading && <p>로그를 불러오는 중입니다...</p>}
      {!isLoading && (
        <table className="dispatch-log-table">
          <thead>
            <tr>
              <th className="col-time">발송일시</th>
              <th className="col-admin">발송 관리자</th>
              <th className="col-type">유형</th>
              <th className="col-count">대상(명)</th>
              <th className="col-message">메시지 내용 (요약)</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(log => (
              <tr key={log.id}>
                <td className="col-time">{formatLogTimestamp(log.timestamp)}</td>
                <td className="col-admin">{log.adminNickname}</td>
                <td className="col-type">{log.type}</td>
                <td className="col-count">{log.recipientCount}</td>
                <td className="col-message" title={log.message}>
                  {log.message.length > 50 ? `${log.message.slice(0, 50)}...` : log.message}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center' }}>발송 내역이 없습니다.</td>
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
          {isLoadingMore ? '로딩 중...' : '이전 내역 더 보기'}
        </button>
      )}
    </div>
  );
};

export default DispatchResultsSubTab;