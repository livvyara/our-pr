// src/components/admin/SubMenuManager.tsx

import React, { useState, useEffect, useCallback, type ChangeEvent } from 'react';
import { getFirestore, collection, getDocs, doc, setDoc, getDoc, orderBy, query, serverTimestamp } from 'firebase/firestore';
import './MenuManagement.css'; 

// [⭐ 1. 수정] DB 선언을 컴포넌트 밖으로 이동 (무한 루프 방지)
const db = getFirestore();

// (임시) 등급 목록
const ALL_ROLES = ['customer', 'partner', 'sub_partner', 'seller', 'contract'];

// (인터페이스 정의)
interface MainMenu {
  id: string;
  key: string;
  title: string;
}
interface SubMenuItem {
  id: string; 
  title: string;
  path: string;
  order: number;
  roles: string[];
}
interface SubMenuFormState {
  title: string;
  path: string;
  order: number;
  roles: Record<string, boolean>;
}
interface SubMenuDocument {
  items: Omit<SubMenuItem, 'id'>[]; 
  updatedAt?: any;
}


const SubMenuManager: React.FC = () => {
  // 1. State 정의
  const [mainMenus, setMainMenus] = useState<MainMenu[]>([]); 
  const [selectedParentKey, setSelectedParentKey] = useState<string>(''); 
  
  const [subMenus, setSubMenus] = useState<SubMenuItem[]>([]); 
  const [isLoading, setIsLoading] = useState(true); 
  
  // [편집/생성] 상태
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); 
  
  const initialFormState: SubMenuFormState = {
    title: '',
    path: '/',
    order: 10,
    roles: { customer: true, partner: false, seller: false, contract: false },
  };
  const [formState, setFormState] = useState<SubMenuFormState>(initialFormState);

  // [⭐ 2. 수정] 'db' 선언 삭제 (밖으로 이동됨)

  // [⭐ 3. 수정] resetForm을 안정적인 함수로 변경 (의존성 제거)
  const resetForm = useCallback(() => {
    setIsEditing(false);
    setEditingId(null);
    setFormState(initialFormState);
  }, []); // 의존성 없음

  // 1. (Mount) 메인 메뉴 목록 불러오기
  const fetchMainMenus = useCallback(async () => {
    setIsLoading(true);
    const q = query(collection(db, 'mainMenus'), orderBy("order", "asc"));
    const querySnapshot = await getDocs(q);
    const menuList: MainMenu[] = [];
    querySnapshot.forEach((doc) => {
      menuList.push({ id: doc.id, ...doc.data() } as MainMenu);
    });
    setMainMenus(menuList);
    if (menuList.length > 0) {
      setSelectedParentKey(menuList[0].key);
    } else {
      setIsLoading(false);
    }
  }, [db]); // [정상] db는 안정적임

  useEffect(() => {
    fetchMainMenus();
  }, [fetchMainMenus]);

  // 2. (선택 변경) 서브 메뉴 목록 불러오기
  // [⭐ 4. 수정] resetForm 의존성 제거
  const fetchSubMenus = useCallback(async (parentKey: string) => {
    if (!parentKey) {
      setSubMenus([]);
      setIsLoading(false); 
      return;
    }
    setIsLoading(true);
    const docRef = doc(db, 'subMenus', parentKey);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data() as SubMenuDocument;
      const itemsWithIds: SubMenuItem[] = (data.items || []).map((item, index) => ({
        ...item,
        id: `${parentKey}-${index}-${item.path}`, 
      }));
      setSubMenus(itemsWithIds.sort((a, b) => a.order - b.order));
    } else {
      setSubMenus([]); 
    }
    setIsLoading(false);
    // resetForm(); // [⭐ 4. 수정] 무한 루프의 원인이므로 이 호출을 제거!
  }, [db]); 

  // [⭐ 5. 수정] useEffect가 이제 안정적임
  useEffect(() => {
    fetchSubMenus(selectedParentKey);
  }, [selectedParentKey, fetchSubMenus]);

  // [⭐ 6. 추가] 'selectedParentKey'가 바뀔 때만 폼을 리셋
  useEffect(() => {
    resetForm();
  }, [selectedParentKey, resetForm]);


  // 4. "수정" 버튼 클릭
  const handleEditClick = (menu: SubMenuItem) => {
    setEditingId(menu.id);
    setIsEditing(true);
    const rolesState: Record<string, boolean> = {};
    ALL_ROLES.forEach(role => {
      rolesState[role] = menu.roles.includes(role);
    });
    setFormState({
      title: menu.title,
      path: menu.path,
      order: menu.order,
      roles: rolesState,
    });
  };

  // 8. "전체 저장" (State를 DB에 덮어쓰기)
  const handleSaveAll = async (menusToSave: SubMenuItem[]) => {
    if (!selectedParentKey) {
      alert("메인 메뉴가 선택되지 않았습니다.");
      return;
    }
    setIsLoading(true);
    
    // DB에 저장할 'items' 배열 (임시 id 제거 및 admin/subadmin 추가)
    const itemsToSave: Omit<SubMenuItem, 'id'>[] = menusToSave.map(menu => {
      // [수정] 저장 시점에도 admin/subadmin 강제 추가
      const rolesSet = new Set(menu.roles);
      rolesSet.add('admin');
      rolesSet.add('subadmin');
      
      return {
        title: menu.title,
        path: menu.path,
        order: menu.order,
        roles: Array.from(rolesSet), // 최종 roles
      };
    });
    
    const docData: SubMenuDocument = {
      items: itemsToSave,
      updatedAt: serverTimestamp(),
    };
    
    try {
      const docRef = doc(db, 'subMenus', selectedParentKey);
      await setDoc(docRef, docData, { merge: true }); 
    } catch (error) {
      alert('저장 중 오류가 발생했습니다.');
      console.error(error);
    } finally {
      setIsLoading(false);
      // [수정] DB 저장 후 다시 불러와서 state 정돈 (무한루프 방지)
      // fetchSubMenus(selectedParentKey); // -> 이 호출이 루프를 유발할 수 있음.
      // (Submit/Delete에서 이미 state를 갱신했으므로, 수동으로 refetch 안 함)
    }
  };
  
  // 5. "삭제" 버튼 클릭
  const handleDeleteClick = (id: string) => {
    if (!window.confirm("정말로 이 서브메뉴를 삭제하시겠습니까?")) {
      return;
    }
    const newSubMenus = subMenus.filter(menu => menu.id !== id);
    setSubMenus(newSubMenus);
    handleSaveAll(newSubMenus); // 즉시 저장
    alert("서브메뉴가 삭제되었습니다. (DB 반영 완료)");
    resetForm();
  };

  // 6. 폼 입력 변경
  const handleFormChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormState(prev => ({ ...prev, [name]: value }));
  };
  const handleRoleChange = (role: string) => {
    setFormState(prev => ({
      ...prev,
      roles: { ...prev.roles, [role]: !prev.roles[role] }
    }));
  };

  // 7. "저장" (생성/수정)
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.path || !formState.title) {
      alert("경로(Path)와 표시될 이름을 모두 입력해야 합니다.");
      return;
    }
    
    // [⭐ 7. 수정] 'order' 계산 로직
    // (폼이 안정적인 initialFormState.order (10)을 갖고 있으므로,
    // '추가' 시에만 order를 동적으로 계산)
    let finalOrder = Number(formState.order);
    if (!isEditing) {
      finalOrder = (subMenus.length + 1) * 10;
    }

    // 1. 폼에서 체크된 roles 배열 생성
    const selectedRolesFromForm = ALL_ROLES.filter(role => formState.roles[role]);
    
    // 2. [수정] Set을 사용해 'admin'과 'subadmin'을 강제로 추가
    const rolesSet = new Set(selectedRolesFromForm);
    rolesSet.add('admin');
    rolesSet.add('subadmin');
    
    const finalRoles = Array.from(rolesSet);
    
    const newMenuItem: SubMenuItem = {
      ...formState,
      id: editingId || `${selectedParentKey}-${Date.now()}`,
      order: finalOrder, // [수정]
      roles: finalRoles, 
    };
    
    let newSubMenus: SubMenuItem[];
    if (isEditing) { 
      newSubMenus = subMenus.map(menu => 
        menu.id === editingId ? newMenuItem : menu
      );
    } else { 
      newSubMenus = [...subMenus, newMenuItem];
    }
    
    const sortedMenus = newSubMenus.sort((a, b) => a.order - b.order);
    
    // [수정] State를 먼저 바꾸고, DB에 저장
    setSubMenus(sortedMenus);
    handleSaveAll(sortedMenus); 
    alert(editingId ? '서브메뉴가 수정되었습니다. (DB 반영 완료)' : '서브메뉴가 추가되었습니다. (DB 반영 완료)');
    resetForm();
  };
  
  return (
    <div className="menu-management-container">
      
      {/* 1. 부모 메뉴 선택 */}
      <div className="form-group">
        <label className="form-label" htmlFor="parent-menu-select">
          관리할 메인 메뉴 선택:
        </label>
        <select 
          id="parent-menu-select"
          className="form-input" 
          value={selectedParentKey}
          onChange={(e) => setSelectedParentKey(e.target.value)}
          disabled={isLoading}
        >
          <option value="">-- 메인 메뉴를 선택하세요 --</option>
          {mainMenus.map(menu => (
            <option key={menu.key} value={menu.key}>{menu.title} ({menu.key})</option>
          ))}
        </select>
      </div>

      {/* 2. 서브 메뉴 목록 */}
      {selectedParentKey && (
      <div>
        <h3>'{selectedParentKey}'의 서브 메뉴 목록</h3>
        <div className="menu-table-wrapper">
          <table className="menu-table">
            <thead>
              <tr>
                <th>순서(Order)</th>
                <th>표시될 이름 (Title)</th>
                <th>경로 (Path)</th>
                <th>접근 가능 등급 (Roles)</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {subMenus.map(menu => (
                <tr key={menu.id}>
                  <td>{menu.order}</td>
                  <td>{menu.title}</td>
                  <td>{menu.path}</td>
                  <td className="roles-list">{menu.roles.join(', ') || '(없음)'}</td>
                  <td className="actions-cell">
                    <button className="action-button btn-edit" onClick={() => handleEditClick(menu)}>수정</button>
                    <button className="action-button btn-delete" onClick={() => handleDeleteClick(menu.id)}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* 3. 서브 메뉴 추가/수정 폼 */}
      {selectedParentKey && (
      <div className="menu-form-container">
        <h3>{editingId ? '서브 메뉴 수정' : '새 서브 메뉴 추가'}</h3>
        <form className="menu-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="title">표시될 이름 (Title)</label>
            <input 
              id="title" 
              name="title" 
              className="form-input" 
              value={formState.title}
              onChange={handleFormChange}
              placeholder="예: 파트너스"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="path">경로 (Path)</label>
            <input 
              id="path" 
              name="path" 
              className="form-input" 
              value={formState.path}
              onChange={handleFormChange}
              placeholder="예: /partners"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="order">정렬 순서 (숫자, 낮을수록 먼저)</label>
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
              {editingId ? '수정' : '추가'}
            </button>
            <button type="button" className="form-button btn-cancel" onClick={resetForm} disabled={isLoading}>
              취소
            </button>
          </div>
        </form>
      </div>
      )}
      
    </div>
  );
};

export default SubMenuManager;