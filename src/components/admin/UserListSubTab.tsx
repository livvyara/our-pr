// src/components/admin/UserListSubTab.tsx
// (이 파일은 제공해주신 UserManagementTab.tsx의 내용과 100% 동일합니다.)

import React, { useState, useEffect, useMemo, type ChangeEvent } from 'react';
import { getFirestore, collection, getDocs, doc, updateDoc, Timestamp } from 'firebase/firestore';
import './UserManagementTab.css'; // [⭐ 참고] CSS 파일은 UserManagementTab.css를 공유합니다.
import { functions } from '../../firebase-config'; 
import { httpsCallable } from 'firebase/functions'; 

// ... (UserData, EditUserData, timestampToDateString 인터페이스 및 헬퍼) ...
interface UserData {
  uid: string;
  name: string;
  nickname: string;
  email: string;
  role: string;
  phone?: string; 
  isBannedUntil?: Timestamp | null;
  productExpiry?: Timestamp | null;
  agreedMarketing?: boolean;
  agreedNotifications?: boolean;
}
interface EditUserData {
  nickname: string;
  role: string;
  phone: string;
  isBannedUntil: string;
  productExpiry: string;
}
const timestampToDateString = (ts: Timestamp | null | undefined): string => {
  if (!ts) return '';
  return ts.toDate().toISOString().split('T')[0];
};

const logActivity = httpsCallable(functions, 'logAdminActivity');

