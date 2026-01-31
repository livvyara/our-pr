// src/components/admin/MainMenuManager.tsx

import React, { useState, useEffect, useCallback, type ChangeEvent } from 'react';
import { getFirestore, collection, getDocs, doc, setDoc, deleteDoc, orderBy, query, serverTimestamp } from 'firebase/firestore';
import './MenuManagement.css';

// [⭐ 1. DB/Ref 선언]
const db = getFirestore();
const menuCollectionRef = collection(db, 'mainMenus'); 

// Firestore에 저장될 메인 메뉴 데이터 타입
interface MainMenuData {
  id?: string; 
  key: string; 
  title: string; 
  path?: string; // [⭐ 추가] 이동 경로 (선택 사항)
  order: number; 
  roles: string[]; 
}

// 편집 폼용 state 타입
interface EditFormState {
  key: string;
  title: string;
  path: string; // [⭐ 추가] 폼 상태에도 path 추가
  order: number;
  roles: Record<string, boolean>; 
}

// (임시) 등급 목록
const ALL_ROLES = ['customer', 'partner','sub_partner',  'seller', 'contract'];

const MainMenuManager: React.FC = () => {
  const [menus, setMenus] = useState<MainMenuData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // [편집/생성] 상태
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); 
  const [formState, setFormState] = useState<EditFormState>({
    key: '',
    title: '',
    path: '', // [⭐ 추가] 초기값
    order: 100,
    roles: { customer: true, partner: false, seller: false, contract: false },
  });

  // 1. 데이터 로드
  const fetchMenus = useCallback(async () => {
    setIsLoading(true);
    const q = query(menuCollectionRef, orderBy("order", "asc"));
    const querySnapshot = await getDocs(q);
    const menuList: MainMenuData[] = [];
    querySnapshot.forEach((doc) => {
      menuList.push({ id: doc.id, ...doc.data() } as MainMenuData);
    });
    setMenus(menuList);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchMenus();
  }, [fetchMenus]);

  // 2. 폼 초기화/취소
  const resetForm = () => {
    setIsEditing(false);
    setEditingId(null);
    setFormState({
      key: '',
      title: '',
      path: '', // [⭐ 추가] 초기화
      order: (menus.length + 1) * 10, 
      roles: { customer: true, partner: false, seller: false, contract: false },
    });
  };

  // 3. "수정" 버튼 클릭 (기존 데이터 폼에 로드)
  const handleEditClick = (menu: MainMenuData) => {
    setEditingId(menu.id!);
    setIsEditing(true);

    const rolesState: Record<string, boolean> = {};
    ALL_ROLES.forEach(role => {
      rolesState[role] = menu.roles.includes(role);
    });

    setFormState({
      key: menu.key,
      title: menu.title,
      path: menu.path || '', // [⭐ 추가] 기존 경로 로드 (없으면 빈 문자열)
      order: menu.order,
      roles: rolesState,
    });
  };

  // 4. "삭제" 버튼 클릭
  const handleDeleteClick = async (id: string, key: string) => {
    if (!window.confirm(`정말로 '${key}' 메뉴를 삭제하시겠습니까? (관련 서브메뉴도 함께 설정해야 함)`)) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'mainMenus', id));
      alert('메뉴가 삭제되었습니다.');
      fetchMenus();
    } catch (error) {
      alert('삭제 중 오류가 발생했습니다.');
      console.error(error);
    }
  };

  // 5. 폼 입력 변경
  const handleFormChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormState(prev => ({ ...prev, [name]: value }));
  };

  // 6. 폼 체크박스 변경
  const handleRoleChange = (role: string) => {
    setFormState(prev => ({
      ...prev,
      roles: {
        ...prev.roles,
        [role]: !prev.roles[role], 
      }
    }));
  };

  // 7. "저장" (생성/수정)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.key || !formState.title) {
      alert("메뉴 Key와 표시될 이름을 모두 입력해야 합니다.");
      return;
    }
    
    setIsLoading(true);

    // admin/subadmin 강제 추가
    const selectedRolesFromForm = ALL_ROLES.filter(role => formState.roles[role]);
    const rolesSet = new Set(selectedRolesFromForm);
    rolesSet.add('admin');
    rolesSet.add('subadmin');
    const finalRoles = Array.from(rolesSet);
    
    const docData = {
      key: formState.key,
      title: formState.title,
      path: formState.path, // [⭐ 추가] 경로 저장
      order: Number(formState.order),
      roles: finalRoles,
      updatedAt: serverTimestamp(),
    };

    try {
      // Key를 문서 ID로 사용
      const docRef = doc(db, 'mainMenus', formState.key);
      await setDoc(docRef, docData, { merge: true }); 

      alert(editingId ? '메뉴가 수정되었습니다.' : '메뉴가 생성되었습니다.');
      resetForm();
      fetchMenus();
    } catch (error) {
      alert('저장 중 오류가 발생했습니다.');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="menu-management-container">
      <div>
        <h3>메인 메뉴 목록 (Firestore)</h3>
        <div className="menu-table-wrapper">
          <table className="menu-table">
<thead>
              <tr>
                <th style={{ width: '10%' }}>순서</th>
                <th style={{ width: '15%' }}>Key (ID)</th>
                <th style={{ width: '20%' }}>메뉴명 (Title)</th>
                <th style={{ width: '25%' }}>이동 경로 (Path)</th>
                <th style={{ width: '20%' }}>접근 권한</th>
                <th style={{ width: '10%' }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {menus.map(menu => (
                <tr key={menu.id}>
                  <td>{menu.order}</td>
                  <td>{menu.key}</td>
                  <td>{menu.title}</td>
                  {/* [⭐ 추가] 경로 표시 */}
                  <td style={{ color: menu.path ? '#2563eb' : '#999', fontSize: '0.9rem' }}>
                    {menu.path || '(하위 메뉴용)'}
                  </td>
                  <td className="roles-list">{menu.roles.join(', ') || '(없음)'}</td>
                  <td className="actions-cell">
                    <button className="action-button btn-edit" onClick={() => handleEditClick(menu)}>수정</button>
                    <button className="action-button btn-delete" onClick={() => handleDeleteClick(menu.id!, menu.key)}>삭제</button>
                  </td>
                </tr>
              ))}
              {menus.length === 0 && (
                <tr>
                    <td colSpan={6} style={{textAlign:'center', padding:'20px'}}>등록된 메뉴가 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="menu-form-container">
        <h3>{editingId ? '메뉴 수정' : '새 메인 메뉴 추가'}</h3>
        <p style={{fontSize:'13px', color:'#666', marginBottom:'15px'}}>
            * <strong>이동 경로</strong>를 입력하면 클릭 시 해당 페이지로 바로 이동합니다.<br/>
            * 비워두면 클릭 시 하위 메뉴(SubNav)가 열리는 드롭다운 메뉴로 동작합니다.
        </p>
        <form className="menu-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="key">메뉴 Key (ID)</label>
            <input 
              id="key" 
              name="key" 
              className="form-input" 
              value={formState.key}
              onChange={handleFormChange}
              disabled={!!editingId} 
              placeholder="예: menu1, guide"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="title">표시될 이름 (Title)</label>
            <input 
              id="title" 
              name="title" 
              className="form-input" 
              value={formState.title}
              onChange={handleFormChange}
              placeholder="예: 회사소개"
              required
            />
          </div>
          
          {/* [⭐ 추가] 경로 입력 필드 */}
          <div className="form-group">
            <label className="form-label" htmlFor="path">이동 경로 (선택사항)</label>
            <input 
              id="path" 
              name="path" 
              className="form-input" 
              value={formState.path}
              onChange={handleFormChange}
              placeholder="예: /about (비워두면 드롭다운 메뉴)"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="order">정렬 순서 (숫자)</label>
            <input 
              id="order" 
              name="order" 
              type="number"
              className="form-input" 
              value={formState.order}
              onChange={handleFormChange}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">접근 가능 등급</label>
            <div className="role-checkbox-group">
              {ALL_ROLES.map(role => (
                <label key={role} className="role-checkbox-label">
                  <input 
                    type="checkbox"
                    checked={formState.roles[role] || false}
                    onChange={() => handleRoleChange(role)}
                  />
                  {role}
                </label>
              ))}
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="form-button btn-save" disabled={isLoading}>
              {isLoading ? '저장 중...' : '저장'}
            </button>
            <button type="button" className="form-button btn-cancel" onClick={resetForm} disabled={isLoading}>
              취소
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MainMenuManager;