import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  getFirestore, collection, getDocs, query, orderBy, Timestamp, 
  collectionGroup, where, onSnapshot 
} from 'firebase/firestore';
import './SiteList.css'; 
import SiteAddModal from './SiteAddModal';

type SiteStatus = '미팅중' | '계약대기' | '계약완료' | '공사전' | '공사중' | '공사완료' | '보류' | '취소' | 'deleted';

interface SiteData {
  uid: string;
  siteName: string;
  address: string;
  client1Name: string;
  client1Phone: string;
  status: SiteStatus;
  createdAt: Timestamp;
}

interface SiteListProps {
  onSiteSelect: (siteId: string) => void;
  partnerUid: string; 
}

interface CellContent {
    display: string; 
    full: string;    
}

const DEFAULT_STATUS_ORDER: SiteStatus[] = [
  '미팅중', '계약대기', '계약완료', '공사전', '공사중', '공사완료', '보류', '취소'
];
const ALL_STATUSES: SiteStatus[] = [...DEFAULT_STATUS_ORDER, 'deleted'];

const formatPhoneNumber = (phone: string) => {
    if (!phone) return '';
    const clean = phone.replace(/[^0-9]/g, '');
    if (clean.length === 11) return clean.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
    if (clean.length === 10) return clean.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3'); 
    if (clean.length === 8) return clean.replace(/(\d{4})(\d{4})/, '$1-$2');
    return clean;
};

