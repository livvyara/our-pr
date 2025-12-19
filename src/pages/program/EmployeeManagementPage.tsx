import React, { useState, useEffect, useCallback } from 'react';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore'; // updateDoc 등 필요시 추가
import { functions } from '../../firebase-config';
import { httpsCallable } from 'firebase/functions';
import './EmployeeManagementPage.css';

// --- [Icons] ---
const Icons = {
  Link: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  Copy: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  Trash: () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  UserPlus: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>,
  Search: () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
};

// --- [Types & Helpers] ---
const createInvitation = httpsCallable(functions, 'createCompanyInvitation');
const deleteSubPartner = httpsCallable(functions, 'deleteSubPartner');

interface SubPartnerData {
  uid: string;
  name: string;
  nickname: string;
  email: string;
  phone?: string;
  joinedAt?: any;
  rankId?: string; // [추가] 직급 ID
}

interface Rank {
  id: string;
  name: string;
  level: number;
}

// 기본 직급 (DB에 없을 경우 대비)
const defaultRanks: Rank[] = [
  { id: 'r1', name: '대표', level: 1 },
  { id: 'r2', name: '이사', level: 2 },
  { id: 'r3', name: '부장', level: 3 },
  { id: 'r4', name: '과장', level: 4 },
  { id: 'r5', name: '대리', level: 5 },
  { id: 'r6', name: '사원', level: 6 },
];

interface EmployeeManagementPageProps {
  partnerBusinessNumber: string;
  partnerUid?: string | null; // [추가] 직급 조회를 위해 필요
}

