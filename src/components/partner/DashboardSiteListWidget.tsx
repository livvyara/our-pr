import React, { useEffect, useState } from 'react';
import { getFirestore, collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

interface SiteData {
  id: string;
  siteName: string;
  address: string;
  client1Name: string;
  status: string;
}

interface Props {
  partnerUid: string;
  currentUserId: string;
}

// 모든 상태값 정의
const ALL_STATUSES = [
  '미팅중', '계약대기', '계약완료', '공사전', '공사중', '공사완료', '보류', '취소', 'deleted'
];

const DashboardSiteListWidget: React.FC<Props> = ({ partnerUid }) => {
  const [sites, setSites] = useState<SiteData[]>([]);
  const [loading, setLoading] = useState(true);
  
  // 노출 설정 상태
  const [visibleStatuses, setVisibleStatuses] = useState<string[]>([]);
  const [tempVisible, setTempVisible] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const navigate = useNavigate();
  const db = getFirestore();

  // 1. 초기 로드: 로컬 스토리지에서 필터 설정 불러오기
  useEffect(() => {
    const savedFilter = localStorage.getItem(`dashboard_site_filter_${partnerUid}`);
    if (savedFilter) {
      setVisibleStatuses(JSON.parse(savedFilter));
    } else {
      // 기본값: 삭제됨을 제외한 모든 상태
      setVisibleStatuses(ALL_STATUSES.filter(s => s !== 'deleted'));
    }
  }, [partnerUid]);

  // 2. 현장 데이터 불러오기 (필터가 변경될 때마다 실행)
  useEffect(() => {
    if (visibleStatuses.length === 0) return; // 초기화 전이면 대기

    const fetchSites = async () => {
      setLoading(true);
      try {
        // 필터링 후 5개를 보여주기 위해 넉넉하게 50개를 가져옴 (클라이언트 필터링)
        const q = query(
          collection(db, 'users', partnerUid, 'sites'),
          orderBy('createdAt', 'desc'),
          limit(50) 
        );
        const snap = await getDocs(q);
        const list: SiteData[] = [];
        
        snap.forEach(d => {
          const data = d.data();
          const status = data.status || '미팅중';
          
          // 여기서 필터링 적용
          if (visibleStatuses.includes(status)) {
            list.push({
              id: d.id,
              siteName: data.siteName,
              address: data.address,
              client1Name: data.client1Name,
              status: status
            });
          }
        });

        // 상위 5개만 자름
        setSites(list.slice(0, 10));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    fetchSites();
  }, [partnerUid, db, visibleStatuses]);

  // 모달 열기
  const openModal = () => {
    setTempVisible([...visibleStatuses]);
    setIsModalOpen(true);
  };

  // 체크박스 토글
  const toggleStatus = (status: string) => {
    setTempVisible(prev => 
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
  };

  // 설정 저장
  const saveVisibility = () => {
    setVisibleStatuses(tempVisible);
    localStorage.setItem(`dashboard_site_filter_${partnerUid}`, JSON.stringify(tempVisible));
    setIsModalOpen(false);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      
      {/* 헤더 영역 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h3 style={{ margin: 0, fontSize: '16px', color: '#333' }}>최근 현장 목록</h3>
        
        <div className="dashboard-widget-header-actions">
            {/* 노출 설정 버튼 */}
            <button className="dashboard-btn-text" onClick={openModal}>
                👁️ 노출 설정
            </button>
            {/* 더보기 버튼 */}
            <button className="dashboard-btn-text" onClick={() => navigate('/program/site-list')}>
                더보기 +
            </button>
        </div>
      </div>

      {/* 테이블 영역 */}
      <div style={{ flex: 1, overflowX: 'auto' }}>
        <table className="dashboard-site-table">
          <colgroup>
            <col style={{ width: '80px' }} /> {/* 상태 */}
            <col /> {/* 현장명 */}
            <col style={{ width: '80px' }} /> {/* 고객 */}
          </colgroup>
          <thead>
            <tr>
              <th>상태</th>
              <th style={{ textAlign: 'left', paddingLeft: '10px' }}>현장명</th>
              <th>고객명</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={3} style={{ textAlign: 'center', padding: '20px', color: '#999' }}>로딩 중...</td></tr>
            ) : sites.length === 0 ? (
              <tr><td colSpan={3} style={{ textAlign: 'center', padding: '20px', color: '#999' }}>표시할 현장이 없습니다.</td></tr>
            ) : (
              sites.map(site => (
                <tr key={site.id}>
                  <td style={{ textAlign: 'center' }}>
                    <span className={`dashboard-status-badge ${site.status}`}>
                      {site.status === 'deleted' ? '삭제대기' : site.status}
                    </span>
                  </td>
                  <td style={{ paddingLeft: '10px' }}>
                    <button 
                      className="dashboard-link-text"
                      onClick={() => navigate(`/program/site-detail/${site.id}`)}
                    >
                      {site.siteName}
                    </button>
                    {site.address && (
                        <div style={{fontSize:'11px', color:'#888', marginTop:'2px', maxWidth:'150px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                            {site.address}
                        </div>
                    )}
                  </td>
                  <td style={{ textAlign: 'center', fontSize:'12px' }}>{site.client1Name}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 노출 설정 모달 */}
      {isModalOpen && (
        <div className="dashboard-modal-backdrop" onClick={() => setIsModalOpen(false)}>
          <div className="dashboard-modal-paper" onClick={e => e.stopPropagation()}>
            <h3 className="dashboard-modal-title">현장 노출 설정</h3>
            <ul className="dashboard-modal-list">
              {ALL_STATUSES.map((status) => (
                <li key={status} className="dashboard-modal-item">
                  <label className="dashboard-checkbox-label">
                    <input 
                        type="checkbox" 
                        checked={tempVisible.includes(status)} 
                        onChange={() => toggleStatus(status)} 
                    />
                    {status === 'deleted' ? '삭제대기' : status}
                  </label>
                </li>
              ))}
            </ul>
            <div className="dashboard-modal-footer">
              <button className="dashboard-btn-cancel" onClick={() => setIsModalOpen(false)}>취소</button>
              <button className="dashboard-btn-save" onClick={saveVisibility}>저장</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default DashboardSiteListWidget;