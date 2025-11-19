// src/components/partner/EmployeeListTab.tsx

import React, { useState, useEffect, useCallback } from 'react';
import { getFirestore, collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { functions, auth } from '../../firebase-config';
import { httpsCallable } from 'firebase/functions';
import './EmployeeListTab.css'; // (CSS는 하단에 제공)

// 헬퍼 함수 및 타입
const deleteSubPartner = httpsCallable(functions, 'deleteSubPartner');
const logActivity = httpsCallable(functions, 'logAdminActivity');

interface SubPartnerData {
  uid: string;
  name: string; 
  nickname: string;
  email: string;
  phone?: string;
}

interface EmployeeListTabProps {
  partnerBusinessNumber: string; // 소속 직원 필터링용
}

const EmployeeListTab: React.FC<EmployeeListTabProps> = ({ partnerBusinessNumber }) => {
  const [subPartnerList, setSubPartnerList] = useState<SubPartnerData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null); // (삭제 중인 UID)
  const db = getFirestore();

  // 직원 목록 불러오기
  const fetchSubPartners = useCallback(async () => {
    if (!partnerBusinessNumber) {
      console.warn("사업자 번호가 없어 직원 목록을 조회할 수 없습니다.");
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    try {
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
    } catch (error) {
      console.error("직원 목록 조회 오류:", error);
    } finally {
      setIsLoading(false);
    }
  }, [db, partnerBusinessNumber]);

  useEffect(() => {
    fetchSubPartners();
  }, [fetchSubPartners]);

  // 직원 삭제(역할 회수) 핸들러
  const handleDelete = async (employee: SubPartnerData) => {
    if (isDeleting) return;
    
    if (!window.confirm(`[${employee.nickname}]님을 직원 목록에서 삭제(역할 회수)하시겠습니까?\n이 직원은 일반 고객(customer) 등급으로 변경됩니다.`)) {
      return;
    }

    setIsDeleting(employee.uid);
    try {
      // 1. 백엔드 함수 호출
      await deleteSubPartner({ employeeUid: employee.uid });

      // 2. (성공 시) 활동 로그 기록 - deleteSubPartner 함수가 자체 기록하므로 생략
      // (만약 함수가 로그 기록을 안 한다면 여기서 logActivity 호출)

      alert(`[${employee.nickname}]님이 직원 목록에서 삭제되었습니다.`);
      fetchSubPartners(); // 목록 새로고침

    } catch (error: any) {
      console.error("직원 삭제 오류:", error);
      alert(`삭제 실패: ${error.message}`);
    } finally {
      setIsDeleting(null);
    }
  };

  return (
    <div>
      <h3>직원 목록</h3>
      <p>현재 내 파트너 소속으로 등록된 직원 목록입니다.</p>

      {isLoading && <p>직원 목록 로딩 중...</p>}
      {!isLoading && (
        <table className="employee-table">
          <thead>
            <tr>
              <th>이름</th>
              <th>닉네임</th>
              <th>이메일</th>
              <th>휴대전화</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {subPartnerList.map(emp => (
              <tr key={emp.uid}>
                <td>{emp.name}</td>
                <td>{emp.nickname}</td>
                <td>{emp.email}</td>
                <td>{emp.phone || '-'}</td>
                <td>
                  <button 
                    className="delete-button"
                    onClick={() => handleDelete(emp)}
                    disabled={isDeleting === emp.uid}
                  >
                    {isDeleting === emp.uid ? '삭제 중...' : '삭제'}
                  </button>
                </td>
              </tr>
            ))}
            {subPartnerList.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center' }}>
                  등록된 직원이 없습니다. '직원 등록' 탭에서 초대하세요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default EmployeeListTab;