const EmployeeManagementPage: React.FC<EmployeeManagementPageProps> = ({ partnerBusinessNumber, partnerUid }) => {
  const db = getFirestore();
  
  // State
  const [subPartnerList, setSubPartnerList] = useState<SubPartnerData[]>([]);
  const [filteredList, setFilteredList] = useState<SubPartnerData[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]); // [추가] 직급 목록 상태
  
  const [isLoading, setIsLoading] = useState(false);
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // --- [Logic: Invite] ---
  const handleCreateInvitation = async () => {
    setIsCreatingLink(true);
    setGeneratedLink(null);
    try {
      const result: any = await createInvitation();
      if (result.data.success && result.data.inviteId) {
        const link = `${window.location.origin}/join-company/${result.data.inviteId}`;
        setGeneratedLink(link);
      } else {
        throw new Error(result.data.message || '초대 코드 생성 실패');
      }
    } catch (error: any) {
      alert(`초대 링크 생성 실패: ${error.message}`);
    } finally {
      setIsCreatingLink(false);
    }
  };

  const copyToClipboard = () => {
    if (!generatedLink) return;
    navigator.clipboard.writeText(generatedLink)
      .then(() => alert('초대 링크가 복사되었습니다.'))
      .catch(() => alert('복사 실패. 수동으로 복사해주세요.'));
  };

  // --- [Logic: Fetch Ranks] ---
  // 직급 데이터를 가져오는 함수
  const fetchRanks = useCallback(async () => {
    if (!partnerUid) {
      setRanks(defaultRanks);
      return;
    }
    try {
      const rankSnap = await getDocs(collection(db, `users/${partnerUid}/ranks`));
      if (!rankSnap.empty) {
        const fetchedRanks: Rank[] = [];
        rankSnap.forEach(doc => fetchedRanks.push(doc.data() as Rank));
        setRanks(fetchedRanks);
      } else {
        setRanks(defaultRanks);
      }
    } catch (e) {
      console.error("직급 로딩 실패:", e);
      setRanks(defaultRanks);
    }
  }, [db, partnerUid]);

  // --- [Logic: List & Search] ---
  const fetchSubPartners = useCallback(async () => {
    if (!partnerBusinessNumber) return;
    setIsLoading(true);
    try {
      // 1. 직원 목록 조회
      const usersRef = collection(db, 'users');
      const q = query(
        usersRef, 
        where("role", "==", "sub_partner"),
        where("partnerInfo.businessNumber", "==", partnerBusinessNumber)
      );
      const snapshot = await getDocs(q);
      const users: SubPartnerData[] = [];
      snapshot.forEach((doc) => {
        users.push({ uid: doc.id, ...doc.data() } as SubPartnerData);
      });
      // 이름순 정렬
      users.sort((a, b) => a.name.localeCompare(b.name));
      setSubPartnerList(users);
      setFilteredList(users);

      // 2. 직급 목록 조회 (병렬 처리 가능하지만 순차적으로 실행)
      await fetchRanks();

    } catch (error) {
      console.error("직원 목록 로드 실패:", error);
    } finally {
      setIsLoading(false);
    }
  }, [db, partnerBusinessNumber, fetchRanks]);

  useEffect(() => {
    fetchSubPartners();
  }, [fetchSubPartners]);

  useEffect(() => {
    const lowerTerm = searchTerm.toLowerCase();
    const filtered = subPartnerList.filter(user => 
      user.name.toLowerCase().includes(lowerTerm) || 
      user.email.toLowerCase().includes(lowerTerm) ||
      (user.nickname && user.nickname.toLowerCase().includes(lowerTerm))
    );
    setFilteredList(filtered);
  }, [searchTerm, subPartnerList]);

  // --- [Helper: Get Rank Name] ---
  const getRankName = (rankId?: string) => {
    if (!rankId) return '-';
    const rank = ranks.find(r => r.id === rankId);
    return rank ? rank.name : '-';
  };

  // --- [Logic: Delete] ---
  const handleDelete = async (employee: SubPartnerData) => {
    if (isDeleting) return;
    if (!window.confirm(`[${employee.name}]님을 직원 목록에서 삭제하시겠습니까?\n해당 계정은 일반 회원으로 전환됩니다.`)) return;

    setIsDeleting(employee.uid);
    try {
      await deleteSubPartner({ employeeUid: employee.uid });
      alert('삭제되었습니다.');
      fetchSubPartners(); // Refresh
    } catch (error: any) {
      console.error("삭제 오류:", error);
      alert(`삭제 실패: ${error.message}`);
    } finally {
      setIsDeleting(null);
    }
  };

  return (
    <div className="emp-page">
      <header className="emp-header">
        <div className="emp-header-content">
          <h2 className="emp-title">직원 관리</h2>
          <p className="emp-subtitle">초대 링크를 통해 직원을 등록하고, 소속된 구성원을 관리하세요.</p>
        </div>
      </header>

      <div className="emp-container">
        
        {/* Section 1: Invitation Card */}
        <section className="emp-section invite-section">
          <div className="emp-card invite-card">
            <div className="invite-content">
              <div className="invite-text">
                <h3>새로운 직원 초대하기</h3>
                <p>생성된 링크는 1회용이며, 직원이 가입 또는 로그인 후 수락하면 즉시 등록됩니다.</p>
              </div>
              <button 
                className={`btn-generate ${isCreatingLink ? 'loading' : ''}`}
                onClick={handleCreateInvitation}
                disabled={isCreatingLink}
              >
                {isCreatingLink ? (
                  <span className="spinner"></span>
                ) : (
                  <>
                    <Icons.UserPlus />
                    <span>초대 링크 생성</span>
                  </>
                )}
              </button>
            </div>

            {/* Generated Link Area */}
            <div className={`invite-result ${generatedLink ? 'visible' : ''}`}>
              <div className="link-box">
                <div className="link-icon"><Icons.Link /></div>
                <input type="text" readOnly value={generatedLink || ''} />
                <button className="btn-copy" onClick={copyToClipboard}>
                  <Icons.Copy />
                  <span>복사</span>
                </button>
              </div>
              <p className="link-caption">* 이 링크를 복사하여 초대할 직원에게 전달해주세요.</p>
            </div>
          </div>
        </section>

        {/* Section 2: Employee List */}
        <section className="emp-section list-section">
          <div className="list-header">
            <h3>등록된 직원 <span className="count">{subPartnerList.length}</span></h3>
            <div className="search-bar">
              <Icons.Search />
              <input 
                type="text" 
                placeholder="이름 또는 이메일 검색" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="emp-table-wrapper">
            {isLoading ? (
              <div className="emp-loading-state">
                <div className="spinner large"></div>
                <p>데이터를 불러오는 중입니다...</p>
              </div>
            ) : filteredList.length === 0 ? (
              <div className="emp-empty-state">
                <p>{searchTerm ? '검색 결과가 없습니다.' : '등록된 직원이 없습니다.'}</p>
              </div>
            ) : (
              <div className="emp-list">
                {/* Desktop Header */}
                <div className="emp-list-header">
                  <div className="col name">이름</div>
                  <div className="col rank">직급</div> {/* [추가] 직급 컬럼 */}
                  <div className="col email">이메일</div>
                  <div className="col phone">연락처</div>
                  <div className="col action">관리</div>
                </div>
                
                {/* List Items */}
                {filteredList.map(emp => (
                  <div key={emp.uid} className="emp-item">
                    <div className="col name">
                      <span className="name-text">{emp.name}</span>
                      {emp.nickname && <span className="nickname-badge">{emp.nickname}</span>}
                    </div>
                    {/* [추가] 직급 데이터 표시 */}
                    <div className="col rank">
                      <span className="rank-text">{getRankName(emp.rankId)}</span>
                    </div>
                    <div className="col email">{emp.email}</div>
                    <div className="col phone">{emp.phone || '-'}</div>
                    <div className="col action">
                      <button 
                        className="btn-delete" 
                        onClick={() => handleDelete(emp)}
                        disabled={isDeleting === emp.uid}
                        title="직원 삭제"
                      >
                        {isDeleting === emp.uid ? '처리중...' : <><Icons.Trash /> 삭제</>}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

      </div>
    </div>
  );
};

export default EmployeeManagementPage;