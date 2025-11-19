// src/components/partner/PartnerPermissionTab.tsx

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getFirestore, collection, getDocs, doc, getDoc, updateDoc, query, where, Timestamp } from 'firebase/firestore';
import { functions } from '../../firebase-config'; 
import { httpsCallable } from 'firebase/functions'; 
import { PARTNER_MENUS_DATA } from './partnerMenuData'; 
import './PartnerPermissionTab.css'; 

// 헬퍼 함수
const logActivity = httpsCallable(functions, 'logAdminActivity');

interface SubPartnerData {
  uid: string;
  name: string; 
  nickname: string;
  partnerPermissions?: string[]; 
}

interface PartnerPermissionTabProps {
  partnerUid: string; 
  partnerBusinessNumber: string; 
}

const PartnerPermissionTab: React.FC<PartnerPermissionTabProps> = ({ partnerUid, partnerBusinessNumber }) => {
  const [subPartnerList, setSubPartnerList] = useState<SubPartnerData[]>([]);
  const [selectedSubPartnerId, setSelectedSubPartnerId] = useState<string>('');
  const [permissions, setPermissions] = useState<Record<string, boolean>>({}); 
  const [isLoading, setIsLoading] = useState(false);
  const db = getFirestore();

  // 'sub_partner' 목록 불러오기 (사업자 번호 기준)
  useEffect(() => {
    if (!partnerBusinessNumber) return; 

    const fetchSubPartners = async () => {
      setIsLoading(true);
      const usersRef = collection(db, 'users');
      const q = query(
        usersRef, 
        where("role", "==", "sub_partner"),
        where("partnerInfo.businessNumber", "==", partnerBusinessNumber)
      );
      
      const querySnapshot = await getDocs(q);
      const users: SubPartnerData[] = [];
      querySnapshot.forEach((doc) => {
        users.push({ uid: doc.id, ...doc.data() } as SubPartnerData);
      });
      
      setSubPartnerList(users);
      setIsLoading(false);
    };
    fetchSubPartners();
  }, [db, partnerBusinessNumber]);

  // 직원 변경 시 권한(partnerPermissions) 불러오기
  const handleSubPartnerChange = useCallback(async (uid: string) => {
    setSelectedSubPartnerId(uid);
    if (!uid) {
      setPermissions({});
      return;
    }
    
    const userDocRef = doc(db, 'users', uid);
    const userDocSnap = await getDoc(userDocRef);
    const currentPerms: string[] = userDocSnap.data()?.partnerPermissions || [];
    
    const permsState: Record<string, boolean> = {};
    
    permsState['dashboard'] = currentPerms.includes('dashboard');
    
    PARTNER_MENUS_DATA.forEach(menu => {
      permsState[menu.key] = currentPerms.includes(menu.key);
      menu.subMenus.forEach(subMenu => {
        if (subMenu.key !== 'emp-permission') { 
          permsState[subMenu.key] = currentPerms.includes(subMenu.key);
        }
      });
    });
    setPermissions(permsState);

  }, [db]);

  // 체크박스 핸들러
  const handleCheckboxChange = (menuKey: string) => {
    setPermissions(prev => ({
      ...prev,
      [menuKey]: !prev[menuKey],
    }));
  };

  // 저장 핸들러
  const handleSavePermissions = async () => {
    if (!selectedSubPartnerId) {
      alert('먼저 직원을 선택해주세요.');
      return;
    }
    
    const newPermsArray = Object.keys(permissions).filter(key => permissions[key]);
    
    setIsLoading(true);
    try {
      const userDocRef = doc(db, 'users', selectedSubPartnerId);
      await updateDoc(userDocRef, {
        partnerPermissions: newPermsArray 
      });

      const selectedUser = subPartnerList.find(u => u.uid === selectedSubPartnerId);
      const targetUserName = selectedUser?.nickname || selectedUser?.name || 'UnknownUser';
      const permsString = newPermsArray.length > 0 ? newPermsArray.join(', ') : '(없음)';
      
      await logActivity({
        message: `[파트너 권한] (대표가) [${targetUserName}] 직원의 권한을 [${permsString}] (으)로 설정했습니다.`
      });

      alert('권한이 성공적으로 저장되었습니다.');
    } catch (error) {
      alert('저장 중 오류가 발생했습니다.');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <h3>직원 권한관리</h3>
      
      {/* --- 권한 관리 섹션 --- */}
      <div className="permission-management-container">
        <label htmlFor="subpartner-select">권한을 부여할 직원 선택:</label>
        <select 
          id="subpartner-select"
          className="admin-dropdown" 
          value={selectedSubPartnerId}
          onChange={(e) => handleSubPartnerChange(e.target.value)}
          disabled={isLoading}
        >
          <option value="">-- 직원을 선택하세요 --</option>
          {subPartnerList.map(user => (
            <option key={user.uid} value={user.uid}>{user.name} ({user.nickname})</option>
          ))}
        </select>
        
        {selectedSubPartnerId && (
          <div className="permissions-checklist">
            <h3>메뉴 권한</h3>
            
            {/* 1. 대시보드 (별도) */}
            <label className="permission-item parent">
              <input 
                type="checkbox"
                checked={permissions['dashboard'] || false}
                onChange={() => handleCheckboxChange('dashboard')}
                disabled={isLoading}
              />
              대시보드
            </label>
            <hr />

            {/* 2. 메뉴 목록 (map) */}
            {PARTNER_MENUS_DATA.map(menu => (
              <div key={menu.key} className="permission-group">
                <label className="permission-item parent">
                  <input 
                    type="checkbox"
                    checked={permissions[menu.key] || false}
                    onChange={() => handleCheckboxChange(menu.key)}
                    disabled={isLoading}
                  />
                  {menu.title}
                </label>
                
                <div className="permission-sub-items">
                  {menu.subMenus
                    .filter(subMenu => subMenu.key !== 'emp-permission') // '권한관리' 탭은 제외
                    .map(subMenu => (
                    <label key={subMenu.key} className="permission-item">
                      <input 
                        type="checkbox"
                        checked={permissions[subMenu.key] || false}
                        onChange={() => handleCheckboxChange(subMenu.key)}
                        disabled={isLoading}
                      />
                      {subMenu.title}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            
            <button 
              className="admin-save-button" 
              onClick={handleSavePermissions}
              disabled={isLoading}
            >
              {isLoading ? '저장 중...' : '권한 저장'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PartnerPermissionTab;