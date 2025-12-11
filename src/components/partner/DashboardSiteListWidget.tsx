import React, { useEffect, useState } from 'react';
import { getFirestore, collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import './DashboardSiteListWidget.css';

// --- [High-End Icons] ---
const Icons = {
  Settings: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  More: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  ChevronRight: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>,
  Empty: () => <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#E5E7EB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
};

interface SiteData { id: string; siteName: string; address: string; client1Name: string; status: string; }
interface Props { partnerUid: string; currentUserId: string; }

const ALL_STATUSES = ['미팅중', '계약대기', '계약완료', '공사전', '공사중', '공사완료', '보류', '취소', 'deleted'];

const DashboardSiteListWidget: React.FC<Props> = ({ partnerUid }) => {
  const [sites, setSites] = useState<SiteData[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [visibleStatuses, setVisibleStatuses] = useState<string[]>([]);
  const [tempVisible, setTempVisible] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const navigate = useNavigate();
  const db = getFirestore();

  useEffect(() => {
    const savedFilter = localStorage.getItem(`dashboard_site_filter_${partnerUid}`);
    setVisibleStatuses(savedFilter ? JSON.parse(savedFilter) : ALL_STATUSES.filter(s => s !== 'deleted'));
  }, [partnerUid]);

  useEffect(() => {
    if (visibleStatuses.length === 0) return;
    const fetchSites = async () => {
      setLoading(true);
      try {
        const q = query(collection(db, 'users', partnerUid, 'sites'), orderBy('createdAt', 'desc'), limit(50));
        const snap = await getDocs(q);
        const list: SiteData[] = [];
        snap.forEach(d => {
          const data = d.data();
          const status = data.status || '미팅중';
          if (visibleStatuses.includes(status)) {
            list.push({ id: d.id, siteName: data.siteName, address: data.address, client1Name: data.client1Name, status });
          }
        });
        setSites(list.slice(0, 5)); // Widget shows top 5
      } catch (e) { console.error(e); } 
      finally { setLoading(false); }
    };
    fetchSites();
  }, [partnerUid, db, visibleStatuses]);

  const openModal = () => { setTempVisible([...visibleStatuses]); setIsModalOpen(true); };
  const toggleStatus = (status: string) => setTempVisible(prev => prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]);
  const saveVisibility = () => {
    setVisibleStatuses(tempVisible);
    localStorage.setItem(`dashboard_site_filter_${partnerUid}`, JSON.stringify(tempVisible));
    setIsModalOpen(false);
  };

  const getStatusClass = (status: string) => {
    if (['공사중', '계약완료', '공사전'].includes(status)) return 'active';
    if (['공사완료'].includes(status)) return 'done';
    if (['보류', '취소', 'deleted'].includes(status)) return 'gray';
    return 'default'; // 미팅중, 계약대기
  };

  return (
    <div className="ds-widget-container">
      
      {/* Header */}
      <div className="ds-header">
        <h3 className="ds-title">최근 현장</h3>
        <div className="ds-actions">
            <button className="ds-icon-btn" onClick={openModal} title="필터 설정"><Icons.Settings /></button>
            <button className="ds-icon-btn" onClick={() => navigate('/program/site-list')} title="더보기"><Icons.More /></button>
        </div>
      </div>

      {/* Body List */}
      <div className="ds-body">
        {loading ? (
            <div className="ds-loading"><div className="spinner"></div></div>
        ) : sites.length === 0 ? (
            <div className="ds-empty">
                <Icons.Empty />
                <span>표시할 현장이 없습니다.</span>
            </div>
        ) : (
            <div className="ds-list">
                {sites.map(site => (
                    <div key={site.id} className="ds-item" onClick={() => navigate(`/program/site-detail/${site.id}`)}>
                        <div className="ds-item-left">
                            <span className={`ds-status-dot ${getStatusClass(site.status)}`} />
                            <div className="ds-info">
                                <span className="ds-site-name">{site.siteName}</span>
                                {site.address && <span className="ds-address">{site.address}</span>}
                            </div>
                        </div>
                        <div className="ds-item-right">
                            <span className={`ds-badge ${getStatusClass(site.status)}`}>
                                {site.status === 'deleted' ? '삭제됨' : site.status}
                            </span>
                            {/* [Mobile Optimization] 고객명은 PC에서만 노출 */}
                            <span className="ds-client desktop-only">{site.client1Name}</span>
                            <span className="ds-arrow"><Icons.ChevronRight /></span>
                        </div>
                    </div>
                ))}
            </div>
        )}
      </div>

      {/* Filter Modal */}
      {isModalOpen && (
        <div className="ds-modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="ds-modal" onClick={e => e.stopPropagation()}>
            <div className="ds-modal-header">
                <h4>노출 현장 필터</h4>
                <button className="ds-close-btn" onClick={() => setIsModalOpen(false)}>&times;</button>
            </div>
            <div className="ds-modal-body">
                {ALL_STATUSES.map(status => (
                    <label key={status} className="ds-checkbox-row">
                        <input 
                            type="checkbox" 
                            checked={tempVisible.includes(status)} 
                            onChange={() => toggleStatus(status)} 
                        />
                        <span className="ds-checkbox-text">{status === 'deleted' ? '삭제대기' : status}</span>
                        <span className="ds-checkbox-custom"></span>
                    </label>
                ))}
            </div>
            <div className="ds-modal-footer">
                <button className="ds-btn-cancel" onClick={() => setIsModalOpen(false)}>취소</button>
                <button className="ds-btn-save" onClick={saveVisibility}>설정 저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardSiteListWidget;