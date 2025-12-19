import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getFirestore, collection, getDocs, query, where, doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import './OrgManagementPage.css';

// ... (Icons 유지) ...
const Icons = {
  Plus: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Edit: () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  Trash: () => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  ChevronRight: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>,
  ChevronDown: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>,
  User: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Crown: () => <svg width="16" height="16" fill="none" stroke="#FFB02E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/></svg>,
  Badge: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.78 4.78 4 4 0 0 1-6.74 0 4 4 0 0 1-4.78-4.78z"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>,
  List: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
};

interface Rank { id: string; name: string; level: number; }
interface Member { uid: string; name: string; nickname?: string; email: string; phone?: string; rankId?: string; orgId?: string | null; }
interface Organization { id: string; name: string; parentId: string | null; managerUid: string | null; children?: Organization[]; }
interface OrgManagementPageProps { partnerUid: string | null; partnerBusinessNumber: string; }

const defaultRanks: Rank[] = [
  { id: 'r1', name: '대표', level: 1 },
  { id: 'r2', name: '이사', level: 2 },
  { id: 'r3', name: '부장', level: 3 },
  { id: 'r4', name: '과장', level: 4 },
  { id: 'r5', name: '대리', level: 5 },
  { id: 'r6', name: '사원', level: 6 },
];

