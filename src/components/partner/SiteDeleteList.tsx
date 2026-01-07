import React, { useState, useEffect } from 'react';
import { 
  getFirestore, collection, getDocs, query, orderBy, doc, updateDoc, addDoc, serverTimestamp, Timestamp, deleteField, getDoc, deleteDoc 
} from 'firebase/firestore';
import { auth } from '../../firebase-config';
import './SiteDeleteList.css';
import { 
  Trash2, RefreshCw, AlertTriangle, CheckCircle, 
  Archive, FileText, ChevronDown 
} from 'lucide-react';

interface SiteData {
  uid: string;
  siteName: string;
  address: string;
  client1Name: string;
  status: string;
  createdAt: any;
  deletedAt?: any;
  permanentDeleteDate?: any;
}

interface Props {
  partnerUid: string | null;
}

const SiteDeleteList: React.FC<Props> = ({ partnerUid }) => {
  const [activeSites, setActiveSites] = useState<SiteData[]>([]);
  const [deletedSites, setDeletedSites] = useState<SiteData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [authorName, setAuthorName] = useState('직원');
  
  // 모바일 아코디언 상태
  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(new Set());

  const db = getFirestore();

  useEffect(() => {
    const init = async () => {
      if (!partnerUid) return;
      setIsLoading(true);
      
      if (auth.currentUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setAuthorName(userData.nickname || userData.name || '직원');
          }
        } catch (e) { console.error("사용자 정보 로딩 실패", e); }
      }

      await fetchSites();
      setIsLoading(false);
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerUid]);

  const fetchSites = async () => {
    try {
      const q = query(collection(db, 'users', partnerUid!, 'sites'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      
      const active: SiteData[] = [];
      const deleted: SiteData[] = [];
      const expiredIds: string[] = []; // 만료된 현장 ID 모음

      const now = new Date(); // 현재 시간

      snapshot.forEach(doc => {
        const data = { uid: doc.id, ...doc.data() } as SiteData;

        if (data.status === 'deleted') {
          // [핵심 로직] 영구 삭제 예정일이 지났는지 확인
          let isExpired = false;
          if (data.permanentDeleteDate) {
            const deleteDate = data.permanentDeleteDate.toDate ? data.permanentDeleteDate.toDate() : new Date(data.permanentDeleteDate);
            if (now > deleteDate) {
              isExpired = true;
              expiredIds.push(data.uid); // 삭제 대상 리스트에 추가
            }
          }

          // 만료되지 않은 것만 목록에 표시
          if (!isExpired) {
            deleted.push(data);
          }
        } else {
          active.push(data);
        }
      });

      // [자동 청소] 만료된 현장이 있다면 DB에서 영구 삭제 수행
      if (expiredIds.length > 0) {
        console.log(`유효기간이 만료된 현장 ${expiredIds.length}개를 자동으로 영구 삭제합니다.`);
        // 백그라운드에서 조용히 삭제 (사용자를 기다리게 하지 않음)
        Promise.all(expiredIds.map(id => deleteDoc(doc(db, 'users', partnerUid!, 'sites', id))))
          .catch(err => console.error("자동 삭제 중 오류:", err));
      }

      setActiveSites(active);
      setDeletedSites(deleted);
    } catch (err) {
      console.error(err);
      alert('목록을 불러오는 중 오류가 발생했습니다.');
    }
  };

  const handleDelete = async (site: SiteData) => {
    if (!window.confirm(`[${site.siteName}] 현장을 삭제하시겠습니까?\n(30일간 휴지통에 보관됩니다)`)) return;
    
    try {
      const now = new Date();
      const futureDate = new Date(now.setDate(now.getDate() + 30)); 

      await updateDoc(doc(db, 'users', partnerUid!, 'sites', site.uid), {
        status: 'deleted',
        deletedAt: serverTimestamp(),
        permanentDeleteDate: Timestamp.fromDate(futureDate)
      });

      await addDoc(collection(db, 'users', partnerUid!, 'activityLogs'), {
        type: '현장삭제',
        content: `[현장삭제] ${authorName} 사용자가 [${site.siteName}]을 삭제 했습니다. 30일 뒤 영구적으로 삭제 됩니다.`,
        relatedId: site.uid,
        partnerUid,
        performerUid: auth.currentUser?.uid,
        createdAt: serverTimestamp(),
        isRead: false
      });

      alert('삭제되었습니다.');
      fetchSites();
    } catch (e) {
      console.error(e);
      alert('오류가 발생했습니다.');
    }
  };

  const handleRestore = async (site: SiteData) => {
    if (!window.confirm(`[${site.siteName}] 현장을 복구하시겠습니까?`)) return;
    
    try {
      await updateDoc(doc(db, 'users', partnerUid!, 'sites', site.uid), {
        status: '미팅중', // 복구 시 기본 상태로 변경
        deletedAt: deleteField(),
        permanentDeleteDate: deleteField()
      });

      await addDoc(collection(db, 'users', partnerUid!, 'activityLogs'), {
        type: '현장복구',
        content: `[현장복구] ${authorName} 사용자가 [${site.siteName}]을 복구 했습니다.`,
        relatedId: site.uid,
        partnerUid,
        performerUid: auth.currentUser?.uid,
        createdAt: serverTimestamp(),
        isRead: false
      });

      alert('복구되었습니다.');
      fetchSites();
    } catch (e) {
      console.error(e);
      alert('오류가 발생했습니다.');
    }
  };

  const toggleExpand = (id: string) => {
    const newSet = new Set(expandedItemIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedItemIds(newSet);
  };

  const formatDate = (ts: any) => {
    if (!ts) return '-';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toISOString().split('T')[0];
  };

  if (isLoading) return <div className="sdl-loading"><div className="spinner"></div><p>로딩 중...</p></div>;

  return (
    <div className="sdl-container">
      {/* 1. Header */}
      <div className="sdl-header">
        <div className="sdl-title-area">
          <h2>현장 삭제 관리</h2>
          <p>운영 중인 현장을 삭제하거나, 휴지통에 있는 현장을 복구합니다.</p>
        </div>
      </div>

      {/* 2. Summary Grid (Added for Consistency) */}
      <div className="sdl-summary-grid">
        <div className="sdl-card summary">
          <div className="sdl-card-header"><FileText size={16} /> 운영 중</div>
          <div className="sdl-card-value text-success">{activeSites.length}개</div>
        </div>
        <div className="sdl-card summary">
          <div className="sdl-card-header"><Trash2 size={16} /> 휴지통</div>
          <div className="sdl-card-value text-danger">{deletedSites.length}개</div>
        </div>
      </div>

      {/* 3. Section: Active Sites */}
      <div className="sdl-section">
        <div className="sdl-section-header">
            <h3 className="text-success"><CheckCircle size={18} /> 운영 중인 현장</h3>
        </div>
        
        {/* Desktop Table */}
        <div className="sdl-desktop-view">
            <div className="sdl-table-container">
                <div className="sdl-table-wrapper">
                    <table className="sdl-table">
                        <colgroup>
                            <col style={{width:'100px'}} /> 
                            <col style={{width:'200px'}} /> 
                            <col /> 
                            <col style={{width:'120px'}} /> 
                            <col style={{width:'120px'}} /> 
                            <col style={{width:'100px'}} /> 
                        </colgroup>
                        <thead>
                            <tr>
                                <th className="text-center">상태</th>
                                <th>현장명</th>
                                <th>주소</th>
                                <th className="text-center">고객명</th>
                                <th className="text-center">생성일</th>
                                <th className="text-center">관리</th>
                            </tr>
                        </thead>
                        <tbody>
                            {activeSites.length === 0 ? (
                                <tr><td colSpan={6} className="sdl-no-data">삭제 가능한 현장이 없습니다.</td></tr>
                            ) : (
                                activeSites.map(site => (
                                    <tr key={site.uid}>
                                        <td className="text-center"><span className="sdl-badge active">{site.status}</span></td>
                                        <td className="font-bold">{site.siteName}</td>
                                        <td title={site.address}>{site.address}</td>
                                        <td className="text-center">{site.client1Name}</td>
                                        <td className="text-center text-secondary">{formatDate(site.createdAt)}</td>
                                        <td className="text-center">
                                            <button className="sdl-btn-mini delete" onClick={() => handleDelete(site)}>삭제</button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        {/* Mobile List (Accordion) */}
        <div className="sdl-mobile-view">
            {activeSites.length === 0 ? (
                <div className="sdl-no-data">삭제 가능한 현장이 없습니다.</div>
            ) : (
                activeSites.map(site => {
                    const isExpanded = expandedItemIds.has(site.uid);
                    return (
                        <div key={site.uid} className="sdl-mobile-card">
                            <div className="sdl-mobile-card-header" onClick={() => toggleExpand(site.uid)}>
                                <div className="sdl-mobile-header-left">
                                    <div className="site-row">
                                        <span className="sdl-badge active">{site.status}</span>
                                        <span className="site-name">{site.siteName}</span>
                                    </div>
                                    <span className="address">{site.address}</span>
                                </div>
                                <div className="sdl-mobile-header-right">
                                    <ChevronDown size={20} className={`sdl-chevron ${isExpanded ? 'open' : ''}`} />
                                </div>
                            </div>
                            
                            {isExpanded && (
                                <div className="sdl-mobile-expanded">
                                    <div className="sdl-mobile-body">
                                        <div className="sdl-info-row">
                                            <span className="label">고객명</span>
                                            <span className="value">{site.client1Name}</span>
                                        </div>
                                        <div className="sdl-info-row">
                                            <span className="label">생성일</span>
                                            <span className="value">{formatDate(site.createdAt)}</span>
                                        </div>
                                    </div>
                                    <div className="sdl-mobile-actions">
                                        <button className="sdl-btn-link delete" onClick={() => handleDelete(site)}>
                                            <Trash2 size={16} /> 삭제하기
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                })
            )}
        </div>
      </div>

      {/* 4. Section: Deleted Sites */}
      <div className="sdl-section">
        <div className="sdl-section-header">
            <h3 className="text-danger"><Archive size={18} /> 삭제 대기 (휴지통)</h3>
        </div>

        {/* Desktop Table */}
        <div className="sdl-desktop-view">
            <div className="sdl-table-container">
                <div className="sdl-table-wrapper">
                    <table className="sdl-table">
                        <colgroup>
                            <col style={{width:'200px'}} /> 
                            <col /> 
                            <col style={{width:'150px'}} /> 
                            <col style={{width:'150px'}} /> 
                            <col style={{width:'100px'}} /> 
                        </colgroup>
                        <thead>
                            <tr>
                                <th>현장명</th>
                                <th>주소</th>
                                <th className="text-center">삭제 요청일</th>
                                <th className="text-center">영구 삭제 예정</th>
                                <th className="text-center">관리</th>
                            </tr>
                        </thead>
                        <tbody>
                            {deletedSites.length === 0 ? (
                                <tr><td colSpan={5} className="sdl-no-data">휴지통이 비어있습니다.</td></tr>
                            ) : (
                                deletedSites.map(site => (
                                    <tr key={site.uid} className="row-deleted">
                                        <td className="text-tertiary line-through">{site.siteName}</td>
                                        <td className="text-tertiary" title={site.address}>{site.address}</td>
                                        <td className="text-center text-tertiary">{formatDate(site.deletedAt)}</td>
                                        <td className="text-center text-danger font-bold">
                                            {formatDate(site.permanentDeleteDate)}
                                        </td>
                                        <td className="text-center">
                                            <button className="sdl-btn-mini restore" onClick={() => handleRestore(site)}>복구</button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        {/* Mobile List (Accordion) */}
        <div className="sdl-mobile-view">
            {deletedSites.length === 0 ? (
                <div className="sdl-no-data">휴지통이 비어있습니다.</div>
            ) : (
                deletedSites.map(site => {
                    const isExpanded = expandedItemIds.has(site.uid);
                    return (
                        <div key={site.uid} className="sdl-mobile-card deleted">
                            <div className="sdl-mobile-card-header" onClick={() => toggleExpand(site.uid)}>
                                <div className="sdl-mobile-header-left">
                                    <div className="site-row">
                                        <span className="sdl-badge deleted">삭제됨</span>
                                        <span className="site-name line-through">{site.siteName}</span>
                                    </div>
                                    <span className="address">{site.address}</span>
                                </div>
                                <div className="sdl-mobile-header-right">
                                    <ChevronDown size={20} className={`sdl-chevron ${isExpanded ? 'open' : ''}`} />
                                </div>
                            </div>
                            
                            {isExpanded && (
                                <div className="sdl-mobile-expanded">
                                    <div className="sdl-mobile-body">
                                        <div className="sdl-info-row">
                                            <span className="label">삭제 요청일</span>
                                            <span className="value">{formatDate(site.deletedAt)}</span>
                                        </div>
                                        <div className="sdl-info-row">
                                            <span className="label text-danger">영구 삭제</span>
                                            <span className="value text-danger font-bold">{formatDate(site.permanentDeleteDate)}</span>
                                        </div>
                                    </div>
                                    <div className="sdl-mobile-actions">
                                        <button className="sdl-btn-link restore" onClick={() => handleRestore(site)}>
                                            <RefreshCw size={16} /> 복구하기
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                })
            )}
        </div>
      </div>

    </div>
  );
};

export default SiteDeleteList;