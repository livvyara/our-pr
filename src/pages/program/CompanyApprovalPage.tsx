import React, { useState, useEffect, useMemo } from 'react';
import { getFirestore, collection, addDoc, query, orderBy, getDocs, doc, updateDoc, deleteDoc, Timestamp, where, getDoc } from 'firebase/firestore';
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
  Refresh: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>,
  Search: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Trash: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  Ban: () => <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>,
};

// --- [Types & Templates] ---
type ApprovalStatus = 'pending' | 'approved' | 'rejected';
type ApprovalType = 'general' | 'expense' | 'leave' | 'report' | 'apology';
// [NEW] 반차 타입 정의
type LeaveDurationType = 'full' | 'half_am' | 'half_pm';

const DOC_TEMPLATES: Record<ApprovalType, string> = {
  general: `1. 품의 목적:\n\n2. 상세 내용:\n\n3. 기대 효과:\n\n4. 소요 예산:`,
  expense: `1. 지출 금액: 원\n\n2. 지출 목적:\n\n3. 상세 내역:\n\n4. 계좌 정보:`,
  leave: `1. 사유:\n\n2. 비상 연락망:`, // 간소화
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
  leaveDurationType?: LeaveDurationType; // [NEW] 반차 여부
  usingDays?: number; 
  createdAt: any;
}

interface StaffData { 
  uid: string; 
  name: string; 
  orgId?: string | null;
  totalLeave?: number;
  usedLeave?: number;
  joinDate?: string; 
}

interface OrgData { id: string; name: string; parentId: string | null; managerUid: string | null; }

interface Props { partnerUid: string; }

// Helper: 날짜 문자열 변환
const getISODateString = (date: Date) => {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().split('T')[0];
};

const calculateLeaveFromJoinDate = (joinDateStr?: string) => {
    if (!joinDateStr) return 0;
    const join = new Date(joinDateStr);
    const now = new Date();
    
    let months = (now.getFullYear() - join.getFullYear()) * 12 + (now.getMonth() - join.getMonth());
    if (now.getDate() < join.getDate()) {
        months--;
    }
    const years = Math.floor(months / 12);

    let leave = 0;
    if (years < 1) {
        leave = Math.min(months, 11); 
    } else {
        const bonus = Math.floor((years - 1) / 2);
        leave = Math.min(15 + bonus, 25);
    }
    return Math.max(0, leave);
};