// [⭐ 1. 수정] 컴포넌트 이름 변경 (UserManagementTab -> UserListSubTab)
const UserListSubTab: React.FC = () => {
  // ... (useState, fetchUsers, useEffect, filteredUsers 등 모든 로직 100% 동일) ...
  const [allUsers, setAllUsers] = useState<UserData[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [editData, setEditData] = useState<EditUserData | null>(null);
  const db = getFirestore();

  const fetchUsers = async () => {
    setIsLoading(true);
    const usersCollectionRef = collection(db, "users");
    const querySnapshot = await getDocs(usersCollectionRef);
    const users: UserData[] = [];
    querySnapshot.forEach((doc) => {
      users.push({ uid: doc.id, ...doc.data() } as UserData);
    });
    setAllUsers(users);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    if (!searchTerm) return allUsers;
    const lowerSearchTerm = searchTerm.toLowerCase();
    return allUsers.filter(user =>
      user.name.toLowerCase().includes(lowerSearchTerm) ||
      user.nickname.toLowerCase().includes(lowerSearchTerm) ||
      user.email.toLowerCase().includes(lowerSearchTerm)
    );
  }, [allUsers, searchTerm]);

  const handleEditClick = (user: UserData) => {
    setSelectedUser(user);
    setEditData({
      phone: user.phone || '', 
      nickname: user.nickname,
      role: user.role,
      isBannedUntil: timestampToDateString(user.isBannedUntil),
      productExpiry: timestampToDateString(user.productExpiry),
    });
  };

  const handleModalChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (!editData) return;
    setEditData({
      ...editData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSaveUser = async () => {
    if (!selectedUser || !editData) return;
    setIsLoading(true);
    const userDocRef = doc(db, 'users', selectedUser.uid);
    const changes: string[] = [];
    const targetUserName = selectedUser.nickname || selectedUser.name;
    try {
      const newBanUntil = editData.isBannedUntil
        ? Timestamp.fromDate(new Date(`${editData.isBannedUntil}T23:59:59`))
        : null;
      const newProductExpiry = editData.productExpiry 
        ? Timestamp.fromDate(new Date(editData.productExpiry)) 
        : null;
      const updateData: Record<string, any> = {};

      if (editData.nickname !== selectedUser.nickname) {
        updateData.nickname = editData.nickname;
        changes.push(`[${targetUserName}]님의 닉네임을 '${selectedUser.nickname}'에서 '${editData.nickname}'(으)로 변경했습니다.`);
      }
      if (editData.role !== selectedUser.role) {
        updateData.role = editData.role;
        changes.push(`[${targetUserName}]님의 등급을 '${selectedUser.role}'에서 '${editData.role}'(으)로 변경했습니다.`);
      }
      if (editData.phone !== (selectedUser.phone || '')) {
        updateData.phone = editData.phone;
        changes.push(`[${targetUserName}]님의 휴대전화를 '${selectedUser.phone || '(없음)'}'에서 '${editData.phone}'(으)로 변경했습니다.`);
      }
      if (timestampToDateString(selectedUser.isBannedUntil) !== editData.isBannedUntil) {
        updateData.isBannedUntil = newBanUntil;
        changes.push(`[${targetUserName}]님의 로그인 금지 날짜를 '${editData.isBannedUntil || '(없음)'}'(으)로 지정했습니다.`);
      }
      if (timestampToDateString(selectedUser.productExpiry) !== editData.productExpiry) {
        updateData.productExpiry = newProductExpiry;
        changes.push(`[${targetUserName}]님의 상품 기한을 '${editData.productExpiry || '(없음)'}'(으)로 지정했습니다.`);
      }
      
      if (changes.length === 0) {
        alert('변경된 내용이 없습니다.');
        setIsLoading(false);
        return;
      }

      await updateDoc(userDocRef, updateData);

      for (const message of changes) {
        try {
          await logActivity({ message: message });
        } catch (logError) {
          console.error("로그 기록 실패:", message, logError);
        }
      }
      alert('사용자 정보가 성공적으로 업데이트되었습니다.');
      
      setSelectedUser(null);
      setEditData(null);
      await fetchUsers(); 
    } catch (error) {
      alert('업데이트 중 오류가 발생했습니다. (Firestore 보안 규칙을 확인하세요)');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseModal = () => {
    setSelectedUser(null);
    setEditData(null);
  };

  // [⭐ 2. 수정] return문 내부의 최상위 <h2> 제거
  return (
    <div className="user-manage-container">
      {/* <h2>회원관리</h2> <-- 이 <h2> 태그 제거 */}
      
      <input
        type="text"
        placeholder="이름, 닉네임, 이메일로 검색"
        className="user-search-bar"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />

      {isLoading && <p>회원 목록을 불러오는 중입니다...</p>}
      {!isLoading && (
        <div className="user-table-wrapper">
          <table className="user-table">
            {/* ... (thead, tbody는 100% 동일) ... */}
            <thead>
              <tr>
                <th>이름</th>
                <th>닉네임</th>
                <th>이메일</th>
                <th>휴대전화</th> 
                <th>등급</th>
                <th>로그인 금지</th>
                <th>상품 기한</th>
                <th>마케팅</th>
                <th>알림수신</th>
                <th>수정</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(user => (
                <tr key={user.uid}>
                  <td>{user.name}</td>
                  <td>{user.nickname}</td>
                  <td>{user.email}</td>
                  <td>{user.phone || '-'}</td> 
                  <td>{user.role}</td>
                  <td>{timestampToDateString(user.isBannedUntil) || '-'}</td>
                  <td>{timestampToDateString(user.productExpiry) || '-'}</td>
                  <td>{user.agreedMarketing ? 'O' : 'X'}</td> 
                  <td>{user.agreedNotifications ? 'O' : 'X'}</td> 
                  <td>
                    <button className="edit-button" onClick={() => handleEditClick(user)}>
                      수정
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ... (모달 JSX 100% 동일) ... */}
      {selectedUser && editData && (
        <div className="edit-modal-overlay" onClick={handleCloseModal}>
          <div className="edit-modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>'{selectedUser.name}'님 정보 수정</h3>
            {/* ... (모달 폼 100% 동일) ... */}
          </div>
        </div>
      )}
    </div>
  );
};

// [⭐ 3. 수정] export default 이름 변경
export default UserListSubTab;