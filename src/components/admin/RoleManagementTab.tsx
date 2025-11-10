// src/components/admin/RoleManagementTab.tsx

import React, { useState, useEffect, useCallback } from 'react';
import { getFirestore, collection, getDocs, doc, getDoc, updateDoc, query, where } from 'firebase/firestore';

// [⭐ 수정] 같은 폴더에 있으므로 경로 변경
import { ALL_ADMIN_MENUS } from './adminMenuData';
import './RoleManagementTab.css'; 

// ... (Interface UserData) ...
interface UserData {
  uid: string;
  name: string; 
  nickname: string;
  adminPermissions?: string[]; 
}

const RoleManagementTab: React.FC = () => {
  const [subadminList, setSubadminList] = useState<UserData[]>([]);
  const [selectedSubadminId, setSelectedSubadminId] = useState<string>('');
  const [permissions, setPermissions] = useState<Record<string, boolean>>({}); 
  const [isLoading, setIsLoading] = useState(false);
  const db = getFirestore();

  // 1. subadmin 목록 불러오기
  useEffect(() => {
    const fetchSubadmins = async () => {
      setIsLoading(true);
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where("role", "==", "subadmin"));
      const querySnapshot = await getDocs(q);
      
      const users: UserData[] = [];
      querySnapshot.forEach((doc) => {
        users.push({ uid: doc.id, ...doc.data() } as UserData);
      });
      
      setSubadminList(users);
      setIsLoading(false);
    };
    fetchSubadmins();
  }, [db]);

  // 2. subadmin 변경 시 권한 불러오기
  const handleSubadminChange = useCallback(async (uid: string) => {
    setSelectedSubadminId(uid);
    if (!uid) {
      setPermissions({});
      return;
    }
    
    const userDocRef = doc(db, 'users', uid);
    const userDocSnap = await getDoc(userDocRef);
    const currentPerms: string[] = userDocSnap.data()?.adminPermissions || [];
    
    const permsState: Record<string, boolean> = {};
    // (수정 없음) ALL_ADMIN_MENUS는 정상적으로 임포트됨
    ALL_ADMIN_MENUS.forEach(menu => {
      permsState[menu.key] = currentPerms.includes(menu.key);
    });
    setPermissions(permsState);

  }, [db]);

  // 3. 체크박스 핸들러 (수정 없음)
  const handleCheckboxChange = (menuKey: string) => {
    setPermissions(prev => ({
      ...prev,
      [menuKey]: !prev[menuKey],
    }));
  };

  // 4. 저장 핸들러 (수정 없음)
  const handleSavePermissions = async () => {
    if (!selectedSubadminId) {
      alert('먼저 직원을 선택해주세요.');
      return;
    }
    
    const newPermsArray = Object.keys(permissions).filter(key => permissions[key]);
    
    setIsLoading(true);
    try {
      const userDocRef = doc(db, 'users', selectedSubadminId);
      await updateDoc(userDocRef, {
        adminPermissions: newPermsArray
      });
      alert('권한이 성공적으로 저장되었습니다.');
    } catch (error) {
      alert('저장 중 오류가 발생했습니다.');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // 5. JSX (수정 없음)
  return (
    <div>
      <h2>권한관리</h2>
      <div className="role-management-container">
        <label htmlFor="subadmin-select">권한을 부여할 직원 선택:</label>
        <select 
          id="subadmin-select"
          className="admin-dropdown"
          value={selectedSubadminId}
          onChange={(e) => handleSubadminChange(e.target.value)}
          disabled={isLoading}
        >
          <option value="">-- 직원을 선택하세요 --</option>
          {subadminList.map(user => (
            <option key={user.uid} value={user.uid}>{user.name} ({user.nickname})</option>
          ))}
        </select>
        
        {selectedSubadminId && (
          <div className="permissions-checklist">
            <h3>메뉴 권한</h3>
            {/* (수정 없음) ALL_ADMIN_MENUS는 정상적으로 임포트됨 */}
            {ALL_ADMIN_MENUS.map(menu => (
              <label key={menu.key} className="permission-item">
                <input 
                  type="checkbox"
                  checked={permissions[menu.key] || false}
                  onChange={() => handleCheckboxChange(menu.key)}
                  disabled={isLoading}
                />
                {menu.title}
              </label>
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

export default RoleManagementTab;