const OrgManagementPage: React.FC<OrgManagementPageProps> = ({ partnerUid, partnerBusinessNumber }) => {
  const db = getFirestore();
  
  // State
  const [activeTab, setActiveTab] = useState<'org' | 'rank'>('org');
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [selectedRankId, setSelectedRankId] = useState<string | null>('all');
  const [isLoading, setIsLoading] = useState(true);

  // UI State
  const [expandedOrgIds, setExpandedOrgIds] = useState<Set<string>>(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'addOrg' | 'editOrg' | 'addMember' | 'addRank' | 'editRank' | 'changeRank' | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [targetMemberId, setTargetMemberId] = useState<string | null>(null);
  const [targetRankId, setTargetRankId] = useState<string | null>(null);

  // --- [Helper: Get Full Org Name] ---
  // [수정] 인자 타입에 undefined 추가하여 타입 오류 해결
  const getFullOrgName = useCallback((orgId: string | null | undefined) => {
    if (!orgId) return '부서 미정';
    
    const path: string[] = [];
    let currentId: string | null = orgId;
    let isRoot = false;

    // 트리 역추적
    while (currentId) {
      const org = orgs.find(o => o.id === currentId);
      if (!org) break;

      if (org.parentId === null) {
        isRoot = true; 
      } else {
        path.unshift(org.name); 
      }
      currentId = org.parentId;
    }

    if (path.length === 0 && isRoot) {
        const root = orgs.find(o => o.id === orgId);
        return root ? root.name : '본사';
    }

    return path.join(' ');
  }, [orgs]);

  // --- [Helper: Get Rank Level] ---
  const getRankLevel = useCallback((rankId: string | undefined | null) => {
    if (!rankId) return 999;
    const rank = ranks.find(r => r.id === rankId);
    return rank ? rank.level : 999;
  }, [ranks]);

  // --- [Data Fetching] ---
  const fetchData = useCallback(async () => {
    if (!partnerUid || !partnerBusinessNumber) return;
    setIsLoading(true);
    try {
      const fetchedMembers: Member[] = [];

      // 1. 대표 정보
      if (partnerUid) {
        const partnerSnap = await getDoc(doc(db, 'users', partnerUid));
        if (partnerSnap.exists()) {
            const pData = partnerSnap.data();
            fetchedMembers.push({
                uid: partnerSnap.id,
                name: pData.name || '대표',
                nickname: pData.nickname,
                email: pData.email,
                phone: pData.phone,
                rankId: pData.rankId || 'r1', 
                orgId: pData.orgId || null
            });
        }
      }

      // 2. 직원 목록
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where("role", "==", "sub_partner"), where("partnerInfo.businessNumber", "==", partnerBusinessNumber));
      const userSnap = await getDocs(q);
      
      userSnap.forEach((doc) => {
        if (doc.id !== partnerUid) {
            const data = doc.data();
            fetchedMembers.push({ 
              uid: doc.id, name: data.name, nickname: data.nickname, email: data.email, phone: data.phone,
              rankId: data.rankId || null, orgId: data.orgId || null    
            });
        }
      });
      setMembers(fetchedMembers);

      // 3. 조직도
      const orgSnap = await getDocs(collection(db, `users/${partnerUid}/organization`));
      const fetchedOrgs: Organization[] = [];
      orgSnap.forEach(doc => fetchedOrgs.push(doc.data() as Organization));
      if (fetchedOrgs.length > 0) {
        setOrgs(fetchedOrgs);
        const rootOrg = fetchedOrgs.find(o => o.parentId === null);
        if (rootOrg) { setSelectedOrgId(rootOrg.id); setExpandedOrgIds(new Set([rootOrg.id])); }
      } else {
        const rootOrg = { id: `o-${Date.now()}`, name: '본사', parentId: null, managerUid: partnerUid };
        setOrgs([rootOrg]);
        setSelectedOrgId(rootOrg.id);
        setDoc(doc(db, `users/${partnerUid}/organization`, rootOrg.id), rootOrg);
      }

      // 4. 직급
      const rankSnap = await getDocs(collection(db, `users/${partnerUid}/ranks`));
      if (!rankSnap.empty) {
          const fetchedRanks: Rank[] = [];
          rankSnap.forEach(doc => fetchedRanks.push(doc.data() as Rank));
          setRanks(fetchedRanks);
      } else {
          setRanks(defaultRanks);
          defaultRanks.forEach(r => setDoc(doc(db, `users/${partnerUid}/ranks`, r.id), r));
      }

    } catch (e) { console.error("데이터 로딩 실패:", e); } finally { setIsLoading(false); }
  }, [db, partnerUid, partnerBusinessNumber]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // --- [Data Helpers] ---
  const saveMemberUpdate = async (uid: string, data: Partial<Member>) => {
    if (!partnerUid) return;
    setMembers(prev => prev.map(m => m.uid === uid ? { ...m, ...data } : m));
    try { await updateDoc(doc(db, 'users', uid), data); } catch (e) { console.error("멤버 업데이트 실패", e); }
  };

  const saveOrgUpdate = async (newOrgs: Organization[]) => {
      setOrgs(newOrgs);
      newOrgs.forEach(async (org) => {
          await setDoc(doc(db, `users/${partnerUid}/organization`, org.id), org);
      });
  };

  // --- [Calculated Data] ---
  const orgTree = useMemo(() => {
    const buildTree = (parentId: string | null): Organization[] => {
      return orgs.filter(org => org.parentId === parentId).map(org => ({ ...org, children: buildTree(org.id) }));
    };
    return buildTree(null);
  }, [orgs]);

  const currentOrgMembers = useMemo(() => {
    if (!selectedOrgId) return [];
    return members
      .filter(m => m.orgId === selectedOrgId)
      .sort((a, b) => getRankLevel(a.rankId) - getRankLevel(b.rankId));
  }, [selectedOrgId, members, getRankLevel]);

  const currentOrg = orgs.find(o => o.id === selectedOrgId);

  const currentRank = useMemo(() => ranks.find(r => r.id === selectedRankId), [ranks, selectedRankId]);
  
  const currentRankMembers = useMemo(() => {
    let filtered = [];
    if (selectedRankId === 'all') {
        filtered = members;
    } else if (selectedRankId) {
        filtered = members.filter(m => m.rankId === selectedRankId);
    } else {
        return [];
    }
    return filtered.sort((a, b) => getRankLevel(a.rankId) - getRankLevel(b.rankId));
  }, [selectedRankId, members, getRankLevel]);

  const toggleExpand = (orgId: string) => {
    const newSet = new Set(expandedOrgIds);
    if (newSet.has(orgId)) newSet.delete(orgId); else newSet.add(orgId);
    setExpandedOrgIds(newSet);
  };

  // --- [Handlers] ---
  const handleSaveRank = async () => {
    if (!partnerUid || !formData.name) return;
    const rankLevel = Number(formData.level) || 99;
    if (modalType === 'addRank') {
        const newRank: Rank = { id: `r-${Date.now()}`, name: formData.name, level: rankLevel };
        setRanks(prev => [...prev, newRank]);
        await setDoc(doc(db, `users/${partnerUid}/ranks`, newRank.id), newRank);
    } else if (modalType === 'editRank' && targetRankId) {
        const updatedRank = { id: targetRankId, name: formData.name, level: rankLevel };
        setRanks(prev => prev.map(r => r.id === targetRankId ? updatedRank : r));
        await updateDoc(doc(db, `users/${partnerUid}/ranks`, targetRankId), { name: formData.name, level: rankLevel });
    }
    setIsModalOpen(false);
  };

  const handleDeleteRank = async () => {
    if (!partnerUid || !currentRank) return;
    if (members.some(m => m.rankId === currentRank.id)) {
        alert("현재 이 직급을 사용 중인 구성원이 있어 삭제할 수 없습니다."); return;
    }
    if (!confirm(`[${currentRank.name}] 직급을 삭제하시겠습니까?`)) return;
    setRanks(prev => prev.filter(r => r.id !== currentRank.id));
    await deleteDoc(doc(db, `users/${partnerUid}/ranks`, currentRank.id));
    setSelectedRankId('all');
  };

  const openEditRankModal = () => {
      if(!currentRank) return;
      setTargetRankId(currentRank.id);
      setFormData({ name: currentRank.name, level: currentRank.level });
      setModalType('editRank');
      setIsModalOpen(true);
  };

  const handleAddMember = (memberUid: string) => {
    if (!selectedOrgId) return;
    saveMemberUpdate(memberUid, { orgId: selectedOrgId });
    setIsModalOpen(false);
  };

  const handleRemoveMember = (memberUid: string) => {
    if(!confirm("이 부서에서 제외하시겠습니까?")) return;
    saveMemberUpdate(memberUid, { orgId: null });
    if (currentOrg?.managerUid === memberUid) {
        const newOrgs = orgs.map(o => o.id === selectedOrgId ? { ...o, managerUid: null } : o);
        saveOrgUpdate(newOrgs);
    }
  };

  const handleSetManager = (memberUid: string) => {
    if (!selectedOrgId) return;
    const newOrgs = orgs.map(o => o.id === selectedOrgId ? { ...o, managerUid: memberUid } : o);
    saveOrgUpdate(newOrgs);
  };

  const openChangeRankModal = (member: Member) => {
    setTargetMemberId(member.uid);
    setFormData({ rankId: member.rankId || '' });
    setModalType('changeRank');
    setIsModalOpen(true);
  };

  const handleChangeRank = () => {
    if (targetMemberId) {
        saveMemberUpdate(targetMemberId, { rankId: formData.rankId });
        setIsModalOpen(false);
        setTargetMemberId(null);
    }
  };

  const handleSaveOrg = async () => {
    if (modalType === 'addOrg') {
      const newOrg: Organization = { id: `o-${Date.now()}`, name: formData.name, parentId: selectedOrgId, managerUid: null, children: [] };
      const newOrgs = [...orgs, newOrg];
      await saveOrgUpdate(newOrgs);
      setExpandedOrgIds(prev => new Set(prev).add(selectedOrgId!));
    } else if (modalType === 'editOrg' && selectedOrgId) {
      const newOrgs = orgs.map(o => o.id === selectedOrgId ? { ...o, name: formData.name } : o);
      await saveOrgUpdate(newOrgs);
    }
    setIsModalOpen(false);
  };

  const handleDeleteOrg = () => {
    if (!selectedOrgId) return;
    if (window.confirm('정말 삭제하시겠습니까? 하위 부서 및 소속 직원 설정이 초기화됩니다.')) {
      const getDescendants = (id: string): string[] => {
          const children = orgs.filter(o => o.parentId === id);
          let ids = children.map(c => c.id);
          children.forEach(c => ids = [...ids, ...getDescendants(c.id)]);
          return ids;
      };
      const idsToDelete = [selectedOrgId, ...getDescendants(selectedOrgId)];
      const newOrgs = orgs.filter(o => !idsToDelete.includes(o.id));
      saveOrgUpdate(newOrgs); 
      idsToDelete.forEach(async (id) => {
          if (partnerUid) await deleteDoc(doc(db, `users/${partnerUid}/organization`, id));
      });
      members.filter(m => m.orgId && idsToDelete.includes(m.orgId)).forEach(m => {
          saveMemberUpdate(m.uid, { orgId: null });
      });
      setSelectedOrgId(null);
    }
  };

  const renderTreeItem = (org: Organization, depth: number = 0) => {
    const hasChildren = org.children && org.children.length > 0;
    const isExpanded = expandedOrgIds.has(org.id);
    const isSelected = selectedOrgId === org.id;
    return (
      <div key={org.id} className="org-tree-node">
        <div className={`org-tree-content ${isSelected ? 'selected' : ''}`} style={{ paddingLeft: `${depth * 20 + 12}px` }} onClick={() => setSelectedOrgId(org.id)}>
          <button className={`tree-toggle ${hasChildren ? '' : 'invisible'}`} onClick={(e) => { e.stopPropagation(); toggleExpand(org.id); }}>
            {isExpanded ? <Icons.ChevronDown /> : <Icons.ChevronRight />}
          </button>
          <span className="tree-name">{org.name}</span>
        </div>
        {isExpanded && hasChildren && <div className="org-tree-children">{org.children!.map(child => renderTreeItem(child, depth + 1))}</div>}
      </div>
    );
  };

  if (isLoading) return <div className="om-loading">데이터를 불러오는 중입니다...</div>;

  return (
    <div className="om-page">
      <header className="om-header">
        <div className="om-header-top">
          <h2 className="om-title">조직 및 직급 관리</h2>
          <p className="om-desc">회사의 조직 구조를 정의하고 구성원의 권한과 역할을 관리합니다.</p>
        </div>
        <div className="om-tabs">
          <button className={`om-tab ${activeTab === 'org' ? 'active' : ''}`} onClick={() => setActiveTab('org')}>조직도 관리</button>
          <button className={`om-tab ${activeTab === 'rank' ? 'active' : ''}`} onClick={() => setActiveTab('rank')}>직급 관리</button>
        </div>
      </header>

      <div className="om-container">
        {activeTab === 'org' ? (
          <div className="om-split-view">
            <aside className="om-sidebar">
              <div className="om-panel-header">
                <h3>조직도</h3>
                {selectedOrgId && (
                  <button className="om-icon-btn" onClick={() => { setModalType('addOrg'); setFormData({ name: '' }); setIsModalOpen(true); }} title="하위 부서 추가">
                    <Icons.Plus />
                  </button>
                )}
              </div>
              <div className="om-tree-wrapper">
                {orgs.length > 0 ? orgTree.map(org => renderTreeItem(org)) : <div className="om-empty-tree">조직도가 없습니다.</div>}
              </div>
            </aside>

            <main className="om-detail">
              {selectedOrgId && currentOrg ? (
                <>
                  <div className="om-detail-header">
                    <div className="om-dh-left">
                      <span className="om-org-badge">부서</span>
                      <h2>{currentOrg.name}</h2>
                    </div>
                    <div className="om-dh-actions">
                      <button className="btn-secondary" onClick={() => { setModalType('editOrg'); setFormData({ name: currentOrg.name }); setIsModalOpen(true); }}>수정</button>
                      <button className="btn-danger-text" onClick={handleDeleteOrg}>삭제</button>
                    </div>
                  </div>

                  <div className="om-section">
                    <div className="om-section-header"><h4>부서 관리자</h4></div>
                    <div className="om-manager-card">
                      <div className="om-avatar-placeholder manager"><Icons.Crown /></div>
                      <div className="om-mc-info">
                        {currentOrg.managerUid ? (
                          <>
                            <span className="name">{members.find(m => m.uid === currentOrg.managerUid)?.name}</span>
                            <span className="meta">{ranks.find(r => r.id === members.find(m => m.uid === currentOrg.managerUid)?.rankId)?.name || '직급 미정'}</span>
                          </>
                        ) : <span className="empty-text">관리자가 설정되지 않았습니다.</span>}
                      </div>
                    </div>
                  </div>

                  <div className="om-section flex-grow">
                    <div className="om-section-header row">
                      <h4>구성원 <span className="count">{currentOrgMembers.length}</span></h4>
                      <button className="btn-primary small" onClick={() => { setModalType('addMember'); setIsModalOpen(true); }}>
                        <Icons.Plus /> 구성원 추가
                      </button>
                    </div>
                    <div className="om-member-list">
                      {currentOrgMembers.length === 0 ? (
                        <div className="om-empty-state">구성원이 없습니다.</div>
                      ) : (
                        currentOrgMembers.map(member => (
                          <div key={member.uid} className="om-member-item">
                            <div className="om-mi-profile">
                              <div className="om-avatar-placeholder"><Icons.User /></div>
                              <div className="om-mi-text">
                                <span className="name">{member.name} {member.uid === currentOrg.managerUid && <Icons.Crown />}</span>
                                <span className="id">{member.email}</span>
                              </div>
                            </div>
                            <div className="om-mi-meta">
                              <button className="rank-badge-btn" onClick={() => openChangeRankModal(member)}>
                                {ranks.find(r => r.id === member.rankId)?.name || '직급없음'} <Icons.Edit />
                              </button>
                            </div>
                            <div className="om-mi-actions">
                              {member.uid !== currentOrg.managerUid && (
                                <button className="btn-text" onClick={() => handleSetManager(member.uid)}>관리자 지정</button>
                              )}
                              <button className="btn-icon-danger" onClick={() => handleRemoveMember(member.uid)}><Icons.Trash /></button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="om-empty-selection"><p>좌측에서 부서를 선택하거나 생성해주세요.</p></div>
              )}
            </main>
          </div>
        ) : (
          <div className="om-split-view">
            {/* Left: Rank List */}
            <aside className="om-sidebar">
              <div className="om-panel-header">
                <h3>직급 목록</h3>
                <button className="om-icon-btn" onClick={() => { setModalType('addRank'); setFormData({ name: '', level: ranks.length + 1 }); setIsModalOpen(true); }} title="직급 추가">
                    <Icons.Plus />
                </button>
              </div>
              <div className="om-tree-wrapper">
                <div 
                    className={`rank-list-item ${selectedRankId === 'all' ? 'selected' : ''}`}
                    onClick={() => setSelectedRankId('all')}
                >
                    <div className="rank-info">
                        <span className="level-badge all"><Icons.List /></span>
                        <span className="name">전체 직원 보기</span>
                    </div>
                    <span className="count-badge">{members.length}</span>
                </div>

                {ranks.sort((a,b) => a.level - b.level).map((rank) => (
                  <div 
                    key={rank.id} 
                    className={`rank-list-item ${selectedRankId === rank.id ? 'selected' : ''}`}
                    onClick={() => setSelectedRankId(rank.id)}
                  >
                    <div className="rank-info">
                        <span className="level-badge">Lv.{rank.level}</span>
                        <span className="name">{rank.name}</span>
                    </div>
                    <span className="count-badge">
                        {members.filter(m => m.rankId === rank.id).length}
                    </span>
                  </div>
                ))}
              </div>
            </aside>

            {/* Right: Rank Detail & Members */}
            <main className="om-detail">
                {selectedRankId === 'all' ? (
                    <>
                        <div className="om-detail-header">
                            <div className="om-dh-left">
                                <span className="om-org-badge">전체</span>
                                <h2>모든 임직원</h2>
                            </div>
                        </div>
                        <div className="om-section flex-grow">
                            <div className="om-section-header row">
                                <h4>총 인원 <span className="count">{members.length}</span></h4>
                            </div>
                            <div className="om-member-list">
                                {members.sort((a, b) => getRankLevel(a.rankId) - getRankLevel(b.rankId)).map(member => (
                                    <div key={member.uid} className="om-member-item">
                                        <div className="om-mi-profile">
                                            <div className="om-avatar-placeholder"><Icons.User /></div>
                                            <div className="om-mi-text">
                                                <span className="name">{member.name} {member.uid === partnerUid && <Icons.Crown />}</span>
                                                <span className="id">{member.email}</span>
                                            </div>
                                        </div>
                                        <div className="om-mi-meta">
                                            <span className="org-text">{getFullOrgName(member.orgId)}</span>
                                        </div>
                                        <div className="om-mi-actions">
                                            <button className="rank-badge-btn" onClick={() => openChangeRankModal(member)}>
                                                {ranks.find(r => r.id === member.rankId)?.name || '직급없음'} <Icons.Edit />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                ) : (selectedRankId && currentRank ? (
                    <>
                        <div className="om-detail-header">
                            <div className="om-dh-left">
                                <span className="om-org-badge">직급</span>
                                <h2>{currentRank.name}</h2>
                                <span className="level-text">Level {currentRank.level}</span>
                            </div>
                            <div className="om-dh-actions">
                                <button className="btn-secondary" onClick={openEditRankModal}>수정</button>
                                <button className="btn-danger-text" onClick={handleDeleteRank}>삭제</button>
                            </div>
                        </div>

                        <div className="om-section flex-grow">
                            <div className="om-section-header row">
                                <h4>해당 직급 구성원 <span className="count">{currentRankMembers.length}</span></h4>
                            </div>
                            <div className="om-member-list">
                                {currentRankMembers.length === 0 ? (
                                    <div className="om-empty-state">이 직급을 가진 직원이 없습니다.</div>
                                ) : (
                                    currentRankMembers.map(member => (
                                        <div key={member.uid} className="om-member-item">
                                            <div className="om-mi-profile">
                                                <div className="om-avatar-placeholder"><Icons.User /></div>
                                                <div className="om-mi-text">
                                                    <span className="name">{member.name} {member.uid === partnerUid && <Icons.Crown />}</span>
                                                    <span className="id">{member.email}</span>
                                                </div>
                                            </div>
                                            <div className="om-mi-meta">
                                                <span className="org-text">{getFullOrgName(member.orgId)}</span>
                                            </div>
                                            <div className="om-mi-actions">
                                                <button className="rank-badge-btn" onClick={() => openChangeRankModal(member)}>
                                                    직급 변경
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="om-empty-selection"><p>좌측에서 직급을 선택해주세요.</p></div>
                ))}
            </main>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="om-modal-overlay">
          <div className="om-modal">
            <div className="om-modal-header">
              <h3>
                {modalType === 'addOrg' && '하위 부서 생성'}
                {modalType === 'editOrg' && '부서명 수정'}
                {modalType === 'addMember' && '구성원 추가'}
                {modalType === 'addRank' && '새 직급 등록'}
                {modalType === 'editRank' && '직급 수정'}
                {modalType === 'changeRank' && '직급 변경'}
              </h3>
              <button className="close-btn" onClick={() => setIsModalOpen(false)}>✕</button>
            </div>
            
            <div className="om-modal-body">
              {(modalType === 'addOrg' || modalType === 'editOrg' || modalType === 'addRank' || modalType === 'editRank') && (
                <div className="form-group">
                  <label>명칭</label>
                  <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} autoFocus />
                </div>
              )}

              {(modalType === 'addRank' || modalType === 'editRank') && (
                <div className="form-group">
                  <label>레벨 (낮을수록 높은 직급)</label>
                  <input type="number" value={formData.level} onChange={e => setFormData({ ...formData, level: e.target.value })} placeholder="예: 1" />
                </div>
              )}

              {modalType === 'changeRank' && (
                <div className="form-group">
                    <label>직급 선택</label>
                    <div className="rank-select-grid">
                        {ranks.sort((a,b) => a.level - b.level).map(rank => (
                            <button 
                                key={rank.id}
                                className={`rank-option ${formData.rankId === rank.id ? 'selected' : ''}`}
                                onClick={() => setFormData({ ...formData, rankId: rank.id })}
                            >
                                <span className="lv">Lv.{rank.level}</span>
                                <span className="nm">{rank.name}</span>
                                {formData.rankId === rank.id && <Icons.Badge />}
                            </button>
                        ))}
                    </div>
                </div>
              )}

              {modalType === 'addMember' && (
                <div className="member-select-list">
                  {members.filter(m => m.orgId !== selectedOrgId).length === 0 ? <p className="om-empty-text">추가할 직원이 없습니다.</p> :
                      members.filter(m => m.orgId !== selectedOrgId).map(member => (
                        <div key={member.uid} className="select-item" onClick={() => handleAddMember(member.uid)}>
                          <div className="info">
                            <span className="name">{member.name}</span>
                            <span className="sub">{getFullOrgName(member.orgId)} · {ranks.find(r => r.id === member.rankId)?.name || '직급없음'}</span>
                          </div>
                          <button className="btn-sm-primary">선택</button>
                        </div>
                      ))
                  }
                </div>
              )}
            </div>

            {modalType !== 'addMember' && (
              <div className="om-modal-footer">
                <button className="btn-secondary" onClick={() => setIsModalOpen(false)}>취소</button>
                <button className="btn-primary" onClick={
                    modalType === 'changeRank' ? handleChangeRank : 
                    modalType?.includes('Rank') ? handleSaveRank :
                    modalType?.includes('Org') ? handleSaveOrg : 
                    () => setIsModalOpen(false)
                }>저장</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default OrgManagementPage;