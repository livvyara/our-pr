import React, { useState, useEffect } from 'react';
import { 
  getFirestore, collection, getDocs, query, orderBy, doc, updateDoc, addDoc, serverTimestamp, Timestamp, deleteField, getDoc 
} from 'firebase/firestore';
import { auth } from '../../firebase-config';
import './SiteDeleteList.css';

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

      snapshot.forEach(doc => {
        const data = { uid: doc.id, ...doc.data() } as SiteData;
        if (data.status === 'deleted') {
          deleted.push(data);
        } else {
          active.push(data);
        }
      });

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
        status: '미팅중', // 복구 시 기본 상태로 변경 (필요 시 로직 수정 가능)
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

  const formatDate = (ts: any) => {
    if (!ts) return '-';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toISOString().split('T')[0];
  };

  if (isLoading) return <div style={{padding:'50px', textAlign:'center', color:'#888'}}>로딩 중...</div>;

  return (
    <div className="site-delete-page-container">
      {/* 헤더 영역 */}
      <div className="site-delete-header-wrapper">
        <div className="site-delete-title">
          <h2>현장 삭제 관리</h2>
          <p>운영 중인 현장을 삭제하거나, 휴지통에 있는 현장을 복구합니다.</p>
        </div>
      </div>

      {/* 1. 운영 중인 현장 */}
      <div className="site-delete-section-header active">
        <h3>운영 중인 현장</h3>
        <span className="site-delete-count-badge">{activeSites.length}</span>
      </div>

      <div className="site-delete-result-section">
        <div className="site-delete-table-wrapper">
          <table className="site-delete-table">
            <colgroup>
              <col style={{width:'100px'}} /> 
              <col /> 
              <col /> 
              <col style={{width:'120px'}} /> 
              <col style={{width:'120px'}} /> 
              <col style={{width:'80px'}} /> 
            </colgroup>
            <thead>
              <tr>
                <th>상태</th>
                <th>현장명</th>
                <th>주소</th>
                <th>고객명</th>
                <th>생성일</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {activeSites.length === 0 ? (
                <tr><td colSpan={6} className="site-delete-no-data">삭제 가능한 현장이 없습니다.</td></tr>
              ) : (
                activeSites.map(site => (
                  <tr key={site.uid}>
                    <td data-label="상태" style={{textAlign:'center'}}>{site.status}</td>
                    <td data-label="현장명">{site.siteName}</td>
                    <td data-label="주소">{site.address}</td>
                    <td data-label="고객명">{site.client1Name}</td>
                    <td data-label="생성일" style={{textAlign:'center'}}>{formatDate(site.createdAt)}</td>
                    <td data-label="관리" style={{textAlign:'center'}}>
                      <button className="site-delete-btn-mini delete" onClick={() => handleDelete(site)}>삭제</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. 삭제 대기 (휴지통) */}
      <div className="site-delete-section-header deleted">
        <h3>삭제 대기 (휴지통)</h3>
        <span className="site-delete-count-badge">{deletedSites.length}</span>
      </div>

      <div className="site-delete-result-section">
        <div className="site-delete-table-wrapper">
          <table className="site-delete-table">
            <colgroup>
              <col /> 
              <col /> 
              <col style={{width:'150px'}} /> 
              <col style={{width:'150px'}} /> 
              <col style={{width:'80px'}} /> 
            </colgroup>
            <thead>
              <tr>
                <th>현장명</th>
                <th>주소</th>
                <th>삭제 요청일</th>
                <th>영구 삭제 예정</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {deletedSites.length === 0 ? (
                <tr><td colSpan={5} className="site-delete-no-data">휴지통이 비어있습니다.</td></tr>
              ) : (
                deletedSites.map(site => (
                  <tr key={site.uid} style={{backgroundColor:'#fff5f5'}}>
                    <td data-label="현장명" style={{textDecoration:'line-through', color:'#888'}}>{site.siteName}</td>
                    <td data-label="주소" style={{color:'#888'}}>{site.address}</td>
                    <td data-label="삭제 요청일" style={{textAlign:'center', color:'#888'}}>{formatDate(site.deletedAt)}</td>
                    <td data-label="영구 삭제" style={{textAlign:'center', color:'#dc3545', fontWeight:'bold'}}>
                      {formatDate(site.permanentDeleteDate)}
                    </td>
                    <td data-label="관리" style={{textAlign:'center'}}>
                      <button className="site-delete-btn-mini restore" onClick={() => handleRestore(site)}>복구</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SiteDeleteList;