const SiteList: React.FC<SiteListProps> = ({ onSiteSelect, partnerUid }) => { 
  const [allSites, setAllSites] = useState<SiteData[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  const [currentOrder, setCurrentOrder] = useState<SiteStatus[]>(DEFAULT_STATUS_ORDER);
  const [isSortModalOpen, setIsSortModalOpen] = useState(false);
  const [tempOrder, setTempOrder] = useState<SiteStatus[]>(DEFAULT_STATUS_ORDER);
  const [visibleStatuses, setVisibleStatuses] = useState<SiteStatus[]>(ALL_STATUSES); 
  const [isVisibilityModalOpen, setIsVisibilityModalOpen] = useState(false);
  const [tempVisible, setTempVisible] = useState<SiteStatus[]>(ALL_STATUSES);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  
  // 데이터 상태
  const [meetingMap, setMeetingMap] = useState<Record<string, CellContent>>({});
  const [meetingDateMap, setMeetingDateMap] = useState<Record<string, Date>>({});
  const [recentMemoMap, setRecentMemoMap] = useState<Record<string, CellContent>>({}); 

  const db = getFirestore();

  // 1. 현장 목록 로딩
  const fetchSites = useCallback(async () => {
    setIsLoading(true);
    if (!partnerUid) {
      setIsLoading(false);
      return; 
    }
    
    const sitesCollectionRef = collection(db, 'users', partnerUid, 'sites');
    const q = query(sitesCollectionRef, orderBy("createdAt", "desc"));
    
    try {
      const querySnapshot = await getDocs(q);
      const sites: SiteData[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        sites.push({ uid: doc.id, ...data } as SiteData);
      });
      setAllSites(sites);
    } catch (error) {
      console.error("현장 목록 로딩 오류:", error);
    } finally {
      setIsLoading(false);
    }
  }, [db, partnerUid]);

  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  // [수정] 2. 미팅 일정 구독 (단독 쿼리)
  useEffect(() => {
    if (!partnerUid) return;
    
    const q = query(
        collectionGroup(db, 'memos'), 
        where('partnerUid', '==', partnerUid),
        where('memoType', '==', 'meeting')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
        const now = new Date();
        const siteNextMeeting: Record<string, { date: Date, data: CellContent }> = {};

        snapshot.forEach(doc => {
            const data = doc.data();
            
            // siteId 추출 (데이터 없으면 경로에서)
            let siteId = data.siteId;
            if (!siteId && doc.ref.parent.parent) {
                siteId = doc.ref.parent.parent.id;
            }
            if (!siteId) return;

            if (data.meetingDate && data.meetingTime) {
                const dateTimeStr = `${data.meetingDate}T${data.meetingTime}`;
                const meetingDate = new Date(dateTimeStr);

                if (meetingDate >= now) {
                    if (!siteNextMeeting[siteId] || meetingDate < siteNextMeeting[siteId].date) {
                        const dateStr = data.meetingDate.slice(5); // MM-DD
                        const contentStr = data.memoContent || '';
                        const shortContent = contentStr.length > 12 ? contentStr.substring(0, 12) + '..' : contentStr;
                        
                        siteNextMeeting[siteId] = {
                            date: meetingDate,
                            data: {
                                display: `${dateStr} ${data.meetingTime} ${shortContent}`,
                                full: `[일시] ${data.meetingDate} ${data.meetingTime}\n[내용] ${contentStr}`
                            }
                        };
                    }
                }
            }
        });

        const newMap: Record<string, CellContent> = {};
        const newDateMap: Record<string, Date> = {};
        Object.keys(siteNextMeeting).forEach(key => {
            newMap[key] = siteNextMeeting[key].data;
            newDateMap[key] = siteNextMeeting[key].date;
        });
        setMeetingMap(newMap);
        setMeetingDateMap(newDateMap);
    });

    return () => unsubscribe();
  }, [partnerUid, db]);

  // [수정] 3. 최근 메모 구독 (단독 쿼리 - 일반 메모)
  useEffect(() => {
    if (!partnerUid) return;

    const q = query(
        collectionGroup(db, 'memos'), 
        where('partnerUid', '==', partnerUid),
        where('memoType', '==', 'general')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
        const siteLastMemo: Record<string, { createdAt: number, data: CellContent }> = {};

        snapshot.forEach(doc => {
            const data = doc.data();
            let siteId = data.siteId;
            if (!siteId && doc.ref.parent.parent) {
                siteId = doc.ref.parent.parent.id;
            }
            if (!siteId) return;

            const createdTime = data.createdAt?.seconds || 0;
            if (!siteLastMemo[siteId] || createdTime > siteLastMemo[siteId].createdAt) {
                const content = data.memoContent || '(내용 없음)';
                const shortMemo = content.length > 15 ? content.substring(0, 15) + '..' : content;
                
                siteLastMemo[siteId] = {
                    createdAt: createdTime,
                    data: {
                        display: shortMemo,
                        full: content
                    }
                };
            }
        });

        const newMap: Record<string, CellContent> = {};
        Object.keys(siteLastMemo).forEach(key => {
            newMap[key] = siteLastMemo[key].data;
        });
        setRecentMemoMap(newMap);
    });

    return () => unsubscribe();
  }, [partnerUid, db]);


  const processedSites = useMemo(() => {
    let result = [...allSites];
    if (searchTerm) {
      const lowerTerm = searchTerm.toLowerCase();
      result = result.filter(site =>
        site.siteName.toLowerCase().includes(lowerTerm) ||
        site.address.toLowerCase().includes(lowerTerm) ||
        site.client1Name.toLowerCase().includes(lowerTerm)
      );
    }
    result = result.filter(site => visibleStatuses.includes(site.status));
    
    // [정렬 로직]
    result.sort((a, b) => {
      // 1. 삭제 대기 맨 뒤
      const isDeletedA = a.status === 'deleted';
      const isDeletedB = b.status === 'deleted';
      if (isDeletedA && !isDeletedB) return 1;
      if (!isDeletedA && isDeletedB) return -1;
      if (isDeletedA && isDeletedB) return 0;

      // 2. 상태 순서
      const indexA = currentOrder.indexOf(a.status);
      const indexB = currentOrder.indexOf(b.status);
      if (indexA !== indexB) {
          return indexA - indexB;
      }

      // 3. [중요] '미팅중' 상태 내부 정렬 (약속 가까운 순)
      if (a.status === '미팅중') {
          const dateA = meetingDateMap[a.uid];
          const dateB = meetingDateMap[b.uid];

          // 둘 다 약속 있으면 날짜순
          if (dateA && dateB) return dateA.getTime() - dateB.getTime();
          // 약속 있는 쪽을 위로
          if (dateA) return -1;
          if (dateB) return 1;
      }

      // 4. 기본 최신순
      const timeA = a.createdAt?.toMillis() || 0;
      const timeB = b.createdAt?.toMillis() || 0;
      return timeB - timeA;
    });
    
    return result;
  }, [allSites, searchTerm, currentOrder, visibleStatuses, meetingDateMap]);

  // Modal Handlers (기존 동일)
  const openSortModal = () => { setTempOrder([...currentOrder]); setIsSortModalOpen(true); };
  const moveSortItem = (index: number, direction: 'up' | 'down') => {
    const newOrder = [...tempOrder];
    if (direction === 'up') {
      if (index === 0) return;
      [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    } else {
      if (index === newOrder.length - 1) return;
      [newOrder[index + 1], newOrder[index]] = [newOrder[index], newOrder[index + 1]];
    }
    setTempOrder(newOrder);
  };
  const saveSortOrder = () => { setCurrentOrder(tempOrder); setIsSortModalOpen(false); };
  const openVisibilityModal = () => { setTempVisible([...visibleStatuses]); setIsVisibilityModalOpen(true); };
  const toggleVisibility = (status: SiteStatus) => {
    setTempVisible(prev => prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]);
  };
  const saveVisibility = () => { setVisibleStatuses(tempVisible); setIsVisibilityModalOpen(false); };

  return (
    <div className="site-list-container">
      
      <div className="list-header">
        <h2>현장 목록</h2>
        <div className="header-actions">
          <button className="header-btn add-btn" onClick={() => setIsAddModalOpen(true)}>
            + 현장 추가
          </button>
          <button className="header-btn" onClick={openSortModal}>
            ⚙️ 정렬 순서
          </button>
          <button className="header-btn" onClick={openVisibilityModal}>
            👁️ 노출 변경
          </button>
        </div>
      </div>
      
      <input
        type="text"
        placeholder="현장명, 주소, 고객명으로 검색"
        className="site-search-bar"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />

      {isLoading && <p>현장 목록을 불러오는 중입니다...</p>}
      
      {!isLoading && (
        <div className="site-table-wrapper">
          <table className="site-table">
            <thead>
              <tr>
                <th>현장명</th>
                <th>고객명1</th>
                <th>연락처1</th>
                <th>주소</th>
                <th>상태</th>
                <th>미팅약속</th>
                <th>최근메모</th>
              </tr>
            </thead>
            <tbody>
              {processedSites.map(site => (
                <tr key={site.uid} className={site.status === 'deleted' ? 'row-deleted' : ''}>
                  <td>
                    <button className="site-link-button" onClick={() => onSiteSelect(site.uid)}>
                      {site.siteName}
                    </button>
                  </td>
                  <td>{site.client1Name}</td>
                  <td>{formatPhoneNumber(site.client1Phone)}</td>
                  <td className="address-cell" title={site.address}>{site.address}</td>
                  
                  <td>
                      <span className={`status-badge ${site.status}`}>
                          {site.status === 'deleted' ? '삭제대기' : site.status}
                      </span>
                  </td>
                  
                  <td 
                    className="meeting-cell"
                    style={{
                        color: meetingMap[site.uid] ? '#1976d2' : '#ccc', 
                        fontWeight: meetingMap[site.uid] ? 'bold' : 'normal',
                        cursor: meetingMap[site.uid] ? 'help' : 'default'
                    }}
                    title={meetingMap[site.uid]?.full || ''}
                  >
                      {meetingMap[site.uid]?.display || '-'}
                  </td>

                  <td 
                    className="memo-cell"
                    title={recentMemoMap[site.uid]?.full || ''}
                    style={{ cursor: recentMemoMap[site.uid] ? 'help' : 'default' }}
                  >
                      {recentMemoMap[site.uid]?.display || '-'}
                  </td>
                </tr>
              ))}
              {processedSites.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px' }}>조건에 맞는 현장이 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {isAddModalOpen && <SiteAddModal partnerUid={partnerUid} onClose={() => setIsAddModalOpen(false)} onSuccess={() => fetchSites()} />}
      
      {isSortModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h3>상태값 정렬 순서</h3>
            <ul className="modal-list">
              {tempOrder.map((status, index) => (
                <li key={status} className="modal-item">
                  <span>{index + 1}. {status}</span>
                  <div className="sort-controls">
                    <button onClick={() => moveSortItem(index, 'up')} disabled={index === 0}>▲</button>
                    <button onClick={() => moveSortItem(index, 'down')} disabled={index === tempOrder.length - 1}>▼</button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="modal-footer">
              <button className="btn-close" onClick={() => setIsSortModalOpen(false)}>취소</button>
              <button className="btn-save" onClick={saveSortOrder}>저장</button>
            </div>
          </div>
        </div>
      )}

      {isVisibilityModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h3>현장 노출 설정</h3>
            <ul className="modal-list">
              {ALL_STATUSES.map((status) => (
                <li key={status} className="modal-item">
                  <label className="visibility-label">
                    <input type="checkbox" checked={tempVisible.includes(status)} onChange={() => toggleVisibility(status)} />
                    {status === 'deleted' ? '삭제대기' : status}
                  </label>
                </li>
              ))}
            </ul>
            <div className="modal-footer">
              <button className="btn-close" onClick={() => setIsVisibilityModalOpen(false)}>취소</button>
              <button className="btn-save" onClick={saveVisibility}>저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SiteList;