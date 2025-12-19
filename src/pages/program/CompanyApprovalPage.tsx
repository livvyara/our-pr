import React, { useState, useEffect, useMemo } from 'react';
import { getFirestore, collection, addDoc, query, orderBy, getDocs, doc, updateDoc, Timestamp, where } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import './CompanyApprovalPage.css';

// --- [Icons] ---
const Icons = {
  Pen: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>,
  CheckCircle: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  Clock: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  XCircle: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>,
  FileText: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
  Close: () => <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  User: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Calendar: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  Users: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
};

// --- [Types & Templates] ---
type ApprovalStatus = 'pending' | 'approved' | 'rejected';
type ApprovalType = 'general' | 'expense' | 'leave' | 'report' | 'apology';

const DOC_TEMPLATES: Record<ApprovalType, string> = {
  general: `1. 품의 목적:\n\n2. 상세 내용:\n\n3. 기대 효과:\n\n4. 소요 예산:`,
  expense: `1. 지출 금액: 원\n\n2. 지출 목적:\n\n3. 상세 내역:\n\n4. 계좌 정보:`,
  leave: `1. 휴가 종류: (연차/반차/병가)\n\n2. 사유:\n\n3. 비상 연락망:`,
  report: `1. 보고 개요:\n\n2. 주요 내용:\n\n3. 특이 사항:\n\n4. 향후 계획:`,
  apology: `1. 사건 발생 일시:\n\n2. 사건 내용:\n\n3. 발생 원인:\n\n4. 반성 및 재발 방지 대책:`
};

interface Approver {
  uid: string;
  name: string;
  level: 1 | 2 | 3;
  status: ApprovalStatus;
  comment?: string;
  processedAt?: any;
}

interface ApprovalDoc {
  id: string;
  title: string;
  content: string;
  type: ApprovalType;
  status: ApprovalStatus;
  requesterUid: string;
  requesterName: string;
  requesterOrgId?: string;
  approverLine: Approver[];
  referrerUids: string[];
  referrerOrgIds: string[];
  leaveStartDate?: string;
  leaveEndDate?: string;
  createdAt: any;
}

interface StaffData { 
  uid: string; 
  name: string; 
  orgId?: string | null; 
  totalLeave?: number;
  usedLeave?: number;
}

interface OrgData { id: string; name: string; parentId: string | null; managerUid: string | null; }

interface Props { partnerUid: string; }

const CompanyApprovalPage: React.FC<Props> = ({ partnerUid }) => {
  const db = getFirestore();
  const auth = getAuth();
  const currentUser = auth.currentUser;

  // State
  const [approvals, setApprovals] = useState<ApprovalDoc[]>([]);
  const [staffList, setStaffList] = useState<StaffData[]>([]);
  const [orgList, setOrgList] = useState<OrgData[]>([]);
  const [myOrgId, setMyOrgId] = useState<string | null>(null);
  const [myStaffData, setMyStaffData] = useState<StaffData | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'my_request'>('all');
  
  // Modals
  const [isWriteOpen, setIsWriteOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<ApprovalDoc | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [docType, setDocType] = useState<ApprovalType>('general');
  const [leaveStart, setLeaveStart] = useState('');
  const [leaveEnd, setLeaveEnd] = useState('');
  const [usingDays, setUsingDays] = useState<number>(0);
  
  // Approver Selection State
  const [approver1, setApprover1] = useState(''); 
  const [approver2, setApprover2] = useState(''); 
  const [approverFinal, setApproverFinal] = useState(''); 

  // Reference Selection State
  const [refUids, setRefUids] = useState<string[]>([]);
  const [refOrgIds, setRefOrgIds] = useState<string[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- [Data Fetching] ---
  useEffect(() => {
    fetchData();
  }, [partnerUid]);

  const fetchData = async () => {
    if (!partnerUid) return;
    setLoading(true);
    try {
      const q = query(collection(db, 'users', partnerUid, 'approvals'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() })) as ApprovalDoc[];
      setApprovals(list);

      const uQ = query(collection(db, 'users'), where('partnerInfo.ownerUid', '==', partnerUid));
      const uSnap = await getDocs(uQ);
      const staffs: StaffData[] = [];
      uSnap.forEach(d => {
          const data = d.data();
          const staffObj = { 
            uid: d.id, 
            name: data.name || '이름없음', 
            orgId: data.orgId || data.staffInfo?.orgId || null,
            totalLeave: data.staffInfo?.totalLeave || 0,
            usedLeave: data.staffInfo?.usedLeave || 0
          };
          staffs.push(staffObj);
          
          if (d.id === currentUser?.uid) {
              setMyOrgId(staffObj.orgId || null);
              setMyStaffData(staffObj);
          }
      });
      // 대표자 본인 체크 (필요시 추가)
      setStaffList(staffs);

      const oQ = query(collection(db, `users/${partnerUid}/organization`));
      const oSnap = await getDocs(oQ);
      const orgs = oSnap.docs.map(d => ({ id: d.id, ...d.data() } as OrgData));
      setOrgList(orgs);

    } catch (e) {
      console.error("데이터 로딩 실패", e);
    } finally {
      setLoading(false);
    }
  };

  // --- [Auto Approval Line & Template Logic] ---
  useEffect(() => {
    if (isWriteOpen) {
      calculateDefaultLine();
      // [FIX] 결재 종류 변경 시 템플릿 즉시 적용
      setContent(DOC_TEMPLATES[docType]);
    }
  }, [docType, isWriteOpen]);

  // [NEW] 휴가 사용 일수 자동 계산
  useEffect(() => {
    if (leaveStart && leaveEnd) {
        const start = new Date(leaveStart);
        const end = new Date(leaveEnd);
        start.setHours(0,0,0,0);
        end.setHours(0,0,0,0);

        if (end >= start) {
            const diffTime = Math.abs(end.getTime() - start.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; 
            setUsingDays(diffDays);
        } else {
            setUsingDays(0);
        }
    } else {
        setUsingDays(0);
    }
  }, [leaveStart, leaveEnd]);

  const calculateDefaultLine = () => {
    if (!currentUser) return;
    if (currentUser.uid === partnerUid) {
        setApprover1(''); setApprover2(''); setApproverFinal(partnerUid);
        return;
    }

    let sugApp1 = '';
    let sugAppFinal = partnerUid;

    const myOrg = orgList.find(o => o.id === myOrgId);
    if (myOrg) {
        if (myOrg.managerUid && myOrg.managerUid !== currentUser.uid) {
            sugApp1 = myOrg.managerUid;
        } else if (myOrg.parentId) {
            const parentOrg = orgList.find(o => o.id === myOrg.parentId);
            if (parentOrg && parentOrg.managerUid) {
                sugApp1 = parentOrg.managerUid;
            }
        }
    }
    setApprover1(sugApp1);
    setApprover2('');
    setApproverFinal(sugAppFinal);
  };

  // --- [Filtering] ---
  const filteredApprovals = useMemo(() => {
    if (!currentUser) return [];
    return approvals.filter(doc => {
      if (activeTab === 'my_request') return doc.requesterUid === currentUser.uid;
      if (activeTab === 'pending') {
        const myTurn = doc.approverLine.find(a => a.uid === currentUser.uid && a.status === 'pending');
        if (!myTurn) return false;
        if (myTurn.level === 1) return true;
        const prevApprover = doc.approverLine.find(a => a.level === myTurn.level - 1);
        return prevApprover?.status === 'approved';
      }
      if (currentUser.uid === partnerUid) return true;
      const isRequester = doc.requesterUid === currentUser.uid;
      const isApprover = doc.approverLine.some(a => a.uid === currentUser.uid);
      const isReferrerUser = doc.referrerUids?.includes(currentUser.uid);
      const isReferrerOrg = myOrgId && doc.referrerOrgIds?.includes(myOrgId);
      return isRequester || isApprover || isReferrerUser || isReferrerOrg;
    });
  }, [approvals, activeTab, currentUser, myOrgId, partnerUid]);

  // --- [Actions] ---
  const handleWrite = async () => {
    if (!title || !content || !approverFinal) {
      alert("제목, 내용, 최종 결재자는 필수입니다."); return;
    }
    if (docType === 'leave' && (!leaveStart || !leaveEnd)) {
        alert("휴가 기간을 선택해주세요."); return;
    }
    if (!currentUser) return;

    setIsSubmitting(true);
    try {
      const line: Approver[] = [];
      if (approver1) line.push({ uid: approver1, name: getName(approver1), level: 1, status: 'pending' });
      if (approver2) line.push({ uid: approver2, name: getName(approver2), level: 2, status: 'pending' });
      const finalLevel = (line.length + 1) as 1|2|3; 
      line.push({ uid: approverFinal, name: getName(approverFinal), level: finalLevel, status: 'pending' });

      await addDoc(collection(db, 'users', partnerUid, 'approvals'), {
        title, content, type: docType,
        status: 'pending',
        requesterUid: currentUser.uid,
        requesterName: currentUser.displayName || '이름없음',
        requesterOrgId: myOrgId || null,
        approverLine: line,
        referrerUids: refUids,
        referrerOrgIds: refOrgIds,
        leaveStartDate: docType === 'leave' ? leaveStart : null,
        leaveEndDate: docType === 'leave' ? leaveEnd : null,
        createdAt: Timestamp.now(),
      });

      alert("결재가 상신되었습니다.");
      setIsWriteOpen(false);
      resetForm();
      fetchData();
    } catch (e) {
      console.error(e); alert("오류 발생");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProcess = async (status: 'approved' | 'rejected') => {
    if (!selectedDoc || !currentUser) return;
    if (!confirm(status === 'approved' ? "승인하시겠습니까?" : "반려하시겠습니까?")) return;

    try {
        const newLine = selectedDoc.approverLine.map(a => {
            if (a.uid === currentUser.uid && a.status === 'pending') {
                return { ...a, status, processedAt: Timestamp.now() };
            }
            return a;
        });

        let docStatus: ApprovalStatus = 'pending';
        if (status === 'rejected') docStatus = 'rejected';
        else {
            const isAllApproved = newLine.every(a => a.status === 'approved');
            if (isAllApproved) {
                docStatus = 'approved';
                // [Optional] 휴가 승인 시 사용자 usedLeave 증가 로직 추가 가능 (여기서는 생략)
            }
        }

        await updateDoc(doc(db, 'users', partnerUid, 'approvals', selectedDoc.id), {
            approverLine: newLine,
            status: docStatus
        });

        alert("처리되었습니다.");
        setIsDetailOpen(false);
        fetchData();
    } catch (e) {
        console.error(e); alert("오류 발생");
    }
  };

  const getName = (uid: string) => staffList.find(s => s.uid === uid)?.name || '알수없음';
  const getOrgName = (id: string) => orgList.find(o => o.id === id)?.name || '부서미정';

  const resetForm = () => {
    setTitle(''); setContent(''); setDocType('general');
    setApprover1(''); setApprover2(''); setApproverFinal('');
    setRefUids([]); setRefOrgIds([]); setLeaveStart(''); setLeaveEnd('');
    setUsingDays(0);
  };

  // UI Helpers
  const getStatusBadge = (status: ApprovalStatus) => {
    const map = { pending: { t: '진행중', c: 'pending' }, approved: { t: '승인완료', c: 'approved' }, rejected: { t: '반려됨', c: 'rejected' } };
    const curr = map[status];
    return <span className={`status-badge ${curr.c}`}>{curr.t}</span>;
  };

  const getTypeLabel = (type: ApprovalType) => {
      const map = { general: '일반품의', expense: '지출결의', leave: '휴가신청', report: '보고서', apology: '시말서' };
      return map[type] || type;
  };

  // 잔여 연차 계산
  const myTotalLeave = myStaffData?.totalLeave || 0;
  const myUsedLeave = myStaffData?.usedLeave || 0;
  const myRemainingLeave = myTotalLeave - myUsedLeave;
  const isLeaveOver = usingDays > myRemainingLeave;

  return (
    <div className="ap-page">
      <div className="ap-header">
        <div className="header-left">
          <h2 className="page-title">전자결재</h2>
          <p className="page-desc">자동화된 결재 프로세스로 업무 효율을 높이세요.</p>
        </div>
        <button className="btn-new-app" onClick={() => setIsWriteOpen(true)}>
          <Icons.Pen /> <span>결재 작성</span>
        </button>
      </div>

      <div className="ap-tabs">
        <button className={`ap-tab ${activeTab === 'all' ? 'active' : ''}`} onClick={() => setActiveTab('all')}>전체 문서</button>
        <button className={`ap-tab ${activeTab === 'pending' ? 'active' : ''}`} onClick={() => setActiveTab('pending')}>결재 대기</button>
        <button className={`ap-tab ${activeTab === 'my_request' ? 'active' : ''}`} onClick={() => setActiveTab('my_request')}>내 요청함</button>
      </div>

      <div className="ap-list-container">
        {loading ? <div className="loading-msg">로딩 중...</div> : filteredApprovals.length === 0 ? (
            <div className="empty-state"><div className="empty-icon"><Icons.FileText /></div><p>문서가 없습니다.</p></div>
        ) : (
            <div className="ap-grid">
                {filteredApprovals.map(doc => (
                    <div key={doc.id} className="ap-card" onClick={() => { setSelectedDoc(doc); setIsDetailOpen(true); }}>
                        <div className="card-header">
                            <span className="doc-type">{getTypeLabel(doc.type)}</span>
                            {getStatusBadge(doc.status)}
                        </div>
                        <h3 className="doc-title">{doc.title}</h3>
                        <div className="card-meta">
                            <div className="meta-row"><span className="label">기안자</span><span className="value">{doc.requesterName}</span></div>
                            <div className="meta-row"><span className="label">현재 결재</span><span className="value">
                                {doc.approverLine.find(a => a.status === 'pending')?.name || (doc.status === 'approved' ? '완료' : '종료')}
                            </span></div>
                            <div className="meta-row date">{doc.createdAt?.toDate().toLocaleDateString()}</div>
                        </div>
                    </div>
                ))}
            </div>
        )}
      </div>

      {/* --- [Write Modal] --- */}
      {isWriteOpen && (
        <div className="ap-modal-overlay">
          <div className="ap-modal-content write-mode">
            <div className="ap-modal-header"><h3>새 결재 작성</h3><button onClick={() => setIsWriteOpen(false)} className="ap-close-btn"><Icons.Close /></button></div>
            <div className="ap-modal-body">
              
              <div className="ap-section-title">결재 종류 선택</div>
              <div className="type-selector">
                  {['general', 'expense', 'leave', 'report', 'apology'].map((t) => (
                      <button key={t} className={`type-btn ${docType === t ? 'selected' : ''}`} onClick={() => setDocType(t as any)}>{getTypeLabel(t as any)}</button>
                  ))}
              </div>

              <div className="ap-section-title" style={{ marginTop: '24px' }}>결재선 지정</div>
              <div className="approver-line-box">
                  <div className="app-step">
                      <span className="step-label">1차 결재 (선택)</span>
                      <select value={approver1} onChange={e => setApprover1(e.target.value)}>
                          <option value="">선택 안함</option>
                          {staffList.filter(s => s.uid !== currentUser?.uid && s.uid !== approver2 && s.uid !== approverFinal).map(s => <option key={s.uid} value={s.uid}>{s.name}</option>)}
                      </select>
                  </div>
                  <div className="app-arrow">➔</div>
                  <div className="app-step">
                      <span className="step-label">2차 결재 (선택)</span>
                      <select value={approver2} onChange={e => setApprover2(e.target.value)}>
                          <option value="">선택 안함</option>
                          {staffList.filter(s => s.uid !== currentUser?.uid && s.uid !== approver1 && s.uid !== approverFinal).map(s => <option key={s.uid} value={s.uid}>{s.name}</option>)}
                      </select>
                  </div>
                  <div className="app-arrow">➔</div>
                  <div className="app-step final">
                      <span className="step-label">최종 결재 (필수)</span>
                      <select value={approverFinal} onChange={e => setApproverFinal(e.target.value)} required>
                          <option value="">선택하세요</option>
                          {staffList.filter(s => s.uid !== currentUser?.uid).map(s => <option key={s.uid} value={s.uid}>{s.name}</option>)}
                      </select>
                  </div>
              </div>

              <div className="ap-section-title" style={{ marginTop: '24px' }}>참조 (열람 가능)</div>
              <div className="ref-selector-box">
                  <div className="ref-group">
                      <label>부서 참조</label>
                      <select onChange={e => { if(e.target.value && !refOrgIds.includes(e.target.value)) setRefOrgIds([...refOrgIds, e.target.value]) }}>
                          <option value="">부서 선택...</option>
                          {orgList.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                      <div className="ref-tags">
                          {refOrgIds.map(id => <span key={id} className="ref-tag org">{getOrgName(id)} <button onClick={() => setRefOrgIds(refOrgIds.filter(x => x !== id))}>×</button></span>)}
                      </div>
                  </div>
                  <div className="ref-group">
                      <label>직원 참조</label>
                      <select onChange={e => { if(e.target.value && !refUids.includes(e.target.value)) setRefUids([...refUids, e.target.value]) }}>
                          <option value="">직원 선택...</option>
                          {staffList.filter(s => s.uid !== currentUser?.uid).map(s => <option key={s.uid} value={s.uid}>{s.name}</option>)}
                      </select>
                      <div className="ref-tags">
                          {refUids.map(uid => <span key={uid} className="ref-tag user">{getName(uid)} <button onClick={() => setRefUids(refUids.filter(x => x !== uid))}>×</button></span>)}
                      </div>
                  </div>
              </div>

              <div className="ap-section-title" style={{ marginTop: '24px' }}>내용 작성</div>
              <div className="ap-input-group"><input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="제목을 입력하세요" /></div>
              
              {/* [FIX] 휴가 날짜 선택 및 잔여 연차 표시 */}
              {docType === 'leave' && (
                  <div className="leave-management-area">
                      <div className="leave-status-bar">
                          <span className="ls-label">내 연차 현황:</span>
                          <span className="ls-badge total">총 {myTotalLeave}일</span>
                          <span className="ls-divider">/</span>
                          <span className="ls-badge used">사용 {myUsedLeave}일</span>
                          <span className="ls-arrow">➔</span>
                          <span className={`ls-badge remain ${isLeaveOver ? 'warning' : ''}`}>잔여 {myRemainingLeave}일</span>
                      </div>

                      <div className="ap-input-group leave-date-row">
                          <div className="date-field"><Icons.Calendar /><input type="date" value={leaveStart} onChange={e => setLeaveStart(e.target.value)} /></div>
                          <span>~</span>
                          <div className="date-field"><Icons.Calendar /><input type="date" value={leaveEnd} onChange={e => setLeaveEnd(e.target.value)} /></div>
                          
                          {usingDays > 0 && (
                              <div className={`using-days-badge ${isLeaveOver ? 'over' : ''}`}>
                                  총 <strong>{usingDays}일</strong> 사용
                              </div>
                          )}
                      </div>
                      {isLeaveOver && usingDays > 0 && (
                          <p className="leave-warning-text">※ 잔여 연차보다 많은 일수를 신청합니다. (마이너스 처리됨)</p>
                      )}
                  </div>
              )}

              <div className="ap-input-group flex-grow">
                  <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="상세 내용을 입력하세요..." />
              </div>
            </div>
            <div className="ap-modal-footer">
                <button className="btn-cancel" onClick={() => setIsWriteOpen(false)}>취소</button>
                <button className="btn-submit" onClick={handleWrite} disabled={isSubmitting}>{isSubmitting ? '상신 중...' : '결재 상신'}</button>
            </div>
          </div>
        </div>
      )}

      {/* --- [Detail Modal] --- */}
      {isDetailOpen && selectedDoc && (
        <div className="ap-modal-overlay">
          <div className="ap-modal-content detail-mode">
            <div className="ap-modal-header">
                <div className="header-badges">
                    <span className="type-badge">{getTypeLabel(selectedDoc.type)}</span>
                    {getStatusBadge(selectedDoc.status)}
                </div>
                <button onClick={() => setIsDetailOpen(false)} className="ap-close-btn"><Icons.Close /></button>
            </div>
            <div className="ap-modal-body">
                <h2 className="detail-title">{selectedDoc.title}</h2>
                <div className="approval-status-line">
                    <div className="step-node requester">
                        <div className="node-circle active"><Icons.User /></div>
                        <span className="node-name">{selectedDoc.requesterName}</span>
                        <span className="node-role">기안</span>
                    </div>
                    {selectedDoc.approverLine.map((app, idx) => (
                        <React.Fragment key={idx}>
                            <div className={`line-connector ${app.status !== 'pending' ? 'active' : ''}`}></div>
                            <div className="step-node">
                                <div className={`node-circle ${app.status === 'approved' ? 'approved' : app.status === 'rejected' ? 'rejected' : ''}`}>
                                    {app.status === 'approved' ? <Icons.CheckCircle /> : app.status === 'rejected' ? <Icons.XCircle /> : <span className="step-num">{idx + 1}</span>}
                                </div>
                                <span className="node-name">{app.name}</span>
                                <span className="node-role">{app.level === selectedDoc.approverLine.length ? '최종' : '검토'}</span>
                            </div>
                        </React.Fragment>
                    ))}
                </div>

                {selectedDoc.type === 'leave' && selectedDoc.leaveStartDate && selectedDoc.leaveEndDate && (
                    <div className="leave-info-box">
                        <span className="lb-label">휴가 기간:</span>
                        <span className="lb-val">{selectedDoc.leaveStartDate} ~ {selectedDoc.leaveEndDate}</span>
                        <span className="lb-days">
                            ({ Math.ceil(Math.abs(new Date(selectedDoc.leaveEndDate).getTime() - new Date(selectedDoc.leaveStartDate).getTime()) / (1000 * 60 * 60 * 24)) + 1 }일)
                        </span>
                    </div>
                )}

                <div className="detail-divider"></div>
                <div className="detail-content">{selectedDoc.content.split('\n').map((line, i) => <p key={i}>{line}</p>)}</div>

                {(selectedDoc.referrerUids?.length > 0 || selectedDoc.referrerOrgIds?.length > 0) && (
                    <div className="detail-refs">
                        <span className="ref-label">참조:</span>
                        {selectedDoc.referrerOrgIds?.map(id => <span key={id} className="ref-badge org">{getOrgName(id)}</span>)}
                        {selectedDoc.referrerUids?.map(uid => <span key={uid} className="ref-badge user">{getName(uid)}</span>)}
                    </div>
                )}
            </div>
            
            {selectedDoc.status === 'pending' && selectedDoc.approverLine.find(a => a.uid === currentUser?.uid && a.status === 'pending') && (
                <div className="ap-modal-footer">
                    <button className="btn-reject" onClick={() => handleProcess('rejected')}>반려</button>
                    <button className="btn-approve" onClick={() => handleProcess('approved')}>승인</button>
                </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CompanyApprovalPage;