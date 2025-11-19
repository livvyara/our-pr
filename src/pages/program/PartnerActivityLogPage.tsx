import React, { useEffect, useState, useMemo } from 'react';
import { getFirestore, collection, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import './PartnerActivityLogPage.css'; 

// 통합된 로그 데이터 타입
interface LogData {
  id: string;
  type: string;
  content: string; // message와 content를 통합
  createdAt: any;  // timestamp와 createdAt을 통합
  isRead?: boolean;
}

interface Props {
  partnerUid: string | null;
}

const formatTime = (timestamp: any) => {
  if (!timestamp) return '-';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
};

const PartnerActivityLogPage: React.FC<Props> = ({ partnerUid }) => {
  const [logs, setLogs] = useState<LogData[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const db = getFirestore();

  useEffect(() => {
    if (!partnerUid) {
      setLoading(false);
      return;
    }

    // 데이터를 모을 임시 배열
    let newSystemLogs: LogData[] = [];
    let oldSystemLogs: LogData[] = [];

    const mergeAndSetLogs = () => {
      // 두 배열 합치기
      const allLogs = [...newSystemLogs, ...oldSystemLogs];
      
      // 중복 제거 (ID 기준)
      const uniqueLogs = allLogs.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
      
      // 최신순 정렬
      uniqueLogs.sort((a, b) => {
        const t1 = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const t2 = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return t2 - t1;
      });

      setLogs(uniqueLogs);
      setLoading(false);
    };

    // ----------------------------------------------------------------
    // 1. [직원/신규] 새로운 저장소 구독
    // 경로: users/{partnerUid}/activityLogs
    // ----------------------------------------------------------------
    const qNew = query(
      collection(db, 'users', partnerUid, 'activityLogs'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribeNew = onSnapshot(qNew, (snapshot) => {
      newSystemLogs = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          type: data.type || '활동',
          content: data.content,
          createdAt: data.createdAt,
          isRead: data.isRead
        };
      });
      mergeAndSetLogs();
    });

    // ----------------------------------------------------------------
    // 2. [대표/기존] 옛날 저장소 구독 (제공해주신 코드 기반)
    // 경로: adminActivityLogs (Logs가 붙음!)
    // 필드: adminUid (partnerUid가 아님!)
    // ----------------------------------------------------------------
    const qOld = query(
      collection(db, 'adminActivityLogs'),
      where('adminUid', '==', partnerUid),
      orderBy('timestamp', 'desc')
    );

    const unsubscribeOld = onSnapshot(qOld, (snapshot) => {
      oldSystemLogs = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          type: '일반', // 기존 로그엔 타입이 없으므로 기본값
          content: data.message, // message -> content 매핑
          createdAt: data.timestamp, // timestamp -> createdAt 매핑
          isRead: true
        };
      });
      mergeAndSetLogs();
    }, (err) => {
      console.warn("기존 로그 로딩 에러 (색인 필요시 링크 클릭):", err);
    });

    return () => {
      unsubscribeNew();
      unsubscribeOld();
    };
  }, [partnerUid, db]);


  // 검색 필터링
  const filteredLogs = useMemo(() => {
    if (!searchTerm) return logs;
    const lower = searchTerm.toLowerCase();
    return logs.filter(log => 
      (log.content && log.content.toLowerCase().includes(lower)) || 
      (log.type && log.type.toLowerCase().includes(lower)) ||
      formatTime(log.createdAt).includes(lower)
    );
  }, [logs, searchTerm]);

  if (loading) return <div style={{padding:'20px'}}>활동 로그 로딩 중...</div>;

  return (
    <div className="activity-log-list-container">
      <div className="activity-log-header-row">
        <h2>활동 로그</h2>
      </div>

      <input 
        type="text" 
        placeholder="내용, 날짜로 검색" 
        className="activity-log-search-bar"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />
      
      <div className="activity-log-table-wrapper">
        <table className="activity-log-table">
          <colgroup>
            <col style={{ width: '180px' }} />
            <col style={{ width: '100px' }} />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th>발생 일시</th>
              <th>구분</th>
              <th>활동 내용</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
                  기록된 활동 로그가 없습니다.
                </td>
              </tr>
            ) : (
              filteredLogs.map((log) => (
                <tr key={log.id}>
                  <td style={{ textAlign: 'center', color: '#666' }}>
                    {formatTime(log.createdAt)}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className={`log-type-badge ${log.type === '작업일지' ? 'worklog' : 'default'}`}>
                      {log.type}
                    </span>
                  </td>
                  <td className="log-content-cell" title={log.content}>
                    {log.content}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PartnerActivityLogPage;