// src/components/partner/SiteList.tsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getFirestore, collection, getDocs, query, orderBy, Timestamp } from 'firebase/firestore';
import './SiteList.css'; 

type SiteStatus = '미팅중' | '계약대기' | '계약완료' | '공사전' | '공사중' | '공사완료' | '보류' | '취소' | 'deleted';

interface SiteData {
  uid: string;
  siteName: string;
  address: string;
  client1Name: string;
  client1Phone: string;
  budget: number;
  status: SiteStatus;
  createdAt: Timestamp;
}

interface SiteListProps {
  onSiteSelect: (siteId: string) => void;
  partnerUid: string; 
}

// 기본 정렬 순서 (deleted 제외)
const DEFAULT_STATUS_ORDER: SiteStatus[] = [
  '미팅중', '계약대기', '계약완료', '공사전', '공사중', '공사완료', '보류', '취소'
];

// 모든 상태값 (deleted 포함 - 노출 설정용)
const ALL_STATUSES: SiteStatus[] = [...DEFAULT_STATUS_ORDER, 'deleted'];

const timestampToDateString = (ts: Timestamp | null | undefined): string => {
  if (!ts) return '';
  return ts.toDate().toISOString().split('T')[0];
};
const formatNumberWithCommas = (num: number): string => {
  return num ? num.toLocaleString('ko-KR') : '0'; 
};

const SiteList: React.FC<SiteListProps> = ({ onSiteSelect, partnerUid }) => { 
  const [allSites, setAllSites] = useState<SiteData[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  // --- 정렬 순서 State ---
  const [currentOrder, setCurrentOrder] = useState<SiteStatus[]>(DEFAULT_STATUS_ORDER);
  const [isSortModalOpen, setIsSortModalOpen] = useState(false);
  const [tempOrder, setTempOrder] = useState<SiteStatus[]>(DEFAULT_STATUS_ORDER);

  // --- [추가] 노출 설정 State ---
  const [visibleStatuses, setVisibleStatuses] = useState<SiteStatus[]>(ALL_STATUSES); // 기본값: 모두 보임
  const [isVisibilityModalOpen, setIsVisibilityModalOpen] = useState(false);
  const [tempVisible, setTempVisible] = useState<SiteStatus[]>(ALL_STATUSES);

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
        sites.push({ uid: doc.id, ...doc.data() } as SiteData);
      });
      setAllSites(sites);
    } catch (error) {
      console.error("현장 목록 로딩 오류:", error);
      alert("현장 목록을 불러오는 데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [db, partnerUid]);

  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  // [핵심] 필터링 및 정렬 로직
  const processedSites = useMemo(() => {
    let result = [...allSites];

    // 1. 검색어 필터링
    if (searchTerm) {
      const lowerTerm = searchTerm.toLowerCase();
      result = result.filter(site =>
        site.siteName.toLowerCase().includes(lowerTerm) ||
        site.address.toLowerCase().includes(lowerTerm) ||
        site.client1Name.toLowerCase().includes(lowerTerm)
      );
    }

    // 2. [추가] 노출 설정 필터링 (체크 해제된 상태는 숨김)
    result = result.filter(site => visibleStatuses.includes(site.status));

    // 3. 사용자 지정 순서 정렬
    result.sort((a, b) => {
      // (A) deleted는 무조건 맨 아래 (만약 노출되어 있다면)
      const isDeletedA = a.status === 'deleted';
      const isDeletedB = b.status === 'deleted';

      if (isDeletedA && !isDeletedB) return 1;
      if (!isDeletedA && isDeletedB) return -1;
      if (isDeletedA && isDeletedB) return 0;

      // (B) 나머지 정렬
      const indexA = currentOrder.indexOf(a.status);
      const indexB = currentOrder.indexOf(b.status);
      const safeIndexA = indexA === -1 ? 999 : indexA;
      const safeIndexB = indexB === -1 ? 999 : indexB;

      return safeIndexA - safeIndexB;
    });

    return result;
  }, [allSites, searchTerm, currentOrder, visibleStatuses]);


  // --- 정렬 모달 핸들러 ---
  const openSortModal = () => {
    setTempOrder([...currentOrder]);
    setIsSortModalOpen(true);
  };
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
  const saveSortOrder = () => {
    setCurrentOrder(tempOrder);
    setIsSortModalOpen(false);
  };

  // --- [추가] 노출 변경 모달 핸들러 ---
  const openVisibilityModal = () => {
    setTempVisible([...visibleStatuses]); // 현재 설정 불러오기
    setIsVisibilityModalOpen(true);
  };
  const toggleVisibility = (status: SiteStatus) => {
    setTempVisible(prev => {
      if (prev.includes(status)) {
        return prev.filter(s => s !== status); // 체크 해제 (제거)
      } else {
        return [...prev, status]; // 체크 (추가)
      }
    });
  };
  const saveVisibility = () => {
    setVisibleStatuses(tempVisible);
    setIsVisibilityModalOpen(false);
  };

  return (
    <div className="site-list-container">
      
      {/* 헤더 (제목 + 버튼 그룹) */}
      <div className="list-header">
        <h2>현장 목록</h2>
        <div className="header-actions">
          {/* 정렬 변경 버튼 */}
          <button className="header-btn" onClick={openSortModal}>
            ⚙️ 정렬 순서 변경
          </button>
          {/* [추가] 노출 변경 버튼 */}
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
                <th>상태</th>
                <th>현장명</th>
                <th>주소</th>
                <th>고객명1</th>
                <th>연락처1</th>
                <th>공사 예산</th>
                <th>생성일</th>
              </tr>
            </thead>
            <tbody>
              {processedSites.map(site => (
                <tr 
                  key={site.uid} 
                  className={site.status === 'deleted' ? 'row-deleted' : ''}
                >
                  <td>
                    {site.status === 'deleted' ? '삭제대기' : site.status}
                  </td>
                  <td>
                    <button 
                      className="site-link-button" 
                      onClick={() => onSiteSelect(site.uid)}
                    >
                      {site.siteName}
                    </button>
                  </td>
                  <td>{site.address}</td>
                  <td>{site.client1Name}</td>
                  <td>{site.client1Phone}</td>
                  <td>{formatNumberWithCommas(site.budget)}</td>
                  <td>{timestampToDateString(site.createdAt)}</td>
                </tr>
              ))}
              {processedSites.length === 0 && (
                 <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '40px' }}> 
                    조건에 맞는 현장이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* --- [모달 1] 정렬 순서 변경 --- */}
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

      {/* --- [모달 2] 노출 변경 (추가됨) --- */}
      {isVisibilityModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h3>현장 노출 설정</h3>
            <ul className="modal-list">
              {ALL_STATUSES.map((status) => (
                <li key={status} className="modal-item">
                  <label className="visibility-label">
                    <input 
                      type="checkbox" 
                      checked={tempVisible.includes(status)}
                      onChange={() => toggleVisibility(status)}
                    />
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