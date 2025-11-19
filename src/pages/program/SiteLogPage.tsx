// src/pages/program/SiteLogPage.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { getFirestore, collectionGroup, query, where, getDocs, orderBy } from 'firebase/firestore';
import './SiteLogPage.css'; // (CSS는 아래 제공)

interface WorkLogData {
  id: string;
  date: string;
  siteName: string;
  authorName: string;
  todayProcess: string;
  // ... 필요한 필드 추가
}

interface SiteLogPageProps {
  partnerUid: string; // 대표 UID
}

const SiteLogPage: React.FC<SiteLogPageProps> = ({ partnerUid }) => {
  const [logs, setLogs] = useState<WorkLogData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const db = getFirestore();

  useEffect(() => {
    if (!partnerUid) return;

    const fetchLogs = async () => {
      setIsLoading(true);
      try {
        // collectionGroup을 사용하여 모든 현장의 workLogs 조회
        const logsQuery = query(
          collectionGroup(db, 'workLogs'),
          where('partnerUid', '==', partnerUid),
          orderBy('date', 'desc')
        );

        const snapshot = await getDocs(logsQuery);
        const logList: WorkLogData[] = [];
        snapshot.forEach(doc => {
          logList.push({ id: doc.id, ...doc.data() } as WorkLogData);
        });
        setLogs(logList);

      } catch (error) {
        console.error("작업일지 로딩 실패:", error);
        // (인덱스 오류가 날 수 있음 - 콘솔 확인 필요)
      } finally {
        setIsLoading(false);
      }
    };

    fetchLogs();
  }, [partnerUid, db]);

  // 검색 필터링
  const filteredLogs = useMemo(() => {
    if (!searchTerm) return logs;
    return logs.filter(log => 
      log.siteName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.authorName.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [logs, searchTerm]);

  return (
    <div className="site-log-page">
      <h2>작업 일지 목록</h2>
      
      <div className="log-search-bar">
        <input 
          type="text" 
          placeholder="현장명 또는 작성자로 검색" 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {isLoading ? (
        <p>로딩 중...</p>
      ) : (
        <table className="log-table">
          <thead>
            <tr>
              <th>날짜</th>
              <th>현장명</th>
              <th>작성자</th>
              <th>금일 작업 내용 (요약)</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.map(log => (
              <tr key={log.id}>
                <td>{log.date}</td>
                <td style={{ fontWeight: 'bold' }}>{log.siteName}</td>
                <td>{log.authorName}</td>
                <td className="log-content-cell">
                    {log.todayProcess.length > 30 ? log.todayProcess.slice(0, 30) + '...' : log.todayProcess}
                </td>
                <td>
                   <button className="view-btn" onClick={() => alert('상세보기 기능 구현 예정')}>보기</button>
                </td>
              </tr>
            ))}
             {filteredLogs.length === 0 && (
                <tr><td colSpan={5} style={{textAlign:'center'}}>작업일지가 없습니다.</td></tr>
             )}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default SiteLogPage;