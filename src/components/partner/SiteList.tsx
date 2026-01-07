import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  getFirestore, collection, getDocs, query, orderBy, Timestamp, 
  collectionGroup, where, onSnapshot 
} from 'firebase/firestore';
import './SiteList.css'; 
import SiteAddModal from './SiteAddModal';
import { 
  Search, Filter, Plus, Settings, Eye, ChevronDown, ChevronUp, 
  Building, Users, ArrowUp, ArrowDown 
} from 'lucide-react';

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
  
  const [meetingMap, setMeetingMap] = useState<Record<string, CellContent>>({});
  const [meetingDateMap, setMeetingDateMap] = useState<Record<string, Date>>({});
  const [recentMemoMap, setRecentMemoMap] = useState<Record<string, CellContent>>({}); 

  // 모바일 아코디언 상태
  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(new Set());

  const db = getFirestore();

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
                        const dateStr = data.meetingDate.slice(5);
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
    
    result.sort((a, b) => {
      const isDeletedA = a.status === 'deleted';
      const isDeletedB = b.status === 'deleted';
      if (isDeletedA && !isDeletedB) return 1;
      if (!isDeletedA && isDeletedB) return -1;
      if (isDeletedA && isDeletedB) return 0;

      const indexA = currentOrder.indexOf(a.status);
      const indexB = currentOrder.indexOf(b.status);
      if (indexA !== indexB) {
          return indexA - indexB;
      }

      if (a.status === '미팅중') {
          const dateA = meetingDateMap[a.uid];
          const dateB = meetingDateMap[b.uid];
          if (dateA && dateB) return dateA.getTime() - dateB.getTime();
          if (dateA) return -1;
          if (dateB) return 1;
      }

      const timeA = a.createdAt?.toMillis() || 0;
      const timeB = b.createdAt?.toMillis() || 0;
      return timeB - timeA;
    });
    
    return result;
  }, [allSites, searchTerm, currentOrder, visibleStatuses, meetingDateMap]);

  // 요약 정보 (디자인 통일성을 위해 추가)
  const summary = useMemo(() => {
      const total = processedSites.length;
      const active = processedSites.filter(s => ['공사중', '미팅중', '계약대기'].includes(s.status)).length;
      return { total, active };
  }, [processedSites]);

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

  const toggleExpand = (id: string) => {
    const newSet = new Set(expandedItemIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedItemIds(newSet);
  };

  return (
    <div className="slp-container">
      {/* 1. 헤더 */}
      <div className="slp-header">
        <div className="slp-title-area">
          <h2>현장 목록</h2>
          <p>등록된 현장을 조회하고 관리합니다.</p>
        </div>
      </div>

      {/* 2. 필터 패널 */}
      <div className="slp-filter-panel">
        <div className="slp-filter-row">
            <div className="slp-filter-item search">
                <Search size={18} className="search-icon"/>
                <input
                    type="text"
                    className="slp-input search"
                    placeholder="현장명, 주소, 고객명으로 검색"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            
            <div className="slp-action-group">
                <button className="slp-btn slp-btn-secondary" onClick={openSortModal}>
                    <Settings size={16} /> 정렬 순서
                </button>
                <button className="slp-btn slp-btn-secondary" onClick={openVisibilityModal}>
                    <Eye size={16} /> 노출 변경
                </button>
                <button className="slp-btn slp-btn-primary" onClick={() => setIsAddModalOpen(true)}>
                    <Plus size={16} /> 현장 추가
                </button>
            </div>
        </div>
      </div>

      {/* 3. 요약 카드 (Summary Grid) */}
      <div className="slp-summary-grid">
        <div className="slp-card summary">
          <div className="slp-card-header"><Building size={16} /> 전체 현장</div>
          <div className="slp-card-value">{summary.total}개</div>
        </div>
        <div className="slp-card summary">
          <div className="slp-card-header"><Users size={16} /> 진행 중</div>
          <div className="slp-card-value text-primary">{summary.active}개</div>
        </div>
      </div>
      
      {/* 4. 데스크탑 테이블 뷰 */}
      <div className="slp-desktop-view">
        <div className="slp-table-container">
            <div className="slp-table-wrapper">
                <table className="slp-table">
                    <thead>
                      <tr>
                        <th style={{width:'180px'}}>현장명</th>
                        <th style={{width:'100px'}} className="text-center">고객명</th>
                        <th style={{width:'140px'}} className="text-center">연락처</th>
                        <th>주소</th>
                        <th style={{width:'100px'}} className="text-center">상태</th>
                        <th style={{width:'200px'}}>미팅약속</th>
                        <th style={{width:'200px'}}>최근메모</th>
                      </tr>
                    </thead>
                    <tbody>
                      {isLoading ? (
                          <tr><td colSpan={7} className="slp-no-data">로딩 중...</td></tr>
                      ) : processedSites.length === 0 ? (
                          <tr><td colSpan={7} className="slp-no-data">조건에 맞는 현장이 없습니다.</td></tr>
                      ) : (
                        processedSites.map(site => (
                            <tr key={site.uid} className={site.status === 'deleted' ? 'row-deleted' : ''}>
                              <td>
                                <button className="slp-link-text" onClick={() => onSiteSelect(site.uid)}>
                                  {site.siteName}
                                </button>
                              </td>
                              <td className="text-center">{site.client1Name}</td>
                              <td className="text-center">{formatPhoneNumber(site.client1Phone)}</td>
                              <td title={site.address}>{site.address}</td>
                              <td className="text-center">
                                  <span className={`slp-badge status ${site.status}`}>
                                      {site.status === 'deleted' ? '삭제대기' : site.status}
                                  </span>
                              </td>
                              <td title={meetingMap[site.uid]?.full || ''}>
                                  {meetingMap[site.uid] ? (
                                      <span className="text-primary font-bold">{meetingMap[site.uid].display}</span>
                                  ) : <span className="text-tertiary">-</span>}
                              </td>
                              <td title={recentMemoMap[site.uid]?.full || ''}>
                                  {recentMemoMap[site.uid] ? (
                                      <span className="text-secondary">{recentMemoMap[site.uid].display}</span>
                                  ) : <span className="text-tertiary">-</span>}
                              </td>
                            </tr>
                        ))
                      )}
                    </tbody>
                </table>
            </div>
        </div>
      </div>

      {/* 5. 모바일 카드 뷰 (아코디언) */}
      <div className="slp-mobile-view">
        <div className="slp-mobile-list">
            {isLoading ? (
                <div className="slp-no-data">로딩 중...</div>
            ) : processedSites.length === 0 ? (
                <div className="slp-no-data">조건에 맞는 현장이 없습니다.</div>
            ) : (
                processedSites.map(site => {
                    const isExpanded = expandedItemIds.has(site.uid);
                    return (
                        <div key={site.uid} className={`slp-mobile-card ${site.status === 'deleted' ? 'deleted' : ''}`}>
                            <div className="slp-mobile-card-header" onClick={() => toggleExpand(site.uid)}>
                                <div className="slp-mobile-header-left">
                                    <div className="site-info-main">
                                        <span className="site-name" onClick={(e) => { e.stopPropagation(); onSiteSelect(site.uid); }}>
                                            {site.siteName}
                                        </span>
                                        <span className={`slp-badge status ${site.status}`}>
                                            {site.status === 'deleted' ? '삭제대기' : site.status}
                                        </span>
                                    </div>
                                    <span className="client-info">{site.client1Name} • {formatPhoneNumber(site.client1Phone)}</span>
                                </div>
                                <div className="slp-mobile-header-right">
                                    <ChevronDown size={20} className={`slp-chevron ${isExpanded ? 'open' : ''}`} />
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="slp-mobile-expanded">
                                    <div className="slp-mobile-body">
                                        <div className="slp-info-row">
                                            <span className="label">주소</span>
                                            <span className="value address">{site.address}</span>
                                        </div>
                                        <div className="slp-info-row">
                                            <span className="label">미팅약속</span>
                                            <span className="value text-primary">
                                                {meetingMap[site.uid] ? meetingMap[site.uid].display : '-'}
                                            </span>
                                        </div>
                                        <div className="slp-info-row">
                                            <span className="label">최근메모</span>
                                            <span className="value text-secondary">
                                                {recentMemoMap[site.uid] ? recentMemoMap[site.uid].display : '-'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="slp-mobile-actions">
                                        <button className="slp-btn-link primary" onClick={() => onSiteSelect(site.uid)}>
                                            상세 보기
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })
            )}
        </div>
      </div>

      {/* 모달: 현장 추가 */}
      {isAddModalOpen && <SiteAddModal partnerUid={partnerUid} onClose={() => setIsAddModalOpen(false)} onSuccess={() => fetchSites()} />}
      
      {/* 모달: 정렬 순서 */}
      {isSortModalOpen && (
        <div className="slp-modal-overlay" onClick={() => setIsSortModalOpen(false)}>
          <div className="slp-modal-paper" onClick={e => e.stopPropagation()}>
            <div className="slp-modal-header">
                <h3>상태값 정렬 순서</h3>
            </div>
            <ul className="slp-sort-list">
              {tempOrder.map((status, index) => (
                <li key={status} className="slp-sort-item">
                  <span>{index + 1}. {status}</span>
                  <div className="btn-group">
                    <button className="slp-icon-btn" onClick={() => moveSortItem(index, 'up')} disabled={index === 0}><ArrowUp size={16}/></button>
                    <button className="slp-icon-btn" onClick={() => moveSortItem(index, 'down')} disabled={index === tempOrder.length - 1}><ArrowDown size={16}/></button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="slp-modal-footer">
              <button className="slp-btn slp-btn-secondary" onClick={() => setIsSortModalOpen(false)}>취소</button>
              <button className="slp-btn slp-btn-primary" onClick={saveSortOrder}>저장</button>
            </div>
          </div>
        </div>
      )}

      {/* 모달: 노출 변경 */}
      {isVisibilityModalOpen && (
        <div className="slp-modal-overlay" onClick={() => setIsVisibilityModalOpen(false)}>
          <div className="slp-modal-paper" onClick={e => e.stopPropagation()}>
            <div className="slp-modal-header">
                <h3>현장 노출 설정</h3>
            </div>
            <ul className="slp-check-list">
              {ALL_STATUSES.map((status) => (
                <li key={status} className="slp-check-item">
                  <label>
                    <input type="checkbox" checked={tempVisible.includes(status)} onChange={() => toggleVisibility(status)} />
                    {status === 'deleted' ? '삭제대기' : status}
                  </label>
                </li>
              ))}
            </ul>
            <div className="slp-modal-footer">
              <button className="slp-btn slp-btn-secondary" onClick={() => setIsVisibilityModalOpen(false)}>취소</button>
              <button className="slp-btn slp-btn-primary" onClick={saveVisibility}>저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SiteList;