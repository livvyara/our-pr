// src/components/partner/DashboardSiteListWidget.tsx

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  getFirestore, collection, query, where, orderBy, getDocs, Timestamp, doc, getDoc, updateDoc 
} from 'firebase/firestore';

// 현장 데이터 타입
interface SiteSummary {
  uid: string;
  siteName: string;
  client1Name: string;
  client1Phone: string;
  status: SiteStatus;
}

interface Props {
  partnerUid: string;       // 현장 데이터를 불러올 대표의 UID (데이터 소스)
  currentUserId: string;    // [⭐ 추가] 현재 로그인한 사용자의 UID (설정 저장 위치)
}

// 현장 상태값 및 '전체' 옵션 정의
type SiteStatus = '미팅중' | '계약대기' | '계약완료' | '공사전' | '공사중' | '공사완료' | '보류' | '취소' | 'deleted';

const ALL_STATUSES: SiteStatus[] = [
  '미팅중', '계약대기', '계약완료', '공사전', '공사중', 
  '공사완료', '보류', '취소', 'deleted'
];


const DashboardSiteListWidget: React.FC<Props> = ({ partnerUid, currentUserId }) => {
  const navigate = useNavigate();
  const db = getFirestore();
  
  // 데이터 상태
  const [allSites, setAllSites] = useState<SiteSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // [⭐ 수정/추가] 노출 설정 상태
  const [visibleStatuses, setVisibleStatuses] = useState<SiteStatus[]>(ALL_STATUSES);
  const [isVisModalOpen, setIsVisModalOpen] = useState(false);
  const [tempVisible, setTempVisible] = useState<SiteStatus[]>(ALL_STATUSES);


  // 1. 사용자 설정 불러오기 (최초 1회)
  useEffect(() => {
    const loadPreferences = async () => {
      const userRef = doc(db, 'users', currentUserId);
      const docSnap = await getDoc(userRef);
      if (docSnap.exists()) {
        const pref = docSnap.data().preferences?.dashboardSiteStatusFilter as SiteStatus[];
        if (pref && pref.length > 0) {
          setVisibleStatuses(pref);
        }
      }
    };
    loadPreferences();
  }, [db, currentUserId]);


  // 2. 데이터 조회 함수 (노출 설정에 따라 필터링)
  const fetchSites = useCallback(async () => {
    if (!partnerUid) return;

    setIsLoading(true);
    try {
      const sitesRef = collection(db, 'users', partnerUid, 'sites');
      
      // 상태값 필터링을 Firestore 쿼리로 처리할 경우 복잡해지므로,
      // 일단 모든 현장을 가져와 JS에서 필터링합니다 (대시보드 위젯 크기 고려)
      const q = query(sitesRef, orderBy('createdAt', 'desc')); 
      
      const snapshot = await getDocs(q);
      const siteList: SiteSummary[] = [];

      snapshot.forEach((doc) => {
        const data = doc.data();
        siteList.push({
          uid: doc.id,
          siteName: data.siteName || '-',
          client1Name: data.client1Name || '-',
          client1Phone: data.client1Phone || '-',
          status: data.status as SiteStatus,
        } as SiteSummary);
      });
      setAllSites(siteList);

    } catch (error) {
      console.error("대시보드 현장 목록 로딩 오류:", error);
    } finally {
      setIsLoading(false);
    }
  }, [partnerUid, db]);

  // visibleStatuses가 바뀔 때마다 목록 새로고침 (혹은 컴포넌트 마운트 시)
  useEffect(() => {
    fetchSites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchSites, visibleStatuses]); // visibleStatuses가 변경될 때마다 fetchSites를 실행

  // 3. JS 필터링 (메모이제이션)
  const filteredSites = useMemo(() => {
    return allSites.filter(site => visibleStatuses.includes(site.status));
  }, [allSites, visibleStatuses]);


  // 4. 핸들러 및 저장 로직
  const handleSiteClick = (siteId: string) => {
    navigate(`/program/site-detail/${siteId}`, { state: { viewAsAdmin: true, ownerUid: partnerUid } });
  };
  
  const openVisModal = () => {
    setTempVisible([...visibleStatuses]);
    setIsVisModalOpen(true);
  };

  const toggleVisibility = (status: SiteStatus) => {
    setTempVisible(prev => prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]);
  };

  const saveVisibility = async () => {
    // Firebase에 설정값 저장
    try {
      const userRef = doc(db, 'users', currentUserId);
      await updateDoc(userRef, {
        "preferences.dashboardSiteStatusFilter": tempVisible // 중첩 필드 업데이트
      });
      setVisibleStatuses(tempVisible); // 로컬 상태 업데이트
      alert('노출 설정이 저장되었습니다.');
    } catch (e) {
      console.error('설정 저장 실패:', e);
      alert('설정 저장에 실패했습니다.');
    } finally {
      setIsVisModalOpen(false);
    }
  };


  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h3 style={{ margin: 0, fontSize: '18px', color: '#333' }}>현장 목록</h3>
        
        {/* [⭐ 수정] 노출 변경 버튼 (드롭박스 대체) */}
        <button
          onClick={openVisModal}
          style={{ padding: '5px 10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px', background:'white', cursor:'pointer' }}
        >
          👁️ 노출 변경
        </button>
      </div>

      {/* 리스트 뷰 */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {isLoading ? (
          <p style={{ textAlign: 'center', color: '#999' }}>로딩 중...</p>
        ) : filteredSites.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#999', marginTop: '30px' }}>
            현재 설정된 상태의 현장이 없습니다.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #ddd' }}>
                <th style={{ textAlign: 'left', padding: '8px 0', width: '40%' }}>현장명</th>
                <th style={{ textAlign: 'left', padding: '8px 0', width: '30%' }}>고객명</th>
                <th style={{ textAlign: 'right', padding: '8px 0', width: '30%' }}>연락처</th>
              </tr>
            </thead>
            <tbody>
              {filteredSites.map((site) => (
                <tr key={site.uid} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '8px 0' }}>
                    <button
                      onClick={() => handleSiteClick(site.uid)}
                      style={{ background: 'none', border: 'none', padding: 0, color: '#007bff', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      {site.siteName}
                    </button>
                  </td>
                  <td style={{ padding: '8px 0' }}>{site.client1Name}</td>
                  <td style={{ padding: '8px 0', textAlign: 'right', color: '#666' }}>{site.client1Phone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* [⭐ 추가] 노출 변경 모달 */}
      {isVisModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 1001,
          display: 'flex', justifyContent: 'center', alignItems: 'center'
        }} onClick={() => setIsVisModalOpen(false)}>
          <div style={{
            background: 'white', padding: '20px', borderRadius: '8px', width: '300px',
            boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
          }} onClick={(e) => e.stopPropagation()}>
            <h3>현장 노출 설정 저장</h3>
            <ul style={{ listStyle: 'none', padding: 0, border: '1px solid #ddd', borderRadius: '4px', maxHeight: '300px', overflowY: 'auto', marginBottom: '20px' }}>
              {ALL_STATUSES.map((status) => (
                <li key={status} style={{ padding: '10px 15px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', width: '100%', cursor: 'pointer' }}>
                    <input type="checkbox" checked={tempVisible.includes(status)} onChange={() => toggleVisibility(status)} style={{ marginRight: '10px', transform: 'scale(1.2)' }} />
                    {status === 'deleted' ? '삭제대기' : status}
                  </label>
                </li>
              ))}
            </ul>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setIsVisModalOpen(false)} style={{ padding: '8px 15px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>취소</button>
              <button onClick={saveVisibility} style={{ padding: '8px 15px', background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>저장</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default DashboardSiteListWidget;