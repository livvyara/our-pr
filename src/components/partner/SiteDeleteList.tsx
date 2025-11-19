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
  
  // [⭐ 추가] 작성자(로그인한 사람) 닉네임 상태
  const [authorName, setAuthorName] = useState('직원');

  const db = getFirestore();

  // 1. 데이터 불러오기 및 작성자 정보 확인
  useEffect(() => {
    const init = async () => {
      if (!partnerUid) return;
      setIsLoading(true);
      
      // (1) 작성자 닉네임 가져오기
      if (auth.currentUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setAuthorName(userData.nickname || userData.name || '직원');
          }
        } catch (e) {
          console.error("사용자 정보 로딩 실패", e);
        }
      }

      // (2) 현장 목록 가져오기
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

  // 2. 현장 삭제 처리 (로그 메시지 수정됨)
  const handleDelete = async (site: SiteData) => {
    if (!window.confirm(`[${site.siteName}] 현장을 삭제하시겠습니까?\n(30일간 휴지통에 보관됩니다)`)) return;
    
    try {
      const now = new Date();
      const futureDate = new Date(now.setDate(now.getDate() + 30)); 

      // 상태 업데이트
      await updateDoc(doc(db, 'users', partnerUid!, 'sites', site.uid), {
        status: 'deleted',
        deletedAt: serverTimestamp(),
        permanentDeleteDate: Timestamp.fromDate(futureDate)
      });

      // [⭐ 로그 기록 수정됨]
      await addDoc(collection(db, 'users', partnerUid!, 'activityLogs'), {
        type: '현장삭제',
        // 요청하신 형식 적용
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

  // 3. 현장 복구 처리
  const handleRestore = async (site: SiteData) => {
    if (!window.confirm(`[${site.siteName}] 현장을 복구하시겠습니까?`)) return;
    
    try {
      await updateDoc(doc(db, 'users', partnerUid!, 'sites', site.uid), {
        status: '미팅중',
        deletedAt: deleteField(),
        permanentDeleteDate: deleteField()
      });

      // [⭐ 복구 로그도 통일성 있게 수정]
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

  if (isLoading) return <div style={{padding:'20px'}}>로딩 중...</div>;

  return (
    <div className="site-delete-container">
      <div className="section-header">
        <h2>현장 삭제 관리</h2>
        <p>운영 중인 현장을 삭제하거나, 휴지통에 있는 현장을 복구합니다.</p>
      </div>

      {/* 운영 중인 현장 */}
      <div className="list-section">
        <h3 style={{ color: '#28a745' }}>운영 중인 현장</h3>
        <div className="table-wrapper">
          <table className="delete-table">
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
                <tr><td colSpan={6} className="empty-cell">삭제 가능한 현장이 없습니다.</td></tr>
              ) : (
                activeSites.map(site => (
                  <tr key={site.uid}>
                    <td style={{textAlign:'center'}}>{site.status}</td>
                    <td>{site.siteName}</td>
                    <td>{site.address}</td>
                    <td>{site.client1Name}</td>
                    <td style={{textAlign:'center'}}>{formatDate(site.createdAt)}</td>
                    <td style={{textAlign:'center'}}>
                      <button className="btn-action delete" onClick={() => handleDelete(site)}>삭제</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 휴지통 */}
      <div className="list-section">
        <h3 style={{ color: '#dc3545', marginTop:'30px' }}>삭제 대기 (휴지통)</h3>
        <div className="table-wrapper">
          <table className="delete-table">
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
                <tr><td colSpan={5} className="empty-cell">휴지통이 비어있습니다.</td></tr>
              ) : (
                deletedSites.map(site => (
                  <tr key={site.uid} className="row-deleted">
                    <td style={{textDecoration:'line-through'}}>{site.siteName}</td>
                    <td>{site.address}</td>
                    <td style={{textAlign:'center'}}>{formatDate(site.deletedAt)}</td>
                    <td style={{textAlign:'center', color:'#dc3545', fontWeight:'bold'}}>
                      {formatDate(site.permanentDeleteDate)}
                    </td>
                    <td style={{textAlign:'center'}}>
                      <button className="btn-action restore" onClick={() => handleRestore(site)}>복구</button>
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