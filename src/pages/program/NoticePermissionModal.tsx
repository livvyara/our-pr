import React, { useState, useEffect, useCallback } from 'react';
import { getFirestore, collection, query, where, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import './CompanyNoticePage.css'; // 스타일 공유

// --- [Icons] ---
const Icons = {
  Close: () => <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Check: () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>,
};

interface StaffData {
  uid: string;
  name: string;
  orgId?: string | null;
  fullOrgName?: string; // 계산된 전체 부서명
}

interface OrgData {
  id: string;
  name: string;
  parentId: string | null;
}

interface Props {
  partnerUid: string;
  onClose: () => void;
}

const NoticePermissionModal: React.FC<Props> = ({ partnerUid, onClose }) => {
  const db = getFirestore();
  
  const [staffList, setStaffList] = useState<StaffData[]>([]);
  const [orgList, setOrgList] = useState<OrgData[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('all');
  const [selectedManagers, setSelectedManagers] = useState<string[]>([]); // 권한 부여된 UID 목록
  const [isSaving, setIsSaving] = useState(false);

  // --- [Logic: Get Full Org Name] ---
  // OrgManagementPage의 로직을 그대로 가져와서 부서 경로를 계산합니다.
  const getFullOrgName = useCallback((orgId: string | null | undefined, orgs: OrgData[]) => {
    if (!orgId) return '부서 미정';
    
    const path: string[] = [];
    let currentId: string | null = orgId;
    let isRoot = false;

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

    return path.join(' > '); // 보기 좋게 구분자 변경
  }, []);

  useEffect(() => {
    fetchData();
  }, [partnerUid]);

  const fetchData = async () => {
    try {
      // 1. 조직(부서) 목록 가져오기 (경로 수정: organization)
      // OrgManagementPage와 동일한 경로 사용
      const orgsQ = query(collection(db, `users/${partnerUid}/organization`));
      const orgsSnap = await getDocs(orgsQ);
      const orgs = orgsSnap.docs.map(d => ({ id: d.id, ...d.data() } as OrgData));
      setOrgList(orgs);

      // 2. 직원 목록 가져오기
      const usersQ = query(collection(db, 'users'), where('partnerInfo.ownerUid', '==', partnerUid));
      const usersSnap = await getDocs(usersQ);
      
      const staffs = usersSnap.docs.map(d => {
        const data = d.data();
        const rawOrgId = data.orgId || data.staffInfo?.orgId || null;
        
        return { 
          uid: d.id, 
          name: data.name,
          orgId: rawOrgId,
          // 여기서 바로 부서명을 계산해서 넣어줍니다.
          fullOrgName: getFullOrgName(rawOrgId, orgs) 
        } as StaffData;
      });

      // 3. 기존 권한 설정 가져오기
      const configRef = doc(db, 'users', partnerUid, 'config', 'notice_permissions');
      const configSnap = await getDoc(configRef);
      if (configSnap.exists()) {
        setSelectedManagers(configSnap.data().managers || []);
      }

      setStaffList(staffs);
    } catch (e) {
      console.error("데이터 로딩 실패", e);
    }
  };

  const handleToggleStaff = (uid: string) => {
    setSelectedManagers(prev => 
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const configRef = doc(db, 'users', partnerUid, 'config', 'notice_permissions');
      // merge: true 옵션으로 기존 다른 설정이 있다면 유지
      await setDoc(configRef, { managers: selectedManagers }, { merge: true });
      alert("권한 설정이 저장되었습니다.");
      onClose();
    } catch (e) {
      console.error(e);
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  // 필터링된 직원 목록
  const filteredStaff = selectedOrgId === 'all' 
    ? staffList 
    : staffList.filter(s => s.orgId === selectedOrgId);

  return (
    <div className="n-modal-overlay">
      <div className="n-modal-content" style={{ maxWidth: '500px', height: '650px' }}>
        <div className="n-modal-header">
          <h3>🔐 공지사항 관리 권한 설정</h3>
          <button onClick={onClose} className="n-close-btn"><Icons.Close /></button>
        </div>
        
        <div className="n-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <p style={{ fontSize: '14px', color: '#666', margin: 0, lineHeight: '1.5' }}>
            선택된 직원은 <b>모든 공지사항을 수정 및 삭제</b>할 수 있는 관리자 권한을 갖게 됩니다.<br/>
            (작성자 본인과 대표자는 기본적으로 권한을 가집니다.)
          </p>

          {/* 부서 필터 Dropdown */}
          <div className="n-input-group" style={{ marginBottom: 0 }}>
            <label>부서별 보기</label>
            <select 
              value={selectedOrgId} 
              onChange={(e) => setSelectedOrgId(e.target.value)}
              style={{ height: '48px', cursor: 'pointer' }}
            >
              <option value="all">전체 직원 보기</option>
              {orgList.map(org => (
                <option key={org.id} value={org.id}>{org.name}</option>
              ))}
            </select>
          </div>

          {/* 직원 리스트 (체크박스) */}
          <div className="staff-checklist-container">
            {filteredStaff.length === 0 ? (
              <div className="empty-state-text">해당 부서에 직원이 없습니다.</div>
            ) : (
              filteredStaff.map(staff => {
                const isSelected = selectedManagers.includes(staff.uid);
                return (
                  <div 
                    key={staff.uid} 
                    className={`staff-check-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleToggleStaff(staff.uid)}
                  >
                    <div className="check-circle">
                      {isSelected && <Icons.Check />}
                    </div>
                    <div className="staff-info">
                      <span className="staff-name">{staff.name}</span>
                      <span className="staff-dept">
                        {staff.fullOrgName}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="n-modal-footer">
          <button className="btn-cancel" onClick={onClose}>취소</button>
          <button className="btn-submit" onClick={handleSave} disabled={isSaving}>
            {isSaving ? '저장 중...' : `선택된 ${selectedManagers.length}명에게 권한 부여`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NoticePermissionModal;