const CompanyApprovalPage: React.FC<Props> = ({ partnerUid }) => {
  const db = getFirestore();
  const auth = getAuth();
  const currentUser = auth.currentUser;

  // --- [State] ---
  const [approvals, setApprovals] = useState<ApprovalDoc[]>([]);
  const [staffList, setStaffList] = useState<StaffData[]>([]);
  const [orgList, setOrgList] = useState<OrgData[]>([]);
  
  const [myOrgId, setMyOrgId] = useState<string | null>(null);
  const [myStaffData, setMyStaffData] = useState<StaffData | null>(null);

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'my_request'>('all');
  
  // Date Filters
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  // Modals
  const [isWriteOpen, setIsWriteOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<ApprovalDoc | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [docType, setDocType] = useState<ApprovalType>('general');
  // [NEW] 반차 타입 State
  const [leaveDurationType, setLeaveDurationType] = useState<LeaveDurationType>('full'); 
  const [leaveStart, setLeaveStart] = useState('');
  const [leaveEnd, setLeaveEnd] = useState('');
  const [usingDays, setUsingDays] = useState<number>(0);
  
  const [approver1, setApprover1] = useState('');
  const [approver2, setApprover2] = useState('');
  const [approverFinal, setApproverFinal] = useState('');

  const [refUids, setRefUids] = useState<string[]>([]);
  const [refOrgIds, setRefOrgIds] = useState<string[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // 초기 기간 설정
  useEffect(() => {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 30);
      setFilterStartDate(getISODateString(start));
      setFilterEndDate(getISODateString(end));
  }, []);

  // --- [Data Fetching] ---
  useEffect(() => {
    if (partnerUid && currentUser) {
        fetchData();
    }
  }, [partnerUid, currentUser]);

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
          const info = data.staffInfo || {};
          
          let tLeave = Number(info.totalLeave ?? 0);
          const joinDate = info.joinDate || data.joinDate;
          
          if (tLeave === 0 && joinDate) {
              tLeave = calculateLeaveFromJoinDate(joinDate);
          }

          staffs.push({ 
            uid: d.id, 
            name: data.name || '이름없음', 
            orgId: data.orgId || data.staffInfo?.orgId || null,
            totalLeave: tLeave,
            usedLeave: Number(info.usedLeave ?? 0),
            joinDate: joinDate
          });
      });
      setStaffList(staffs);

      const oQ = query(collection(db, `users/${partnerUid}/organization`));
      const oSnap = await getDocs(oQ);
      const orgs = oSnap.docs.map(d => ({ id: d.id, ...d.data() } as OrgData));
      setOrgList(orgs);

      if (currentUser) fetchMyInfo();

    } catch (e) {
      console.error("데이터 로딩 실패", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchMyInfo = async () => {
      if (!currentUser) return;
      try {
          const myDocRef = doc(db, 'users', currentUser.uid);
          const myDocSnap = await getDoc(myDocRef);
          
          if (myDocSnap.exists()) {
              const d = myDocSnap.data();
              const info = d.staffInfo || {}; 

              let tLeave = Number(info.totalLeave ?? 0);
              const joinDate = info.joinDate || d.joinDate;

              if (tLeave === 0 && joinDate) {
                  tLeave = calculateLeaveFromJoinDate(joinDate);
              }

              const myInfo: StaffData = {
                  uid: currentUser.uid,
                  name: d.name || info.name || currentUser.displayName || '이름없음',
                  orgId: d.orgId || info.orgId || null,
                  totalLeave: tLeave,
                  usedLeave: Number(info.usedLeave ?? 0),
                  joinDate: joinDate
              };
              
              setMyStaffData(myInfo);
              setMyOrgId(d.orgId || info.orgId || null);
              
              if (!staffList.find(s => s.uid === currentUser.uid)) {
                  setStaffList(prev => [...prev, myInfo]);
              }
          }
      } catch (err) {
          console.error("내 정보 로딩 실패", err);
      }
  };

  useEffect(() => {
    if (isWriteOpen && currentUser) {
        calculateDefaultLine();
        setContent(DOC_TEMPLATES[docType]);
        fetchMyInfo(); 
    }
  }, [docType, isWriteOpen, currentUser]);

  // [수정] 휴가 사용 일수 계산 로직 (반차 고려)
  useEffect(() => {
    if (docType !== 'leave') {
        setUsingDays(0);
        return;
    }

    // 1. 반차인 경우 -> 무조건 0.5일 (날짜 하나만 선택됨)
    if (leaveDurationType !== 'full') {
        if (leaveStart) setUsingDays(0.5);
        else setUsingDays(0);
        return;
    }

    // 2. 종일인 경우 -> 기간 계산
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
  }, [leaveStart, leaveEnd, leaveDurationType, docType]);

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

  const filteredApprovals = useMemo(() => {
    if (!currentUser) return [];
    
    const startDate = filterStartDate ? new Date(filterStartDate) : null;
    if(startDate) startDate.setHours(0,0,0,0);

    const endDate = filterEndDate ? new Date(filterEndDate) : null;
    if(endDate) endDate.setHours(23,59,59,999);

    return approvals.filter(doc => {
      if (startDate && endDate && doc.createdAt) {
          const docDate = doc.createdAt.toDate();
          if (docDate < startDate || docDate > endDate) return false;
      }

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
  }, [approvals, activeTab, currentUser, myOrgId, partnerUid, filterStartDate, filterEndDate]);

  const handleWrite = async () => {
    if (!title || !content || !approverFinal) {
      alert("제목, 내용, 최종 결재자는 필수입니다."); return;
    }
    
    // [수정] 반차/종일 유효성 검사 분기
    if (docType === 'leave') {
        if (leaveDurationType === 'full' && (!leaveStart || !leaveEnd)) {
            alert("휴가 기간을 선택해주세요."); return;
        }
        if (leaveDurationType !== 'full' && !leaveStart) {
            alert("휴가 날짜를 선택해주세요."); return;
        }
    }
    if (!currentUser) return;

    setIsSubmitting(true);
    try {
      const line: Approver[] = [];
      if (approver1) line.push({ uid: approver1, name: getName(approver1), level: 1, status: 'pending' });
      if (approver2) line.push({ uid: approver2, name: getName(approver2), level: 2, status: 'pending' });
      const finalLevel = (line.length + 1) as 1|2|3; 
      line.push({ uid: approverFinal, name: getName(approverFinal), level: finalLevel, status: 'pending' });

      const realRequesterName = myStaffData?.name || currentUser.displayName || '이름없음';

      // [수정] 반차일 경우 end date를 start date와 동일하게 맞춤
      const finalStartDate = leaveStart;
      const finalEndDate = leaveDurationType === 'full' ? leaveEnd : leaveStart;

      await addDoc(collection(db, 'users', partnerUid, 'approvals'), {
        title, content, type: docType,
        status: 'pending',
        requesterUid: currentUser.uid,
        requesterName: realRequesterName,
        requesterOrgId: myOrgId || null,
        approverLine: line,
        referrerUids: refUids,
        referrerOrgIds: refOrgIds,
        leaveStartDate: docType === 'leave' ? finalStartDate : null,
        leaveEndDate: docType === 'leave' ? finalEndDate : null,
        leaveDurationType: docType === 'leave' ? leaveDurationType : 'full', // [NEW] 타입 저장
        usingDays: docType === 'leave' ? usingDays : 0, 
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

  const handleProcess = async (status: 'approved' | 'rejected' | 'revoked') => {
    if (!selectedDoc || !currentUser) return;
    
    let confirmMsg = "";
    if (status === 'approved') confirmMsg = "승인하시겠습니까?";
    else if (status === 'rejected') confirmMsg = "반려하시겠습니까?";
    else if (status === 'revoked') confirmMsg = "이미 승인된 결재를 취소(반려)하시겠습니까?\n차감된 연차가 복구됩니다.";

    if (!confirm(confirmMsg)) return;

    try {
        const newLine = selectedDoc.approverLine.map(a => {
            if (status !== 'revoked' && a.uid === currentUser.uid && a.status === 'pending') {
                return { ...a, status, processedAt: Timestamp.now() };
            }
            return a;
        });

        let docStatus: ApprovalStatus = 'pending';
        
        if (status === 'rejected' || status === 'revoked') {
            docStatus = 'rejected';
        } else {
            const isAllApproved = newLine.every(a => a.status === 'approved');
            if (isAllApproved) docStatus = 'approved';
        }

        await updateDoc(doc(db, 'users', partnerUid, 'approvals', selectedDoc.id), {
            approverLine: newLine,
            status: docStatus
        });

        if (selectedDoc.type === 'leave' && docStatus === 'approved' && selectedDoc.usingDays && selectedDoc.usingDays > 0) {
            await updateUserUsedLeave(selectedDoc.requesterUid, selectedDoc.usingDays, 'add');
        }

        if (selectedDoc.type === 'leave' && status === 'revoked' && selectedDoc.usingDays && selectedDoc.usingDays > 0) {
            await updateUserUsedLeave(selectedDoc.requesterUid, selectedDoc.usingDays, 'subtract');
        }

        alert("처리되었습니다.");
        setIsDetailOpen(false);
        fetchData();
    } catch (e) {
        console.error(e); alert("오류 발생");
    }
  };

  // [NEW] 관리자 직권 반려
  const handlePartnerReject = async () => {
      if (!selectedDoc || !currentUser || currentUser.uid !== partnerUid) return;
      if (!confirm("관리자 권한으로 해당 결재를 반려하시겠습니까?")) return;

      try {
          const newLine = selectedDoc.approverLine.map(a => {
              if (a.status === 'pending') {
                  return { ...a, status: 'rejected' as ApprovalStatus, comment: '관리자 직권 반려', processedAt: Timestamp.now() };
              }
              return a;
          });

          await updateDoc(doc(db, 'users', partnerUid, 'approvals', selectedDoc.id), {
              approverLine: newLine,
              status: 'rejected'
          });

          alert("반려 처리되었습니다.");
          setIsDetailOpen(false);
          fetchData();
      } catch(e) {
          console.error(e); alert("오류 발생");
      }
  };

  // [NEW] 반려 문서 삭제
  const handleDeleteDoc = async () => {
      if (!selectedDoc || !currentUser || currentUser.uid !== partnerUid) return;
      if (!confirm("이 문서를 영구 삭제하시겠습니까?\n삭제 후에는 복구할 수 없습니다.")) return;

      try {
          await deleteDoc(doc(db, 'users', partnerUid, 'approvals', selectedDoc.id));
          alert("삭제되었습니다.");
          setIsDetailOpen(false);
          fetchData();
      } catch(e) {
          console.error(e); alert("삭제 중 오류 발생");
      }
  };

  const updateUserUsedLeave = async (targetUid: string, days: number, mode: 'add' | 'subtract') => {
      try {
          const targetRef = doc(db, 'users', targetUid);
          const targetSnap = await getDoc(targetRef);
          
          if (targetSnap.exists()) {
              const data = targetSnap.data();
              const currentInfo = data.staffInfo || {};
              const currentUsed = Number(currentInfo.usedLeave || 0);
              
              let newUsed = currentUsed;
              if (mode === 'add') newUsed += days;
              else newUsed = Math.max(0, currentUsed - days);
              
              await updateDoc(targetRef, {
                  'staffInfo.usedLeave': newUsed
              });
          }
      } catch (err) {
          console.error("연차 업데이트 실패:", err);
      }
  };

  const getName = (uid: string) => staffList.find(s => s.uid === uid)?.name || '알수없음';
  const getOrgName = (id: string) => orgList.find(o => o.id === id)?.name || '부서미정';

  const resetForm = () => {
    setTitle(''); setContent(''); setDocType('general');
    setLeaveDurationType('full'); // 초기화
    setApprover1(''); setApprover2(''); setApproverFinal('');
    setRefUids([]); setRefOrgIds([]); setLeaveStart(''); setLeaveEnd('');
    setUsingDays(0);
  };

  const getStatusBadge = (status: ApprovalStatus) => {
    const map = { pending: { t: '진행중', c: 'pending' }, approved: { t: '승인완료', c: 'approved' }, rejected: { t: '반려됨', c: 'rejected' } };
    const curr = map[status];
    return <span className={`status-badge ${curr.c}`}>{curr.t}</span>;
  };

  const getTypeLabel = (type: ApprovalType) => {
      const map = { general: '일반품의', expense: '지출결의', leave: '휴가신청', report: '보고서', apology: '시말서' };
      return map[type] || type;
  };

  const myTotalLeave = myStaffData?.totalLeave || 0;
  const myUsedLeave = myStaffData?.usedLeave || 0;
  const myRemainingLeave = myTotalLeave - myUsedLeave;
  const isLeaveOver = usingDays > myRemainingLeave;

  const requesterData = useMemo(() => {
      if (!selectedDoc) return null;
      return staffList.find(s => s.uid === selectedDoc.requesterUid);
  }, [selectedDoc, staffList]);

  const isPartner = currentUser?.uid === partnerUid;

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
        <button className={`ap-tab ${activeTab === 'pending' ? 'active' : ''}`} onClick={() => setActiveTab('pending')}>
            결재 대기 {approvals.filter(d => d.status === 'pending' && d.approverLine.some(a => a.uid === currentUser?.uid && a.status === 'pending')).length > 0 && <span className="dot"></span>}
        </button>
        <button className={`ap-tab ${activeTab === 'my_request' ? 'active' : ''}`} onClick={() => setActiveTab('my_request')}>내 요청함</button>
      </div>

      <div className="ap-toolbar">
          <div className="date-filter-box">
              <span className="filter-label"><Icons.Calendar /> 조회 기간</span>
              <input type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} />
              <span className="tilde">~</span>
              <input type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} />
          </div>
      </div>

      <div className="ap-list-container">
        {loading ? (
            <div className="loading-msg">로딩 중...</div>
        ) : filteredApprovals.length === 0 ? (
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

      {/* --- Write Modal --- */}
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

                      {/* [NEW] 휴가 유형 선택 (종일/반차) */}
                      <div className="leave-duration-selector">
                          <label className={`ld-option ${leaveDurationType==='full'?'active':''}`}>
                              <input type="radio" name="dur" checked={leaveDurationType==='full'} onChange={()=>setLeaveDurationType('full')} /> 종일 (1.0일)
                          </label>
                          <label className={`ld-option ${leaveDurationType==='half_am'?'active':''}`}>
                              <input type="radio" name="dur" checked={leaveDurationType==='half_am'} onChange={()=>setLeaveDurationType('half_am')} /> 오전반차 (0.5일)
                          </label>
                          <label className={`ld-option ${leaveDurationType==='half_pm'?'active':''}`}>
                              <input type="radio" name="dur" checked={leaveDurationType==='half_pm'} onChange={()=>setLeaveDurationType('half_pm')} /> 오후반차 (0.5일)
                          </label>
                      </div>

                      {/* [NEW] 날짜 선택 UI (반차일 땐 날짜 1개만) */}
                      <div className="ap-input-group leave-date-row">
                          <div className="date-field">
                              <Icons.Calendar />
                              <input type="date" value={leaveStart} onChange={e => setLeaveStart(e.target.value)} />
                          </div>
                          
                          {leaveDurationType === 'full' && (
                              <>
                                <span>~</span>
                                <div className="date-field">
                                    <Icons.Calendar />
                                    <input type="date" value={leaveEnd} onChange={e => setLeaveEnd(e.target.value)} />
                                </div>
                              </>
                          )}
                          
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

      {/* --- Detail Modal --- */}
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

                {selectedDoc.type === 'leave' && selectedDoc.leaveStartDate && requesterData && (
                    <div className="leave-detail-summary">
                        <div className="lds-header">
                            <span className="lds-title">📅 휴가 신청 내역</span>
                            <span className="lds-date">
                                {selectedDoc.leaveDurationType !== 'full' 
                                    ? `${selectedDoc.leaveStartDate} (${selectedDoc.leaveDurationType === 'half_am' ? '오전반차' : '오후반차'})` 
                                    : `${selectedDoc.leaveStartDate} ~ ${selectedDoc.leaveEndDate}`}
                            </span>
                        </div>
                        <div className="lds-stats">
                            <div className="lds-stat-item">
                                <span className="label">현재 잔여</span>
                                <span className="value">{(requesterData.totalLeave || 0) - (requesterData.usedLeave || 0)}일</span>
                            </div>
                            <div className="lds-stat-item minus">
                                <span className="label">신청 일수</span>
                                <span className="value">-{selectedDoc.usingDays || 0}일</span>
                            </div>
                            <div className="lds-stat-item result">
                                <span className="label">승인 후 잔여</span>
                                <span className="value">
                                    {(requesterData.totalLeave || 0) - (requesterData.usedLeave || 0) - (selectedDoc.status === 'approved' ? 0 : (selectedDoc.usingDays || 0))}일
                                </span>
                            </div>
                        </div>
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
            
            <div className="ap-modal-footer">
                {selectedDoc.status === 'pending' && selectedDoc.approverLine.find(a => a.uid === currentUser?.uid && a.status === 'pending') && (() => {
                    const myTurn = selectedDoc.approverLine.find(a => a.uid === currentUser?.uid && a.status === 'pending');
                    if(!myTurn) return false;
                    if(myTurn.level > 1) {
                        const prev = selectedDoc.approverLine.find(a => a.level === myTurn.level - 1);
                        if(prev?.status !== 'approved') return false;
                    }
                    return true;
                })() && (
                    <>
                        <button className="btn-reject" onClick={() => handleProcess('rejected')}>반려</button>
                        <button className="btn-approve" onClick={() => handleProcess('approved')}>승인</button>
                    </>
                )}

                {isPartner && selectedDoc.status === 'approved' && (
                    <button className="btn-revoke" onClick={() => handleProcess('revoked')}>
                        <Icons.Refresh /> 승인 취소 (연차 복구)
                    </button>
                )}

                {isPartner && selectedDoc.status === 'pending' && (
                    <button className="btn-force-reject" onClick={handlePartnerReject} style={{marginLeft:'auto', background:'#E02020', color:'white', border:'none', padding:'0 16px', borderRadius:'8px', height:'48px', fontWeight:600, display:'flex', alignItems:'center', gap:'6px', cursor:'pointer'}}>
                        <Icons.Ban /> 직권 반려
                    </button>
                )}

                {isPartner && selectedDoc.status === 'rejected' && (
                    <button className="btn-delete-doc" onClick={handleDeleteDoc} style={{marginLeft:'auto', background:'#666', color:'white', border:'none', padding:'0 16px', borderRadius:'8px', height:'48px', fontWeight:600, display:'flex', alignItems:'center', gap:'6px', cursor:'pointer'}}>
                        <Icons.Trash /> 문서 삭제
                    </button>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompanyApprovalPage;