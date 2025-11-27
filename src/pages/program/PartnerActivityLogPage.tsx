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

// [NEW] 로그 타입 한글 매핑 헬퍼
const getLogTypeLabel = (type: string) => {
    switch(type) {
        case 'hometax_scraping': return '홈택스 수집';
        case 'tax_invoice_update': return '세금계산서';
        case 'cash_receipt_update': return '현금영수증';
        case 'site_add': return '현장 추가';
        case '작업일지': return '작업일지';
        default: return type || '활동';
    }
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
    // 1. [직원/신규] 새로운 저장소 구독 (ACTIVITY_LOGS)
    // * 주의: 컬렉션 이름이 'activityLogs'인지 'ACTIVITY_LOGS'인지 확인 필요.
    //   앞서 만든 페이지에서는 'ACTIVITY_LOGS'로 저장했으므로 대문자로 맞춥니다.
    // ----------------------------------------------------------------
    const qNew = query(
      collection(db, 'users', partnerUid, 'ACTIVITY_LOGS'), // [수정] 대문자 컬렉션명
      orderBy('createdAt', 'desc')
    );

    const unsubscribeNew = onSnapshot(qNew, (snapshot) => {
      newSystemLogs = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          type: data.type || '활동',
          content: data.text || data.content || '', // text 필드 호환
          createdAt: data.createdAt,
          isRead: data.isRead
        };
      });
      mergeAndSetLogs();
    }, (error) => {
        // 기존 소문자 컬렉션(activityLogs)일 수도 있으므로 에러 시 폴백 가능하지만,
        // 여기서는 대문자로 통일했다고 가정합니다.
        console.warn("로그 로딩 에러:", error);
    });

    // ----------------------------------------------------------------
    // 2. [대표/기존] 옛날 저장소 구독 (기존 유지)
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
          type: '일반', 
          content: data.message, 
          createdAt: data.timestamp, 
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
      (log.type && getLogTypeLabel(log.type).toLowerCase().includes(lower)) ||
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
            <col style={{ width: '120px' }} />
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
              filteredLogs.map((log) => {
                const label = getLogTypeLabel(log.type);
                // 타입별 뱃지 스타일 지정
                let badgeClass = 'default';
                if (log.type.includes('hometax')) badgeClass = 'hometax';
                else if (log.type.includes('tax_invoice')) badgeClass = 'tax';
                else if (log.type.includes('cash_receipt')) badgeClass = 'cash';
                
                return (
                  <tr key={log.id}>
                    <td style={{ textAlign: 'center', color: '#666' }}>
                      {formatTime(log.createdAt)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`log-type-badge ${badgeClass}`}>
                        {label}
                      </span>
                    </td>
                    <td className="log-content-cell" title={log.content}>
                      {log.content}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PartnerActivityLogPage;