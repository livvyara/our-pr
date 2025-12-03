import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  getFirestore, collection, query, orderBy, getDocs, doc, getDoc, updateDoc 
} from 'firebase/firestore';
import './DashboardSiteListWidget.css'; // [NEW] CSS 파일 임포트

interface SiteSummary {
  uid: string;
  siteName: string;
  client1Name: string;
  client1Phone: string;
  status: SiteStatus;
}

interface Props {
  partnerUid: string;
  currentUserId: string;
}

type SiteStatus = '미팅중' | '계약대기' | '계약완료' | '공사전' | '공사중' | '공사완료' | '보류' | '취소' | 'deleted';

const ALL_STATUSES: SiteStatus[] = [
  '미팅중', '계약대기', '계약완료', '공사전', '공사중', 
  '공사완료', '보류', '취소', 'deleted'
];

// 상태별 뱃지 스타일 매핑
const getStatusClass = (status: string) => {
  if (['공사중', '계약완료'].includes(status)) return 'status-active';
  if (['공사완료'].includes(status)) return 'status-done';
  if (['보류', '취소', 'deleted'].includes(status)) return 'status-gray';
  return 'status-default';
};

const DashboardSiteListWidget: React.FC<Props> = ({ partnerUid, currentUserId }) => {
  const navigate = useNavigate();
  const db = getFirestore();
  
  const [allSites, setAllSites] = useState<SiteSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [visibleStatuses, setVisibleStatuses] = useState<SiteStatus[]>(ALL_STATUSES);
  const [isVisModalOpen, setIsVisModalOpen] = useState(false);
  const [tempVisible, setTempVisible] = useState<SiteStatus[]>(ALL_STATUSES);

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

  const fetchSites = useCallback(async () => {
    if (!partnerUid) return;
    setIsLoading(true);
    try {
      const sitesRef = collection(db, 'users', partnerUid, 'sites');
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
        });
      });
      setAllSites(siteList);
    } catch (error) {
      console.error("현장 목록 로딩 오류:", error);
    } finally {
      setIsLoading(false);
    }
  }, [partnerUid, db]);

  useEffect(() => {
    fetchSites();
  }, [fetchSites, visibleStatuses]);

  const filteredSites = useMemo(() => {
    return allSites.filter(site => visibleStatuses.includes(site.status));
  }, [allSites, visibleStatuses]);

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
    try {
      const userRef = doc(db, 'users', currentUserId);
      await updateDoc(userRef, {
        "preferences.dashboardSiteStatusFilter": tempVisible
      });
      setVisibleStatuses(tempVisible);
      // alert('노출 설정이 저장되었습니다.'); // 불필요한 알림 제거 (UX 개선)
    } catch (e) {
      console.error('설정 저장 실패:', e);
      alert('설정 저장에 실패했습니다.');
    } finally {
      setIsVisModalOpen(false);
    }
  };

  return (
    <div className="widget-container">
      <div className="widget-header">
        <h3 className="widget-title">현장 목록</h3>
        <button onClick={openVisModal} className="btn-filter">
          <span className="icon-filter">⚙️</span> 필터 설정
        </button>
      </div>

      <div className="widget-body">
        {isLoading ? (
          <div className="loading-state">데이터를 불러오는 중...</div>
        ) : filteredSites.length === 0 ? (
          <div className="empty-state">
            <p>표시할 현장이 없습니다.</p>
            <span>필터 설정을 확인해보세요.</span>
          </div>
        ) : (
          <div className="site-list">
            {filteredSites.map((site) => (
              <div key={site.uid} className="site-item" onClick={() => handleSiteClick(site.uid)}>
                <div className="site-info-main">
                  <span className={`status-badge ${getStatusClass(site.status)}`}>{site.status}</span>
                  <strong className="site-name">{site.siteName}</strong>
                </div>
                <div className="site-info-sub">
                  <span className="client-name">{site.client1Name}</span>
                  <span className="client-phone">{site.client1Phone}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 필터 설정 모달 */}
      {isVisModalOpen && (
        <div className="filter-modal-overlay" onClick={() => setIsVisModalOpen(false)}>
          <div className="filter-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>현장 상태 필터</h4>
              <button className="btn-close" onClick={() => setIsVisModalOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <ul className="filter-list">
                {ALL_STATUSES.map((status) => (
                  <li key={status} className="filter-item">
                    <label className="checkbox-label">
                      <input 
                        type="checkbox" 
                        checked={tempVisible.includes(status)} 
                        onChange={() => toggleVisibility(status)} 
                      />
                      <span className="checkbox-text">{status === 'deleted' ? '삭제대기' : status}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
            <div className="modal-footer">
              <button onClick={() => setIsVisModalOpen(false)} className="btn-cancel">취소</button>
              <button onClick={saveVisibility} className="btn-save">적용하기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardSiteListWidget;